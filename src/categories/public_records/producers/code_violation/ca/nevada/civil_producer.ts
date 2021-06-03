import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';

export default class CivilProducer extends AbstractProducer {
    productId = '';
    sources =
      [
        { url: 'https://permits.mynevadacounty.com/CitizenAccess/Cap/CapHome.aspx?module=CodeCompliance', handler: this.handleSource1 }
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

    async setSearchCriteria(page: puppeteer.Page) {
        // setting date range
        const street_handle = await page.$x('//input[contains(@title, "Street No.")]');
        await street_handle[0].click();
        await street_handle[0].type('1', {delay: 150});

        await street_handle[1].click();
        await street_handle[1].type('20000000', {delay: 150});
    }

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
        const isPageLoaded = await this.openPage(page, link, '//input[contains(@title, "Street No.")]');
        if (!isPageLoaded) {
            console.log('Page loading failed');
            return counts;
        }
        let from = await this.getPrevCodeViolationId(sourceId, true);
        await this.setSearchCriteria(page);
        
        await page.click('div#ctl00_PlaceHolderMain_btnNewSearch_container a[title="Search"]');
        await page.waitForXPath('//div[@id="divGlobalLoading"]', {visible: true});
        await page.waitForXPath('//div[@id="divGlobalLoading"]', {hidden: true});

        let result_handle = await Promise.race([
            page.waitForXPath('//span[contains(text(), "returned no results")]', {visible: true}),
            page.waitForXPath('//div[@class="ACA_Grid_OverFlow"]//tr[not(contains(@class, "ACA_TabRow_Header")) and contains(@class, "TabRow")]', {visible: true})
        ]);
        
        let result_text = await result_handle.evaluate(el => el.textContent || '');
        if (result_text?.indexOf('no results') > -1) {
            console.log('No Results Found');
            return counts;
        }
        // get results
        counts += await this.getData1(page, sourceId, from);
        await this.sleep(3000);
        return counts;
    }

    async getData1(page: puppeteer.Page, sourceId: number, from: any) {
        let counts = 0, pageNum = 1;

        while (true) {            
            const rowXpath = '//div[@class="ACA_Grid_OverFlow"]//tr[not(contains(@class, "ACA_TabRow_Header")) and contains(@class, "TabRow")]';
            const rows = await page.$x(rowXpath);
            const firstRow = await page.$x(`${rowXpath}[1]/td[2]//span`);
            const date = await firstRow[0].evaluate(el => el.textContent?.trim());
            if (from < (new Date(date!)).getTime()) {
                for (const row of rows) {
                    let fillingDate = await row.evaluate(el => el.children[1].children[0].children[0].textContent?.trim());
                    let originalDocType = await row.evaluate(el => el.children[3].children[0].children[0].textContent?.trim());
                    let address = await row.evaluate(el => el.children[4].children[0].children[0].textContent?.trim());
                   
                    const timestamp = (new Date(fillingDate!)).getTime();
                    if (from < timestamp) {
                        if (await this.saveRecord(address!, originalDocType!, fillingDate!, sourceId, timestamp)) {
                            counts++;
                        }
                    }
                }
                let nextHandle = await page.$x(`//a[contains(text(), "Next")]`);
                if (nextHandle.length > 0) {
                    await nextHandle[0].click();
                    await page.waitForXPath('//div[@id="divGlobalLoading"]', {visible: true});
                    await page.waitForXPath('//div[@id="divGlobalLoading"]', {hidden: true});
                    pageNum++;
                } else {
                    break;
                } 
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