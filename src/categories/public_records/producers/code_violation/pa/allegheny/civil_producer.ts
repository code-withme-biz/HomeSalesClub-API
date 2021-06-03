import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
import db from '../../../../../../models/db';

export default class CivilProducer extends AbstractProducer {
    productId = '';

    sources =
      [
        { url: 'https://data.wprdc.org/dataset/pittsburgh-pli-violations-report', handler: this.handleSource }
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
        const isPageLoaded = await this.openPage(page, link, '//*[@id="terms-submit"]');
        if (!isPageLoaded) {
            console.log("Website not loaded successfully:", link);
            return counts;
        }
        const [agree_button] = await page.$x('//*[@id="terms-submit"]');
        await agree_button.click();
        const [preview_button] = await page.$x('//*[@class="resource-item"][1]/*[contains(@href, "/dataset/pittsburgh-pli-violations-report")]');
        await Promise.all([
            preview_button.click(),
            page.waitForNavigation()
        ]);
        let iframe: any = await page.$x('//iframe');
        iframe = await iframe[0].contentFrame();
        await iframe.waitForXPath('//*[@class="dataTables_scrollBody"]//*[text()="_id"]/ancestor::table[1]', {visible: true});
        const [date_sort] = await iframe.$x('//*[@class="dataTables_scrollHead"]//*[text()="INSPECTION_DATE"]');
        await date_sort.click();
        await date_sort.click();
        await this.sleep(2000);
        let prevCodeViolationId = await this.getPrevCodeViolationId(sourceId);

        while (true) {
            const rows = await iframe.$x('//*[@class="dataTables_scrollBody"]//*[text()="_id"]/ancestor::table[1]/tbody/tr');
            let flag = false;
            for (const row of rows) {
                let caseid = await row.evaluate((el: any) => el.children[1].textContent) || '';
                caseid = caseid.replace(/\s+|\n/gm, ' ').trim();
                let codeViolationId = parseInt(caseid.replace(/\D/g, ''));
                if (prevCodeViolationId === codeViolationId) {
                    flag = true;
                    break;
                }
                let casetype = await row.evaluate((el: any) => el.children[7].textContent) || '';
                casetype = casetype.replace(/\s+|\n/gm, ' ').trim();
                let streetnum = await row.evaluate((el: any) => el.children[1].textContent) || '';
                streetnum = streetnum.replace(/\s+|\n/gm, ' ').trim();
                let streetname = await row.evaluate((el: any) => el.children[2].textContent) || ''
                streetname = streetname.replace(/\s+|\n/gm, ' ').trim();
                let property_address = streetnum + ' ' + streetname;
                property_address = property_address.replace(/\s+|\n/gm, ' ').trim();
                let fillingdate = await row.evaluate((el: any) => el.children[3].textContent) || ''
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
            const [next_page_disabled]  = await iframe.$x('//*[@id="dtprv_next"][@class="paginate_button next disabled"]')
            if (next_page_disabled) {
                console.log('-----------------')
                break;
            } else {
                const [next_page_button]  = await iframe.$x('//*[@id="dtprv_next"][@class="paginate_button next"]')
                await next_page_button.click();
                await iframe.waitForSelector('#dtprv_processing', {hidden: true});
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