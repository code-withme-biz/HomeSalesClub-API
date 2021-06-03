import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
import db from '../../../../../../models/db';
const parser = require('parse-address');

export default class CivilProducer extends AbstractProducer {
    productId = '';

    sources =
        [
            { url: 'https://devsvcs.cityofgastonia.com/CodeEnforcement/Locator', handler: this.handleSource1 }
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
        const isPageLoaded = await this.openPage(page, link, '//input[@id="searchValue"]');
        if (!isPageLoaded) {
            console.log("Website not loaded successfully:", link);
            return counts;
        }

        // get results
        counts += await this.getData1(page, sourceId);
        await this.sleep(3000);
        return counts;
    }

    getFormattedDateYearMonth(date: Date) {
        let year = date.getFullYear();
        let month = (date.getMonth() - 1).toString();

        return year + month;
    }

    getFormattedDateAlwaysFirstDate(date: Date) {
        let year = date.getFullYear();
        let month = (date.getMonth()).toString().padStart(2, '0');
        let day = date.getDate().toString().padStart(2, '0');

        return month + '/01/' + year;
    }

    async getData1(page: puppeteer.Page, sourceId: number) {
        let counts = 0;

        await page.goto('https://devsvcs.cityofgastonia.com/CodeEnforcement/Locator');
        await page.waitForXPath('//input[@id="searchValue"]', { visible: true, timeout: 200000 });
        let toDateRaw = new Date();
        let toDate = this.getFormattedDateYearMonth(toDateRaw);

        console.log('Search data with casenumber: ' + toDate);
        await page.click('input#searchValue', { clickCount: 3 });
        await page.type('input#searchValue', toDate);
        let btnSearch = await page.$x('//input[@id="bsearch"]');
        await btnSearch[0].click();

        let loopingStop = false;
        let pageNo = 0;
        while (!loopingStop) {
            await page.waitForXPath('//input[@id="pageNumber" and @value="' + pageNo + '"]', { timeout: 200000 });
            let rowData = await page.$x('//div[@class="cv-searchresults"]/ul/li');
            for (let i = 0; i < rowData.length; i++) {
                let index = i + 1;
                let caseNumberXpath = await page.$x('//div[@class="cv-searchresults"]/ul/li[' + index + ']/div[1]/div[2]/div');
                let addressXpath = await page.$x('//div[@class="cv-searchresults"]/ul/li[' + index + ']/div[4]/div[2]/span');
                let caseTypeXpath = await page.$x('//div[@class="cv-searchresults"]/ul/li[' + index + ']/div[2]/div[2]/div');

                try {
                    let caseNumber = await caseNumberXpath[0].evaluate(el => el.textContent?.trim());
                    let address = await addressXpath[0].evaluate(el => el.textContent?.trim());
                    let caseType = await caseTypeXpath[0].evaluate(el => el.textContent?.trim());
                    let fillingDate = this.getFormattedDateAlwaysFirstDate(toDateRaw);
                    const timestamp = (new Date(fillingDate!)).getTime();
                    if (await this.saveRecord(address!, caseType!, fillingDate!, sourceId, timestamp))
                        counts++;
                } catch (err) {
                    continue
                }
            }
            try {
                let btnClickNext = await page.$x('//input[@id="bnext"]');
                await btnClickNext[0].click();
                pageNo++;
            } catch (err) {
                loopingStop = true
            }
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