import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
export default class CivilProducer extends AbstractProducer {
    sources =
        [
            { url: 'https://irco-trk.aspgov.com/etrakit/Search/case.aspx', handler: this.handleSource1 },
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

        let startNum = await this.getPrevCodeViolationId(sourceId, false, 19);
        console.log('loading page')
        const isPageLoaded = await this.openPage(page, link, '//*[@id="cplMain_txtSearchString"]');
        if (!isPageLoaded) {
            console.log('Page loading failed');
            return counts;
        }
        let year = (new Date()).getFullYear();
        if (year == 2020) {
            startNum = 26
        }

        for (let pre = startNum; pre < 1000000; pre++) {            
            await this.setSearchCriteria1(page, pre);
            
            // click search button
            await page.click('#ctl00_cplMain_btnSearch');
            await page.waitForXPath('//*[@id="cplMain_rlpSearch"]', {visible: true});
            await page.waitForXPath('//*[@id="cplMain_rlpSearch"]', {hidden: true});
            await this.sleep(3000);

            // wait for search result
            let result_handle = await Promise.race([
                page.waitForXPath('//*[@id="cplMain_lblNoSearchRslts"]', { visible: true }),
                page.waitForXPath('//*[@id="ctl00_cplMain_hlSearchResults"]', { visible: true })
            ]);
            let result_text = await result_handle.evaluate(el => el.textContent || '');
            if (result_text?.indexOf('no results') > -1) {
                console.log('No Results Found');
                break;
            }
            // get results
            counts += await this.getData1(page, sourceId, pre);
            await this.sleep(2000);
        }
        
        await this.sleep(3000);
        return counts;
    }

    async setSearchCriteria1(page: puppeteer.Page, prefix: number) {
        await page.select('#cplMain_ddSearchBy', `Case_Main.CASE_NO`);
        await page.waitForNavigation();
        await page.select('#cplMain_ddSearchOper', 'CONTAINS');
        let searchKey = `BS-${prefix.toString().padStart(6, '0')}`;
        const searchHandle = await page.$x('//input[@id="cplMain_txtSearchString"]');
        await searchHandle[0].click({clickCount: 3});
        await searchHandle[0].press('Backspace');
        await searchHandle[0].type(searchKey, {delay: 150});
    }

    async getData1(page: puppeteer.Page, sourceId: number, pre: any) {
        let counts = 0;
        const rowXpath = '//table[contains(@id, "_rgSearchRslts")]/tbody/tr';
        const rows = await page.$x(rowXpath);        
        for (const row of rows) {
            let address = await row.evaluate(el => el.children[1].children[0].textContent?.trim());
            let codeViolationId = pre;
            let record = {
                property_addresss: address,
                fillingdate: '',
                casetype:'',
                sourceId,
                codeViolationId
            }
            if (await this.saveRecord(record)) {
                counts++;
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