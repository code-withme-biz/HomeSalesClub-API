import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
export default class CivilProducer extends AbstractProducer {
    sources =
        [
            { url: 'https://crw.codb.us/etrakit3/Search/case.aspx', handler: this.handleSource1 },
            { url: 'https://hub.arcgis.com/datasets/CODB::codeenforcement-case-main/data?orderBy=STARTED&orderByAsc=false', handler: this.handleSource2 },
            { url: 'https://deltonafl-energovweb.tylerhost.net/apps/SelfService#/search', handler: this.handleSource3 }
        ];

    async init(): Promise<boolean> {
        console.log("running init")
        this.browser = await this.launchBrowser();
        this.browserPages.generalInfoPage = await this.browser.newPage();

        await this.setParamsForPage(this.browserPages.generalInfoPage);
        return true;
    };
    async read(): Promise<boolean> {
        return true;
    };

    getStartNumberString(startNum: number, lengthdigit = 4) {
        let result = startNum.toString().padStart(lengthdigit, '0');
        return result;
    }

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

    async handleSource1(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;
        let startNum = await this.getPrevCodeViolationId(sourceId);
        let startCaseCodes = [
            { code: 'BP', flagStop: false },
            { code: 'CE', flagStop: false },
            { code: 'RI', flagStop: false },
        ]
        for (let id = startNum; id < startNum + 200; id++) {
            // load page
            // get year
            let year = (new Date()).getFullYear();
            let startNumString = this.getStartNumberString(id);


            for (let caseCode = 0; caseCode < startCaseCodes.length; caseCode++) {
                try {
                    if (startCaseCodes[caseCode].flagStop) {
                        console.log('Progress another case for id = ' + id);
                        continue
                    }
                    const isPageLoaded = await this.openPage(page, link, '//*[@id="cplMain_txtSearchString"]');
                    if (!isPageLoaded) {
                        console.log('Page loading is failed, trying next...');
                        continue;
                    }

                    let caseId = startCaseCodes[caseCode].code + year + "-" + startNumString;

                    await this.setSearchCriteria1(page, caseId);
                    // click search button
                    await page.click('#cplMain_btnSearch');

                    // wait for search result
                    await page.waitForSelector('#cplMain_lblLoading', {visible: true});
                    await page.waitForSelector('#cplMain_lblLoading', {hidden: true});

                    let [noresult] = await page.$x('//*[@id="cplMain_lblNoSearchRslts"]');
                    if (noresult) {
                        console.log('No Results Found');
                        startCaseCodes[caseCode].flagStop = true;
                        continue;
                    }

                    // get results
                    counts += await this.getData1(page, sourceId, id);
                    await this.sleep(2000);
                } catch (e) {}
            }
        }
        return counts;
    }

    async setSearchCriteria1(page: puppeteer.Page, id: string) {

        // choose begin with
        await page.select('#cplMain_ddSearchOper', 'BEGINS WITH');
        // page loaded successfully

        let [input_handle] = await page.$x('//*[@id="cplMain_txtSearchString"]');
        await input_handle.type(id);
    }

    async getData1(page: puppeteer.Page, sourceId: number, codeViolationId: number) {
        let counts = 0;
        let index = 1;
        const rows = await page.$x('//table[contains(@id, "rgSearchRslts")]/tbody/tr');
        for (const row of rows) {
            try {
                const rowCaseType = await page.$x('//table[contains(@id, "rgSearchRslts")]/tbody/tr[' + index + ']/td[2]/span');
                let casetype = await page.evaluate(el => el.getAttribute('title'), rowCaseType[0]);
                casetype = casetype.replace(/\s+|\n/, ' ').trim();
                let property_address = await page.evaluate(el => el.children[2].textContent, row);
                property_address = property_address.replace(/\s+|\n/, ' ').trim();
                if (casetype == '' || property_address == '') {
                    index++;
                    continue
                }
                if (await this.saveRecord({ property_address, casetype, sourceId, codeViolationId })) counts++;
            } catch (error) {
            }
            index++
        }
        return counts;
    }

    async handleSource2(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;
        // load page
        const isPageLoaded = await this.openPage(page, link, '//*[text()="OBJECTID"]/ancestor::table[1]/tbody/tr');
        if (!isPageLoaded) {
            console.log("Website not loaded successfully:", link);
            return counts;
        }

        let prevCodeViolationId = await this.getPrevCodeViolationId(sourceId, true, -1);

        while (true) {
            const rows = await page.$x('//*[text()="OBJECTID"]/ancestor::table[1]/tbody/tr');
            let flag = false;
            for (const row of rows) {
                let fillingdate = await row.evaluate(el => el.children[6].textContent) || '';
                fillingdate = fillingdate.replace(/\s+|\n/gm, ' ').trim();
                let codeViolationId = (new Date(fillingdate)).getTime();
                if (prevCodeViolationId > codeViolationId) {
                    flag = true;
                    break;
                }
                let casetype = await row.evaluate(el => el.children[16].textContent) || '';
                casetype = casetype.replace(/\s+/gm, ' ').trim();
                let property_city = await row.evaluate(el => el.children[24].textContent) || '';
                property_city = property_city.replace(/\s+/gm, ' ').trim();
                let property_zip = await row.evaluate(el => el.children[26].textContent) || '';
                property_zip = property_zip.replace(/\s+/gm, ' ').trim();
                let property_address = await row.evaluate(el => el.children[32].textContent) || '';
                property_address = property_address.replace(/\s+/gm, ' ').trim();
                let owner_name = await row.evaluate(el => el.children[44].textContent) || '';
                owner_name = owner_name.replace(/[^a-zA-Z\s]+/g, '');
                let mailing_address = await row.evaluate((el: any) => el.children[70].textContent) || '';
                mailing_address = mailing_address.replace(/\s+|\n/gm, ' ').trim();
                let mailing_city = await row.evaluate((el: any) => el.children[71].textContent) || '';
                mailing_city = mailing_city.replace(/\s+|\n/gm, ' ').trim();
                let mailing_zip = await row.evaluate((el: any) => el.children[73].textContent) || '';
                mailing_zip = mailing_zip.replace(/\s+|\n/gm, ' ').trim();

                const record = {
                    property_address,
                    property_city,
                    property_zip,
                    casetype,
                    fillingdate,
                    sourceId,
                    codeViolationId,
                    owner_name,
                    mailing_address,
                    mailing_city,
                    mailing_zip
                }

                if (await this.saveRecord(record))
                    counts++;
            }
            if (flag) break;
            const [hasnextpage] = await page.$x('//a[text()="›"][@aria-label="Next"]');
            if (hasnextpage) {
                await hasnextpage.click();
                await page.waitForXPath('//*[@class="table-responsive"]/following-sibling::div[contains(@class, "loader")]', { hidden: true });
                await this.sleep(500);
            } else {
                break;
            }
        }
        return counts;
    }

    async handleSource3(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;

        let dateRange = {
            from: this.getFormattedDate(new Date(await this.getPrevCodeViolationId(sourceId, true))),
            to: this.getFormattedDate(new Date())
        };
        console.log('loading page')
        const isPageLoaded = await this.openPage(page, link, '//select[@name="SearchModule"]');
        if (!isPageLoaded) {
            console.log('Page loading failed');
            return counts;
        }

        await this.setSearchCriteria3(page, dateRange);
        await page.click('#button-Search');
        await page.waitForXPath('//div[@id="overlay"]', {visible: true});
        await page.waitForXPath('//div[@id="overlay"]', {hidden: true});

        // get results
        counts += await this.getData3(page, sourceId);
        await this.sleep(3000);
        return counts;
    }

    async setSearchCriteria3(page: puppeteer.Page, dateRange: any) {
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

    async getData3(page: puppeteer.Page, sourceId: number) {
        let counts = 0, pageNum = 1;

        while (true) {            
            const rowXpath = '//*[contains(@id, "entityRecordDiv")]';
            const rows = await page.$x(rowXpath);
            if (rows.length == 0) {
                break;
            } else {
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
        }
        return counts;
    }

    async saveRecord(record: any) {
        let data: any = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'Property Address': record.property_address,
            "vacancyProcessed": false,
            "productId": this.productId,
            originalDocType: record.casetype,
            sourceId: record.sourceId,
            codeViolationId: record.codeViolationId
        };
        if (record.fillingdate) data = { ...data, fillingDate: record.fillingdate };
        if (record.owner_name) {
            // save owner data
            let parseName: any = this.newParseName(record.owner_name.trim());
            if (parseName.type && parseName.type == 'COMPANY') {
                return false;
            }
            data = {
                ...data,
                'First Name': parseName.firstName,
                'Last Name': parseName.lastName,
                'Middle Name': parseName.middleName,
                'Name Suffix': parseName.suffix,
                'Full Name': parseName.fullName,
            }
            if (record.owner_address) {
                data = {
                    ...data,
                    'Mailing Address': record.owner_address
                }
            }
        }
        if (record.property_city) {
            data = {
                ...data,
                'Property City': record.property_city
            }
        }
        if (record.property_zip) {
            data = {
                ...data,
                'Property Zip': record.property_zip
            }
        }
        if (record.mailing_address) {
            data = {
                ...data,
                'Mailing Address': record.mailing_address
            }
        }
        if (record.mailing_city) {
            data = {
                ...data,
                'Mailing City': record.mailing_city
            }
        }
        if (record.mailing_zip) {
            data = {
                ...data,
                'Mailing Zip': record.mailing_zip
            }
        }

        return await this.civilAndLienSaveToNewSchema(data);
    }
}