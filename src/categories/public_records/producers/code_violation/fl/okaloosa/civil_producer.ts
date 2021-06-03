import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';

export default class CivilProducer extends AbstractProducer {
    productId = '';
    sources =
      [
        { url: 'http://permits.myokaloosa.com/Default.asp?Build=PM.pmPermit.SearchForm&Mode=OpenByKey', handler: this.handleSource1 }
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

    async openPage(page: puppeteer.Page, link: string, xpath: string) {
        try {
            await page.goto(link, {waitUntil: 'load'});
            await page.$x(xpath);
            return true;
        } catch (error) {
            return false;
        }
    }

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

        let fromDate = await this.getPrevCodeViolationId(sourceId, true, (new Date('1/1/2020')).getTime());
        let types = ['ceb', 'cec'];
        for (let type of types) {
            const isPageLoaded = await this.openPage(page, link, '//input[@value="Search for Permits"]');
            await this.sleep(1000);
            if (!isPageLoaded) {
                console.log()
                return counts
            }
            
            await this.setSearchCriteria1(page, type); 
            await Promise.all([
                page.click('input[value*="Permits"]'),
                page.waitForNavigation()
            ]);
            
            // get results
            counts += await this.getData1(page, fromDate);
            await this.sleep(3000);
        }
        return counts;
    }

    async setSearchCriteria1(page: puppeteer.Page, type: string) {
        await page.select('select[name*="pmPermit"]', type);
    }

    async getData1(page: puppeteer.Page, fromDate: any) {
        let counts = 0;
        const rowXpath = '//a[contains(@href, "pmPermit.Main")]/parent::td/parent::tr';
        const rows = await page.$x(rowXpath);
        
        for (const row of rows) {
            let fillingDate = await row.evaluate(el => el.children[1].textContent?.trim());
            let originalDocType = await row.evaluate(el => el.children[4].textContent?.trim());
            let address = await row.evaluate(el => el.children[2].textContent?.trim());
            const timestamp = (new Date(fillingDate!)).getTime();
            if (fromDate <= timestamp) {
                if (await this.saveRecord(address!, originalDocType!, fillingDate!, timestamp)) {
                    counts++;
                }
            }
        }  

        return counts;
    }

    async saveRecord(address: string, caseType: string, fillingDate: string, codeViolationId: number) {
        const data = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'Property Address': address,
            "vacancyProcessed": false,
            "productId": this.productId,
            fillingDate,
            originalDocType: caseType,
            codeViolationId
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }
}