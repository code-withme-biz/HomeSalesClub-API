import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../abstract_producer';
import axios from 'axios';
import { countReset } from 'console';
import STREETS from './streets.json';

export default class CivilProducer extends AbstractProducer {

    sources = [
        { url: 'https://documents.shelbycountytn.gov/PermitInquiry/', handler: this.handleSource },
        { url: '', installationID: 256, citizenService: true }
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
            if (!source.handler) {
                countRecords += await this.handleCitizenSerice(page, source.installationID, sourceId);
            } else {
                countRecords += await source.handler.call(this, page, source.url, sourceId);
            }
            sourceId++;
        }

        await AbstractProducer.sendMessage(this.publicRecordProducer.state, this.publicRecordProducer.county ? this.publicRecordProducer.county : this.publicRecordProducer.city, countRecords, 'Code Violation');
        return true;
    }

    async handleSource(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;

        const isPageLoaded = await this.openPage(page, link, `//*[@id="txtStreetName"]`);
        if (!isPageLoaded) {
            console.log('Not found');
            return counts;
        }
        const date2010 = (new Date('1/1/2010')).getTime();
        for (const street of STREETS) {
            const inputStreet = await page.$('#txtStreetName');
            await inputStreet?.click({clickCount: 3});
            await inputStreet?.press('Backspace');
            await inputStreet?.type(street, {delay: 100});
            await Promise.all([
                page.click('#btnSearch'),
                page.waitForNavigation()
            ]);
            const [noresult] = await page.$x('//*[contains(text(), "The search did not return any documents")]');
            if (noresult) continue;
            let currPage = 1;
            while (true) {
                const rows = await page.$x('//*[@id="grdResultsGrid"]/tbody/tr[contains(@onmouseover, "this.original")]/td[1]');
                for (const row of rows) {
                    let text: any = await row.evaluate(el => el.textContent);
                    text = text?.replace(/\s+|\n/gm, ' ').trim();
                    const property_address_regex = new RegExp(`\\d+\\s+${street}.*$`, 'i');
                    const property_address_1 = text.match(property_address_regex);
                    if (property_address_1 === null) continue;
                    const property_address = property_address_1[0];

                    const fillingdate_1 = text.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
                    let fillingdate = '';
                    if (fillingdate_1) {
                        fillingdate = fillingdate_1[0];
                    }
                    if ((new Date(fillingdate)).getTime() < date2010) continue;
                    const timestamp = (new Date(fillingdate)).getTime();
                    const res = {
                        property_address,
                        fillingdate,
                        casetype: '',
                        sourceId,
                        codeViolationId: timestamp
                    };
                    if (await this.saveRecord(res)) counts++;
                    await this.sleep(1000);
                }
                currPage++;
                let [hasnextpage] = await page.$x(`//a[contains(@href, "javascript:__doPostBack('grdResultsGrid','Page$${currPage}')")]`);
                if (hasnextpage) {
                    await Promise.all([
                        hasnextpage.click(),
                        page.waitForNavigation()
                    ]);
                    await page.waitForSelector('#grdResultsGrid', {visible: true});
                } else {
                    break;
                }
            }
            await this.randomSleepIn5Sec();
        }
        return counts;
    }

    async setSearchCriteria(page: puppeteer.Page, date: string) {
        const [inputhandle] = await page.$x('//*[@name="ACTION_DATE"]');
        await inputhandle.type(date, {delay: 100});
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