import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
import db from '../../../../../../models/db';
import axios from 'axios';

export default class CivilProducer extends AbstractProducer {
    productId = '';

    sources =
      [
        { url: 'https://api.phila.gov/open311/v2/requests/13110002.json', handler: this.handleSource1 }
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
        // load page
        const isPageLoaded = await this.openPage(page, link, '//pre');
        if (!isPageLoaded) {
            console.log("Website not loaded successfully:", link);
            return counts;
        }

        let year = (new Date()).getFullYear();
        // get results
        counts += await this.getData1(page, year, sourceId);
        await this.sleep(3000);
        return counts;
    }

    getStartNumberString(startNum: number, lengthdigit = 8){
        let result = startNum.toString().padStart(lengthdigit, '0');
        return result;
    }

    async getData1(page: puppeteer.Page, year: number, sourceId: number) {
        let counts = 0;
        let startNum = await this.getPrevCodeViolationId(sourceId);
        if (startNum === 1) startNum = 13750001;
        let oneHand404 = 0;
        let oneHandTimeout = 0;
        while (true) {
            let startNumString = this.getStartNumberString(startNum);
            let caseUrl = "https://api.phila.gov/open311/v2/requests/" + startNumString + ".json";
            console.log(caseUrl);
            try{
                let req;
                try{
                    req = await axios.get(caseUrl);
                    oneHandTimeout = 0;
                    oneHand404 = 0;
                }catch(e){
                    if(e.response.status == 404){
                        console.log('Not found!');
                        oneHandTimeout = 0;
                        oneHand404++;
                        if (oneHand404 > 3) break;
                        startNum++;
                        continue;
                    }
                    oneHandTimeout++;
                    if (oneHandTimeout > 10) break;
                    console.log("API Limit, sleep for 30 seconds...");
                    await this.sleep(30000);
                    continue;
                }
                let jsonData = req.data[0];
                if(!jsonData.address){
                    console.log("Not found!");
                    startNum++;
                    continue;
                }
                let casetype = jsonData.service_name;
                casetype = casetype.replace(/\s+|\n/, ' ').trim();
                let address = jsonData.address;
                address = address.replace(/\s+|\n/, ' ').trim();
                let fillingdate = jsonData.requested_datetime;
                fillingdate = fillingdate.replace(/\s+|\n/, ' ').trim();
                if (await this.saveRecord(address, casetype, fillingdate, sourceId, startNum)){
                    counts++;
                }
                startNum++;
            } catch(e){
                console.log(e);
                startNum++;
            }
        }
        return counts;
    }

    async saveRecord(address: string, caseType: string, fillingDate: string, sourceId: number, codeViolationId: number) {
        const data = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'Property Address': address,
            "vacancyProcessed": false,
            "productId": this.productId,
            fillingDate,
            originalDocType: caseType,
            sourceId,
            codeViolationId
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }
}