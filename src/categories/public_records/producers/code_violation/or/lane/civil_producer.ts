import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';

export default class CivilProducer extends AbstractProducer {
    productId = '';
    sources =
      [
        { url: 'https://pdd.eugene-or.gov/CodeCompliance/ComplaintSearch', handler: this.handleSource1 }
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

        let startNum = await this.getPrevCodeViolationId(sourceId, false, 950);

        for (let pre = startNum ; pre < 100000 ; pre ++) {
            const isPageLoaded = await this.openPage(page, link, '//span[text()="Search"]/parent::a');
            await this.sleep(1000);
            if (!isPageLoaded) {
                console.log()
                break;
            }
            const case_num_handle = await page.$x('//a[contains(text(), "By Case Number")]');
            await case_num_handle[0].click();
            await page.waitForXPath('//*[@id="search-by-case-number-form"]//input[@value="Search"]', {visible: true});
            await this.setSearchCriteria1(page, pre);               
            
            await Promise.all([
                page.click('#search-by-case-number-form input[value="Search"]'),
                page.waitForNavigation()
            ]);
            
            const emptyHandle = await page.$x('//p[@id="search-results-empty"]');
            if (emptyHandle.length > 0) {
                break;
            }
            // get results
            counts += await this.getData1(page, pre);
            await Promise.all([
                page.click('#new-search-button-right'),
                page.waitForNavigation()
            ])
            await this.sleep(3000)
        }
        return counts;
    }

    async setSearchCriteria1(page: puppeteer.Page, prefix: number) {
        let year = (new Date()).getFullYear().toString().substr(-2);
        let num = prefix.toString().padStart(5, '0');
        await page.$eval('#search-by-case-number-form', el => el.setAttribute('target', ''));
        await page.click('#FileYY');
        await page.type('#FileYY', year, {delay: 100});
        await page.click('#FileSequence');
        await page.type('#FileSequence', num, {delay: 100});
    }

    async getData1(page: puppeteer.Page, pre: number) {
        let counts = 0;

        let address_handle = await page.$('#complaint-details>tbody>tr:first-child>td');
        let date_handle = await page.$('#complaint-details>tbody>tr>td>table>tbody>tr:nth-child(2)>td:last-child');
        let type_handle = await page.$x('//*[@id="complaint-details"]/tbody/tr[3]/td');
        if (!address_handle || !date_handle || !type_handle[0]) {
            return 0;
        }
        let fillingDate = await date_handle?.evaluate(el => el.textContent?.trim());
        let address = await address_handle?.evaluate(el => el.textContent?.trim());
        let originalDocType = await type_handle[0].evaluate(el => el.textContent?.trim());
        
        if (await this.saveRecord(address!, originalDocType!, fillingDate!, pre)) {
            counts++;
        }
        return counts;
    }

    async saveRecord(address: string, caseType: string, fillingDate: string, pre: number) {
        const data = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'Property Address': address,
            "vacancyProcessed": false,
            "productId": this.productId,
            fillingDate,
            originalDocType: caseType,
            codeViolationId: pre.toString()
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }
}