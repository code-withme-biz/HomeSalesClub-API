import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';

export default class CivilProducer extends AbstractProducer {
    productId = '';
    sources =
      [
        { url: 'https://cdplusmobile.marioncountyfl.org/pdswebservices/prod/webpermit/webpermits.dll', handler: this.handleSource1 }
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
        const isPageLoaded = await this.openPage(page, link, '//input[@id="BTNREPORTS"]');
        if (!isPageLoaded) {
            console.log('Page loading failed');
            return counts;
        }
        await this.sleep(5000);
        await page.click('input#BTNREPORTS'); 
        await page.waitForXPath('//span[contains(text(), "ISSUED")]');
        await this.sleep(1000);
        await page.click('#RGDATETYPE_INPUT_3', {clickCount: 3, delay: 150});
        await this.sleep(1000);
        
        let fromDate =  new Date(await this.getPrevCodeViolationId(sourceId, true));
        let toDate = new Date();
        while (fromDate < toDate) {
            await this.setSearchCriteria(page, fromDate);   
            const btnHandle = await page.$x('//input[@id="BTNSEARCH"]')
            await btnHandle[0].click();
            //section[@id="iwnotify"]
            await this.sleep(5000);

            const countHandle = await page.$('#LBLRECCNT');
            const count = await countHandle?.evaluate(el => el.textContent?.trim());
            if (parseInt(count!) > 0) {
                counts += await this.getData1(page, sourceId, fromDate);
                await this.sleep(3000);
            } else {
                const buttonHandle = await page.$x('//section[@id="iwnotify"]//button');
                await buttonHandle[0].click();
            }       
            fromDate.setDate(fromDate.getDate()+1);
            await this.randomSleepIn5Sec();
        }
        return counts;
    }

    async setSearchCriteria(page: puppeteer.Page, fromDate: Date) {
        // setting date range
        const date = this.getFormattedDate(fromDate);
        const dateHandle = await page.$x('//*[contains(@id, "DATEcalvalue")]');
        await dateHandle[0].click({clickCount: 3});
        await dateHandle[0].press('Backspace');
        await dateHandle[0].type(date, {delay: 150});

        await dateHandle[1].click({clickCount: 3});
        await dateHandle[1].press('Backspace');
        await dateHandle[1].type(date, {delay: 150});
    }

    async getData1(page: puppeteer.Page, sourceId: number, fromDate: Date) {
        let counts = 0, pageNum = 1;

        while (true) {            
            const rowXpath = '//tr[contains(@id, "row")]';
            const rows = await page.$x(rowXpath);
            for (const row of rows) {
                let address = await row.evaluate(el => el.children[2].children[0].children[0].textContent?.trim());
                let originalDocType = await row.evaluate(el => el.children[1].children[0].children[0].textContent?.trim());
                const timestamp = fromDate.getTime();
                if (await this.saveRecord(address!, originalDocType!, this.getFormattedDate(fromDate), sourceId, timestamp)) {
                    counts++;
                }
            }
            let nextHandle = await page.$x(`//span[contains(@onclick, "onNextPage")]`);
            if (nextHandle.length > 0) {
                await nextHandle[0].click();
                await this.sleep(3000);
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