import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
import db from '../../../../../../models/db';
import { SSL_OP_SSLEAY_080_CLIENT_DH_BUG } from 'constants';

export default class CivilProducer extends AbstractProducer {
    productId = '';

    sources =
      [
        { url: 'http://data1.santarosa.fl.gov/gocompliance/GoComplianceWindow.cfm', handler: this.handleSource1 },
        { url: 'https://citizen.srcity.org/CitizenAccess/Cap/CapHome.aspx?module=Enforcement&TabName=Enforcement', handler: this.handleSource2 }
      ];

    async init(): Promise<boolean> {
        console.log("running init")
        this.browser = await this.launchBrowser();
        this.browserPages.generalInfoPage = await this.browser.newPage();
        this.browserPages.generalInfoPage.setDefaultTimeout(60000);
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
        // load page
        const isPageLoaded = await this.openPage(page, link, '//select');
        if (!isPageLoaded) {
            console.log("Website not loaded successfully:", link);
            return counts;
        }

        let from = '12/01/2020';// this.getFormattedDate(new Date(await this.getPrevCodeViolationId(sourceId, true)));
        let to = this.getFormattedDate(new Date());

        await page.select('select.inpSelect', 'search/SearchbyDateForm.cfm');

        await page.waitForXPath('//iframe[@name="frame1"]');
        let [iframe]: any = await page.$x('//iframe[@name="frame1"]');
        iframe = await iframe.contentFrame();

        await iframe.waitForSelector('#FromDate', {visible: true});
        await iframe.type('#FromDate', from, {delay: 100});
        await iframe.type('#ToDate', to, {delay: 100});

        await iframe.click('#Submit');
        
        await this.sleep(2000);


        const [noresult] = await iframe.$x('//*[contains(.//text(), "Sorry")]', {visible: true});
        if (noresult) {
            console.log('No Results Found');
            return SSL_OP_SSLEAY_080_CLIENT_DH_BUG;
        }
        await iframe.waitForXPath('//table[@id="head"]/tbody/tr[position()>1]')
        while (true) {
            const rows = await iframe.$x('//table[@id="head"]/tbody/tr[position()>1]');
            for (const row of rows) {                
                let property_address = await row.evaluate((el: any) => el.children[3].textContent) || ''
                property_address = property_address.replace(/\s+|\n/gm, ' ').trim();
                let fillingdate = await row.evaluate((el: any) => el.children[6].textContent) || ''
                fillingdate = fillingdate.replace(/\s+|\n/gm, ' ').trim();
                let owner_name: any = await row.evaluate((el: any) => el.children[2].textContent) || ''
                if (owner_name.indexOf('&') > -1) {
                    owner_name = owner_name.split('&')[1];
                }
                owner_name = owner_name.replace(/[^a-zA-Z\s]+/g, '');
                const codeViolationId = (new Date(fillingdate)).getTime();
                const record = {
                    property_address,
                    casetype: '',
                    fillingdate,
                    sourceId,
                    codeViolationId,
                    owner_name
                }
                if (await this.saveRecord(record))
                    counts++;
            }
            const [hasnextpage] = await iframe.$x('//*[contains(@title, "next")]');
            if (hasnextpage) {
                await hasnextpage.click();
                await this.sleep(500);
            } else {
                break;
            }
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
        const isPageLoaded = await this.openPage(page, link, '//span[text()="Search"]/parent::a');
        if (!isPageLoaded) {
            console.log()
            return counts;
        }
        await this.setSearchCriteria2(page, dateRange);
        
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
        counts += await this.getData2(page, sourceId);
        await this.sleep(3000);
        return counts;
    }

    async getData2(page: puppeteer.Page, sourceId: number) {
        let counts = 0, pageNum = 1, url = 'https://citizen.srcity.org';

        const sortHandle1 = await page.$x('//span[text()="Date"]/parent::a');
        await sortHandle1[0].click();
        await page.waitForXPath('//div[@id="divGlobalLoading"]', {visible: true});
        await page.waitForXPath('//div[@id="divGlobalLoading"]', {hidden: true});

        const sortHandle2 = await page.$x('//span[text()="Date"]/parent::a');
        await sortHandle2[0].click();
        await page.waitForXPath('//div[@id="divGlobalLoading"]', {visible: true});
        await page.waitForXPath('//div[@id="divGlobalLoading"]', {hidden: true});
        
        await this.sleep(5000)

        while (true) {            
            const rowXpath = '//div[@class="ACA_Grid_OverFlow"]//tr[not(contains(@class, "ACA_TabRow_Header")) and contains(@class, "TabRow")]';
            const rows = await page.$x(rowXpath);
            for (const row of rows) {
                let fillingDate = await row.evaluate(el => el.children[1].children[0].children[0].textContent?.trim());
                let originalDocType = await row.evaluate(el => el.children[3].children[0].children[0].textContent?.trim());
                let link = await row.evaluate(el => el.children[2].children[0].children[1].getAttribute('href'));

                const detailPage = await this.browser?.newPage();
                if (!detailPage) {
                    break;
                }
                await detailPage.goto(url + link, {waitUntil: 'load'});
                const addressHandle = await detailPage.$x('//table[@id="tbl_worklocation"]//tr//span');
                if (addressHandle.length == 0) {
                    await detailPage.close();
                    continue;
                }
                let address = await addressHandle[0].evaluate(el => el.textContent?.trim());
                await detailPage.close();
                
                const timestamp = (new Date(fillingDate!)).getTime();
                const res = {
                    property_address: address!,
                    fillingdate: fillingDate!,
                    casetype: originalDocType!,
                    sourceId,
                    codeViolationId: timestamp
                }   
                if (await this.saveRecord(res)) {
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

    async saveRecord(record: any) {
        // save property data
        let data: any = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'Property Address': record.property_address,
            "vacancyProcessed": false,
            "productId": this.productId,
            originalDocType: record.casetype,
            sourceId: record.sourceId,
            codeViolationId: record.codeViolationId
        };
        if (record.owner_name) {
            // save owner data
            let parseName: any = this.newParseName(record.owner_name.trim());
            if (parseName.type && parseName.type == 'COMPANY') {
                return false;
            }
            data = {
                ...data,
                'First Name': parseName.firstName,
                'Last Name': parseName.lastName,
                'Middle Name': parseName.middleName,
                'Name Suffix': parseName.suffix,
                'Full Name': parseName.fullName,
            }
            if (record.owner_address) {
                data = {
                    ...data,
                    'Mailing Address': record.owner_address
                }
            }
        }
        return await this.civilAndLienSaveToNewSchema(data);
    }
}