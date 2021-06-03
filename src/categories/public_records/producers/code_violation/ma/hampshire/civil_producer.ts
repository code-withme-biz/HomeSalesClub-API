import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';

export default class CivilProducer extends AbstractProducer {
    productId = '';
    sources =
      [
        { url: 'https://hub.arcgis.com/datasets/AmherstMA::code-violation-complaints/data?orderBy=ComplaintDate&orderByAsc=false', handler: this.handleSource1 }
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
        console.log('loading page')
        let fromDate = await this.getPrevCodeViolationId(sourceId, true);

        const isPageLoaded = await this.openPage(page, link, '//tbody/tr[contains(@id, "ember")]');
        if (!isPageLoaded) {
            console.log('Page loading failed');
            return counts;
        }

        // get results
        counts += await this.getData1(page, sourceId, fromDate);
        await this.sleep(3000);
        return counts;
    }

    async getData1(page: puppeteer.Page, sourceId: number, fromDate: number) {
        let counts = 0, pageNum = 1;

        while (true) {            
            const rowXpath = '//tbody/tr[contains(@id, "ember")]';
            const rows = await page.$x(rowXpath);
            const firstRow = await page.$x('//tbody/tr[contains(@id, "ember")][1]/td[2]');
            const first_date = await firstRow[0].evaluate(el => el.textContent?.trim());
            if (fromDate >= (new Date(first_date!)).getTime()) {
                break;
            }
            for (const row of rows) {
                let fillingDate = await row.evaluate(el => el.children[1].textContent?.trim());
                fillingDate = fillingDate?.split(', ')[0];
                let originalDocType = await row.evaluate(el => el.children[2].textContent?.trim());
                let address = await row.evaluate(el => el.children[10].textContent?.trim());
                const timestamp = (new Date(fillingDate!)).getTime();
                if (fromDate < timestamp) {
                    if (await this.saveRecord(address!, originalDocType!, fillingDate!, sourceId, timestamp)) {
                        counts++;
                    }   
                }
            }
            let nextHandle = await page.$x(`//a[@aria-label="Next"]`);
            if (nextHandle.length > 0) {
                await nextHandle[0].click();
                await page.waitForXPath(`//li[@class="active"]/a[text()="${pageNum + 1}"]`)
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