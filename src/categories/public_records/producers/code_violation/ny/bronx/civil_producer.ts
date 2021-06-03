import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
export default class CivilProducer extends AbstractProducer {
    sources =
        [
            { url: 'http://a810-bisweb.nyc.gov/bisweb/bispi00.jsp#compviol', handler: this.handleSource1 },
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

        let dateRange = {
            from: this.getFormatDate(new Date(await this.getPrevCodeViolationId(sourceId, true))),
            to: this.getFormatDate(new Date())
        };
        
        console.log('loading page')
        const isPageLoaded = await this.openPage(page, link, '//select[@name="allviolationtype"]');
        if (!isPageLoaded) {
            console.log('Page loading failed');
            return counts;
        }

        let types = [];
        const type_handles = await page.$x('//select[@name="allviolationtype"]/option[not(@value="")]');
        for (const type_handle of type_handles) {
            const value = await type_handle.evaluate(el => el.getAttribute('value')?.trim());
            types.push(value!)
        }
        
        for (const type of types) {
            await page.select('select[name="allviolationtype"]', type);
            await this.setSearchCriteria1(page, dateRange);
            await Promise.all([
                page.click('input[name="go9"]'),
                page.waitForNavigation()
            ])
            counts += await this.getData1(page, sourceId);
            await this.openPage(page, link, '//select[@name="allviolationtype"]');
            await this.sleep(3000);
        }
        
        await this.sleep(3000);
        return counts;
    }

    async setSearchCriteria1(page: puppeteer.Page, dateRange: any) {
        await page.select('#allstartdate_month1', dateRange.from.month);
        await page.type('#allstartdate_day1', dateRange.from.day.toString(), {delay: 150});
        await page.type('#allstartdate_year1', dateRange.from.year.toString(), {delay: 150});
        await page.select('#allenddate_month1', dateRange.to.month);
        await page.type('#allenddate_day1', dateRange.to.day.toString(), {delay: 150});
        await page.type('#allenddate_year1', dateRange.to.year.toString(), {delay: 150});
    }

    async getData1(page: puppeteer.Page, sourceId: number) {
        let counts = 0;
        while (true) {
            const rowXpath = '//center/table[3]/tbody/tr';
            const rows = await page.$x(rowXpath);     
            for (let i = 0; i < rows.length; i++) {
                let address = await rows[i].evaluate(el => el.children[3].textContent?.trim());
                let fillingDate = await rows[i].evaluate(el => el.children[1].textContent?.trim());
                const timestamp = (new Date(fillingDate!)).getTime();
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
            const nextHandle = await page.$x('//input[@name="next"]');
            if (nextHandle.length > 0) {
                await Promise.all([
                    page.click('input[name="next"]'),
                    page.waitForNavigation()
                ])
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

    private getFormatDate(date: Date) {
        let year = date.getFullYear();
        let month = (1 + date.getMonth()).toString().padStart(2, '0');
        let day = date.getDate().toString().padStart(2, '0');

        return {year, month, day}
    }
}