import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
import db from '../../../../../../models/db';
import axios from "axios";
const parser = require('parse-address');

export default class CivilProducer extends AbstractProducer {
    productId = '';
    monthId = {
        'Jan':0,
        'Feb':1,
        'Mar':2,
        'Apr':3,
        'May':4,
        'Jun':5,
        'Jul':6,
        'Aug':7,
        'Sep':8,
        'Oct':9,
        'Nov':10,
        'Dec':11,
    }

    sources =
        [
            {url: 'http://spires.cityoffrederick.com/cof/codeenforcement/', handler: this.handleSource1}
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

    async handleSource1(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;
        // load page
        const isPageLoaded = await this.openPage(page, link, '//*[@id="txtStartDate"]');
        if (!isPageLoaded) {
            console.log("Website not loaded successfully:", link);
            return counts;
        }

        // get results
        counts += await this.getData1(page, sourceId);
        await this.sleep(3000);
        return counts;
    }

    async getData1(page: puppeteer.Page, sourceId: number) {
        let counts = 0;
        let dateRange = {
            from: new Date(await this.getPrevCodeViolationId(sourceId, true)),
            to: new Date()
        };
        console.log(this.getFormattedDate(dateRange.from),' to ',this.getFormattedDate(dateRange.to))
        try {
            const fromDateArray = dateRange.from.toLocaleDateString('en-US', {
                year: "numeric",
                month: "2-digit",
                day: "2-digit"
            }).split('/')

            const toDateArray = dateRange.to.toLocaleDateString('en-US', {
                year: "numeric",
                month: "2-digit",
                day: "2-digit"
            }).split('/')

            const response = await axios.get(`http://spires.cityoffrederick.com/cof/codeEnforcement/php/query.php?status=&start=${fromDateArray[2]}-${fromDateArray[0]}-${fromDateArray[1]}&end=${toDateArray[2]}-${toDateArray[0]}-${toDateArray[1]}&road=&idPart=&nac=`)
            for (const row of response.data) {
                let casetype = row[1];
                let address =  `${row[3]}, Frederick, MD`;
                const fillingDateArray =row[4].split(' ')
                // @ts-ignore
                const fillingdate = new Date(fillingDateArray[2],this.monthId[fillingDateArray[0]], fillingDateArray[1])
                const timestamp = fillingdate.getTime();
                if (await this.saveRecord(address!, casetype!, fillingdate.toLocaleDateString('en-US'), sourceId, timestamp))
                    counts++;

            }
        } catch (e) {
            console.log(e)
        }
        return counts;
    }

    async saveRecord(address: string, caseType: string, fillingDate: string, sourceId: number, codeViolationId: number) {
        const parsed = parser.parseLocation(address);
        const number = parsed.number ? parsed.number : '';
        const street = parsed.street ? parsed.street : '';
        const type = parsed.type ? parsed.type : '';
        const propertyAddress = number + ' ' + street + ' ' + type;
        const propertyZip = parsed.zip ? parsed.zip : '';
        const propertyCity = parsed.city ? parsed.city : '';
        const data = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'Property Address': propertyAddress,
            'Property City': propertyCity,
            'Property Zip': propertyZip,
            "vacancyProcessed": false,
            "productId": this.productId,
            fillingDate,
            sourceId,
            codeViolationId,
            originalDocType: caseType
        };
       return await this.civilAndLienSaveToNewSchema(data);
    }
}