import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../abstract_producer';
import axios from 'axios';
import { countReset } from 'console';

export default class CivilProducer extends AbstractProducer {

    sources = [
        { url: 'https://dekalbga-ws01.cloud.infor.com/IPSProdDP/Views/AgencyLogin.aspx', handler: this.handleSource },
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

        await page.setDefaultTimeout(60000);

        let sourceId = 0;
        for (const source of this.sources) {
            countRecords += await source.handler.call(this, page, source.url, sourceId);
            sourceId++;
        }

        await AbstractProducer.sendMessage(this.publicRecordProducer.state, this.publicRecordProducer.county ? this.publicRecordProducer.county : this.publicRecordProducer.city, countRecords, 'Code Violation');
        return true;
    }

    async handleSource(page: puppeteer.Page, link: string, sourceId: number) {
        let countRecords = 0;
        const isPageLoaded = await this.openPage(page, link, '//a[contains(@id, "loginAnonymouslyLinkButton")]');
        if (!isPageLoaded) {
            console.log('Not found');
            return countRecords;
        }
        await Promise.all([
            page.click('a[id$="loginAnonymouslyLinkButton"]'),
            page.waitForNavigation()
        ]);
        await page.goto('https://dekalbga-ws01.cloud.infor.com/IPSProdDP/Views/CRM/CaseLookUp.aspx', {waitUntil: 'load'});
        await page.waitForSelector('input[id$="_caseNumberSearchTab__caseNumberSearchControl_NumberTextBox"]', {visible: true});

        let prevCodeViolationId = await this.getPrevCodeViolationId(sourceId, false, 107000);

        while (true) {
            const inputhandle = await page.$('input[id$="_caseNumberSearchTab__caseNumberSearchControl_NumberTextBox"]');
            await inputhandle?.click({clickCount: 3});
            await inputhandle?.press('Backspace');
            await inputhandle?.type(prevCodeViolationId.toString(), {delay: 100});
            await page.click('a[id$="_caseNumberSearchTab__caseNumberSearchControl_NumberSearchButton"]');
            await page.waitForSelector('div.loading', {hidden: true});
            const [errorLabel] = await page.$x('//*[text()="Case Not Found."]');
            if (errorLabel) break;
            await page.waitForXPath(`//*[contains(@id, "_searchResultTab__lookupResultsGrid_ctl02_mainViewLink")][text()="${prevCodeViolationId}"]`);
            await page.waitForSelector('span[id$="_searchResultTab_tab"]', {visible: true});
            await page.click('span[id$="_searchResultTab_tab"]');
            await this.sleep(100);
            const row = await page.$('table[id$="_searchResultTab__lookupResultsGrid"]>tbody>tr:nth-child(2)');
            if (row) {
                const property_address = await this.getTextByXpathFromPage(page, '//*[contains(@id, "_searchResultTab__lookupResultsGrid")]/tbody/tr[2]/td[4]');
                const casetype = await this.getTextByXpathFromPage(page, '//*[contains(@id, "_searchResultTab__lookupResultsGrid")]/tbody/tr[2]/td[2]');
                const record = {
                    property_address,
                    casetype,
                    fillingdate: '',
                    sourceId,
                    codeViolationId: prevCodeViolationId
                }
                if (await this.saveRecord(record)) countRecords++;
            }
            await page.waitForSelector('span[id$="_caseNumberSearchTab_tab"]');
            await page.click('span[id$="_caseNumberSearchTab_tab"]');
            await this.sleep(1000);
            prevCodeViolationId++;
        }

        return countRecords;
    }

    async saveRecord(record: any) {
        const data = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'Property Address': record.property_address,
            "vacancyProcessed": false,
            "productId": this.productId,
            "caseUniqueId": record.caseno,
            fillingDate: record.fillingdate,
            originalDocType: record.casetype,
            sourceId: record.sourceId,
            codeViolationId: record.codeViolationId
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }
}