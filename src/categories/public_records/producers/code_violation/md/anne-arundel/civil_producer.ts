import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';

export default class CivilProducer extends AbstractProducer {

    sources = [
        { url: 'https://www.aacounty.org/departments/inspections-and-permits/code-compliance/review-system/', handler: this.handleSource1 },
        { url: 'https://etrakit.annapolis.gov/Search/case.aspx', handler: this.handleSource2 }
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

    getStartNumberString(startNum: number, lengthdigit = 3) {
        let result = startNum.toString().padStart(lengthdigit, '0');
        return result;
    }


    async parseAndSave(): Promise<boolean> {
        let countRecords = 0;
        let page = this.browserPages.generalInfoPage;
        if (!page) return false;

        await page.setDefaultTimeout(60000);

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
        const isPageLoaded = await this.openPage(page, link, '//*[@id="caseType"]');
        if (!isPageLoaded) {
            console.log('Not found');
            return counts;
        }
        let prevCodeViolationId = await this.getPrevCodeViolationId(sourceId, false, 1);
        let id = prevCodeViolationId;
        let notfound = 0;
        while (true) {
            const year = (new Date()).getFullYear().toString();
            await page.select('#caseType', 'B');
            const yearHandle = await page.$('#caseYear');
            await yearHandle?.click({ clickCount: 3 });
            await yearHandle?.press('Backspace');
            await yearHandle?.type(year, { delay: 150 });
            const numHandle = await page.$('#caseNum');
            await numHandle?.click({ clickCount: 3 });
            await numHandle?.press('Backspace');
            await numHandle?.type(id.toString(), { delay: 150 });

            await page.click('#submitbutton');
            await page.waitForXPath('//*[text()="Loading"]', { hidden: true });
            const [nocase] = await page.$x('//*[text()="No cases found"]');
            if (nocase) {
                console.log('No Case Founds');
                notfound++;
                if (notfound > 2) break;
                continue;
            }
            notfound = 0;
            // 
            await page.waitForXPath('//table[@id="data_table"]/tbody/tr[1]/td[3]');
            let property_address = await this.getTextByXpathFromPage(page, '//table[@id="data_table"]/tbody/tr[1]/td[3]');
            console.log(property_address);
            property_address = property_address && property_address.slice(2).trim();
            let fillingdate = await this.getTextByXpathFromPage(page, '//table[@id="data_table"]/tbody/tr[1]/td[4]');
            console.log(fillingdate);
            const casetype = 'Building Case';
            const res = {
                property_address,
                fillingdate,
                casetype,
                sourceId,
                codeViolationId: id
            };
            if (await this.saveRecord(res)) counts++;
            await this.sleep(this.getRandomInt(1000, 2000));
            id++;
        }
        return counts;
    }

    async handleSource2(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;
        // code violation id = year{0000} + month{00} + id{000}
        let prevCodeViolationId = await this.getPrevCodeViolationId(sourceId, false, 202101001, true);
        let startCaseCodes = [
            { code: 'ENV', flagStop: false }
        ]
        let fullyear = (new Date()).getFullYear();
        let year = (new Date()).getFullYear().toString().substr(-2);
        let currMonth = ((new Date()).getMonth() + 1);
        let startMonth = Math.floor(prevCodeViolationId / 1000);
        let startNum = prevCodeViolationId % 1000;
        
        for (let MONTH = startMonth; MONTH <= currMonth ; MONTH++) {
            if (MONTH === startMonth) 
                startNum = prevCodeViolationId % 1000;
            else
                startNum = 1;
            let month = MONTH.toString().padStart(2, '0');
            for (let caseCode = 0; caseCode < startCaseCodes.length; caseCode++) {
                startCaseCodes[caseCode].flagStop = false;
            }
            for (let id = startNum; id < 1000; id++) {
                // load page
                let startNumString = this.getStartNumberString(id);
                for (let caseCode = 0; caseCode < startCaseCodes.length; caseCode++) {
                    if (startCaseCodes[caseCode].flagStop) {
                        console.log('Progress another case for id = ' + id);
                        continue
                    }
                    const isPageLoaded = await this.openPage(page, link, '//*[@id="cplMain_txtSearchString"]');
                    if (!isPageLoaded) {
                        console.log('Page loading is failed, trying next...');
                        continue;
                    }

                    let caseId = startCaseCodes[caseCode].code + year + month + "-" + startNumString;
                    await page.select('#cplMain_ddSearchBy', 'Case_Main.CASE_NO');
                    await this.setSearchCriteria2(page, caseId);
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
                    let codeViolationId = parseInt(`${fullyear}${month}${this.getStartNumberString(id)}`);
                    counts += await this.getData2(page, sourceId, codeViolationId, caseId);
                    await this.sleep(2000);
                }
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

                let property_address = await page.evaluate(el => el.children[1].textContent, row);
                property_address = property_address.replace(/\s+|\n/, ' ').trim();
                await rowCaseType[0].click();
                await page.waitForXPath('//table[@id="cplMain_ctl02_dvCaseInfo"]/tbody/tr/td[contains(.,"' + caseId + '")]', { visible: true, timeout: 30000 });
                let casetypeXpath = '//table[@id="cplMain_ctl02_dvCaseInfo"]/tbody/tr[3]/td[2]';
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

    async saveRecord(record: any) {
        const data = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'Property Address': record.property_address,
            "vacancyProcessed": false,
            "productId": this.productId,
            "caseUniqueId": record.caseno,
            fillingDate: record.fillingdate,
            originalDocType: record.casetype,
            sourceId: record.sourceId,
            codeViolationId: record.codeViolationId
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }
}