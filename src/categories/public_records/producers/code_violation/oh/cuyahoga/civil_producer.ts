import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';

export default class CivilProducer extends AbstractProducer {
    productId = '';
    sources =
      [
        {url: 'https://ca.permitcleveland.org/public/Cap/CapHome.aspx?module=BuildingHousing&TabName=Home', handler: this.handleSource1 },
        { url: '', installationID: 369, citizenService: true }
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

    async openPage(page: puppeteer.Page, link: string, xpath: string) {
        try {
            await page.goto(link, {waitUntil: 'load'});
            await page.$x(xpath);
            return true;
        } catch (error) {
            return false;
        }
    }

    async parseAndSave(): Promise<boolean> {
        let countRecords = 0;
        let page = this.browserPages.generalInfoPage;
        if (!page) {
            return false;
        }
        
        await page.setDefaultTimeout(60000);

        let sourceId = 0;
        for (const source of this.sources) {
            if (!source.handler) {
                countRecords += await this.handleCitizenSerice(page, source.installationID, sourceId);
            } else {
                countRecords += await source.handler.call(this, page, source.url, sourceId);
            }
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
        const types = [
            'BuildingHousing/Code Enforcement/Amusement Device/Installation',
            'BuildingHousing/Code Enforcement/Complaints/New',
            'BuildingHousing/Code Enforcement/Violation Notification/Building and Housing',
            'BuildingHousing/Code Enforcement/Elevator, Escalator, Lifts/Cert of Oper Location',
            'BuildingHousing/Code Enforcement/Elevator, Escalator, Lifts/Certificate of Operation',
            'BuildingHousing/Code Enforcement/Violation Notification/Elevator',
            'BuildingHousing/Code Enforcement/Elevator or Dumbwaiter/Installation',
            'BuildingHousing/Code Enforcement/Escalator/Installation',
            'BuildingHousing/Code Enforcement/Facade/Facade',
            'BuildingHousing/Historical Permit/Code Enforcement/NA',
            'BuildingHousing/Historical Permit/Violation/Violation',
            'BuildingHousing/Historical Permit/Violation/Condemnation',
            'BuildingHousing/Code Enforcement/Refrigeration/Cert of Qual and Oper Location',
            'BuildingHousing/Code Enforcement/Refrigeration/Cert of Qual and Operation',
            'BuildingHousing/Code Enforcement/Rental/Rental Structure',
            'BuildingHousing/Code Enforcement/Rental/Rental Unit',
            'BuildingHousing/Code Enforcement/Violation Notification/Rental Violation',
        ]
        for (const type of types) {
            await page.select('#ctl00_PlaceHolderMain_generalSearchForm_ddlGSPermitType', type);
            await page.waitForXPath('//div[@id="divGlobalLoading"]', {visible: true});
            await page.waitForXPath('//div[@id="divGlobalLoading"]', {hidden: true});
            const error_handle = await page.$x('//span[contains(text(), "An error has occurred.")]');
            if (error_handle.length > 0) {
                await page.goto(link, {waitUntil: 'load'});
                continue;
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
                continue;
            }
            // get results
            counts += await this.getData1(page);
            await this.sleep(3000);
        }
        
        return counts;
    }

    async setSearchCriteria1(page: puppeteer.Page, dateRange: any) {
        // setting date range
        const from = await this.getFormattedDate(dateRange.from);
        const fromDateHandle = await page.$x('//input[@id="ctl00_PlaceHolderMain_generalSearchForm_txtGSStartDate"]');
        await fromDateHandle[0].click({clickCount: 3});
        await fromDateHandle[0].press('Backspace');
        await fromDateHandle[0].type(from, {delay: 150});

        const to = await this.getFormattedDate(dateRange.to);
        const toDateHandle = await page.$x('//input[@id="ctl00_PlaceHolderMain_generalSearchForm_txtGSEndDate"]');
        await toDateHandle[0].click({clickCount: 3});
        await toDateHandle[0].press('Backspace');
        await toDateHandle[0].type(to, {delay: 150});
    }

    async getData1(page: puppeteer.Page) {
        let counts = 0, pageNum = 1, url = 'https://ca.permitcleveland.org';

        while (true) {            
            const rowXpath = '//div[@class="ACA_Grid_OverFlow"]//tr[not(contains(@class, "ACA_TabRow_Header")) and contains(@class, "TabRow")]';
            const rows = await page.$x(rowXpath);
            for (const row of rows) {
                let fillingDate = await row.evaluate(el => el.children[1].children[0].children[0].textContent?.trim());
                let originalDocType = await row.evaluate(el => el.children[3].children[0].children[0].textContent?.trim());
                let link = await row.evaluate(el => el.children[2].children[0].children[1].getAttribute('href'));
                if (!link) {
                    continue;
                }

                const detailPage = await this.browser?.newPage();
                if (!detailPage) {
                    continue;
                }
                await detailPage.goto(url + link, {waitUntil: 'load'});
                const addressHandle = await detailPage.$x('//table[@id="tbl_worklocation"]//tr//span');
                if (addressHandle.length == 0) {
                    await detailPage.close();
                    continue;
                }
                let address = await addressHandle[0].evaluate(el => el.textContent?.trim());
                await detailPage.close();
               
                if (await this.saveRecord(address!, originalDocType!, fillingDate!)) {
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

    async saveRecord(address: string, caseType: string, fillingDate: string) {
        const data = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'Property Address': address,
            "vacancyProcessed": false,
            "productId": this.productId,
            fillingDate,
            originalDocType: caseType,
            codeViolationId: ''
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }

    getDateString(date: Date): string {
        return ("00" + (date.getMonth() + 1)).slice(-2) + "/" + ("00" + date.getDate()).slice(-2) + "/" + date.getFullYear();
    }
}