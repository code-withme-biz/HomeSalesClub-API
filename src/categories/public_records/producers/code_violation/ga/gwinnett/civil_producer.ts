import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
import db from '../../../../../../models/db';
const parser = require('parse-address');

export default class CivilProducer extends AbstractProducer {
    productId = '';

    sources =
        [
            { url: 'https://eddspermits.gwinnettcounty.com/CitizenAccess/Cap/CapHome.aspx?module=Enforce&TabName=Enforce', handler: this.handleSource1 },
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

        const practiceType = 'code-violation';
        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        this.productId = await db.models.Product.findOne({ name: productName }).exec();
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
        const isPageLoaded = await this.openPage(page, link, '//input[@id="ctl00_PlaceHolderMain_generalSearchForm_txtGSPermitNumber"]');
        if (!isPageLoaded) {
            console.log("Website not loaded successfully:", link);
            return counts;
        }

        // get resultss
        counts += await this.getData1(page, sourceId);
        await this.sleep(3000);
        return counts;
    }

    async getTextByXpathFromPage(page: puppeteer.Page, xPath: string): Promise<string> {
        const [elm] = await page.$x(xPath);
        if (elm == null) {
            return '';
        }
        let text = await page.evaluate(j => j.innerText, elm);
        return text.replace(/\n/g, ' ');
    }

    getStartNumberString(startNum: number, lengthdigit = 5) {
        let result = startNum.toString().padStart(lengthdigit, '0');
        return result;
    }

    async getData1(page: puppeteer.Page, sourceId: number) {
        let counts = 0;
        let startNum = await this.getPrevCodeViolationId(sourceId, false, 1, true);
        let link = 'https://eddspermits.gwinnettcounty.com/CitizenAccess/Cap/CapHome.aspx?module=Enforce&TabName=Enforce';
        console.log('============ Checking for ', link);
        let startCaseCodes = [
            { code: 'CEU', flagStop: false },
        ]
        let yearForCode = (new Date()).getFullYear();
        while (true) {
            let startNumString = this.getStartNumberString(startNum, 5);
            try {
                await page.goto(link, {waitUntil: 'load'});
                await page.waitForXPath('//input[@id="ctl00_PlaceHolderMain_generalSearchForm_txtGSPermitNumber"]', { visible: true, timeout: 200000 });

                let caseId = startCaseCodes[0].code + yearForCode + "-" + startNumString;
                await page.click('input#ctl00_PlaceHolderMain_generalSearchForm_txtGSPermitNumber', { clickCount: 3 });
                await page.type('input#ctl00_PlaceHolderMain_generalSearchForm_txtGSPermitNumber', caseId);
                let buttonSearch = await page.$x('//a[@id="ctl00_PlaceHolderMain_btnNewSearch"]');
                await buttonSearch[0]!.click();
                await page.waitForXPath('//div[@id="divGlobalLoading"]', {visible: true});
                await page.waitForXPath('//div[@id="divGlobalLoading"]', {hidden: true});
                
                const [noresult] = await page.$x('//*[contains(text(), "no results")]');
                if (noresult) {
                    console.log('No results found!');
                    break;
                }
                const addressXpath = '//div[@id="divWorkLocationInfo"]//span[@class="fontbold"]';
                const caseTypeXpath = '//span[@id="ctl00_PlaceHolderMain_lblPermitType"]';
                await page.waitForXPath(addressXpath, { visible: true, timeout: 60000 });
                let caseType = await this.getTextByXpathFromPage(page, caseTypeXpath);
                let addresses = await this.getTextByXpathFromPage(page, addressXpath);
                let address = addresses.split('&')[0].trim();

                // get results
                let codeViolationId = parseInt(`${yearForCode}${startNum.toString().padStart(5, '0')}`);
                if (await this.saveRecord(address, caseType, '', '', sourceId, codeViolationId)) counts++;
            } catch (e) {
                console.log(e);
            }
            startNum++;
        }
        return counts;
    }

    async saveRecord(address: string, caseType: string, fillingDate: string, ownerName: string, sourceId: number, codeViolationId: number) {
        const parsed = parser.parseLocation(address);
        const number = parsed.number ? parsed.number : '';
        const street = parsed.street ? parsed.street : '';
        const type = parsed.type ? parsed.type : '';
        const propertyAddress = number + ' ' + street + ' ' + type;
        const propertyZip = parsed.zip ? parsed.zip : '';
        const propertyCity = parsed.city ? parsed.city : '';
        let data: any = {
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