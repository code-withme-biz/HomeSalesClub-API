import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';

export default class CivilProducer extends AbstractProducer {

    sources =
      [
        {url: 'http://onestopshop.wpbgov.com/egovplus/code/codeenf.aspx', handler: this.handleSource1 },
        {url: 'https://wellingtonfl-energovweb.tylerhost.net/apps/SelfService#/search', handler: this.handleSource2 }
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
        let month = await this.getPrevCodeViolationId(sourceId);
        let thismonth = (new Date()).getMonth() + 1;
        while (month <= thismonth) {
            // load page
            const isPageLoaded = await this.openPage(page, link, '//*[@name="case_no"]');
            if (!isPageLoaded) {
                console.log('Page loading is failed, trying next...');
                continue;
            }
            await this.setSearchCriteria1(page, month);               
            // click search button
            await Promise.all([
                page.click('input[value="SEARCH"]'),
                page.waitForNavigation()
            ]);
            const [noresult] = await page.$x('//*[contains(text(), "No matching records found.")]');
            if (noresult) continue;

            await page.waitForXPath('//*[@class="search_results"]/tbody/tr[position()>1]/td[1]/a');
            // get results
            counts += await this.getData1(page, month, sourceId);
            await this.sleep(3000);
            month++;
        }
        return counts;
    }

    async setSearchCriteria1(page: puppeteer.Page, month: number) {
        // get year
        let year = (new Date()).getFullYear();
        // page loaded successfully
        let [input_handle] = await page.$x('//*[@name="case_no"]');
        let search_str = (year % 100).toString().padStart(2, '0') + month.toString().padStart(2, '0');
        await input_handle.type(`CE${search_str}`, {delay: 100});
    }

    async getData1(page: puppeteer.Page, month: number, sourceId: number) {
        let counts = 0;
        const rows = await page.$x('//*[@class="search_results"]/tbody/tr[position()>1]/td[1]/a');
        const links = [];
        for (const row of rows) {
            let link = await page.evaluate(el => el.href, row);
            links.push(link);
        }
        for (const link of links) {
            await this.openPage(page, link, '//*[@class="search_results"]');
            let fillingdate = await this.getTextByXpathFromPage(page, '//*[text()="Case Date"]/following-sibling::td[1]');
            let casetype = await this.getTextByXpathFromPage(page, '//*[text()="Type"]/following-sibling::td[1]');
            let property_addresss = await this.getTextByXpathFromPage(page, '//*[text()="Property Address"]/following-sibling::td[1]');
            let ownername = await this.getTextByXpathFromPage(page, '//*[text()="Owner"]/following-sibling::td[1]');
            ownername = ownername.slice(0, ownername.indexOf('&')).trim();
            let mailing_address = await this.getTextByXpathFromPage(page, '//*[text()="Owner Address"]/following-sibling::td[1]');

            if (await this.saveRecord({
                ownername,
                property_addresss,
                mailing_address,
                fillingdate,
                casetype,
                sourceId,
                codeViolationId: month
            })) counts++;
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

        await this.setSearchCriteria2(page, dateRange);
        await page.click('#button-Search');
        await page.waitForXPath('//div[@id="overlay"]', {visible: true});
        await page.waitForXPath('//div[@id="overlay"]', {hidden: true});

        // get results
        counts += await this.getData2(page, sourceId);
        await this.sleep(3000);
        return counts;
    }

    async setSearchCriteria2(page: puppeteer.Page, dateRange: any) {
        // setting code case
        await this.sleep(20000);
        await page.waitForSelector('#SearchModule', { visible: true });
        await page.select('#SearchModule', 'number:5');
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
            for (let i = 0; i < rows.length; i++) {
                let dateHandle = await page.$x(rowXpath + `[${i + 1}]//*[@name="label-OpenedDate"]/span`);
                let fillingDate = await dateHandle[0].evaluate(el => el.textContent?.trim());
                let typeHandle = await page.$x(rowXpath + `[${i + 1}]//*[@name="label-CodeCaseType"]/span`);
                let originalDocType = await typeHandle[0].evaluate(el => el.textContent?.trim());
                let addressHandle = await page.$x(rowXpath + `[${i + 1}]//*[@name="label-Address"]/span`);
                let address = await addressHandle[0].evaluate(el => el.textContent?.trim());
                let record = {
                    property_addresss: address,
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
        let data: any = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'Property Address': record.property_addresss,
            "vacancyProcessed": false,
            "productId": this.productId,
            fillingDate: record.fillingdate,
            originalDocType: record.casetype,
            sourceId: record.sourceId,
            codeViolationId: record.codeViolationId
        };
        if (record.ownername) {
            // save owner data
            let parseName: any = this.newParseName(record.ownername.trim());
            if(parseName.type && parseName.type == 'COMPANY'){
                return false;
            }
            data = {
                ...data,
                'First Name': parseName.firstName,
                'Last Name': parseName.lastName,
                'Middle Name': parseName.middleName,
                'Name Suffix': parseName.suffix,
                'Full Name': parseName.fullName,
                'Mailing Address': record.mailing_address
            }
        }
        return await this.civilAndLienSaveToNewSchema(data);
    }
}