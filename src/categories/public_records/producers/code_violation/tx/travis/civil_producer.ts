import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
import axios from 'axios';
    export default class CivilProducer extends AbstractProducer {

    sources =
        [
            { url: 'https://citizenconnect-acd.austintexas.gov/#!/dashboard', handler: this.handleSource1 },
            { url: 'https://data.austintexas.gov/resource/5yf8-fm7j.json?registrationstatus=Active', handler: this.handleSource2 }
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
        while (date <= today) {
            const dateArray = date.toLocaleDateString('en-US', {
                year: "numeric",
                month: "2-digit",
                day: "2-digit"
            }).split('\/');
            const searchDay = `${dateArray[2]}-${dateArray[0]}-${dateArray[1]}`
            const response = await axios.get(`https://citizenconnect-acd.austintexas.gov/api/tickets/details.json?categories=3:T&end_date=${searchDay}&lat1=30.965770801010027&lat2=29.423203936933216&lng1=-96.50414811761826&lng2=-98.9428069453414&search_field=&search_value=&shape_group_id=jcrc-4uuy&shape_ids=&start_date=${searchDay}&statusFilter=&zoom=9`)
            // get results

            counts += await this.getData1(response.data.records, date.toLocaleDateString('en-US', {
                year: "numeric",
                month: "2-digit",
                day: "2-digit"
            }), sourceId);
            await this.sleep(3000);
            date.setDate(date.getDate()+1);
        }

        return counts;
    }

    async getData1(data: any, fillingdate: string, sourceId: number) {
        let counts = 0;
        const timestamp = (new Date(fillingdate)).getTime();
        for (const row of data) {
            if (await this.saveRecord({
                property_addresss: row.street_address,
                fillingdate,
                casetype: row.ticket_detail_entry5 ? row.ticket_detail_entry5 : '',
                sourceId,
                codeViolationId: timestamp
            })) {
                counts++;
            }
        }

        return counts;
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
            const response = await this.getCodeViolationData(url, limit, offset, 'violation_created_date', dateRange.from, dateRange.to);
            if (response.success) {
                for (const record of response.data) {
                    const property_address = record.registeredaddress;
                    const fillingdate = record.violation_created_date;
                    const codeViolationId = (new Date(fillingdate)).getTime();
                    const casetype = 'Repeat Offender Property Activity';
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
            'Property Address': record.property_addresss,
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