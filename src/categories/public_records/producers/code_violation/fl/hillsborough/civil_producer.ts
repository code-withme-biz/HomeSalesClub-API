import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../abstract_producer';
import axios from 'axios';
import { countReset } from 'console';
import CodeViolationNJ from '../../nj/civil_producer';

export default class CivilProducer extends AbstractProducer {

    sources =
      [
        { url: 'https://app.hillsboroughcounty.org/CodeEnforcement/Inquiry/Search/CaseDetails/', handler: this.handleSource1 },
        { url: 'https://aca.tampagov.net/CitizenAccess/Cap/CapHome.aspx?module=Enforcement', handler: this.handleSource2 } 
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
        let prevCodeViolationId = await this.getPrevCodeViolationId(sourceId, false, 1, true);
        let id = prevCodeViolationId;
        while (true) {
            // load page
            const _id = id.toString().padStart(6, '0');
            let year: any = (new Date()).getFullYear() % 100;
            year = year.toString().padStart(2, '0');
            const isPageLoaded = await this.openPage(page, `${link}CE${year}${_id}`, '//footer');
            if (!isPageLoaded) {
                console.log('Page loading is failed, trying next...');
                continue;
            }
            const [errorMessage] = await page.$x('//*[contains(text(), "not a valid")]');
            if (errorMessage) {
                break;
            }
            year = (new Date()).getFullYear();
            let codeViolationId = parseInt(`${year}${_id}`);
            if (await this.getData1(page, codeViolationId, sourceId))
                counts++;
            await this.sleep(this.getRandomInt(1000, 2000));
            id++;
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
        counts += await this.getData2(page, sourceId);
        await this.sleep(3000);
        return counts;
    }

    async setSearchCriteria2(page: puppeteer.Page, dateRange: any) {
        // setting date range
        const fromDateHandle = await page.$x('//input[@id="ctl00_PlaceHolderMain_generalSearchForm_txtGSStartDate"]');
        await fromDateHandle[0].click({clickCount: 3});
        await fromDateHandle[0].press('Backspace');
        await fromDateHandle[0].type(dateRange.from, {delay: 150});

        const toDateHandle = await page.$x('//input[@id="ctl00_PlaceHolderMain_generalSearchForm_txtGSEndDate"]');
        await toDateHandle[0].click({clickCount: 3});
        await toDateHandle[0].press('Backspace');
        await toDateHandle[0].type(dateRange.to, {delay: 150});
    }

    async getData1(page: puppeteer.Page, codeViolationId: number, sourceId: number) {
        let fillingdate = await this.getTextByXpathFromPageV2(page, '//*[text()="Open Date:"]/parent::div/parent::div/div[2]');
        let property_address = await this.getTextByXpathFromPageV2(page, '//*[text()="Property Address:"]/parent::div/parent::div/div[2]');
        property_address = property_address.replace(/\s+/g, " ").trim().split(",")[0];
        if(property_address.includes('&')){
            property_address = property_address.split("&")[0];
        }
        return await this.saveRecord({
            property_address,
            fillingdate,
            sourceId,
            codeViolationId            
        });
    }

    async getData2(page: puppeteer.Page, sourceId: number) {
        let counts = 0, pageNum = 1;

        while (true) {            
            const rowXpath = '//div[@class="ACA_Grid_OverFlow"]//tr[not(contains(@class, "ACA_TabRow_Header")) and contains(@class, "TabRow")]';
            const rows = await page.$x(rowXpath);
            for (const row of rows) {
                let fillingDate = await row.evaluate(el => el.children[1].children[0].children[0].textContent?.trim());
                let originalDocType = await row.evaluate(el => el.children[3].children[0].children[0].textContent?.trim());                
                let address: any = await row.evaluate(el => el.children[4].children[0].children[0].textContent?.trim());
                let address_arr = address?.split(',');
                address = address_arr[0].trim();
                let city = 'Tampa';
                let zip = '';
                try{
                    let strzip = address_arr[1].trim().split(/\s+/)[1].trim();
                    if(!isNaN(strzip)){
                        zip = strzip;
                    }
                } catch(e){
                }
                const timestamp = (new Date(fillingDate!)).getTime();
                if (await this.saveRecord({
                    property_address: address,
                    property_zip: zip,
                    property_city: city,
                    casetype: originalDocType,
                    fillingdate: fillingDate, 
                    sourceId,
                    codeViolationId: timestamp
                })) {
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

    async saveRecord(record: any) {
        const data = {
            'Property State': this.publicRecordProducer.state,
            'Property City': record.property_city || '',
            'Property Zip': record.property_zip || '',
            'County': this.publicRecordProducer.county,
            'Property Address': record.property_address,
            "vacancyProcessed": false,
            "productId": this.productId,
            fillingDate: record.fillingdate,
            originalDocType: record.casetype,
            sourceId: record.sourceId,
            codeViolationId: record.codeViolationId
        };
        console.log(data);
        return await this.civilAndLienSaveToNewSchema(data);
    }
}