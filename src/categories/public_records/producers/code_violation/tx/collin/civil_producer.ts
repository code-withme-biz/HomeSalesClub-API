import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
export default class CivilProducer extends AbstractProducer {
    sources =
        [
            { url: 'https://etrakit.prospertx.gov/eTRAKiT/login.aspx?lt=public&rd=~/Search/case.aspx', handler: this.handleSource1, username: 'webdev1234', password: 'sr2w2W4d8vM5UDb'  },
            { url: '', installationID: 236, citizenService: true }
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
                countRecords += await source.handler.call(this, page, source.url, sourceId, source.username, source.password);
            }
            sourceId++;
        }
        await AbstractProducer.sendMessage(this.publicRecordProducer.state, this.publicRecordProducer.county ? this.publicRecordProducer.county : this.publicRecordProducer.city, countRecords, 'Code Violation');
        return true;
    }

    async handleSource1(page: puppeteer.Page, link: string, sourceId: number, username: string, password: string) {
        console.log('============ Checking for ', link);
        let counts = 0;

        let startNum = await this.getPrevCodeViolationId(sourceId, false, 1, true);
        console.log('loading page')
        const isPageLoaded = await this.openPage(page, link, '//input[@id="cplMain_btnPublicLogin"]');
        if (!isPageLoaded) {
            console.log('Page loading failed');
            return counts;
        }

        await page.type('#cplMain_txtPublicUserName', username, {delay: 150});
        await page.type('#cplMain_txtPublicPassword', password, {delay: 150});
        await Promise.all([
            page.click('#cplMain_btnPublicLogin'),
            page.waitForNavigation()
        ])
        let currYear = (new Date()).getFullYear();
        let id;
        for (let year = startNum===1 ? 2020 : currYear ; year <= currYear ; year++) {
            if (year == currYear) {
                id = startNum;
            } else {
                id = 1;
            }
            for (let pre = id; pre < 100; pre++) {            
                await this.setSearchCriteria1(page, pre, year);
                
                // click search button
                await page.click('#cplMain_btnSearch');

                // wait for search result
                let result_handle = await Promise.race([
                    page.waitForXPath('//*[@id="cplMain_lblNoSearchRslts"]', { visible: true }),
                    page.waitForXPath('//*[@id="cplMain_hlSearchResults"]', { visible: true })
                ]);
                let result_text = await result_handle.evaluate(el => el.textContent || '');
                if (result_text?.indexOf('no results') > -1) {
                    console.log('No Results Found');
                    break;
                }
                // get results
                await this.sleep(3000);
                counts += await this.getData1(page, sourceId, pre);
                await this.sleep(2000);
            }
        }
        
        await this.sleep(3000);
        return counts;
    }

    async setSearchCriteria1(page: puppeteer.Page, prefix: number, year: number) {
        await page.select('#cplMain_ddSearchBy', 'Case_Main.CASE_NO');
        await page.select('#cplMain_ddSearchOper', 'CONTAINS');
        let searchKey = `CE${year.toString().substr(-2)}-${prefix.toString().padStart(2, '0')}`;
        const searchHandle = await page.$x('//input[@id="cplMain_txtSearchString"]');
        await searchHandle[0].click({clickCount: 3});
        await searchHandle[0].press('Backspace');
        await searchHandle[0].type(searchKey, {delay: 150});
    }

    async getData1(page: puppeteer.Page, sourceId: number, pre: any) {
        let counts = 0;
        
        const [firstpagedisabled] = await page.$x('//*[contains(@id, "_btnPageFirst")][@disabled="disabled"]')
        if (!firstpagedisabled) {
            const [firstpage] = await page.$x('//*[contains(@id, "_btnPageFirst")]')
            await firstpage.click();
            await page.waitForXPath('//div[@id="cplMain_rlpSearch"]', {visible: true});
            await page.waitForXPath('//div[@id="cplMain_rlpSearch"]', {hidden: true});
        }
        const rowXpath = '//table[contains(@id, "_rgSearchRslts")]/tbody/tr';
        while (true) {
            const rows = await page.$x(rowXpath);        
            for (const row of rows) {
                let address = await row.evaluate(el => el.children[2].children[0].textContent?.trim());
                let year = (new Date()).getFullYear();
                let codeViolationId = parseInt(`${year}${pre.toString().padStart(4, '0')}`);
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
            const [nextpagedisabled] = await page.$x('//*[contains(@id, "_btnPageNext")][@disabled="disabled"]')
            if (nextpagedisabled) {
                break;
            } else {
                const [nextpage] = await page.$x('//*[contains(@id, "_btnPageNext")]')
                await nextpage.click();
                await page.waitForXPath('//div[@id="cplMain_rlpSearch"]', {visible: true});
                await page.waitForXPath('//div[@id="cplMain_rlpSearch"]', {hidden: true});
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