import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';

export default class CivilProducer extends AbstractProducer {
    productId = '';
    sources =
      [
        { 
            url: 'https://citizenaccess.acfw.net/CitizenAccess/Login.aspx?ReturnUrl=%2fCitizenAccess%2fCap%2fCapHome.aspx%3fmodule%3dCodeEnforcement', 
            handler: this.handleSource1, 
            username: 'webdev1234', 
            password: 'h3u5QmhbQra77Au'
        }
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
            if (source.username) {
                countRecords += await source.handler.call(this, page, source.url, sourceId, source.username, source.password);
                sourceId++;
            }
        }
        
        console.log('---- ', countRecords);
        await AbstractProducer.sendMessage(this.publicRecordProducer.state, this.publicRecordProducer.county ? this.publicRecordProducer.county : this.publicRecordProducer.city, countRecords, 'Code Violation');
        return true;
    }

    async handleSource1(page: puppeteer.Page, link: string, sourceId: number, username: string, password: string) {
        console.log('============ Checking for ', link);
        let counts = 0;

        let fromDate = await this.getPrevCodeViolationId(sourceId, true);

        console.log('loading page')
        const isPageLoaded = await this.openPage(page, link, '//span[contains(text(), "Login ")]/parent::a');
        if (!isPageLoaded) {
            console.log('Page loading failed');
            return counts;
        }
        const inputHandles = await page.$x('//input[contains(@id, "LoginBox_txt")]');
        await inputHandles[0].type(username, {delay: 100});
        await inputHandles[1].type(password, {delay: 100});
        await Promise.all([
            page.click('a[id*="LoginBox_btnLogin"]'),
            page.waitForNavigation()
        ]);
        await this.setSearchCriteria1(page);
        
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
        counts += await this.getData1(page, sourceId, fromDate);
        await this.sleep(3000);
        return counts;
    }

    async setSearchCriteria1(page: puppeteer.Page) {
        let year = (new Date()).getFullYear().toString().substr(-2);
        await page.type('input[id*="txtGSPermitNumber"]', `${year}-`)
    }

    async getData1(page: puppeteer.Page, sourceId: number, fromDate: number) {
        let counts = 0, pageNum = 1;

        while (true) {            
            const rowXpath = '//div[@class="ACA_Grid_OverFlow"]//tr[not(contains(@class, "ACA_TabRow_Header")) and contains(@class, "TabRow")]';
            const rows = await page.$x(rowXpath);
            let firstDate = await rows[0].evaluate(el => el.children[1].children[0].children[0].textContent?.trim());
            if (!(fromDate < new Date(firstDate!).getTime())) {
                break;
            } else {
                for (const row of rows) {
                    let fillingDate = await row.evaluate(el => el.children[1].children[0].children[0].textContent?.trim());
                    let originalDocType = await row.evaluate(el => el.children[3].children[0].children[0].textContent?.trim());
                    let address = await row.evaluate(el => el.children[4].children[0].children[0].textContent?.trim());
                    const timestamp = (new Date(fillingDate!)).getTime();
                    if (fromDate < timestamp) {
                        let record = {
                            property_addresss: address,
                            fillingdate: fillingDate,
                            casetype: originalDocType,
                            sourceId,
                            codeViolationId: timestamp
                        }
                        if (await this.saveRecord(record)) {
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
            }           
        }
        return counts;
    }

    async saveRecord(record: any) {
        const data = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'Property Address': record.property_addresss,
            "vacancyProcessed": false,
            "productId": this.productId,
            fillingDate: record.fillingdate,
            originalDocType: record.caseType,
            sourceId: record.sourceId,
            codeViolationId: record.codeViolationId
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }
}