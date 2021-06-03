import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
import db from '../../../../../../models/db';
const parser = require('parse-address');

export default class CivilProducer extends AbstractProducer {
    productId = '';

    sources =
        [
            { url: 'https://secureapps.charlottecountyfl.gov/CitizenAccess/Cap/CapHome.aspx?module=CodeEnforcement&TabName=CodeEnforcement', handler: this.handleSource1 }
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

    async openPage(page: puppeteer.Page, link: string, xpath: string) {
        try {
            await page.goto(link, { waitUntil: 'load' });
            await page.$x(xpath);
            return true;
        } catch (error) {
            return false;
        }
    }

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
        }

        await AbstractProducer.sendMessage(this.publicRecordProducer.state, this.publicRecordProducer.county ? this.publicRecordProducer.county : this.publicRecordProducer.city, countRecords, 'Code Violation');
        return true;
    }

    async handleSource1(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;
        // load page
        const isPageLoaded = await this.openPage(page, link, '//select[@id="ctl00_PlaceHolderMain_generalSearchForm_ddlGSPermitType"]');
        if (!isPageLoaded) {
            console.log("Website not loaded successfully:", link);
            return counts;
        }

        // get results
        counts += await this.getData1(page, sourceId);
        await this.sleep(3000);
        return counts;
    }


    getFormattedDate(date: Date) {
        let year = date.getFullYear();
        let month = (1 + date.getMonth()).toString().padStart(2, '0');
        let day = date.getDate().toString().padStart(2, '0');

        return month + '/' + day + '/' + year;
    }

    async getTextByXpathFromPage(page: puppeteer.Page, xPath: string): Promise<string> {
        const [elm] = await page.$x(xPath);
        if (elm == null) {
            return '';
        }
        let text = await page.evaluate(j => j.innerText, elm);
        return text.replace(/\n/g, ' ');
    }

    async getData1(page: puppeteer.Page, sourceId: number) {
        let counts = 0;
        let dateRange = {
            from: this.getFormattedDate(new Date(await this.getPrevCodeViolationId(sourceId, true))),
            to: this.getFormattedDate(new Date())
        };
        let fromDate = dateRange.from;
        let toDate = dateRange.to;
        try {
            await page.goto('https://secureapps.charlottecountyfl.gov/CitizenAccess/Cap/CapHome.aspx?module=CodeEnforcement&TabName=CodeEnforcement');
            await page.waitForXPath('//select[@id="ctl00_PlaceHolderMain_generalSearchForm_ddlGSPermitType"]', { visible: true, timeout: 200000 });

            await this.sleep(5000);
            await page.click('input#ctl00_PlaceHolderMain_generalSearchForm_txtGSStartDate', { clickCount: 3 });
            await page.type('input#ctl00_PlaceHolderMain_generalSearchForm_txtGSStartDate', fromDate);
            await page.click('input#ctl00_PlaceHolderMain_generalSearchForm_txtGSEndDate', { clickCount: 3 });
            await page.type('input#ctl00_PlaceHolderMain_generalSearchForm_txtGSEndDate', toDate);

            await this.sleep(3000);
            let buttonSearch = await page.$x('//a[@id="ctl00_PlaceHolderMain_btnNewSearch"]');
            await buttonSearch[0]!.click();
            try {
                await page.waitForXPath('//span[contains(.,"Showing")]', { visible: true, timeout: 30000 });
            } catch (err) {
                console.log('No Result ');
                return counts;
            }
            let flagStop = false;
            let temp10RowBeforeGetAddress = [];
            while (!flagStop) {
                await page.waitForXPath('//div[@id="divGlobalLoading" and contains(@style,"display: none;")]', { timeout: 200000 });
                let totalRow = await page.$x('//table[@id="ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList"]/tbody/tr[contains(@class,"ACA_TabRow_Odd") or contains(@class,"ACA_TabRow_Even")]');

                for (let l = 0; l < totalRow!.length; l++) {
                    let index = l + 1;
                    let [caseTypeXpath] = await page.$x('//table[@id="ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList"]/tbody/tr[contains(@class,"ACA_TabRow_Odd") or contains(@class,"ACA_TabRow_Even")][' + index + ']/td[4]');
                    let [linkToGetAddressXpath] = await page.$x('//table[@id="ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList"]/tbody/tr[contains(@class,"ACA_TabRow_Odd") or contains(@class,"ACA_TabRow_Even")][' + index + ']/td[3]/div/a');
                    let [fillingDateXpath] = await page.$x('//table[@id="ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList"]/tbody/tr[contains(@class,"ACA_TabRow_Odd") or contains(@class,"ACA_TabRow_Even")][' + index + ']/td[2]');
                    let caseType, linkToAddress, fillingDate;
                    try {
                        caseType = await caseTypeXpath.evaluate(el => el.textContent?.trim());
                        linkToAddress = await linkToGetAddressXpath.evaluate(el => el.getAttribute('href')?.trim());
                        fillingDate = await fillingDateXpath!.evaluate(el => el.textContent?.trim());
                    } catch (err) {
                        continue
                    }
                    const data = {
                        caseType,
                        fillingDate,
                        linkToAddress
                    };


                    temp10RowBeforeGetAddress.push(data)

                }
                try {
                    let btnNext = await page.$x('//a[contains(.,"Next") and contains(@href,"javascript")]');
                    await btnNext[0].click();
                    await this.sleep(2000);
                } catch (err) {
                    flagStop = true
                }
            }
            for (let m = 0; m < temp10RowBeforeGetAddress.length; m++) {
                try {
                    await page.goto('https://secureapps.charlottecountyfl.gov' + temp10RowBeforeGetAddress[m]!.linkToAddress!, { waitUntil: 'networkidle0' });
                    let notFound = await page.$x('//span[@id="ctl00_PlaceHolderMain_systemErrorMessage_lblMessageTitle"]');
                    if (notFound.length > 0) {
                        continue;
                    }
                    const addressXpath = '//div[@id="divWorkLocationInfo"]//span[@class="fontbold"]';
                    let addresses = await this.getTextByXpathFromPage(page, addressXpath);
                    let address = addresses.split('&')[0].trim();



                    const timestamp = (new Date(temp10RowBeforeGetAddress[m].fillingDate!)).getTime();
                    counts += (await this.saveRecord(address, temp10RowBeforeGetAddress[m].caseType!, temp10RowBeforeGetAddress[m].fillingDate!!, 0, timestamp));

                    await this.sleep(2000)
                } catch (err) {
                    continue
                }
            }

        } catch (e) {
            console.log(e)
        }

        return counts;
    }

    async saveRecord(address: string, caseType: string, fillingDate: string, sourceId: number, codeViolationId: number) {
        let count = 0;
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
        if (await this.civilAndLienSaveToNewSchema(data)) {
            count++;
        }

        return count
    }
}