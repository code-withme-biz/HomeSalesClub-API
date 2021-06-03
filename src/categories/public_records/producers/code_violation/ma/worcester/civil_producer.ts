import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
import axios from 'axios';
import qs from 'qs';

export default class CivilProducer extends AbstractProducer {
    productId = '';
    sources =
      [
        { url: 'https://upton.patriotpermitpro.com/index.php?act=dashboard', handler: this.handleSource1 }
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
        const isPageLoaded = await this.openPage(page, link, '//*[@id="resultsTable"]/tbody/tr');
        if (!isPageLoaded) {
            console.log('Page loading failed');
            return counts;
        }

        let fromDate = await this.getPrevCodeViolationId(sourceId, true);
        
        // get results
        counts += await this.getData1(page, sourceId, fromDate);
        await this.sleep(3000);
        return counts;
    }

    async getData1(page: puppeteer.Page, sourceId: number, fromDate: number) {
        let counts = 0;
        const types = [
            `Residential - Building`,
            `Standard Permit`
        ];
        const removetypeRegex = new RegExp(`\\b(?:${types.join('|')})\\b`, 'i');

        while (true) {            
            const rowXpath = '//*[@id="resultsTable"]/tbody/tr';
            const rows = await page.$x(rowXpath);
            const firstRow = await page.$x('//*[@id="resultsTable"]/tbody/tr[1]/td[3]');
            const date = await firstRow[0].evaluate(el => el.textContent?.trim());
            if (fromDate < (new Date(date!)).getTime()) {
                for (const row of rows) {
                    let fillingDate = await row.evaluate(el => el.children[2].textContent?.trim());
                    let originalDocType = await row.evaluate(el => el.children[3].textContent?.trim());
                    let address = await row.evaluate(el => el.children[5].textContent?.trim());
                    if (!removetypeRegex.test(originalDocType!)) {
                        console.log('no enforcement');
                        continue;
                    }
                   
                    const timestamp = (new Date(fillingDate!)).getTime();
                    if (fromDate < timestamp) {
                        console.log('reached out here');
                        if (await this.saveRecord(address!, originalDocType!, fillingDate!, sourceId, timestamp)) {
                            counts++;
                        }
                    }
                    
                }
                await page.click('#resultsTableNext');
                await this.sleep(3000);
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