import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
import db from '../../../../../../models/db';

export default class CivilProducer extends AbstractProducer {
    productId = '';
    sources =
      [
        { url: 'https://aca-prod.accela.com/PINELLAS/Cap/CapHome.aspx?module=Enforcement&TabName=Enforcement', handler: this.handleSource1 },
        { url: 'https://stat.stpete.org/resource/way3-3q6b.json?case_status_desc=ACTIVE', handler: this.handleSource2 },
        { url: 'https://stat.stpete.org/resource/tmdq-gg7f.json?case_status_desc=ACTIVE', handler: this.handleSource3 },
        { url: 'https://stat.stpete.org/resource/f65e-u2ih.json', handler: this.handleSource4 }
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
        if (!page) return false;

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
            from: new Date(await this.getPrevCodeViolationId(sourceId, true)),
            to: new Date()
        };

        const isPageLoaded = await this.openPage(page, link, '//span[text()="Search"]/parent::a');
        if (!isPageLoaded) {
            console.log()
            return counts;
        }
        await this.sleep(2000);
        await this.setSearchCriteria1(page, dateRange.from, dateRange.to);               
        
        await page.click('div#ctl00_PlaceHolderMain_btnNewSearch_container a[title="Search"]');
        await page.waitForXPath('//div[@id="divGlobalLoading"]', {visible: true});
        await page.waitForXPath('//div[@id="divGlobalLoading"]', {hidden: true});

        let result_handle = await Promise.race([
            page.waitForXPath('//span[contains(text(), "no results")]', {visible: true}),
            page.waitForXPath('//div[@class="ACA_Grid_OverFlow"]//tr[not(contains(@class, "ACA_TabRow_Header")) and contains(@class, "TabRow")]', {visible: true})
        ]);
        
        let result_text = await result_handle.evaluate(el => el.textContent || '');
        if (result_text?.indexOf('no results') > -1) {
            console.log('No Results Found');
            return counts;
        }
        // get results
        counts += await this.getData1(page, sourceId);
        return counts;
    }

    async setSearchCriteria1(page: puppeteer.Page, fromDate: Date, toDate: Date) {
        let from = await this.getFormattedDate(fromDate);
        let to = await this.getFormattedDate(toDate);
        const fromDateHandle = await page.$x('//*[@id="ctl00_PlaceHolderMain_generalSearchForm_txtGSStartDate"]');
        const toDateHandle = await page.$x('//*[@id="ctl00_PlaceHolderMain_generalSearchForm_txtGSEndDate"]');
        await fromDateHandle[0].click({clickCount: 3});
        await fromDateHandle[0].press('Backspace');
        await fromDateHandle[0].type(from, {delay: 100});
        await toDateHandle[0].click({clickCount: 3})
        await toDateHandle[0].press('Backspace');
        await toDateHandle[0].type(to, {delay: 100});
    }

    async getData1(page: puppeteer.Page, sourceId: number) {
        let counts = 0, pageNum = 1;
        for (let i = 0; i < 2; i++) {
            const dateSortHandle = await page.$x('//span[text()="Date"]/parent::a');
            await dateSortHandle[0].click();
            await page.waitForXPath('//div[@id="divGlobalLoading"]', {visible: true});
            await page.waitForXPath('//div[@id="divGlobalLoading"]', {hidden: true});
        }
        
        while (true) {            
            const rowXpath = '//div[@class="ACA_Grid_OverFlow"]//tr[not(contains(@class, "ACA_TabRow_Header")) and contains(@class, "TabRow")]';
            const rows = await page.$x(rowXpath);
            for (const row of rows) {
                let address = await row.evaluate(el => el.children[6].children[0].children[0].textContent?.trim());
                let fillingDate = await row.evaluate(el => el.children[1].children[0].children[0].textContent?.trim());
                let originalDocType = await row.evaluate(el => el.children[2].children[0].children[0].textContent?.trim());
                const codeViolationId = (new Date(fillingDate!)).getTime();
               
                if (await this.saveRecord(address!, originalDocType!, fillingDate!, sourceId, codeViolationId)) {
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

    
    async handleSource2(page: puppeteer.Page, url: string, sourceId: number) {
        let dateRange = {
            from: new Date(await this.getPrevCodeViolationId(sourceId, true)),
            to: new Date()
        };
        let countRecords = 0;
        let limit = 1000;
        let offset = 0;

        while (true) {
            const response = await this.getCodeViolationData(url, limit, offset, 'date_case_reported', dateRange.from, dateRange.to);
            if (response.success) {
                for (const record of response.data) {
                    const property_address = record.address;
                    const fillingdate = record.date_case_reported;
                    const codeViolationId = (new Date(fillingdate)).getTime();
                    const casetype = 'Codes Citizen Connect';
                    
                    if (await this.saveRecord(property_address, casetype, fillingdate, sourceId, codeViolationId))
                        countRecords++;
                }
                offset += limit;
                if (response.end) break;
                await this.sleep(this.getRandomInt(1000, 2000));
            }
            else {
                break;
            }
        }
        
        return countRecords;
    }
    
    async handleSource3(page: puppeteer.Page, url: string, sourceId: number) {
        let dateRange = {
            from: new Date(await this.getPrevCodeViolationId(sourceId, true)),
            to: new Date()
        };
        let countRecords = 0;
        let limit = 1000;
        let offset = 0;
    
        while (true) {
            const response = await this.getCodeViolationData(url, limit, offset, 'date_case_reported', dateRange.from, dateRange.to);
            if (response.success) {
                for (const record of response.data) {
                    const property_address = record.address;
                    const fillingdate = record.date_case_reported;
                    const codeViolationId = (new Date(fillingdate)).getTime();
                    const casetype = "CIVIL CITATION - ALLEYS";

                    if (await this.saveRecord(property_address, casetype, fillingdate, sourceId, codeViolationId))
                        countRecords++;
                }
                offset += limit;
                if (response.end) break;
                await this.sleep(this.getRandomInt(1000, 2000));
            }
            else {
                break;
            }
        }
        
        return countRecords;
    }

        
    async handleSource4(page: puppeteer.Page, url: string, sourceId: number) {
        let prevCodeViolationId = await this.getPrevCodeViolationId(sourceId);
        let countRecords = 0;
        let limit = 1000;
        let offset = 0;

        while (true) {
            let url_ = `${url}?$where=case_nbr>${prevCodeViolationId}`
            const response = await this.getCodeViolationData(url_, limit, offset);
            if (response.success) {
                for (const record of response.data) {
                    const property_address = record.address;
                    const fillingdate = record.case_year;
                    const codeViolationId = parseInt(record.case_nbr);
                    const casetype = 'Active Neighborhood Association Codes Cases';
        
                    if (await this.saveRecord(property_address, casetype, fillingdate, sourceId, codeViolationId))
                        countRecords++;
                }
                offset += limit;
                if (response.end) break;
                await this.sleep(this.getRandomInt(1000, 2000));
            }
            else {
                break;
            }
        }
        
        return countRecords;
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