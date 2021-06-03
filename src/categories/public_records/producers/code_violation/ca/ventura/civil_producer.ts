import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';

export default class CivilProducer extends AbstractProducer {
    productId = '';
    sources =
      [
        { url: 'https://vcca.ventura.org/CitizenAccess/Cap/CapHome.aspx?module=Enforcement&TabName=Enforcement&TabList=Home%7C0%7CBuilding%7C1%7CEnforcement%7C2%7CFire%7C3%7CPlanning%7C4%7CPublicWorks%7C5%7CPublicHealth%7C6%7CEnvHealth%7C7%7CGIS%7C8%7CCurrentTabIndex%7C2', handler: this.handleSource1 }
      ];
    username = "webdev";
    password = "Qwer!234";

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
        await page.setDefaultTimeout(60000);
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

        const isPageLoaded = await this.openPage(page, link, '//*[@id="ctl00_PlaceHolderMain_LoginBox_txtUserId"]');
        if (!isPageLoaded) {
            console.log('Website loading is failed');
            return 0;
        }
        let dateRange = {
            from: this.getFormattedDate(new Date(await this.getPrevCodeViolationId(sourceId, true, (new Date('1/1/2020')).getTime()))),
            to: this.getFormattedDate(new Date())
        };

        // login
        const username_handle = await page.$('#ctl00_PlaceHolderMain_LoginBox_txtUserId');
        await username_handle?.click();
        await username_handle?.type(this.username, {delay: 100});
        await page.keyboard.press('Escape');
        const password_handle = await page.$('#ctl00_PlaceHolderMain_LoginBox_txtPassword');
        await password_handle?.click();
        await password_handle?.type(this.password, {delay: 100});
        await page.keyboard.press('Escape');

        await this.sleep(500);
        await page.click('#ctl00_PlaceHolderMain_LoginBox_btnLogin');
        await page.waitForXPath('//input[@id="ctl00_PlaceHolderMain_generalSearchForm_txtGSStartDate"]');

        await this.setSearchCriteria1(page, dateRange);               
        await page.click('a#ctl00_PlaceHolderMain_btnNewSearch');
        await page.waitForXPath('//div[@id="divGlobalLoading"]', {visible: true});
        await page.waitForXPath('//div[@id="divGlobalLoading"]', {hidden: true});

        let result_handle = await Promise.race([
            page.waitForXPath('//span[contains(text(), "returned no results")]', {visible: true}),
            page.waitForXPath('//div[@class="ACA_Grid_OverFlow"]//tr[not(contains(@class, "ACA_TabRow_Header")) and contains(@class, "TabRow")]', {visible: true})
        ]);
        
        let result_text = await result_handle.evaluate((el: any) => el.textContent || '');
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
        await fromDateHandle[0].type(dateRange.from, {delay: 150});

        const toDateHandle = await page.$x('//input[@id="ctl00_PlaceHolderMain_generalSearchForm_txtGSEndDate"]');
        await toDateHandle[0].click({clickCount: 3});
        await toDateHandle[0].press('Backspace');
        await toDateHandle[0].type(dateRange.to, {delay: 150});
    }

    async getData1(page: puppeteer.Page, sourceId: number) {
        let counts = 0;
        while (true) {            
            const rowXpath = '//div[@class="ACA_Grid_OverFlow"]//tr[not(contains(@class, "ACA_TabRow_Header")) and contains(@class, "TabRow")]';
            const rows = await page.$x(rowXpath);
            for (const row of rows) {
                let fillingDate = await row.evaluate(el => el.children[1].textContent?.trim()) || '';
                fillingDate = fillingDate?.replace(/\s+|\n/gm, ' ').trim();
                let originalDocType = await row.evaluate(el => el.children[3].textContent?.trim()) || '';
                originalDocType = originalDocType?.replace(/\s+|\n/gm, ' ').trim();
                let address = await row.evaluate(el => el.children[4].textContent?.trim()) || '';
                address = address?.replace(/\s+|\n/gm, ' ').trim();
                const timestamp = (new Date(fillingDate!)).getTime();
                const res = {
                    property_address: address!,
                    fillingdate: fillingDate!,
                    casetype: originalDocType!,
                    sourceId,
                    codeViolationId: timestamp
                }   
                console.log(res)
                if (await this.saveRecord(res)) {
                    counts++;
                }
            }
            let nextHandle = await page.$x(`//a[contains(text(), "Next")]`);
            if (nextHandle.length > 0) {
                await nextHandle[0].click();
                await page.waitForXPath('//div[@id="divGlobalLoading"]', {visible: true});
                await page.waitForXPath('//div[@id="divGlobalLoading"]', {hidden: true});
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
            fillingDate: record.fillingdate,
            originalDocType: record.caseType,
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
        }
        return await this.civilAndLienSaveToNewSchema(data);
    }
}