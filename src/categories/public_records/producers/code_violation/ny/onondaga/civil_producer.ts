import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
export default class CivilProducer extends AbstractProducer {
    sources =
        [
            { url: 'https://hub.arcgis.com/datasets/fb7233117df1443081541f220327f178_0/data?orderBy=violation_date&orderByAsc=false', handler: this.handleSource }
        ];

    async init(): Promise<boolean> {
        console.log("running init")
        this.browser = await this.launchBrowser();
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
        const isPageLoaded = await this.openPage(page, link, '//*[text()="property_address"]/ancestor::table[1]/tbody/tr');
        if (!isPageLoaded) {
            console.log("Website not loaded successfully:", link);
            return counts;
        }

        let prevCodeViolationId = await this.getPrevCodeViolationId(sourceId, true, -1);

        while (true) {
            const rows = await page.$x('//*[text()="property_address"]/ancestor::table[1]/tbody/tr');
            let flag = false;
            for (const row of rows) {
                let fillingdate = await row.evaluate(el => el.children[4].textContent) || '';
                fillingdate = fillingdate.replace(/\s+|\n/gm, ' ').trim();
                let codeViolationId = (new Date(fillingdate)).getTime();
                console.log(fillingdate)
                if (prevCodeViolationId > codeViolationId) {
                    flag = true;
                    break;
                }
                let casetype = await row.evaluate(el => el.children[8].textContent) || '';
                casetype = casetype.replace(/\s+/gm, ' ').trim();

                let property_address = await row.evaluate(el => el.children[0].textContent) || '';
                property_address = property_address.replace(/\s+/gm, ' ').trim();
                if (property_address.indexOf('&') > -1) property_address = property_address.split('&')[0].trim();
                let property_zip = await row.evaluate(el => el.children[1].textContent) || '';
                property_zip = property_zip.replace(/\s+/gm, ' ').trim();
                property_zip = property_zip.replace(/\"/g, '');

                let owner_name = await row.evaluate(el => el.children[10].textContent) || '';
                owner_name = owner_name.replace(/[^a-zA-Z\s]+/g, '');
                let mailing_address = await row.evaluate((el: any) => el.children[14].textContent) || '';
                mailing_address = mailing_address.replace(/\s+|\n/gm, ' ').trim();
                let mailing_city = await row.evaluate((el: any) => el.children[15].textContent) || '';
                mailing_city = mailing_city.replace(/\s+|\n/gm, ' ').trim();
                let mailing_zip = await row.evaluate((el: any) => el.children[17].textContent) || '';
                mailing_zip = mailing_zip.replace(/\s+|\n/gm, ' ').trim();

                const record = {
                    property_address,
                    property_zip,
                    casetype,
                    fillingdate,
                    sourceId,
                    codeViolationId,
                    owner_name,
                    mailing_address,
                    mailing_city,
                    mailing_zip
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
        if (record.fillingdate) data = { ...data, fillingDate: record.fillingdate };
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
        if (record.mailing_address) {
            data = {
                ...data,
                'Mailing Address': record.mailing_address
            }
        }
        if (record.mailing_city) {
            data = {
                ...data,
                'Mailing City': record.mailing_city
            }
        }
        if (record.mailing_zip) {
            data = {
                ...data,
                'Mailing Zip': record.mailing_zip
            }
        }

        return await this.civilAndLienSaveToNewSchema(data);
    }
}