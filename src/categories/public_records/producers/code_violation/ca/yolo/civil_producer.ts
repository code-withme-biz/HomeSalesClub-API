import { SSL_OP_SSLEAY_080_CLIENT_DH_BUG } from 'constants';
import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
export default class CivilProducer extends AbstractProducer {
    sources =
        [
            { url: 'https://etrakit.yolocounty.org/etrakit/Search/case.aspx', handler: this.handleSource1 },
            { url: 'https://access.cityofwestsacramento.org/CitizenAccess/Cap/CapHome.aspx?module=Code', handler: this.handleSource2 },
            { url: 'https://hub.arcgis.com/datasets/0cda8eeb20644e47920e29bcf3188aac_0/data?orderBy=DateOpened&orderByAsc=false', handler: this.handleSource3 }
        ];

    async init(): Promise<boolean> {
        console.log("running init")
        this.browser = await this.launchBrowser();
        this.browserPages.generalInfoPage = await this.browser.newPage();

        await this.setParamsForPage(this.browserPages.generalInfoPage);
        return true;
    };
    async read(): Promise<boolean> {
        return true;
    };

    getStartNumberString(startNum: number, lengthdigit = 4) {
        let result = startNum.toString().padStart(lengthdigit, '0');
        return result;
    }

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
        let startNum = await this.getPrevCodeViolationId(sourceId);
        let startCaseCodes = [
            { code: 'CE', flagStop: false },
        ]
        for (let id = startNum; id < startNum + 200; id++) {
            // load page

            // get year
            let year = (new Date()).getFullYear();
            let startNumString = this.getStartNumberString(id);


            for (let caseCode = 0; caseCode < startCaseCodes.length; caseCode++) {
                if (startCaseCodes[caseCode].flagStop == true) {
                    console.log('Progress another case for id = ' + id);
                    continue
                }
                const isPageLoaded = await this.openPage(page, link, '//*[@id="cplMain_txtSearchString"]');
                if (!isPageLoaded) {
                    console.log('Page loading is failed, trying next...');
                    continue;
                }

                let caseId = startCaseCodes[caseCode].code + year + "-" + startNumString;
                await page.select('#cplMain_ddSearchBy', 'Case_Main.CASE_NO');
                await this.setSearchCriteria1(page, caseId);
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
                    startCaseCodes[caseCode].flagStop = true
                    continue;
                }
                // get results
                counts += await this.getData1(page, sourceId, id);
                await this.sleep(2000);
            }
        }
        return counts;
    }

    async setSearchCriteria1(page: puppeteer.Page, id: string) {

        // choose begin with
        await page.select('#cplMain_ddSearchOper', 'BEGINS WITH');
        // page loaded successfully

        let [input_handle] = await page.$x('//*[@id="cplMain_txtSearchString"]');
        await input_handle.type(id);
    }

    async getData1(page: puppeteer.Page, sourceId: number, codeViolationId: number) {
        let counts = 0;
        let index = 1;
        const rows = await page.$x('//table[contains(@id, "rgSearchRslts")]/tbody/tr');
        for (const row of rows) {
            try {
                const rowCaseType = await page.$x('//table[contains(@id, "rgSearchRslts")]/tbody/tr[' + index + ']/td[3]/span');
                let casetype = await page.evaluate(el => el.getAttribute('title'), rowCaseType[0]);
                casetype = casetype.replace(/\s+|\n/, ' ').trim();
                let property_address = await page.evaluate(el => el.children[5].textContent, row);
                property_address = property_address.replace(/\s+|\n/, ' ').trim();
                if (casetype == '' || property_address == '') {
                    index++;
                    continue
                }
                if (casetype == 'AVA') {
                    casetype = 'Abandoned Vehicle Abatement'
                }
                if (await this.saveRecord({ property_address, casetype, sourceId, codeViolationId })) counts++;
            } catch (error) {
            }
            index++
        }
        return counts;
    }

    async handleSource2(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;

        let dateRange = {
            from: this.getFormattedDate(new Date(await this.getPrevCodeViolationId(sourceId, true))),
            to: this.getFormattedDate(new Date())
        };
        console.log('loading page')
        const isPageLoaded = await this.openPage(page, link, '//span[text()="Search"]/parent::a');
        if (!isPageLoaded) {
            console.log('Page loading failed');
            return counts;
        }
        await this.setSearchCriteria2(page, dateRange);

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
        counts += await this.getData2(page, sourceId);
        await this.sleep(3000);
        return counts;
    }

    async setSearchCriteria2(page: puppeteer.Page, dateRange: any) {
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

    async getData2(page: puppeteer.Page, sourceId: number) {
        let counts = 0, pageNum = 1;

        while (true) {
            const rowXpath = '//div[@class="ACA_Grid_OverFlow"]//tr[not(contains(@class, "ACA_TabRow_Header")) and contains(@class, "TabRow")]';
            const rows = await page.$x(rowXpath);
            for (const row of rows) {
                let fillingDate = await row.evaluate(el => el.children[1].children[0].children[0].textContent?.trim());
                let originalDocType = await row.evaluate(el => el.children[3].children[0].children[0].textContent?.trim());
                let address = await row.evaluate(el => el.children[5].children[0].children[0].textContent?.trim());
                const timestamp = (new Date(fillingDate!)).getTime();

                if (await this.saveRecord({ address, originalDocType, fillingDate, sourceId, codeViolationId: timestamp })) {
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

    async handleSource3(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;
        // load page
        const isPageLoaded = await this.openPage(page, link, '//*[text()="OBJECTID"]/ancestor::table[1]/tbody/tr');
        if (!isPageLoaded) {
            console.log("Website not loaded successfully:", link);
            return counts;
        }

        let prevCodeViolationId = await this.getPrevCodeViolationId(sourceId, true, -1);

        while (true) {
            const rows = await page.$x('//*[text()="OBJECTID"]/ancestor::table[1]/tbody/tr');
            let flag = false;
            for (const row of rows) {
                let fillingdate = await row.evaluate(el => el.children[5].textContent) || ''
                fillingdate = fillingdate.replace(/\s+|\n/gm, ' ').trim();
                let codeViolationId = (new Date(fillingdate)).getTime();
                if (prevCodeViolationId > codeViolationId) {
                    flag = true;
                    break;
                }
                let casetype = 'ENFORCEMENT';
                let property_address = await row.evaluate(el => el.children[3].textContent) || ''
                property_address = property_address.replace(/\s+|\n/gm, ' ').trim();
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
            const [hasnextpage] = await page.$x('//a[text()="›"][@aria-label="Next"]');
            if (hasnextpage) {
                await hasnextpage.click();
                await page.waitForXPath('//*[@class="table-responsive"]/following-sibling::div[contains(@class, "loader")]', { hidden: true });
                await this.sleep(500);
            } else {
                break;
            }
        }
        return counts;
    }

    async saveRecord(record: any) {
        let data: any = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'Property Address': record.property_address,
            "vacancyProcessed": false,
            "productId": this.productId,
            originalDocType: record.casetype,
            fillingDate: record.fillingdate,
            sourceId: record.sourceId,
            codeViolationId: record.codeViolationId
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }
}