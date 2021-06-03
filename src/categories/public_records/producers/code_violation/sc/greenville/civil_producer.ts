import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
export default class CivilProducer extends AbstractProducer {
    sources =
        [
            { url: 'https://greeretrakit.cityofgreer.org/etrakit/login.aspx?lt=either&rd=~/Search/case.aspx', handler: this.handleSource1 },
        ];
    username = 'webdev1234';
    password = '9PziGnB9!3ZXDDw';

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

        let currYear = (new Date()).getFullYear();
        let id;
        for (let year = startNum===1 ? 2020 : currYear ; year <= currYear ; year++) {
            if (year == 2020) {
                id = 59;
            } else {
                id = startNum;
            }

            for (let pre = id; pre < 100000; pre++) {            
                await this.setSearchCriteria1(page, pre, year);
                
                // click search button
                await page.click('#ctl00_cplMain_btnSearch');
                await page.waitForXPath('//div[@id="cplMain_rlpSearch"]', {visible: true});
                await page.waitForXPath('//div[@id="cplMain_rlpSearch"]', {hidden: true});

                const [noresult] = await page.$x('//span[contains(text(), "no results")]');
                if (noresult) break;
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
        }
        return counts;
    }

    async setSearchCriteria1(page: puppeteer.Page, prefix: number, year: number) {
        await page.select('#cplMain_ddSearchBy', `Case_Main.CASE_NO`);
        await page.waitForNavigation();
        await page.select('#cplMain_ddSearchOper', 'CONTAINS');
        let searchKey = `CE${year.toString().substr(-2)}-${prefix.toString().padStart(5, '0')}`;
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
                let address = await row.evaluate(el => el.children[1].children[0].textContent?.trim());
                let year = (new Date()).getFullYear();
                let codeViolationId = parseInt(`${year}${pre.toString().padStart(5, '0')}`);
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