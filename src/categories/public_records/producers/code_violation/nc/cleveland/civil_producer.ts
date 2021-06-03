import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';

export default class CivilProducer extends AbstractProducer {
    productId = '';
    sources =
      [
        { url: 'http://74.218.167.200/p2c/jailinmates.aspx', handler: this.handleSource1 }
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

        let fromDate = await this.getPrevCodeViolationId(sourceId, true);

        const isPageLoaded = await this.openPage(page, link, '//*[@id="tblII"]//tr');
        await this.sleep(1000);
        if (!isPageLoaded) {
            return counts;
        }         
        
        await page.click('#jqgh_disp_arrest_date');
        await page.waitForXPath('//*[@id="load_tblII"]', {visible: true});
        await page.waitForXPath('//*[@id="load_tblII"]', {hidden: true});

        await page.click('#jqgh_disp_arrest_date span[sort="desc"]');
        await page.waitForXPath('//*[@id="load_tblII"]', {visible: true});
        await page.waitForXPath('//*[@id="load_tblII"]', {hidden: true});   
        
        await page.select('#pg_pager select', '10000');
        await page.waitForXPath('//*[@id="load_tblII"]', {visible: true});
        await page.waitForXPath('//*[@id="load_tblII"]', {hidden: true});   
        
        // get results
        counts += await this.getData1(page, sourceId, fromDate);

        await this.sleep(3000)
        return counts;
    }
    async getData1(page: puppeteer.Page, sourceId: number, fromDate: number) {
        let counts = 0;

        const rowXpath = '//*[@id="tblII"]//tr';
            const rows = await page.$x(rowXpath);
            for (const row of rows) {
                let ownername = await row.evaluate(el => el.children[1].textContent?.trim());
                ownername = ownername?.split('(')[0].trim();
                let fillingDate = await row.evaluate(el => el.children[9].textContent?.trim());
                const timestamp = (new Date(fillingDate!)).getTime()
                if (fromDate < timestamp) {
                    let record = {
                        ownername,
                        property_addresss: '',
                        fillingdate: fillingDate,
                        casetype: '',
                        sourceId,
                        codeViolationId: timestamp
                    };
                    if (await this.saveRecord(record)) {
                        counts++;
                    }
                }
            }
        return counts;
    }

    async saveRecord(record: any) {
        // save property data
        let data: any = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'Property Address': record.property_addresss,
            "vacancyProcessed": false,
            "productId": this.productId,
            fillingDate: record.fillingdate,
            originalDocType: record.casetype,
            sourceId: record.sourceId,
            codeViolationId: record.codeViolationId
        };
        // save owner data
        let parseName: any = this.newParseName(record.ownername.trim());
        if(parseName.type && parseName.type == 'COMPANY'){
            return false;
        }
        data = {
            ...data,
            'First Name': parseName.firstName,
            'Last Name': parseName.lastName,
            'Middle Name': parseName.middleName,
            'Name Suffix': parseName.suffix,
            'Full Name': parseName.fullName,
        }
        return await this.civilAndLienSaveToNewSchema(data);
    }
}