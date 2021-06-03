import { time } from 'console';
import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
export default class CivilProducer extends AbstractProducer {
    sources =
        [
            { url: 'https://www.municipalonlinepayments.com/shawneeok/callcenter/search/incidenttype', handler: this.handleSource1 },
        ];

    async init(): Promise<boolean> {
        console.log("running init")
        this.browser = await this.launchBrowser();
        this.browserPages.generalInfoPage = await this.browser.newPage();
        this.browserPages.generalInfoPage.setDefaultNavigationTimeout(60000);
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

    async handleSource1(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;

        const start = (new Date('01/01/2010')).getTime();
        let fromDate = await this.getPrevCodeViolationId(sourceId, false, start);
        console.log('loading page')
        const isPageLoaded = await this.openPage(page, link, '//button[contains(text(), "Incident")]');
        if (!isPageLoaded) {
            console.log('Page loading failed');
            return counts;
        }
        let type_handles = await page.$x('//*[@id="IncidentType"]/option');
        let types: string[] = [];
        for (const type_handle of type_handles) {
            const value = await type_handle.evaluate(el => el.getAttribute('value')?.trim());
            types.push(value!);
        }

        for (const type of types) {
            await page.select('#IncidentType', type);
            await page.select('#Show', 'All');
            const searchBtnHandle = await page.$x('//button[contains(text(), "Incident")]');
            await Promise.all([
                searchBtnHandle[0].click(),
                page.waitForNavigation()
            ]);
            counts += await this.getData1(page, sourceId, fromDate);
            await this.sleep(2000);
        } 
        return counts;
    }

    async getData1(page: puppeteer.Page, sourceId: number, fromDate: any) {
        let counts = 0, pageNum = 1;
        while (true) {
            const rowXpath = '//*[@id="search_results"]//tbody/tr[contains(@style, "table-row")]';
            const rows = await page.$x(rowXpath);        
            for (const row of rows) {
                let address = await row.evaluate(el => el.children[4].textContent?.trim());
                let fillingDate = await row.evaluate(el => el.children[0].textContent?.trim());
                const timestamp = (new Date(fillingDate!)).getTime();
                if (fromDate < timestamp) {
                    let record = {
                        property_addresss: address,
                        fillingdate: fillingDate,
                        casetype:'',
                        sourceId,
                        codeViolationId: timestamp
                    }
                    if (await this.saveRecord(record)) {
                        counts++;
                    }
                }
            }
            const nextHandle = await page.$x(`//a[text()="${pageNum + 1}"]`);
            if (nextHandle.length > 0) {
                await nextHandle[0].click();
                await page.waitForXPath(`//a[text()="${pageNum + 1}"]/parent::li[@class="active"]`);
                pageNum++;
            } else {
                break;
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