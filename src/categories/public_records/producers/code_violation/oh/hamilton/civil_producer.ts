import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
import db from '../../../../../../models/db';
const parser = require('parse-address');

export default class CivilProducer extends AbstractProducer {
    productId = '';

    sources =
        [
            { url: 'http://cagismaps.hamilton-co.org/PropertyActivity/PropertyMaintenance', handler: this.handleSource1 }
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
        const isPageLoaded = await this.openPage(page, link, '//div[@id="recordDetailsButton"]');
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

        await page.goto('http://cagismaps.hamilton-co.org/PropertyActivity/PropertyMaintenance');
        await page.waitForXPath('//div[@id="recordDetailsButton"]', { visible: true, timeout: 200000 });
        let btnDatabase = await page.$x('//div[@id="recordDetailsButton"]');
        await btnDatabase[0].click();
        await page.waitForXPath('//div[@id="spinnygrid"]/img[contains(@src,"loading.gif") and contains(@style,"display: block;")]', { visible: true, timeout: 200000 });
        await page.waitForXPath('//div[@id="spinnygrid"]/img[contains(@src,"loading.gif") and contains(@style,"display: none;")]', { timeout: 200000 });

        await page.waitForXPath('//div[@id="dropDownSelect"]', { visible: true, timeout: 200000 });
        let btnDropDown = await page.$x('//div[@id="dropDownSelect"]');
        await btnDropDown[0].click();
        await page.waitForXPath('//div[@class="dropdown open"]', { visible: true, timeout: 200000 });
        let btnToday = await page.$x('//li[@id="Today"]')
        await btnToday[2].click()
        await page.waitForXPath('//div[@id="spinnygrid"]/img[contains(@src,"loading.gif") and contains(@style,"display: block;")]', { visible: true, timeout: 200000 });
        await page.waitForXPath('//div[@id="spinnygrid"]/img[contains(@src,"loading.gif") and contains(@style,"display: none;")]', { timeout: 200000 });
        let loopingStop = false;
        try {
            await page.waitForXPath('//div[contains(@class,"dgrid-row-even") or contains(@class,"dgrid-row-odd")]', { visible: true, timeout: 200000 });
        } catch (err) {
            return counts;
        }
        let rowData = await page.$x('//div[contains(@class,"dgrid-row-even") or contains(@class,"dgrid-row-odd")]')
        while (!loopingStop) {
            await page.waitForXPath('//div[@id="spinnygrid"]/img[contains(@src,"loading.gif") and contains(@style,"display: none;")]', { timeout: 200000 });
            for (let i = 0; i < rowData.length; i++) {
                let index = i + 1;
                let caseNumberXpath = await page.$x('//div[contains(@class,"dgrid-row-even") or contains(@class,"dgrid-row-odd")][' + index + ']/table/tr/td[2]');
                let addressXpath = await page.$x('//div[contains(@class,"dgrid-row-even") or contains(@class,"dgrid-row-odd")][' + index + ']/table/tr/td[3]');
                let caseTypeXpath = await page.$x('//div[contains(@class,"dgrid-row-even") or contains(@class,"dgrid-row-odd")][' + index + ']/table/tr/td[5]');
                let fillingDateXpath = await page.$x('//div[contains(@class,"dgrid-row-even") or contains(@class,"dgrid-row-odd")][' + index + ']/table/tr/td[9]');

                try {
                    let caseNumber = await caseNumberXpath[0].evaluate(el => el.textContent?.trim());
                    let address = await addressXpath[0].evaluate(el => el.textContent?.trim());
                    let caseType = await caseTypeXpath[0].evaluate(el => el.textContent?.trim());
                    let fillingDate = await fillingDateXpath[0].evaluate(el => el.textContent?.trim());
                    const timestamp = (new Date(fillingDate!)).getTime();
                    if (await this.saveRecord(address!, caseType!, fillingDate!, sourceId, timestamp))
                        counts++;
                } catch (err) {

                    continue
                }
            }
            try {
                await page.waitForXPath('//span[contains(@class,"dgrid-next dgrid-page-link dgrid-page-disabled") and contains(@aria-label,"Go to next page")]', { visible: true, timeout: 200000 });
                loopingStop = true
            } catch (err) {
                let btnClickNext = await page.$x('//span[contains(@class,"dgrid-next dgrid-page-link") and contains(@aria-label,"Go to next page")]');
                await btnClickNext[0].click()
                await page.waitForXPath('//div[@id="spinnygrid"]/img[contains(@src,"loading.gif") and contains(@style,"display: block;")]', { visible: true, timeout: 200000 });
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