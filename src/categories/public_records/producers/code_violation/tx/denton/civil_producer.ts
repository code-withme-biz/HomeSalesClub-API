import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';

const MONTHS = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'
];
const MONTHSONNUMBER = [
    '01',
    '02',
    '03',
    '04',
    '05',
    '06',
    '07',
    '08',
    '09',
    '10',
    '11',
    '12'
];

export default class CivilProducer extends AbstractProducer {
    productId = '';

    sources =
        [
            { url: 'https://data.cityofdenton.com/dataset/building-inspections-monthly-permit-report/resource/ff0df476-fc00-427e-ac9a-d55f134e3aa4?view_id=38a95b0a-14ce-4fb2-b6f4-1993ea1b6d73', handler: this.handleSource },
            { url: 'https://www3.cityofdenton.com/eTRAKiT3/Search/case.aspx', handler: this.handleSource2 },
            { url: 'https://etrakit.flower-mound.com/Search/case.aspx', handler: this.handleSource3 },
            { url: 'https://energov.cityofsouthlake.com/EnerGovProd/SelfService#/search', handler: this.handleSource4 }
        ];

    async init(): Promise<boolean> {
        console.log("running init")
        this.browser = await this.launchBrowser();
        this.browserPages.generalInfoPage = await this.browser.newPage();
        this.browserPages.generalInfoPage.setDefaultTimeout(200000);
        await this.setParamsForPage(this.browserPages.generalInfoPage);
        return true;
    };
    async read(): Promise<boolean> {
        return true;
    };

    async parseAndSave(): Promise<boolean> {
        let countRecords = 0;
        let page = this.browserPages.generalInfoPage;
        if (!page) return false;

        let sourceId = 0;
        for (const source of this.sources) {
            countRecords += await source.handler.call(this, page, source.url, sourceId);
            sourceId++;
        }

        await AbstractProducer.sendMessage(this.publicRecordProducer.state, this.publicRecordProducer.county ? this.publicRecordProducer.county : this.publicRecordProducer.city, countRecords, 'Code Violation');
        return true;
    }

    async handleSource(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;
        // load page
        const isPageLoaded = await this.openPage(page, link, '//*[contains(@class, "resources")]');
        if (!isPageLoaded) {
            console.log("Website not loaded successfully:", link);
            return counts;
        }

        let prevCodeViolationId = await this.getPrevCodeViolationId(sourceId, true, (new Date('1/1/2020')).getTime());
        let from = new Date(prevCodeViolationId);
        let to = new Date();
        while (from <= to) {
            let year = from.getFullYear();
            let month = MONTHS[from.getMonth()];
            console.log(year + " " + month);
            const [check_month_handle] = await page.$x(`//*[contains(@class, "resources")]//*[contains(text(), "${year} ${month}")]/parent::a[1]`);
            if (check_month_handle) {
                await Promise.all([
                    check_month_handle.click(),
                    page.waitForNavigation()
                ]);
                // click data table button
                console.log('-== Waiting for Data Table Button');
                await page.waitForXPath('//*[contains(@class, "nav-tabs-plain")]/li[2]/a', { visible: true });
                console.log('-== clicking Data Table Button');
                const [data_table_button] = await page.$x('//*[contains(@class, "nav-tabs-plain")]/li[2]/a');
                await Promise.all([
                    data_table_button.click(),
                    page.waitForNavigation()
                ]);
                console.log('-== Waiting for loading of table');
                let iframe: any = await page.$x('//iframe');
                iframe = await iframe[0].contentFrame();
                await iframe.waitForXPath('//*[@id="dtprv"]/tbody/tr');
                // get data
                while (true) {
                    const rows = await iframe.$x('//*[@id="dtprv"]/tbody/tr');
                    for (const row of rows) {
                        let property_address = await row.evaluate((el: any) => el.children[6].textContent) || ''
                        property_address = property_address.replace(/\s+|\n/gm, ' ').trim();
                        let fillingdate = await row.evaluate((el: any) => el.children[1].textContent) || ''
                        fillingdate = fillingdate.replace(/\s+|\n/gm, ' ').trim();
                        let codeViolationId = (new Date(fillingdate)).getTime();
                        const record = {
                            property_address,
                            casetype: '',
                            fillingdate,
                            sourceId,
                            codeViolationId
                        }
                        if (await this.saveRecord(record))
                            counts++;
                    }
                    const [next_page_disabled] = await iframe.$x('//*[@id="dtprv_next"][@class="paginate_button next disabled"]')
                    if (next_page_disabled) {
                        break;
                    } else {
                        const [next_page_button] = await iframe.$x('//*[@id="dtprv_next"][@class="paginate_button next"]')
                        await next_page_button.click();
                        await iframe.waitForSelector('#dtprv_processing', { hidden: true });
                    }
                }
            }
            from.setDate(from.getDate() + 30);
        }
        return counts;
    }

    async handleSource2(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;
        let startNum = await this.getPrevCodeViolationId(sourceId, false, 1, true);
        let startCaseCodes = [
            { code: 'CIS', flagStop: false },
        ]
        for (let id = startNum; id < startNum + 100; id++) {
            // load page

            // get year
            let year = (new Date()).getFullYear().toString().substr(-2);
            let startNumString = this.getStartNumberString2(id);


            for (let caseCode = 0; caseCode < startCaseCodes.length; caseCode++) {

                for (let k = 0; k < MONTHSONNUMBER.length; k++) {
                    const isPageLoaded = await this.openPage(page, link, '//*[@id="cplMain_txtSearchString"]');
                    if (!isPageLoaded) {
                        console.log('Page loading is failed, trying next...');
                        continue;
                    }

                    let caseId = startCaseCodes[caseCode].code + year + MONTHSONNUMBER[k] + "-" + startNumString;
                    await page.select('#cplMain_ddSearchBy', 'Case_Main.CASE_NO');
                    await this.setSearchCriteria2(page, caseId);
                    // click search button
                    await page.click('#cplMain_btnSearch');

                    // wait for search result
                    let result_handle = await Promise.race([
                        page.waitForXPath('//*[@id="cplMain_lblNoSearchRslts"]', { visible: true }),
                        page.waitForXPath('//*[@id="cplMain_hlSearchResults"]', { visible: true })
                    ]);
                    let result_text = await result_handle.evaluate(el => el.textContent || '');
                    if (result_text?.indexOf('no results') > -1) {
                        console.log('No Results Found');
                        continue;
                    }
                    let yearForCode = (new Date()).getFullYear();
                    // get results
                    let codeViolationId = parseInt(`${yearForCode}${id.toString().padStart(4, '0')}`);
                    counts += await this.getData2(page, sourceId, codeViolationId, caseId);
                    await this.sleep(2000);
                }
            }
        }
        return counts;
    }

    async handleSource3(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;
        let startNum = await this.getPrevCodeViolationId(sourceId, false, 1, true);
        let startCaseCodes = [
            { code: 'CE', flagStop: false },
            { code: 'FC', flagStop: false },
            { code: 'GE', flagStop: false },
            { code: 'OC', flagStop: false },
            { code: 'PCE', flagStop: false },
            { code: 'PCCE', flagStop: false },
            { code: 'CCE', flagStop: false },
            { code: 'CC', flagStop: false },
            { code: 'MC', flagStop: false },
            { code: 'SW', flagStop: false },
            { code: 'OMI', flagStop: false },
            { code: 'MOST', flagStop: false },
            { code: 'PC', flagStop: false },
            { code: 'RAT', flagStop: false },
            { code: 'MOS', flagStop: false },
        ]
        for (let id = startNum; id < startNum + 200; id++) {
            // load page

            // get year
            let year = (new Date()).getFullYear().toString().substr(-2);
            let startNumString = this.getStartNumberString3(id);


            for (let caseCode = 0; caseCode < startCaseCodes.length; caseCode++) {

                const isPageLoaded = await this.openPage(page, link, '//*[@id="cplMain_txtSearchString"]');
                if (!isPageLoaded) {
                    console.log('Page loading is failed, trying next...');
                    continue;
                }

                let caseId = startCaseCodes[caseCode].code + year + "-" + startNumString;
                await Promise.all([
                    page.select('#cplMain_ddSearchBy', 'Case_Main.CASE_NO'),
                    page.waitForNavigation(),
                ]);
                await this.setSearchCriteria2(page, caseId);
                // click search button
                await page.click('#ctl00_cplMain_btnSearch');

                // wait for search result
                let result_handle = await Promise.race([
                    page.waitForXPath('//*[@id="cplMain_lblNoSearchRslts"]', { visible: true }),
                    page.waitForXPath('//*[@id="ctl00_cplMain_rgSearchRslts_ctl00"]', { visible: true })
                ]);
                let result_text = await result_handle.evaluate(el => el.textContent || '');
                if (result_text?.indexOf('no results') > -1) {
                    console.log('No Results Found');
                    continue;
                }
                let yearForCode = (new Date()).getFullYear();
                // get results
                let codeViolationId = parseInt(`${yearForCode}${id.toString().padStart(4, '0')}`);
                counts += await this.getData3(page, sourceId, codeViolationId, caseId);
                await this.sleep(2000);
            }
        }
        return counts;
    }

    getStartNumberString2(startNum: number, lengthdigit = 4) {
        let result = startNum.toString().padStart(lengthdigit, '0');
        return result;
    }

    getStartNumberString3(startNum: number, lengthdigit = 5) {
        let result = startNum.toString().padStart(lengthdigit, '0');
        return result;
    }

    async setSearchCriteria2(page: puppeteer.Page, id: string) {

        // choose begin with
        await page.select('#cplMain_ddSearchOper', 'BEGINS WITH');
        // page loaded successfully

        let [input_handle] = await page.$x('//*[@id="cplMain_txtSearchString"]');
        await input_handle.type(id);
    }

    async getData2(page: puppeteer.Page, sourceId: number, codeViolationId: number, caseId: string) {
        let counts = 0;
        let index = 1;
        const rows = await page.$x('//table[contains(@id, "rgSearchRslts")]/tbody/tr');
        for (const row of rows) {
            try {
                const rowCaseType = await page.$x('//table[contains(@id, "rgSearchRslts")]/tbody/tr[' + index + ']/td[3]/span');
                let casetype = await page.evaluate(el => el.getAttribute('title'), rowCaseType[0]);
                casetype = casetype.replace(/\s+|\n/, ' ').trim();
                let property_address = await page.evaluate(el => el.children[1].textContent, row);
                property_address = property_address.replace(/\s+|\n/, ' ').trim();
                casetype = casetype.replace(/\s+|\n/, ' ').trim();
                casetype = casetype.replace('RV ', 'RECREATIONAL VEHICLE ').trim();
                if (casetype == '' || property_address == '') {
                    index++;
                    continue
                }
                if (casetype == 'AVA') {
                    casetype = 'Abandoned Vehicle Abatement'
                }
                if (await this.saveRecord({ property_address, casetype, sourceId, codeViolationId })) counts++;
            } catch (error) {
                console.log(error)
            }
            index++
        }
        return counts;
    }

    async getData3(page: puppeteer.Page, sourceId: number, codeViolationId: number, caseId: string) {
        let counts = 0;
        let index = 1;
        const rows = await page.$x('//table[contains(@id, "rgSearchRslts")]/tbody/tr');
        for (const row of rows) {
            try {
                const rowCaseType = await page.$x('//table[contains(@id, "rgSearchRslts")]/tbody/tr[' + index + ']');

                let property_address = await page.evaluate(el => el.children[1].textContent, row);
                property_address = property_address.replace(/\s+|\n/, ' ').trim();
                await rowCaseType[0].click();
                await page.waitForXPath('//div[@id="cplMain_UpdatePanelDetail"]/div/div/table/tbody/tr/td[contains(.,"' + caseId + '")]', { visible: true, timeout: 30000 });
                let casetypeXpath = '//div[@id="cplMain_UpdatePanelDetail"]/div/div/table/tbody/tr[3]/td[2]';
                let casetype = await this.getTextByXpathFromPage(page, casetypeXpath);
                casetype = casetype.replace(/\s+|\n/, ' ').trim();
                if (casetype == '' || property_address == '') {
                    index++;
                    continue
                }
                if (casetype == 'AVA') {
                    casetype = 'Abandoned Vehicle Abatement'
                }
                if (await this.saveRecord({ property_address, casetype, sourceId, codeViolationId })) counts++;
            } catch (error) {
                console.log(error)
            }
            index++
        }
        return counts;
    }

    async handleSource4(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;

        let dateRange = {
            from: this.getFormattedDate(new Date(await this.getPrevCodeViolationId(sourceId, true, (new Date('1/1/2020')).getTime()))),
            to: this.getFormattedDate(new Date())
        };
        console.log('loading page')
        const isPageLoaded = await this.openPage(page, link, '//select[@name="SearchModule"]');
        if (!isPageLoaded) {
            console.log('Page loading failed');
            return counts;
        }

        await this.setSearchCriteria4(page, dateRange);
        await page.click('#button-Search');
        await page.waitForXPath('//div[@id="overlay"]', {visible: true});
        await page.waitForXPath('//div[@id="overlay"]', {hidden: true});

        // get results
        counts += await this.getData4(page, sourceId);
        await this.sleep(3000);
        return counts;
    }

    async setSearchCriteria4(page: puppeteer.Page, dateRange: any) {
        // setting code case
        await this.sleep(20000);
        await page.waitForSelector('#SearchModule', { visible: true });
        await page.select('#SearchModule', 'number:5');
        await page.click('#button-Advanced')
        await page.waitForXPath('//input[@id="OpenedDateFrom"]', {visible: true});
        // setting date range
        const fromDateHandle = await page.$x('//input[@id="OpenedDateFrom"]');
        await fromDateHandle[0].click({clickCount: 3});
        await fromDateHandle[0].press('Backspace');
        await fromDateHandle[0].type(dateRange.from, {delay: 150});

        const toDateHandle = await page.$x('//input[@id="OpenedDateTo"]');
        await toDateHandle[0].click({clickCount: 3});
        await toDateHandle[0].press('Backspace');
        await toDateHandle[0].type(dateRange.to, {delay: 150});
    }

    async getData4(page: puppeteer.Page, sourceId: number) {
        let counts = 0, pageNum = 1;

        while (true) {            
            const rowXpath = '//*[contains(@id, "entityRecordDiv")]';
            const rows = await page.$x(rowXpath);
            for (let i = 0; i < rows.length; i++) {
                let dateHandle = await page.$x(rowXpath + `[${i + 1}]//*[@name="label-OpenedDate"]//span`);
                let fillingDate = await dateHandle[0].evaluate(el => el.textContent?.trim());
                let typeHandle = await page.$x(rowXpath + `[${i + 1}]//*[@name="label-CodeCaseType"]//span`);
                let originalDocType = await typeHandle[0].evaluate(el => el.textContent?.trim());
                let addressHandle = await page.$x(rowXpath + `[${i + 1}]//*[@name="label-Address"]//span`);
                let address = await addressHandle[0].evaluate(el => el.textContent?.trim());
                let record = {
                    property_address: address,
                    fillingdate: fillingDate,
                    casetype: originalDocType,
                    sourceId,
                    codeViolationId: (new Date(fillingDate!)).getTime()
                };
                if (await this.saveRecord(record)) {
                    counts++;
                }
            }
            let nextHandle = await page.$x(`//*[@id="link-NextPage"]`);
            let nextSuperHandle = await page.$x('//*[@id="link-NextPage"]/parent::li');
            let className = await nextSuperHandle[0].evaluate(el => el.getAttribute('class'));
            if (className != "disabled") {
                await nextHandle[0].click();
                await page.waitForXPath('//div[@id="overlay"]', {visible: true});
                await page.waitForXPath('//div[@id="overlay"]', {hidden: true});
                pageNum++;
            } else {
                break;
            }            
        }
        return counts;
    }

    async saveRecord(record: any) {
        // save property data
        const data = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'Property Address': record.property_address,
            "vacancyProcessed": false,
            "productId": this.productId,
            originalDocType: record.casetype,
            sourceId: record.sourceId,
            codeViolationId: record.codeViolationId
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }
}