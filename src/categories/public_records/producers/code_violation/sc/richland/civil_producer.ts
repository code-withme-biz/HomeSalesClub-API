import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
import db from '../../../../../../models/db';

export default class CivilProducer extends AbstractProducer {
    productId = '';

    sources =
      [
        { url: 'https://coc-colacitygis.opendata.arcgis.com/datasets/codeviolationproperty/data?geometry=-81.555%2C33.939%2C-80.501%2C34.138&orderBy=OpenedDate&orderByAsc=false&selectedAttribute=OpenedDate', handler: this.handleSource }
      ];

    async init(): Promise<boolean> {
        console.log("running init")
        this.browser = await this.launchBrowser();
        this.browserPages.generalInfoPage = await this.browser.newPage();
        this.browserPages.generalInfoPage.setDefaultTimeout(200000);
        await this.setParamsForPage(this.browserPages.generalInfoPage);
        return true;
    };
    async read(): Promise<boolean> {
      return true;
    };

    async parseAndSave(): Promise<boolean> {
        let countRecords = 0;
        let page = this.browserPages.generalInfoPage;
        if (!page) return false;

        let sourceId = 0;
        for (const source of this.sources) {
            countRecords += await source.handler.call(this, page, source.url, sourceId);
            sourceId++;
        }

        await AbstractProducer.sendMessage(this.publicRecordProducer.state, this.publicRecordProducer.county ? this.publicRecordProducer.county : this.publicRecordProducer.city, countRecords, 'Code Violation');
        return true;
    }

    async handleSource(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;
        // load page
        const isPageLoaded = await this.openPage(page, link, '//*[text()="CaseNum"]/ancestor::table[1]/tbody/tr');
        if (!isPageLoaded) {
            console.log("Website not loaded successfully:", link);
            return counts;
        }

        let prevCodeViolationId = await this.getPrevCodeViolationId(sourceId);

        while (true) {
            const rows = await page.$x('//*[text()="CaseNum"]/ancestor::table[1]/tbody/tr');
            let flag = false;
            for (const row of rows) {
                let caseid = await row.evaluate(el => el.children[1].textContent) || '';
                caseid = caseid.replace(/\s+|\n/gm, ' ').trim();
                let codeViolationId = parseInt(caseid.replace(/\D/g, ''));
                if (prevCodeViolationId === codeViolationId) {
                    flag = true;
                    break;
                }
                let casetype = await row.evaluate(el => el.children[4].textContent) || '';
                casetype = casetype.replace(/\s+|\n/gm, ' ').trim();
                let property_address = await row.evaluate(el => el.children[6].textContent) || ''
                property_address = property_address.replace(/\s+|\n/gm, ' ').trim();
                let fillingdate = await row.evaluate(el => el.children[3].textContent) || ''
                fillingdate = fillingdate.replace(/\s+|\n/gm, ' ').trim();
                const record = {
                    property_address,
                    casetype,
                    fillingdate,
                    sourceId,
                    codeViolationId
                }
                if (await this.saveRecord(record))
                    counts++;
            }
            if (flag) break;
            const [hasnextpage] = await page.$x('//a[text()="›"][@aria-label="Next"]');
            if (hasnextpage) {
                await hasnextpage.click();
                await page.waitForXPath('//*[@class="table-responsive"]/following-sibling::div[contains(@class, "loader")]', {hidden: true});
                await this.sleep(500);
            } else {
                break;
            }
        }
        return counts;
    }

    async saveRecord(record: any) {
        // save property data
        const data = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'Property Address': record.property_address,
            "vacancyProcessed": false,
            "productId": this.productId,
            originalDocType: record.casetype,
            sourceId: record.sourceId,
            codeViolationId: record.codeViolationId
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }
}