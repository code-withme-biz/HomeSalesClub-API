import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../abstract_producer';
import axios from 'axios';
import {countReset} from 'console';

export default class CivilProducer extends AbstractProducer {

    sources =
        [
            { url: 'https://saltlakecityut.citysourced.com/servicerequests/nearby', handler: this.handleSource1 },
            { url: 'https://citizenportal.slcgov.com/Citizen/Cap/CapHome.aspx?module=HAZE&TabName=HAZE&TabList=HOME%7C0%7CBuilding%7C1%7CBusLic%7C2%7CHAZE%7C3%7CEngineering%7C4%7CEvents%7C5%7CFIRE%7C6%7CCAP%7C7%7CPLANNING%7C8%7CSLCOwner%7C9%7CServiceRequest%7C10%7CTransportation%7C11%7CUTILITIES%7C12%7CParking%7C13%7CAPO%7C14%7CCurrentTabIndex%7C3', handler: this.handleSource2 }
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
        let dateRange = {
            from: new Date(await this.getPrevCodeViolationId(sourceId, true, (new Date('1/1/2020')).getTime())),
            to: new Date()
        };
        let date = dateRange.from;
        let today = dateRange.to;
        let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24)) - 1;
        // load page
        const isPageLoaded = await this.openPage(page, link, '//*[contains(@id,"txtGSStartDate")]');
        if (!isPageLoaded) {
            return counts
        }
        await page.waitForResponse('https://saltlakecityut.citysourced.com/pages/ajax/callapiendpoint.ashx')
        await this.setSearchCriteria1(page, days);
        const response:any =await( await page.waitForResponse('https://saltlakecityut.citysourced.com/pages/ajax/callapiendpoint.ashx')).json()
        counts += await this.getData1(response.Results, sourceId);
        await this.sleep(3000);

        return counts;
    }

    async setSearchCriteria1(page: puppeteer.Page, days: number) {
        await page.waitForXPath('//*[@data-target="#csFiltersModal"]')
        const [filterBtn] = await page.$x('//*[@data-target="#csFiltersModal"]')
        await filterBtn.click()
        let selectOption
        await page.waitForXPath('//*[@id="csFiltersModal" and contains(@class, "show")]')
        if (days > 7) {
            selectOption = '3'
        } else {
            selectOption = '1'
        }
        await page.select('#numDateFilter',selectOption)
        const [applyFilters] = await page.$x('//*[@id="csFiltersModal"]//*[contains(text(),"Apply Filters")]')
        await applyFilters.click()
    }

    async getData1(data:any, sourceId: number) {
        let counts = 0;
        for (const datum of data) {
            const fillingdate = (new Date(datum.DateCreated)).toLocaleDateString('en-US', {
                year: "numeric",
                month: "2-digit",
                day: "2-digit"
            })
            const timestamp = (new Date(fillingdate!)).getTime();
            if (await this.saveRecord({
                property_address: datum.FormattedAddress,
                fillingdate,
                casetype:datum.RequestType,
                sourceId,
                codeViolationId: timestamp
            })) {
                counts++;
           }
        }
        return counts;
    }

    async handleSource2(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;

        let dateRange = {
            from: this.getFormattedDate(new Date(await this.getPrevCodeViolationId(sourceId, true, (new Date('1/1/2020')).getTime()))),
            to: this.getFormattedDate(new Date())
        };
        const isPageLoaded = await this.openPage(page, link, '//select[@id="ctl00_PlaceHolderMain_generalSearchForm_ddlGSPermitType"]');
        if (!isPageLoaded) {
            console.log()
            return counts;
        }
        await this.setSearchCriteria2(page, dateRange);
        
        await page.click('#ctl00_PlaceHolderMain_btnNewSearch');
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
        let counts = 0, url = 'https://citizenportal.slcgov.com/';
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
                let fillingDate = await row.evaluate(el => el.children[1].textContent?.trim());
                fillingDate = fillingDate?.replace(/\s+|\n/gm, ' ').trim();
                let originalDocType = await row.evaluate(el => el.children[3].textContent?.trim());
                originalDocType = originalDocType?.replace(/\s+|\n/gm, ' ').trim();
                let link = await row.evaluate(el => el.children[2].children[0].children[1].getAttribute('href'));
                if (link === null) continue;
                
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
                address = address?.replace(/\s+|\n/gm, ' ').trim();
                await detailPage.close();

                const timestamp = (new Date(fillingDate!)).getTime();
                const res = {
                    property_address: address!,
                    fillingdate: fillingDate!,
                    casetype: originalDocType!,
                    sourceId,
                    codeViolationId: timestamp
                }   
                console.log(res);
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
        const data = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'Property Address': record.property_address,
            "vacancyProcessed": false,
            "productId": this.productId,
            fillingDate: record.fillingdate,
            originalDocType: record.casetype,
            sourceId: record.sourceId,
            codeViolationId: record.codeViolationId
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }
}