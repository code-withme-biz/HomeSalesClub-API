import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../abstract_producer';
import axios from 'axios';
import { countReset } from 'console';
import {log} from "util";

export default class CivilProducer extends AbstractProducer {

    sources = [
        { url: 'https://data.boston.gov/datastore/odata3.0/800a2663-1d6a-46e7-9356-bedb70f5332c', handler: this.handleSource }
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

    async handleSource(page: puppeteer.Page, url: string, sourceId: number) {
        let dateRange = {
            from: new Date(await this.getPrevCodeViolationId(sourceId, true)),
        };
        let countRecords = 0;
        let limit = 1000;
        let offset = 0;

        console.log('Date From',dateRange.from.toISOString()  )
        while (true) {
            let data = {
                 order: 'desc'
            }
            const response = await axios.get(`https://data.boston.gov/api/3/action/datastore_search_sql?sql=SELECT * from "90ed3816-5e70-443c-803d-9a71f44470be" WHERE "status_dttm" >= '${dateRange.from.toISOString()}'  ORDER BY "status_dttm" DESC OFFSET ${offset} ROWS FETCH FIRST ${limit} ROWS ONLY`,)
            if (response.data.result.records.length) {
                for (const record of response.data.result.records) {

                    const property_address = record.stno + ' ' + record.street+ ' ' + record.suffix;
                    const city = record.city;
                    const zip = record.zip;
                    const fillingdate = record.status_dttm;
                    const codeViolationId = (new Date(fillingdate)).getTime();
                    const casetype = 'CODE ENFORCEMENT VIOLATIONS';
                    const res = {
                        property_address,
                        fillingdate,
                        casetype,
                        sourceId,
                        codeViolationId,
                        city,
                        zip
                    }
                    if (await this.saveRecord(res))
                        countRecords++;
                }
                offset += limit;
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
            'Property City': record.city,
            'Property Zip': record.zip,
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