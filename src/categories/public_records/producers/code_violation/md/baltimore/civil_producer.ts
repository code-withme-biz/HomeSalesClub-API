import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';

export default class CivilProducer extends AbstractProducer {
    productId = '';
    sources =
      [
        { url: 'https://citizenaccess.baltimorecountymd.gov/CitizenAccess/Cap/CapHome.aspx?module=Enforcement&TabName=Home', handler: this.handleSource1 }
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

        let startNum = await this.getPrevCodeViolationId(sourceId, false, 1, true);
        if (startNum === 1) {
            startNum = 0;
        }

        for (let pre = startNum ; pre < 10000 ; pre ++) {
            const isPageLoaded = await this.openPage(page, link, '//span[text()="Search"]/parent::a');
            await this.sleep(1000);
            if (!isPageLoaded) {
                console.log()
                break;
            }
            await this.setSearchCriteria1(page, pre);               
            
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
            counts += await this.getData1(page, sourceId, pre);
            await this.sleep(3000)
        }
        return counts;
    }

    async setSearchCriteria1(page: puppeteer.Page, prefix: number) {
        let year = (new Date()).getFullYear().toString().substr(-2);
        let searchKey = `CC${year}${prefix.toString().padStart(4, '0')}`;
        const searchHandle = await page.$x('//input[@id="ctl00_PlaceHolderMain_generalSearchForm_txtGSPermitNumber"]');
        await searchHandle[0].click({clickCount: 3});
        await searchHandle[0].press('Backspace');
        await searchHandle[0].type(searchKey, {delay: 150});
    }

    async getData1(page: puppeteer.Page, sourceId: number, pre: number) {
        let counts = 0;
        let year = (new Date()).getFullYear().toString();
        const rowXpath = '//div[@class="ACA_Grid_OverFlow"]//tr[not(contains(@class, "ACA_TabRow_Header")) and contains(@class, "TabRow")]';
        const rows = await page.$x(rowXpath);        
        for (const row of rows) {
            let address = await row.evaluate(el => el.children[5].children[0].children[0].textContent?.trim());
            let fillingDate = await row.evaluate(el => el.children[1].children[0].children[0].textContent?.trim());
            let originalDocType = await row.evaluate(el => el.children[3].children[0].children[0].textContent?.trim());
            let codeViolationId = parseInt(`${year}${pre.toString().padStart(4, '0')}`);
            if (await this.saveRecord(address!, originalDocType!, fillingDate!, sourceId, codeViolationId)) {
                counts++;
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