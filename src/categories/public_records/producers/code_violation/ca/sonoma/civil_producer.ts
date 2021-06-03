import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';

export default class CivilProducer extends AbstractProducer {
    productId = '';
    sources =
        [
            { url: 'https://prmd.sonomacounty.ca.gov/CitizenAccess/Cap/CapHome.aspx?module=Enforcement&TabName=Enforcement', handler: this.handleSource1 },
            { url: 'https://citizen.srcity.org/CitizenAccess/Cap/CapHome.aspx?module=Enforcement&TabName=Enforcement', handler: this.handleSource1 },
            { url: 'https://licensing.townofwindsor.com/eTRAKiT3/Search/case.aspx', handler: this.handleSource2 }
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

    async setSearchCriteria(page: puppeteer.Page, dateRange: any) {
        // setting date range
        const fromDateHandle = await page.$x('//input[@id="ctl00_PlaceHolderMain_generalSearchForm_txtGSStartDate"]');
        await fromDateHandle[0].click({ clickCount: 3 });
        await fromDateHandle[0].press('Backspace');
        await fromDateHandle[0].type(dateRange.from, { delay: 150 });

        const toDateHandle = await page.$x('//input[@id="ctl00_PlaceHolderMain_generalSearchForm_txtGSEndDate"]');
        await toDateHandle[0].click({ clickCount: 3 });
        await toDateHandle[0].press('Backspace');
        await toDateHandle[0].type(dateRange.to, { delay: 150 });
    }

    async parseAndSave(): Promise<boolean> {
        let countRecords = 0;
        let page = this.browserPages.generalInfoPage;
        if (!page) {
            return false;
        }
        // let sourceId = 0;
        // for (const source of this.sources) {
        //     countRecords += await source.handler.call(this, page, source.url, sourceId);
        //     sourceId++;
        // }

        let sourceId = 2;
        countRecords += await this.sources[2].handler.call(this, page, this.sources[2].url, sourceId);

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
        console.log('loading page')
        const isPageLoaded = await this.openPage(page, link, '//span[text()="Search"]/parent::a[@title="Search"]');
        if (!isPageLoaded) {
            console.log('Page loading failed');
            return counts;
        }
        await this.setSearchCriteria(page, dateRange);

        await page.click('div#ctl00_PlaceHolderMain_btnNewSearch_container a[title="Search"]');
        await page.waitForXPath('//div[@id="divGlobalLoading"]', { visible: true });
        await page.waitForXPath('//div[@id="divGlobalLoading"]', { hidden: true });

        let result_handle = await Promise.race([
            page.waitForXPath('//span[contains(text(), "returned no results")]', { visible: true }),
            page.waitForXPath('//div[@class="ACA_Grid_OverFlow"]//tr[not(contains(@class, "ACA_TabRow_Header")) and contains(@class, "TabRow")]', { visible: true })
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

    async handleSource2(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;
        let startNum = await this.getPrevCodeViolationId(sourceId, false, 1, true);
        let startCaseCodes = [
            { code: 'CE', flagStop: false },
        ]
        for (let id = startNum; id < startNum + 200; id++) {
            // load page

            // get year
            let year = (new Date()).getFullYear().toString().substr(-2);
            let startNumString = this.getStartNumberString2(id);


            for (let caseCode = 0; caseCode < startCaseCodes.length; caseCode++) {

                const isPageLoaded = await this.openPage(page, link, '//*[@id="cplMain_txtSearchString"]');
                if (!isPageLoaded) {
                    console.log('Page loading is failed, trying next...');
                    continue;
                }

                let caseId = startCaseCodes[caseCode].code + year + "-" + startNumString;
                await page.select('#cplMain_ddSearchBy', 'Case_Main.CASE_NO');
                await this.setSearchCriteria2(page, caseId);
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
                    await this.sleep(1000);
                    continue;
                }
                let yearForCode = (new Date()).getFullYear();
                // get results
                let codeViolationId = parseInt(`${yearForCode}${id.toString().padStart(4, '0')}`);
                counts += await this.getData2(page, sourceId, codeViolationId, caseId);
                await this.sleep(2000);
            }
        }
        return counts;
    }

    async getData1(page: puppeteer.Page, sourceId: number) {
        let counts = 0, pageNum = 1, url = 'https://prmd.sonomacounty.ca.gov';

        while (true) {
            const rowXpath = '//div[@class="ACA_Grid_OverFlow"]//tr[not(contains(@class, "ACA_TabRow_Header")) and contains(@class, "TabRow")]';
            const rows = await page.$x(rowXpath);
            for (const row of rows) {
                let fillingDate = await row.evaluate(el => el.children[1].children[0].children[0].textContent?.trim());
                let originalDocType = await row.evaluate(el => el.children[3].children[0].children[0].textContent?.trim());
                let link = await row.evaluate(el => el.children[2].children[0].children[1].getAttribute('href'));
                if (link === null) continue;

                const detailPage = await this.browser?.newPage();
                if (!detailPage) {
                    break;
                }
                await detailPage.goto(url + link, { waitUntil: 'load' });
                const addressHandle = await detailPage.$x('//table[@id="tbl_worklocation"]//tr//span');
                if (addressHandle.length == 0) {
                    await detailPage.close();
                    continue;
                }
                let address = await addressHandle[0].evaluate(el => el.textContent?.trim());
                await detailPage.close();

                const timestamp = (new Date(fillingDate!)).getTime();
                if (await this.saveRecord(address!, originalDocType!, fillingDate!, sourceId, timestamp)) {
                    counts++;
                }
            }
            let nextHandle = await page.$x(`//a[contains(text(), "Next")]`);
            if (nextHandle.length > 0) {
                await nextHandle[0].click();
                await page.waitForXPath('//div[@id="divGlobalLoading"]', { visible: true });
                await page.waitForXPath('//div[@id="divGlobalLoading"]', { hidden: true });
                pageNum++;
            } else {
                break;
            }
        }
        return counts;
    }

    getStartNumberString2(startNum: number, lengthdigit = 4) {
        let result = startNum.toString().padStart(lengthdigit, '0');
        return result;
    }

    async setSearchCriteria2(page: puppeteer.Page, id: string) {

        // choose begin with
        await page.select('#cplMain_ddSearchOper', 'BEGINS WITH');
        // page loaded successfully

        let [input_handle] = await page.$x('//*[@id="cplMain_txtSearchString"]');
        await input_handle.type(id);
    }

    async getData2(page: puppeteer.Page, sourceId: number, codeViolationId: number, caseId: string) {
        let counts = 0;
        let index = 1;
        const rows = await page.$x('//table[contains(@id, "rgSearchRslts")]/tbody/tr');
        for (const row of rows) {
            try {
                const rowCaseType = await page.$x('//table[contains(@id, "rgSearchRslts")]/tbody/tr[' + index + ']/td[5]/span');
                let casetype = await page.evaluate(el => el.getAttribute('title'), rowCaseType[0]);
                casetype = casetype.replace(/\s+|\n/, ' ').trim();
                let property_address = await page.evaluate(el => el.children[1].textContent, row);
                property_address = property_address.replace(/\s+|\n/, ' ').trim();
                casetype = casetype.replace(/\s+|\n/, ' ').trim();
                casetype = casetype.replace('RV ', 'RECREATIONAL VEHICLE ').trim();
                if (casetype == '' || property_address == '') {
                    index++;
                    continue
                }
                if (casetype == 'AVA') {
                    casetype = 'Abandoned Vehicle Abatement'
                }
                if (await this.saveRecord(property_address, casetype, '', sourceId, codeViolationId)) counts++;
            } catch (error) {
                console.log(error)
            }
            index++
        }
        return counts;
    }

    async saveRecord(address: string, caseType: string, fillingDate: string, sourceId: number, codeViolationId: number) {
        const data = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'Property Address': address,
            "vacancyProcessed": false,
            "productId": this.productId,
            fillingDate,
            originalDocType: caseType,
            sourceId,
            codeViolationId
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }
}