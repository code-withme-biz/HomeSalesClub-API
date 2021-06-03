import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';

export default class CivilProducer extends AbstractProducer {
    productId = '';
    sources =
      [
        { url: 'https://apex.alexandriava.gov/EnerGov_Prod/SelfService#/search', handler: this.handleSource1 }
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
        const fromDateHandle = await page.$x('//input[@id="IssueDateFrom"]');
        await fromDateHandle[0].click({clickCount: 3});
        await fromDateHandle[0].press('Backspace');
        await fromDateHandle[0].type(dateRange.from, {delay: 150});

        const toDateHandle = await page.$x('//input[@id="IssueDateTo"]');
        await toDateHandle[0].click({clickCount: 3});
        await toDateHandle[0].press('Backspace');
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

        let dateRange = {
            from: this.getFormattedDate(new Date(await this.getPrevCodeViolationId(sourceId, true))),
            to: this.getFormattedDate(new Date())
        };
        
        console.log('loading page')
        const isPageLoaded = await this.openPage(page, link, '//select[@name="SearchModule"]');
        await this.sleep(5000);
        if (!isPageLoaded) {
            console.log('Page loading failed');
            return counts;
        }
        
        const types = [
            `string:68664d2d-10ac-4436-965e-ab25a16a41e6_63b94457-bea6-4789-8275-1f0cccd2b0f0`,
            `string:68664d2d-10ac-4436-965e-ab25a16a41e6_271d9cd9-9f10-410e-9d72-85fcf0453791`,
            `string:68664d2d-10ac-4436-965e-ab25a16a41e6_20379427-73a5-4ce6-a4e3-d94d3b3053f9`,
            `string:30ffb2f5-a7c5-485a-af74-e315ced17fc3_e6a5de26-b601-42ae-b93e-ce20f6ee79fa`,
            `string:30ffb2f5-a7c5-485a-af74-e315ced17fc3_1937c01e-9322-4f3f-b8a6-c3ec01c2ab20`,
        ]

        for (const type of types) {
            await page.select('select[name="SearchModule"]', 'number:2');
            await this.sleep(1000);
            await page.select('select[name="PermitCriteria_PermitTypeId"]', type);
            await this.setSearchCriteria(page, dateRange);
            await page.click('#button-Search');
            await page.waitForXPath('//div[@id="overlay"]', {visible: true});
            await page.waitForXPath('//div[@id="overlay"]', {hidden: true});
            
            const rows = await page.$x('//*[contains(@id, "entityRecordDiv")]');
            if (rows.length == 0) {
                continue;
            }
            // get results
            counts += await this.getData1(page, sourceId);
            await this.sleep(3000);            
        }
        
        // get results
        // counts += await this.getData1(page, sourceId);
        await this.sleep(3000);
        return counts;
    }

    async getData1(page: puppeteer.Page, sourceId: number) {
        let counts = 0, pageNum = 1;

        while (true) {            
            const rowXpath = '//*[contains(@id, "entityRecordDiv")]';
            const rows = await page.$x(rowXpath);
            for (let i = 0; i < rows.length; i++) {
                let dateHandle = await page.$x(rowXpath + `[${i + 1}]//*[@name="label-IssuedDate"]/span`);
                let fillingDate = await dateHandle[0].evaluate(el => el.textContent?.trim());
                let typeHandle = await page.$x(rowXpath + `[${i + 1}]//*[@name="label-CaseType"]/span`);
                let originalDocType = await typeHandle[0].evaluate(el => el.textContent?.trim());
                let addressHandle = await page.$x(rowXpath + `[${i + 1}]//*[@name="label-Address"]/span`);
                let address = await addressHandle[0].evaluate(el => el.textContent?.trim());
                const timestamp = (new Date(fillingDate!)).getTime();
                if (await this.saveRecord(address!, originalDocType!, fillingDate!, sourceId, timestamp)) {
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