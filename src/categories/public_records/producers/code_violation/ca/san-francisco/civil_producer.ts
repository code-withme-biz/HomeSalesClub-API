import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../abstract_producer';
import axios from 'axios';
import { countReset } from 'console';

export default class CivilProducer extends AbstractProducer {

    sources =
 [
        { url: 'https://data.sfgov.org/resource/5cei-gny5.json', handler: this.handleSource },
        { url: 'https://nhit-odp.data.socrata.com/resource/k9xn-hr3e.json', handler: this.handleSource },
        { url: 'https://data.sfgov.org/resource/nyek-jaw8.json', handler: this.handleSource1 },
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
            from: new Date(await this.getPrevCodeViolationId(sourceId, true)),
            to: new Date()
        };
        let countRecords = 0;
        let limit = 1000;
        let offset = 0;

        while (true) {
            const response = await this.getCodeViolationData(url, limit, offset, 'requested_datetime', dateRange.from, dateRange.to);
            if (response.success) {
                for (const record of response.data) {
                    const property_address = record.address;
                    const fillingdate = record.requested_datetime;
                    const codeViolationId = (new Date(fillingdate)).getTime();
                    const casetype = record.service_name;

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

    async handleSource(page: puppeteer.Page, url: string, sourceId: number) {
        let dateRange = {
            from: new Date(await this.getPrevCodeViolationId(sourceId, true)),
            to: new Date()
        };
        let countRecords = 0;
        let limit = 1000;
        let offset = 0;

        while (true) {
            const response = await this.getCodeViolationData(url, limit, offset, 'file_date', dateRange.from, dateRange.to);
            if (response.success) {
                for (const record of response.data) {
                    const property_address = record.address;
                    const fillingdate = record.file_date;
                    const codeViolationId = (new Date(fillingdate)).getTime();
                    const casetype = 'Eviction Notices';

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