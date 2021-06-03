import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../abstract_producer';
import axios from 'axios';
import { countReset } from 'console';

export default class CivilProducer extends AbstractProducer {

    sources = [
        { url: 'https://data.cityoftacoma.org/resource/6pjp-m3z2.json?current_status=Open', handler: this.handleSource1 },
        { url: 'https://pals.piercecountywa.gov/palsonline/#/app/srs/srsSearch/case/activity?caseNumber=', handler: this.handleSource2 }
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

    async handleSource1(page: puppeteer.Page, url: string, sourceId: number) {
        let dateRange = {
            from: new Date(await this.getPrevCodeViolationId(sourceId, true, (new Date('1/1/2020')).getTime())),
            to: new Date()
        };
        let countRecords = 0;
        let limit = 1000;
        let offset = 0;
    
        while (true) {
            const response = await this.getCodeViolationData(url, limit, offset, 'open_date', dateRange.from, dateRange.to);
            if (response.success) {
                for (const record of response.data) {
                    const property_address = record.location_1;
                    const fillingdate = record.open_date;
                    const codeViolationId = (new Date(fillingdate)).getTime();
                    const casetype = 'CODE ENFORCEMENT VIOLATIONS';
                    const res = {
                        property_address,
                        fillingdate,
                        casetype,
                        sourceId,
                        codeViolationId
                    }                    
                    if (await this.saveRecord(res))
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

    async handleSource2(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;

        let prevCodeViolationId = await this.getPrevCodeViolationId(sourceId, false, 71083);        
        let id = prevCodeViolationId;
        while (true) {
            const isPageLoaded = await this.openPage(page, link+id, `//*[text()="Case ${id}"]`);
            if (!isPageLoaded) {
                console.log('Not found');
                return counts;
            }
            const [caseInfo] = await page.$x(`//*[text()="Case ${id}"]`);
            if (caseInfo) {
                let property_address = await this.getTextByXpathFromPage(page, '//*[@id="parcelNum"]/following-sibling::span[1]');
                property_address = property_address && property_address.slice(2).trim();
                const fillingdate = await this.getTextByXpathFromPage(page, '//td[@data-label="Activity Date"]');
                const casetype = await this.getTextByXpathFromPage(page, '//td[@data-label="Dept"]');
                const res = {
                    property_address,
                    fillingdate,
                    casetype,
                    sourceId,
                    codeViolationId: id
                };
                if (await this.saveRecord(res)) counts++;
                await this.sleep(3000);
            } else {
                break;
            }
            id++;
        }
        return counts;
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