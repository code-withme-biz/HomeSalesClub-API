import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
export default class CivilProducer extends AbstractProducer {
    sources =
        [
            { url: 'https://etrakit.sumtercountyfl.gov/eTRAKiT3/login.aspx?lt=either&rd=~/Search/case.aspx', handler: this.handleSource1 },
        ];
    username = 'webdev1234';
    password = 'befqf3DutHPphtY';

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

        let startNum = await this.getPrevCodeViolationId(sourceId, false, 1, true);
        console.log('loading page')
        const isPageLoaded = await this.openPage(page, link, '//input[@id="cplMain_btnPublicLogin"]');
        if (!isPageLoaded) {
            console.log('Page loading failed');
            return counts;
        }

        await page.type('#cplMain_txtPublicUserName', this.username, {delay: 150});
        await page.type('#cplMain_txtPublicPassword', this.password, {delay: 150});
        await Promise.all([
            page.click('#cplMain_btnPublicLogin'),
            page.waitForNavigation()
        ])

        for (let pre = startNum; pre < 1000; pre++) {            
            await this.setSearchCriteria1(page, pre);
            
            // click search button
            await page.click('#cplMain_btnSearch');

            // wait for search result
            let result_handle = await Promise.race([
                page.waitForXPath('//*[@id="ctl00_ctl00_cplMain_lblNoSearchRsltsPanel"]', { visible: true }),
                page.waitForXPath('//*[@id="cplMain_hlSearchResults"]', { visible: true })
            ]);
            let result_text = await result_handle.evaluate(el => el.textContent || '');
            if (result_text?.indexOf('no results') > -1) {
                console.log('No Results Found');
                continue;
            }
            // get results
            await this.sleep(3000);
            counts += await this.getData1(page, sourceId, pre);
            const first_handle = await page.$x('//input[contains(@id, "btnPageFirst")]');
            if (first_handle.length > 0) {
                await first_handle[0].click();
            }
            await this.sleep(2000);
        }
        
        await this.sleep(3000);
        return counts;
    }

    async setSearchCriteria1(page: puppeteer.Page, prefix: number) {
        await page.select('#cplMain_ddSearchBy', `Case_Main.CASE_NO`);
        await page.select('#cplMain_ddSearchOper', 'CONTAINS');
        let year = (new Date()).getFullYear().toString();
        let searchKey = `${year}-${prefix.toString().padStart(3, '0')}`;
        const searchHandle = await page.$x('//input[@id="cplMain_txtSearchString"]');
        await searchHandle[0].click({clickCount: 3});
        await searchHandle[0].press('Backspace');
        await searchHandle[0].type(searchKey, {delay: 150});
    }

    async getData1(page: puppeteer.Page, sourceId: number, pre: any) {
        let counts = 0, pageNum = 1;
        while (true) {
            const rowXpath = '//table[contains(@id, "_rgSearchRslts")]/tbody/tr';
            const rows = await page.$x(rowXpath);        
            for (const row of rows) {
                let address = await row.evaluate(el => el.children[2].children[0].textContent?.trim());
                let year = (new Date()).getFullYear();
                let codeViolationId = parseInt(`${year}${pre.toString().padStart(3, '0')}`);
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
            const nextHandle = await page.$x('//input[contains(@id, "btnPageNext")]');
            if (nextHandle.length > 0) {
                const disabled = await nextHandle[0].evaluate(el => el.getAttribute('disabled'));
                if (disabled) {
                    break;
                } else {
                    await nextHandle[0].click();
                    await page.waitForXPath(`//table[contains(@id, "_rgSearchRslts")]/tfoot/tr/td//tbody/tr[last()]//span[contains(text(), "page ${pageNum + 1}")]`);
                    pageNum++;
                }
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