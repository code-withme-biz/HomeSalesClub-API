import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
export default class CivilProducer extends AbstractProducer {
    sources =
        [
            { url: '', installationID: 305, citizenService: true },
            { url: 'https://egovweb.charlestoncounty.org/citizenaccess_prod/site/CodeCase/Search', handler: this.handleSource2}
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
            if (!source.handler) {
                countRecords += await this.handleCitizenSerice(page, source.installationID, sourceId);
            } else {
                countRecords += await source.handler.call(this, page, source.url, sourceId);
            }
            sourceId++;
        }
        await AbstractProducer.sendMessage(this.publicRecordProducer.state, this.publicRecordProducer.county ? this.publicRecordProducer.county : this.publicRecordProducer.city, countRecords, 'Code Violation');
        return true;
    };

    async handleSource1(page: puppeteer.Page, installationID: number, link: string, sourceId: number) {
        let counts = 0;
        counts = await this.handleCitizenSerice(page, installationID, sourceId);
        return counts;
    }

    async handleSource2(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;

        let dateRange = {
            from: this.getFormattedDate(new Date(await this.getPrevCodeViolationId(sourceId, true))),
            to: this.getFormattedDate(new Date())
        };

        const isPageLoaded = await this.openPage(page, link, '//*[@id="btnSearch"]');
        await this.sleep(1000);
        if (!isPageLoaded) {
            return counts;
        }

        await this.setSearchCriteria2(page, dateRange);

        await page.click('#btnSearch');
        await page.waitForXPath('//h4[contains(text(), "Search Results")]', {visible: true});
        await this.sleep(3000);

        const noresult_handle = await page.$x('//td[contains(text(), "No records to display")]');
        if (noresult_handle.length > 0) {
            return counts;
        }        
        // get results
        counts += await this.getData2(page, sourceId);

        await this.sleep(3000)
        return counts;
    }

    async setSearchCriteria2(page: puppeteer.Page, dateRange: any) {
        const fromDateHandle = await page.$x('//*[@id="CodeCaseSearchModel_OpenedDateStart"]');
        const toDateHandle = await page.$x('//*[@id="CodeCaseSearchModel_OpenedDateStop"]');
        await fromDateHandle[0].type(dateRange.from, {delay: 100});
        await toDateHandle[0].type(dateRange.to, {delay: 100});
    }

    async getData2(page: puppeteer.Page, sourceId: number) {
        let counts = 0, pageNum = 1;
        while (true) {
            const rowXpath = '//*[@id="Grid"]/div[2]//tbody/tr';
            const rows = await page.$x(rowXpath);
            for (const row of rows) {
                let address = await row.evaluate(el => el.children[1].textContent?.trim());
                let originalDocType = await row.evaluate(el => el.children[2].textContent?.trim());
                let fillingDate = await row.evaluate(el => el.children[5].textContent?.trim());
                if (address) {
                    let record = {
                        property_address: address,
                        fillingdate: fillingDate,
                        casetype: originalDocType,
                        sourceId,
                        codeViolationId: (new Date(fillingDate!)).getTime()
                    };
                    if (await this.saveRecords(record)) {
                        counts++;
                    }
                }
            }

            const nextHandle = await page.$x(`//*[@id="Grid"]/div[3]//a[text()="${pageNum + 1}"]`);
            if (nextHandle.length > 0) {
                await Promise.all([
                    nextHandle[0].click(),
                    page.waitForXPath(`//*[@id="Grid"]/div[3]//span[text()="${pageNum + 1}"]`, {visible: true})
                ]);
                await this.sleep(2000)
                pageNum++;
            } else {
                break;
            }
        }
        return counts;
    }

    async saveRecords(res: any) {
        const data = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'Property Address': res.property_address,
            "vacancyProcessed": false,
            "productId": this.productId,
            fillingDate: res.fillingdate,
            originalDocType: res.casetype,
            sourceId: res.sourceId,
            codeViolationId: res.codeViolationId
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }
}