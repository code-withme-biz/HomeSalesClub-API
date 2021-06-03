import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../abstract_producer';
import axios from 'axios';
import {countReset} from 'console';

export default class CivilProducer extends AbstractProducer {

    sources =
        [
            {url: 'https://citizenconnect-acd.austintexas.gov/#!/dashboard', handler: this.handleSource1},
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
            from: new Date(await this.getPrevCodeViolationId(sourceId, true)),
            to: new Date()
        };
        let date = dateRange.from;
        date.setDate(date.getDate() - 15)
        let today = dateRange.to;
        while (date <= today) {
            const dateArray = date.toLocaleDateString('en-US', {
                year: "numeric",
                month: "2-digit",
                day: "2-digit"
            }).split('\/');
            const searchDay = `${dateArray[2]}-${dateArray[0]}-${dateArray[1]}`
            const response = await axios.get(`https://ago.clarkcountyohio.gov/ccoarcgis/rest/services/WMAS/City_CodeEnforcementCases/MapServer/0/query?f=json&where=((CaseDate%20%3C%3D%20timestamp%20%27${searchDay}%2023%3A59%3A59%27)%20AND%20(CaseDate%20%3E%3D%20timestamp%20%27${searchDay}%2000%3A00%3A00%27))&returnGeometry=true&spatialRel=esriSpatialRelIntersects&geometry=%7B%22xmin%22%3A-9340848.325029738%2C%22ymin%22%3A4851993.374468546%2C%22xmax%22%3A-9315585.88718152%2C%22ymax%22%3A4867624.746752843%2C%22spatialReference%22%3A%7B%22wkid%22%3A102100%7D%7D&geometryType=esriGeometryEnvelope&inSR=102100&outFields=OBJECTID%2CCase%2CCaseDate%2CPin%2CAddress%2CViolation%2CStatus%2COwnerName%2CDateCompleted&orderByFields=OBJECTID%20ASC&outSR=102100`)
            // get results
            counts += await this.getData1(response.data.features, date.toLocaleDateString('en-US', {
                year: "numeric",
                month: "2-digit",
                day: "2-digit"
            }), sourceId);
            await this.sleep(3000);
            date.setDate(date.getDate() + 1);
        }
        return counts;
    }

    async getData1(data: any, fillingdate: string, sourceId: number) {
        let counts = 0;
        const timestamp = (new Date(fillingdate)).getTime();
        for (const row of data) {
            if (await this.saveRecord({
                property_addresss: row.attributes.Address,
                fillingdate,
                casetype: row.attributes.Violation,
                sourceId,
                codeViolationId: timestamp,
            })) {
                counts++;
            }
        }

        return counts;
    }

    async saveRecord(record: any) {
        let data: any = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'Property Address': record.property_addresss.trim(),
            "vacancyProcessed": false,
            "productId": this.productId,
            "caseUniqueId": record.caseno.trim(),
            fillingDate: record.fillingdate.trim(),
            originalDocType: record.casetype.trim(),
            sourceId: record.sourceId,
            codeViolationId: record.codeViolationId
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }
}