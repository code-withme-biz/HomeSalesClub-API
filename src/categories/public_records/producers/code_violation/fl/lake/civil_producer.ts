import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';

export default class CivilProducer extends AbstractProducer {
    productId = '';
    sources =
        [
            { url: 'https://www.lakecountyfl.gov/offices/code_enforcement/cases.aspx', handler: this.handleSource1 },
            { url: 'https://etrakit.clermontfl.org/etrakit3/Search/case.aspx', handler: this.handleSource2 }
        ];

    async init(): Promise<boolean> {
        console.log("running init")
        this.browser = await this.launchBrowser();
        this.browserPages.generalInfoPage?.setDefaultTimeout(60000);
        this.browserPages.generalInfoPage = await this.browser.newPage();
        await this.setParamsForPage(this.browserPages.generalInfoPage);
        return true;
    };

    async read(): Promise<boolean> {
        return true;
    };


    async parseAndSave(): Promise<boolean> {
        let countRecords = 0;
        let page = this.browserPages.generalInfoPage;
        if (!page) {
            return false;
        }
        await page.setDefaultTimeout(60000);

        let sourceId = 0;
        for (const source of this.sources) {
            countRecords += await source.handler.call(this, page, source.url, sourceId);
            sourceId++;
        }
        console.log('---- ', countRecords);
        await AbstractProducer.sendMessage(this.publicRecordProducer.state, this.publicRecordProducer.county ? this.publicRecordProducer.county : this.publicRecordProducer.city, countRecords, 'Code Violation');
        return true;
    }

    async handleSource1(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;

        let dateRange = {
            from: new Date(await this.getPrevCodeViolationId(sourceId, true, (new Date('1/1/2020')).getTime())),
            to: new Date()
        };
        const isPageLoaded = await this.openPage(page, link, '//*[@id="btnSubmit"]');
        if (!isPageLoaded) {
            console.log()
            return counts;
        }

        await this.setSearchCriteria1(page, dateRange);

        await Promise.all([
            page.click('#btnSubmit'),
            page.waitForNavigation()
        ])

        // get results
        counts += await this.getData1(page, sourceId);
        await this.sleep(3000);
        return counts;
    }

    async setSearchCriteria1(page: puppeteer.Page, dateRange: any) {
        // setting date range
        const from = await this.getFormattedDate(dateRange.from);
        const fromDateHandle = await page.$x('//input[@name="txtStartDate"]');
        await fromDateHandle[0].click({ clickCount: 3 });
        await fromDateHandle[0].press('Backspace');
        await fromDateHandle[0].type(from, { delay: 150 });

        const to = await this.getFormattedDate(dateRange.to);
        const toDateHandle = await page.$x('//input[@name="txtEndDate"]');
        await toDateHandle[0].click({ clickCount: 3 });
        await toDateHandle[0].press('Backspace');
        await toDateHandle[0].type(to, { delay: 150 });
    }

    async getData1(page: puppeteer.Page, sourceId: number) {
        let counts = 0;

        while (true) {
            const rowXpath = '//*[@id="case-results"]/table//tr[contains(@class, "row")]';
            const rows = await page.$x(rowXpath);
            for (const row of rows) {
                let fillingDate = await row.evaluate(el => el.children[1].children[0].textContent?.trim());
                let originalDocType = await row.evaluate(el => el.children[2].children[0].textContent?.trim());
                let address = await row.evaluate(el => el.children[4].children[0].textContent?.trim());
                let codeViolationId = (new Date(fillingDate!)).getTime();
                if (await this.saveRecord({ address, originalDocType, fillingDate, sourceId, codeViolationId })) {
                    counts++;
                }
            }
            let nextHandle = await page.$x(`//a[contains(text(), "Next")]`);
            if (nextHandle.length > 0) {
                await Promise.all([
                    nextHandle[0].click(),
                    page.waitForNavigation()
                ]);
            } else {
                break;
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
        console.log(data);

        return await this.civilAndLienSaveToNewSchema(data);
    }

    getStartNumberString(startNum: number, lengthdigit = 4) {
        let result = startNum.toString().padStart(lengthdigit, '0');
        return result;
    }

    async handleSource2(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;
        let startNum = await this.getPrevCodeViolationId(sourceId, false, 0, true);
        let currYear = (new Date()).getFullYear();
        for (let year = startNum===0 ? 2020 : currYear ; year <= currYear ; year++) {
            for (let id = year === currYear ? startNum : 0 ; id < 10000; id++) {
                let startNumString = this.getStartNumberString(id);
                const isPageLoaded = await this.openPage(page, link, '//*[@id="cplMain_txtSearchString"]');
                if (!isPageLoaded) {
                    console.log('Page loading is failed, trying next...');
                    continue;
                }
                let caseId = 'C' + year + "-" + startNumString;
                let codeViolationId = parseInt(`${year}${this.getStartNumberString(id)}`);
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
                    page.waitForXPath('//*[@id="ctl00_cplMain_hlSearchResults"]', { visible: true })
                ]);
                let result_text = await result_handle.evaluate(el => el.textContent || '');
                if (result_text?.indexOf('no results') > -1) {
                    break;
                }
                // get results
                counts += await this.getData2(page, sourceId, codeViolationId, caseId);
                await this.sleep(2000);
            }
        }
        return counts;
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
                const rowCaseType = await page.$x('//table[contains(@id, "rgSearchRslts")]/tbody/tr[' + index + ']');

                await rowCaseType[0].click();
                await page.waitForXPath('//table[@id="cplMain_ctl08_dvCaseInfo"]/tbody/tr/td[contains(.,"' + caseId + '")]', { visible: true, timeout: 30000 });
                let casetypeXpath = '//table[@id="cplMain_ctl08_dvCaseInfo"]/tbody/tr[3]/td[2]';
                let casetype = await this.getTextByXpathFromPage(page, casetypeXpath);
                casetype = casetype.replace(/\s+|\n/, ' ').trim();

                let [btnSiteInfo] = await page.$x('//a[@class="rtsLink rtsAfter"]');
                await btnSiteInfo.click();
                await page.waitForXPath('//span[@id="cplMain_ctl09_lblSiteAddrLbl"]', { visible: true, timeout: 30000 });
                let property_address = await this.getTextByXpathFromPage(page, '//a[@id="cplMain_ctl09_hlSiteAddress"]');
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
}