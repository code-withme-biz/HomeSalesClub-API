import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
import db from '../../../../../../models/db';

const parser = require('parse-address');

export default class CivilProducer extends AbstractProducer {
    productId = '';

    sources =
        [
            {url: 'https://www.fairfaxcounty.gov/FIDO/complaints/comp_search.aspx', handler: this.handleSource1}
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
        const isPageLoaded = await this.openPage(page, link, '//*[contains(@id,"btnSearchNo")]');
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
        let complaintNumber = await this.getPrevCodeViolationId(sourceId, false, 178000);
        let nextFlag;
        let countSkip = 0
        do {
            try {
                nextFlag = true
                await page.goto(`https://www.fairfaxcounty.gov/FIDO/complaints/comp_display.aspx?type=sr&servno=${complaintNumber}`, {waitUntil: 'load'})
                await page.waitForXPath('//*[contains(@id,"pDetail")]')
                const [complaintElement] = await page.$x('//*[contains(text(),"Complaint #")]/following-sibling::td[1]/span')
                let complaintPage = await page.evaluate(elem => elem.textContent, complaintElement)
                if (!!complaintPage) {
                    countSkip = 0
                    const [fillingDateElement] = await page.$x('//*[contains(text(),"Opened Date")]/following-sibling::td[1]/span')
                    let fillingdate = await page.evaluate(elem => elem.textContent, fillingDateElement)
                    const [caseTypeElement] = await page.$x('//*[contains(text(),"Complaint Description")]/following-sibling::td[1]/span')
                    let casetype = await page.evaluate(elem => elem.textContent, caseTypeElement);
                    const [addressElement] = await page.$x('//*[contains(text(),"Street Address")]/following-sibling::td[1]/span')
                    let address = await page.evaluate(elem => elem.textContent, addressElement);
                    if (await this.saveRecord(address!, casetype!, fillingdate, sourceId, complaintNumber))
                        counts++;
                } else {
                    countSkip++
                    if (countSkip > 10) nextFlag = false
                }
            } catch (e) {
                console.log(e)
                nextFlag = false
            }
            complaintNumber++
        } while (nextFlag)
        return counts;
    }

    async saveRecord(address: string, caseType: string, fillingDate: string, sourceId: number, codeViolationId: number) {
        try {
            const data = {
                'Property State': this.publicRecordProducer.state,
                'County': this.publicRecordProducer.county,
                'Property Address': address,
                "vacancyProcessed": false,
                "productId": this.productId,
                fillingDate,
                sourceId,
                codeViolationId,
                originalDocType: caseType
            };
            return await this.civilAndLienSaveToNewSchema(data);
        } catch (e) {

        }
       return false
    }
}