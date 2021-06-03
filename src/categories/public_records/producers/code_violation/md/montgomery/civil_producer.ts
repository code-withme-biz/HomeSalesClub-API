import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../abstract_producer';
import axios from 'axios';
import { countReset } from 'console';

export default class CivilProducer extends AbstractProducer {

    sources = [
        { url: 'https://data.montgomerycountymd.gov/resource/rry5-yaa6.json', handler: this.handleSource1 },
        { url: 'https://data.montgomerycountymd.gov/resource/7hsy-2xg7.json', handler: this.handleSource2 },
        { url: 'https://data.montgomerycountymd.gov/resource/bw2r-araf.json', handler: this.handleSource3 },
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
            const response = await this.getCodeViolationData(url, limit, offset, 'date_filed', dateRange.from, dateRange.to);
            if (response.success) {
                console.log(response.data.length)
                for (const record of response.data) {
                    const property_address = record.street_address;
                    const fillingdate = record.date_filed;
                    const casetype = 'Housing Code Violatons';
                    const codeViolationId = (new Date(fillingdate)).getTime();

                    const res = {
                        property_address,
                        fillingdate,
                        casetype,
                        sourceId,
                        codeViolationId
                    }
                    console.log(res);
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

    async handleSource2(page: puppeteer.Page, url: string, sourceId: number) {
        let dateRange = {
            from: new Date(await this.getPrevCodeViolationId(sourceId, true, (new Date('1/1/2020')).getTime())),
            to: new Date()
        };
        let countRecords = 0;
        let limit = 1000;
        let offset = 0;

        while (true) {
            const response = await this.getCodeViolationData(url, limit, offset, 'date_filed', dateRange.from, dateRange.to);
            if (response.success) {
                console.log(response.data.length)
                for (const record of response.data) {
                    const property_address = record.street_address;
                    const fillingdate = record.date_filed;
                    const codeViolationId = (new Date(fillingdate)).getTime();
                    const casetype = 'Housing Code Violation Point Map';

                    const res = {
                        property_address,
                        fillingdate,
                        casetype,
                        sourceId,
                        codeViolationId
                    }
                    console.log(res);
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

    async handleSource3(page: puppeteer.Page, url: string, sourceId: number) {
        let dateRange = {
            from: new Date(await this.getPrevCodeViolationId(sourceId, true, (new Date('1/1/2020')).getTime())),
            to: new Date()
        };
        let countRecords = 0;
        let limit = 1000;
        let offset = 0;

        while (true) {
            const response = await this.getCodeViolationData(url, limit, offset, 'firstinspectiondate', dateRange.from, dateRange.to);
            if (response.success) {
                console.log(response.data.length)
                for (const record of response.data) {
                    const property_address = record.streetaddress;
                    const fillingdate = record.firstinspectiondate;
                    const casetype = 'Troubled Properties Analysis';
                    const codeViolationId = (new Date(fillingdate)).getTime();

                    const res = {
                        property_address,
                        fillingdate,
                        casetype,
                        sourceId,
                        codeViolationId
                    }
                    console.log(res);
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