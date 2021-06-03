import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../abstract_producer';
import axios from 'axios';
import { countReset } from 'console';

export default class CivilProducer extends AbstractProducer {

    sources = [
        { url: 'https://ids.knoxapps.org/reports/runreport?uri=/inet/public/codes/permits/scheduledinspections_2510&mode=egov', handler: this.handleSource }
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
        console.log('============ Checking for ', link);
        let counts = 0;

        let fromDate = new Date(await this.getPrevCodeViolationId(sourceId, true, (new Date('1/1/2020')).getTime()));
        let toDate = new Date();

        while (fromDate <= toDate) {
            const isPageLoaded = await this.openPage(page, link, `//*[@name="ACTION_DATE"]`);
            if (!isPageLoaded) {
                console.log('Not found');
                return counts;
            }
            await this.setSearchCriteria(page, this.getFormattedDate(fromDate));
            await page.click('#submitButton');
            await this.sleep(2000);
            const pages = await this.browser?.pages()!;
            const newpage = pages[pages.length-1];
            await newpage.waitForXPath('//a[@title="View General Permit Information"]');

            let property_addresses = await newpage.$x('//a[@title="View General Permit Information"]/ancestor::tr[1]/following-sibling::tr[2]/td[3]');
            let fillingdates = await newpage.$x('//a[@title="View General Permit Information"]/ancestor::td[1]/preceding-sibling::td[4]');
            for (let i = 0 ; i < property_addresses.length ; i++) {                
                let property_address = await property_addresses[i].evaluate(el => el.textContent);
                let fillingdate = await fillingdates[i].evaluate(el => el.textContent) || '';
                const casetype = '';
                const timestamp = (new Date(fillingdate)).getTime();
                const res = {
                    property_address,
                    fillingdate,
                    casetype,
                    sourceId,
                    codeViolationId: timestamp
                };
                if (await this.saveRecord(res)) counts++;
                await this.sleep(1000);
            }
            await newpage.close();
            fromDate.setDate(fromDate.getDate()+1);
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