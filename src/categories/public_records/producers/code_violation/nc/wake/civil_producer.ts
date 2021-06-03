import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';

export default class CivilProducer extends AbstractProducer {
    productId = '';
    sources =
      [
        { url: 'http://www.rfdreports.net/', handler: this.handleSource1 },
        { url: 'https://raleighnc-energovpub.tylerhost.net/apps/selfservice#/search', handler: this.handleSource2 },
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

    async setSearchCriteria(page: puppeteer.Page, date: Date) {
        // setting date range
        const year = date.getFullYear().toString();
        const month = ("00" + (date.getMonth() + 1)).slice(-2);
        const day = ("00" + date.getDate()).slice(-2)
        await page.select('#date2_month', month);
        await page.select('#date2_day', day);
        await page.select('#date2_year', year);
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
        
        console.log('---- ', countRecords);
        await AbstractProducer.sendMessage(this.publicRecordProducer.state, this.publicRecordProducer.county ? this.publicRecordProducer.county : this.publicRecordProducer.city, countRecords, 'Code Violation');
        return true;
    }

    async handleSource1(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;
        const isPageLoaded = await this.openPage(page, link, '//form[@action="date.php"]//input[@value="Submit"]');
        if (!isPageLoaded) {
            console.log()
            return counts;
        }

        let dateRange = {
            from: new Date(await this.getPrevCodeViolationId(sourceId, true, (new Date('10/1/2020')).getTime())),
            to: new Date()
        };
        let date = dateRange.from;
        let today = dateRange.to;

        while (date <= today) {
            await this.setSearchCriteria(page, date);
            
            await page.click('form[action="date.php"] input[value="Submit"]');
            let frame: puppeteer.Frame | null | undefined;
            await page.waitForXPath('//iframe[@name="rightcolumn"]');
            let elementHandle = await page.$('iframe[name="rightcolumn"]');
            frame = await elementHandle?.contentFrame();
            await this.sleep(5000);
            const rows = await frame?.$x('//table[2]/tbody/tr/td/parent::tr');
            if (rows?.length == 0) {
                continue;
            };
            // get results
            counts += await this.getData1(frame!, sourceId);
            await this.sleep(3000);
            date.setDate(date.getDate()+1);
        }        
        return counts;
    }

    async getData1(frame: puppeteer.Frame, sourceId: number) {
        let counts = 0;
        const rows = await frame.$x('//table[2]/tbody/tr/td/parent::tr');
        for (const row of rows) {
            let fillingDate = await row.evaluate(el => el.children[0].textContent?.trim());
            let caseType = await row.evaluate(el => el.children[1].textContent?.trim());
            let address = await row.evaluate(el => el.children[6].textContent?.trim());
            let record = {
                property_address: address,
                fillingdate: fillingDate,
                casetype: caseType,
                sourceId,
                codeViolationId: (new Date(fillingDate!)).getTime()
            };
            if (await this.saveRecord(record)) {
                counts++;
            }
        }
        return counts;
    }

    async handleSource2(page: puppeteer.Page, link: string, sourceId: number) {
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

        await this.setSearchCriteria2(page, dateRange, sourceId);
        await page.click('#button-Search');
        await page.waitForXPath('//div[@id="overlay"]', {visible: true});
        await page.waitForXPath('//div[@id="overlay"]', {hidden: true});

        // get results
        counts += await this.getData2(page, sourceId);
        await this.sleep(3000);
        return counts;
    }

    async setSearchCriteria2(page: puppeteer.Page, dateRange: any, sourceId: number) {
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

    async getData2(page: puppeteer.Page, sourceId: number) {
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