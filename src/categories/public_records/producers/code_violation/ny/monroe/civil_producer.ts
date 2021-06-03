import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
import db from '../../../../../../models/db';

export default class CivilProducer extends AbstractProducer {
    productId = '';

    sources =
      [
        { url: 'https://hub.arcgis.com/datasets/RochesterNY::code-enforcement-open-case-parcels-live/data?geometry=-78.243%2C43.101%2C-76.979%2C43.276&orderBy=CASE_OPEN_DATE&orderByAsc=false', handler: this.handleSource }
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
        const isPageLoaded = await this.openPage(page, link, '//*[text()="OBJECTID"]/ancestor::table[1]/tbody/tr');
        if (!isPageLoaded) {
            console.log("Website not loaded successfully:", link);
            return counts;
        }

        let prevCodeViolationId = await this.getPrevCodeViolationId(sourceId, true, -1);

        while (true) {
            const rows = await page.$x('//*[text()="OBJECTID"]/ancestor::table[1]/tbody/tr');
            let flag = false;
            for (const row of rows) {
                let fillingdate = await row.evaluate(el => el.children[16].textContent) || ''
                fillingdate = fillingdate.replace(/\s+|\n/gm, ' ').trim();
                let codeViolationId = (new Date(fillingdate)).getTime();
                if (prevCodeViolationId > codeViolationId) {
                    flag = true;
                    break;
                }
                let casetype = '';
                let property_address = await row.evaluate(el => el.children[1].textContent) || ''
                property_address = property_address.replace(/\s+|\n/gm, ' ').trim();
                let owner_name: any = await row.evaluate((el: any) => el.children[4].textContent) || ''
                if (owner_name.indexOf('&') > -1) {
                    owner_name = owner_name.split('&')[0].trim();
                }
                owner_name = owner_name.replace(/[^a-zA-Z\s]+/g, '');
                const record = {
                    property_address,
                    casetype,
                    fillingdate,
                    sourceId,
                    codeViolationId,
                    owner_name
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
        let data: any = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'Property Address': record.property_address,
            "vacancyProcessed": false,
            "productId": this.productId,
            originalDocType: record.casetype,
            sourceId: record.sourceId,
            codeViolationId: record.codeViolationId
        };
        if (record.property_city) {
            data = {
                ...data, 
                'Property City': record.property_city
            }
        }
        if (record.property_zip) {
            data = {
                ...data, 
                'Property Zip': record.property_zip
            }
        }
        if (record.owner_name) {
            // save owner data
            let parseName: any = this.newParseName(record.owner_name.trim());
            if (parseName.type && parseName.type == 'COMPANY') {
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
            if (record.owner_address) {
                data = {
                    ...data,
                    'Mailing Address': record.owner_address
                }
            }
        }
        return await this.civilAndLienSaveToNewSchema(data);
    }
}