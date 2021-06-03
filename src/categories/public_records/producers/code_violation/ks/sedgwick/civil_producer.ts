import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
import db from '../../../../../../models/db';

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
            {url: 'https://app.mygov.us/ce/citizen/check_project_status.php?citiesID=260', handler: this.handleSource1}
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
        const isPageLoaded = await this.openPage(page, link, '//*[@id="number"]');
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
        let complaintNumber = await this.getPrevCodeViolationId(sourceId, false, 214331);
        let nextFlag;
        let countSkip = 0
        do {
            try {
                nextFlag = true
                await page.goto(`https://app.mygov.us/ce/citizen/project_view.php?citiesID=260&projectsID=${complaintNumber}`, {waitUntil: 'load'})
                await page.waitForXPath('//*[@id="projectTable"]')
                const [complaintElement] = await page.$x('//*[contains(text(),"Case ID")]/following-sibling::td[1]')
                let complaintPage = (await page.evaluate(elem => elem.textContent, complaintElement)).trim()
                if (!!complaintPage) {
                    countSkip = 0
                    const [fillingDateElement] = await page.$x('//*[contains(text(),"Case Start Date")]/following-sibling::td[1]')
                    let date = (await page.evaluate(elem => elem.textContent, fillingDateElement)).trim().replace(',','').replace('  ', ' ')
                    const fillingDateArray =date.split(' ')
                    // @ts-ignore
                    const fillingdate = (new Date(fillingDateArray[2],this.monthId[fillingDateArray[0]], fillingDateArray[1])).toLocaleDateString('en-US', {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit"
                    })

                    const [caseTypeElement] = await page.$x('//*[@id="projectTable"]/following-sibling::div[1]')
                    let casetype = (await page.evaluate(elem => elem.textContent, caseTypeElement)).trim();
                    const [addressElement] = await page.$x('//*[@id="projectTable"]')
                    let address = (await page.evaluate(elem => elem.textContent, addressElement)).trim();
                    if (await this.saveRecord(address!, casetype!, fillingdate, sourceId, complaintNumber))
                        counts++;
                } else {
                    countSkip++
                    if (countSkip > 15) nextFlag = false
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