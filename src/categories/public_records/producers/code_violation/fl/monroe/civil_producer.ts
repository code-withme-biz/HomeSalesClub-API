import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';

export default class CivilProducer extends AbstractProducer {
    productId = '';
    sources =
      [
        { url: 'https://mcesearch.monroecounty-fl.gov/search/code-compliance', handler: this.handleSource1 },
        { url: '', installationID: 326, citizenService: true }
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

    async setSearchCriteria(page: puppeteer.Page, dateRange: any) {
        // setting date range
        const fromDateHandle = await page.$x('//*[@id="from"]');
        await fromDateHandle[0].click();
        await fromDateHandle[0].type(dateRange.from, {delay: 150});

        const toDateHandle = await page.$x('//*[@id="to"]');
        await toDateHandle[0].click();
        await toDateHandle[0].type(dateRange.to, {delay: 150});
    }

    async parseAndSave(): Promise<boolean> {
        let countRecords = 0;
        let page = this.browserPages.generalInfoPage;
        if (!page) {
            return false;
        }
        let sourceId = 0;
        for (const source of this.sources) {
            if (!source.handler) {
                countRecords += await this.handleCitizenSerice(page, source.installationID, sourceId);
            } else {
                countRecords += await source.handler.call(this, page, source.url, sourceId);
            }
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
            from: this.getFormattedDate(new Date(await this.getPrevCodeViolationId(sourceId, true))),
            to: this.getFormattedDate(new Date())
        };
        console.log('loading page')
        const isPageLoaded = await this.openPage(page, link, '//*[@id="search"]');
        if (!isPageLoaded) {
            console.log('Page loading failed');
            return counts;
        }
        await this.setSearchCriteria(page, dateRange);
        
        await page.click('#search');
        await page.waitForXPath('//div[@id="codes_processing"]', {visible: true});
        await page.waitForXPath('//div[@id="codes_processing"]', {hidden: true});

        // get results
        counts += await this.getData1(page, sourceId);
        await this.sleep(3000);
        return counts;
    }

    async getData1(page: puppeteer.Page, sourceId: number) {
        let counts = 0, pageNum = 1;

        while (true) {            
            const rowXpath = '//*[@id="codes"]/tbody/tr';
            const rows = await page.$x(rowXpath);
            for (const row of rows) {
                let link = await row.evaluate(el => el.children[0].children[0].getAttribute('href'));
                if (!link) {
                    continue;
                }
                let address = await row.evaluate(el => el.children[2].textContent?.trim());

                const detailPage = await this.browser?.newPage();
                if (!detailPage) {
                    continue;
                }
                await detailPage.goto(link!, {waitUntil: 'load'});
                const dateHandle = await detailPage.$x('//h5[text()="CODE COMPLIANCE DETAIL"]/parent::div/table//tr[2]/td[1]');
                const typeHandle = await detailPage.$x('//h5[text()="COMPLAINT CODES"]/parent::div/table//tr/td');
                if (!dateHandle[0] || !typeHandle[0]) {
                    await detailPage.close();
                    continue;
                }
                let fillingDate = await dateHandle[0].evaluate(el => el.textContent?.trim());
                let originalDocType = await typeHandle[0].evaluate(el => el.textContent?.trim());
                await detailPage.close();
               
                const timestamp = (new Date(fillingDate!)).getTime();
                if (await this.saveRecord(address!, originalDocType!, fillingDate!, sourceId, timestamp)) {
                    counts++;
                }
            }
            let nextHandle = await page.$x(`//a[contains(text(), "Next")]`);
            let parentHandle = await page.$x(`//a[contains(text(), "Next")]/parent::li`)
            let className = await parentHandle[0].evaluate(el => el.getAttribute('class'));
            if (!className?.includes('disabled')) {
                await nextHandle[0].click();
                await page.waitForXPath('//div[@id="codes_processing"]', {visible: true});
                await page.waitForXPath('//div[@id="codes_processing"]', {hidden: true});
                pageNum++;
            } else {
                break;
            }            
        }
        return counts;
    }

    async saveRecord(address: string, caseType: string, fillingDate: string, sourceId: number, codeViolationId: number) {
        const data = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'Property Address': address,
            "vacancyProcessed": false,
            "productId": this.productId,
            fillingDate,
            originalDocType: caseType,
            sourceId,
            codeViolationId
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }
}