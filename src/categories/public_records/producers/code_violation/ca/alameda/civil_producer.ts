import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
import db from '../../../../../../models/db';
const parser = require('parse-address');

export default class CivilProducer extends AbstractProducer {
    productId = '';

    sources =
        [
            { url: 'https://aca-prod.accela.com/OAKLAND/Cap/CapHome.aspx?module=Enforcement&TabName=Enforcement', handler: this.handleSource1 },
            { url: 'https://aca-prod.accela.com/COF/Cap/CapHome.aspx?module=Enforcement&TabName=Enforcement', handler: this.handleSource1 }
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

    async openPage(page: puppeteer.Page, link: string, xpath: string) {
        try {
            await page.goto(link, { waitUntil: 'load' });
            await page.$x(xpath);
            return true;
        } catch (error) {
            return false;
        }
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
        // load page
        const isPageLoaded = await this.openPage(page, link, '//select[@id="ctl00_PlaceHolderMain_generalSearchForm_ddlGSPermitType"]');
        if (!isPageLoaded) {
            console.log("Website not loaded successfully:", link);
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

        let dateRange = {
            from: this.getFormattedDate(new Date(await this.getPrevCodeViolationId(sourceId, true, (new Date('1/1/2020')).getTime()))),
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

    async getData1(page: puppeteer.Page, sourceId: number) {
        let counts = 0;
        try {
            await page.goto('https://aca-prod.accela.com/OAKLAND/Cap/CapHome.aspx?module=Enforcement&TabName=Enforcement');


            let dateRange = {
                from: this.getFormattedDate(new Date(await this.getPrevCodeViolationId(sourceId, true, (new Date('1/1/2020')).getTime()))),
                to: this.getFormattedDate(new Date())
            };
            let fromDate = dateRange.from;
            let toDate = dateRange.to;
            await page.waitForXPath('//select[@id="ctl00_PlaceHolderMain_generalSearchForm_ddlGSPermitType"]', { visible: true, timeout: 200000 });
            await page.click('input#ctl00_PlaceHolderMain_generalSearchForm_txtGSStartDate', { clickCount: 3 });
            await page.type('input#ctl00_PlaceHolderMain_generalSearchForm_txtGSStartDate', fromDate);
            await page.click('input#ctl00_PlaceHolderMain_generalSearchForm_txtGSEndDate', { clickCount: 3 });
            await page.type('input#ctl00_PlaceHolderMain_generalSearchForm_txtGSEndDate', toDate);

            await this.sleep(3000);
            let buttonSearch = await page.$x('//a[@id="ctl00_PlaceHolderMain_btnNewSearch"]');
            await buttonSearch[0]!.click();
            try {
                await page.waitForXPath('//span[contains(.,"Showing")]', { visible: true, timeout: 8000 });
            } catch (err) {
                console.log('No Result');
                return counts;
            }
            let flagStop = false;
            while (!flagStop) {
                await page.waitForXPath('//div[@id="divGlobalLoading" and contains(@style,"display: none;")]', { timeout: 200000 });
                let totalRow = await page.$x('//table[@id="ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList"]/tbody/tr[contains(@class,"ACA_TabRow_Odd") or contains(@class,"ACA_TabRow_Even")]');
                for (let l = 0; l < totalRow!.length; l++) {
                    let index = l + 1;
                    let [addressXpath] = await page.$x('//table[@id="ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList"]/tbody/tr[contains(@class,"ACA_TabRow_Odd") or contains(@class,"ACA_TabRow_Even")][' + index + ']/td[5]');
                    let address;
                    try {
                        address = await addressXpath.evaluate(el => el.textContent?.trim());
                    } catch (err) {
                        continue
                    }

                    let [fillingDateXpath] = await page.$x('//table[@id="ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList"]/tbody/tr[contains(@class,"ACA_TabRow_Odd") or contains(@class,"ACA_TabRow_Even")][' + index + ']/td[2]');
                    let fillingDate;
                    try {
                        fillingDate = await fillingDateXpath!.evaluate(el => el.textContent?.trim());
                    } catch (err) {
                        continue
                    }

                    let [caseTypeXpath] = await page.$x('//table[@id="ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList"]/tbody/tr[contains(@class,"ACA_TabRow_Odd") or contains(@class,"ACA_TabRow_Even")][' + index + ']/td[4]');
                    let caseType;
                    try {
                        caseType = await caseTypeXpath!.evaluate(el => el.textContent?.trim());
                    } catch (err) {
                        continue
                    }

                    const timestamp = (new Date(fillingDate!)).getTime();
                    if (address != '' && caseType != '' && fillingDate != '')
                        counts += (await this.saveRecord(address!, caseType!, fillingDate!!, 0, timestamp));

                }

                try {
                    let btnNext = await page.$x('//a[contains(.,"Next") and contains(@href,"javascript")]');
                    await btnNext[0].click();
                    await this.sleep(2000);
                } catch (err) {
                    flagStop = true
                }
            }
        } catch (e) {
            console.log(e)
        }

        return counts;
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
                if (await this.saveRecord(address!, originalDocType!, fillingDate!, sourceId, timestamp)) {
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

    async saveRecord(address: string, caseType: string, fillingDate: string, sourceId: number, codeViolationId: number) {
        let count = 0;
        const parsed = parser.parseLocation(address);
        let number, street, type, propertyAddress;
        try {
            number = parsed.number ? parsed.number : '';
            street = parsed.street ? parsed.street : '';
            type = parsed.type ? parsed.type : '';
            propertyAddress = number + ' ' + street + ' ' + type;
        } catch (err) {
            return count;
        }
        const propertyZip = parsed.zip ? parsed.zip : '';
        const propertyCity = parsed.city ? parsed.city : '';
        const data = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'Property Address': propertyAddress,
            'Property City': propertyCity,
            'Property Zip': propertyZip,
            "vacancyProcessed": false,
            "productId": this.productId,
            fillingDate,
            sourceId,
            codeViolationId,
            originalDocType: caseType
        };
        if (await this.civilAndLienSaveToNewSchema(data)) {
            count++;
        }
        return count
    }
}