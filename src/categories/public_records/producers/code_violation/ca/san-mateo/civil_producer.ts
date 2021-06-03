import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';

export default class CivilProducer extends AbstractProducer {
    productId = '';
    sources =
      [
        { url: 'https://aca-prod.accela.com/SMCGOV/Cap/CapHome.aspx?module=Planning', handler: this.handleSource1 },
        { url: 'https://permits.redwoodcity.org/eTRAKiT3/Search/case.aspx', handler: this.handleSource2 }
      ];

    async init(): Promise<boolean> {
        console.log("running init")
        this.browser = await this.launchBrowser();
        this.browserPages.generalInfoPage?.setDefaultTimeout(60000);
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
        if (!page) {
            return false;
        }
        let sourceId = 0;
        for (const source of this.sources) {
            countRecords += await source.handler.call(this, page, source.url, sourceId);
            sourceId++;
        }
        
        console.log('---- ', countRecords);
        await AbstractProducer.sendMessage(this.publicRecordProducer.state, this.publicRecordProducer.county ? this.publicRecordProducer.county : this.publicRecordProducer.city, countRecords, 'Code Violation');
        return true;
    }

    async handleSource1(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;

        let dateRange = {
            from: this.getFormattedDate(new Date(await this.getPrevCodeViolationId(sourceId, true))),
            to: this.getFormattedDate(new Date())
        };
        console.log('loading page');
        const isPageLoaded = await this.openPage(page, link, '//span[text()="Search"]/parent::a');
        if (!isPageLoaded) {
            console.log('Page loading failed');
            return counts;
        }
        await this.setSearchCriteria1(page, dateRange);
        
        await page.click('div#ctl00_PlaceHolderMain_btnNewSearch_container a[title="Search"]');
        await page.waitForXPath('//div[@id="divGlobalLoading"]', {visible: true});
        await page.waitForXPath('//div[@id="divGlobalLoading"]', {hidden: true});

        let result_handle = await Promise.race([
            page.waitForXPath('//span[contains(text(), "returned no results")]', {visible: true}),
            page.waitForXPath('//div[@class="ACA_Grid_OverFlow"]//tr[not(contains(@class, "ACA_TabRow_Header")) and contains(@class, "TabRow")]', {visible: true})
        ]);
        
        let result_text = await result_handle.evaluate(el => el.textContent || '');
        if (result_text?.indexOf('no results') > -1) {
            console.log('No Results Found');
            return counts;
        }
        // get results
        counts += await this.getData1(page, sourceId);
        await this.sleep(3000);
        return counts;
    }

    async setSearchCriteria1(page: puppeteer.Page, dateRange: any) {
        // setting date range
        const fromDateHandle = await page.$x('//input[@id="ctl00_PlaceHolderMain_generalSearchForm_txtGSStartDate"]');
        await fromDateHandle[0].click({clickCount: 3});
        await fromDateHandle[0].press('Backspace');
        await fromDateHandle[0].type(dateRange.from, {delay: 100});

        const toDateHandle = await page.$x('//input[@id="ctl00_PlaceHolderMain_generalSearchForm_txtGSEndDate"]');
        await toDateHandle[0].click({clickCount: 3});
        await toDateHandle[0].press('Backspace');
        await toDateHandle[0].type(dateRange.to, {delay: 100});
    }

    async getData1(page: puppeteer.Page, sourceId: number) {
        let counts = 0, pageNum = 1;

        while (true) {            
            const rowXpath = '//div[@class="ACA_Grid_OverFlow"]//tr[not(contains(@class, "ACA_TabRow_Header")) and contains(@class, "TabRow")]';
            const rows = await page.$x(rowXpath);
            for (const row of rows) {
                let fillingDate = await row.evaluate(el => el.children[1].children[0].children[0].textContent?.trim());
                let originalDocType = await row.evaluate(el => el.children[3].children[0].children[0].textContent?.trim());
                let address = await row.evaluate(el => el.children[5].children[0].children[0].textContent?.trim());
                const timestamp = (new Date(fillingDate!)).getTime();
                let record = {
                    property_addresss: address,
                    fillingdate: fillingDate,
                    casetype:originalDocType,
                    sourceId,
                    codeViolationId: timestamp
                }
                if (await this.saveRecord(record)) {
                    counts++;
                }
            }
            let nextHandle = await page.$x(`//a[contains(text(), "Next")]`);
            if (nextHandle.length > 0) {
                await nextHandle[0].click();
                await page.waitForXPath('//div[@id="divGlobalLoading"]', {visible: true});
                await page.waitForXPath('//div[@id="divGlobalLoading"]', {hidden: true});
                pageNum++;
            } else {
                break;
            }            
        }
        return counts;
    }

    async handleSource2(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;
        let startNum = await this.getPrevCodeViolationId(sourceId, false, -1, true);
        if (startNum === -1) startNum = 0;
        for (let pre = startNum; pre < 100; pre++) {
            // load page
            // get year
            const isPageLoaded = await this.openPage(page, link, '//*[@id="cplMain_txtSearchString"]');
            if (!isPageLoaded) {
                console.log('Page loading is failed, trying next...');
                continue;
            }

            await this.setSearchCriteria2(page, pre);
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
                continue;
            }
            // get results
            counts += await this.getData2(page, sourceId, pre);
            await this.sleep(2000);
        }
        return counts;
    }

    async setSearchCriteria2(page: puppeteer.Page, prefix: number) {
        await page.select('#cplMain_ddSearchOper', 'BEGINS WITH');
        let year = (new Date()).getFullYear().toString().substr(-2);
        let searchKey = `CE${year}-${prefix.toString().padStart(2, '0')}`;
        const searchHandle = await page.$x('//input[@id="cplMain_txtSearchString"]');
        await searchHandle[0].click({clickCount: 3});
        await searchHandle[0].press('Backspace');
        await searchHandle[0].type(searchKey, {delay: 150});
    }

    async getData2(page: puppeteer.Page, sourceId: number, pre: any) {
        let counts = 0;
        
        const [firstpagedisabled] = await page.$x('//*[contains(@id, "_btnPageFirst")][@disabled="disabled"]')
        if (!firstpagedisabled) {
            const [firstpage] = await page.$x('//*[contains(@id, "_btnPageFirst")]')
            await firstpage.click();
            await page.waitForXPath('//div[@id="cplMain_rlpSearch"]', {visible: true});
            await page.waitForXPath('//div[@id="cplMain_rlpSearch"]', {hidden: true});
        }
        while (true) {
            const rows = await page.$x('//table[contains(@id, "rgSearchRslts")]/tbody/tr');
            for (const row of rows) {
                try {
                    let address = await row.evaluate(el => el.children[1].children[0].textContent?.trim());
                    let fillingDate = await row.evaluate(el => el.children[6].textContent?.trim());
                    let originalDocType = await row.evaluate(el => el.children[10].children[0].textContent?.trim()); 
                    let year = (new Date()).getFullYear();
                    let codeViolationId = parseInt(`${year}${pre.toString().padStart(2, '0')}`);
                    let record = {
                        property_addresss: address,
                        fillingdate: fillingDate,
                        casetype:originalDocType,
                        sourceId,
                        codeViolationId
                    }
                    if (await this.saveRecord(record)) {
                        counts++;
                    }
                } catch (error) {
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