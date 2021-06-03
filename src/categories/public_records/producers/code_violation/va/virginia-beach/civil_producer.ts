import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
import db from '../../../../../../models/db';
const parser = require('parse-address');

export default class CivilProducer extends AbstractProducer {
    productId = '';

    sources =
        [
            { url: 'https://aca-prod.accela.com/cvb/Default.aspx', handler: this.handleSource1 }
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
        const isPageLoaded = await this.openPage(page, link, '//form');
        if (!isPageLoaded) {
            console.log("Website not loaded successfully:", link);
            return counts;
        }

        // get results
        counts += await this.getData1(page, link, sourceId);
        await this.sleep(3000);
        return counts;
    }

    async getData1(page: puppeteer.Page, link: string, sourceId: number) {
        let email = 'homesalesllc@gmail.com';
        let password = 'test12345'
        await page.goto(link);
        await page.waitForSelector("iframe", { visible: true, timeout: 200000 });
        const elementHandle = await page.$('form#theForm iframe');
        const frame = await elementHandle!.contentFrame();
        await frame!.waitForXPath('//input[@id="ctl00_PlaceHolderMain_LoginBox_txtUserId"]', { visible: true, timeout: 200000 });
        await frame!.evaluate(() => {
            // @ts-ignore
            document.querySelector('#ctl00_PlaceHolderMain_LoginBox_txtUserId').value = '';
            // @ts-ignore
            document.querySelector('#ctl00_PlaceHolderMain_LoginBox_txtPassword').value = '';
        })
        await frame!.type('#ctl00_PlaceHolderMain_LoginBox_txtUserId', email, { delay: 150 });
        await frame!.type('#ctl00_PlaceHolderMain_LoginBox_txtPassword', password, { delay: 150 });

        let btnLogin = await frame!.$x('//a[@id="ctl00_PlaceHolderMain_LoginBox_btnLogin"]')
        await btnLogin[0].click();
        await frame!.waitForXPath('//span[@id="ctl00_PlaceHolderMain_lblHellow"]', { visible: true, timeout: 200000 });

        let counts = 0;
        let dateRange = {
            from: this.getFormattedDate(new Date(await this.getPrevCodeViolationId(sourceId, true))),
            to: this.getFormattedDate(new Date())
        };
        let fromDate = dateRange.from;
        let toDate = dateRange.to;
        try {
            let valueForSelect = ['Permits/Complaint/NA/NA'];
            let docTypeArr = ['Complaint'];

            for (let j = 0; j < valueForSelect.length; j++) {
                await page.goto(link);
                await page.waitForSelector("iframe", { visible: true, timeout: 200000 });
                const elementHandle = await page.$('form#theForm iframe');
                const frame = await elementHandle!.contentFrame();
                await frame!.waitForXPath('//a[contains(@title,"Permits")]', { visible: true, timeout: 200000 });
                let btnPermit = await frame!.$x('//a[contains(@title,"Permits")]');
                await btnPermit[0].click();
                await frame!.waitForXPath('//a[contains(.,"Search Applications")]', { visible: true, timeout: 200000 });
                let btnSearchApp = await frame!.$x('//a[contains(.,"Search Applications")]');
                await btnSearchApp[0].click();

                await frame!.waitForXPath('//select[@id="ctl00_PlaceHolderMain_generalSearchForm_ddlGSPermitType"]', { visible: true, timeout: 200000 });
                await frame!.select('#ctl00_PlaceHolderMain_generalSearchForm_ddlGSPermitType', valueForSelect[j]);



                await frame!.waitForXPath('//div[@id="divGlobalLoading" and contains(@style,"display: block;")]', { visible: true, timeout: 5000 });
                await this.sleep(5000);
                await frame!.click('input#ctl00_PlaceHolderMain_generalSearchForm_txtGSStartDate', { clickCount: 3 });
                await frame!.type('input#ctl00_PlaceHolderMain_generalSearchForm_txtGSStartDate', fromDate);
                await frame!.click('input#ctl00_PlaceHolderMain_generalSearchForm_txtGSEndDate', { clickCount: 3 });
                await frame!.type('input#ctl00_PlaceHolderMain_generalSearchForm_txtGSEndDate', toDate);

                await this.sleep(3000);
                let buttonSearch = await frame!.$x('//a[@id="ctl00_PlaceHolderMain_btnNewSearch"]');
                await buttonSearch[0]!.click();
                try {
                    await frame!.waitForXPath('//span[contains(.,"Showing")]', { visible: true, timeout: 8000 });
                } catch (err) {
                    console.log('No Result For ' + docTypeArr[j]);
                    continue
                }
                console.log('here1')
                let flagStop = false;
                while (!flagStop) {
                    await frame!.waitForXPath('//div[@id="divGlobalLoading" and contains(@style,"display: none;")]', { timeout: 60000 });
                    let caseType = docTypeArr[j];
                    console.log('here')
                    let totalRow = await frame!.$x('//table[@id="ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList"]/tbody/tr[contains(@class,"ACA_TabRow_Odd") or contains(@class,"ACA_TabRow_Even")]');
                    for (let l = 0; l < totalRow!.length; l++) {
                        await page.waitForSelector("iframe", { visible: true, timeout: 200000 });
                        const elementHandle = await page.$('form#theForm iframe');
                        const frame = await elementHandle!.contentFrame();
                        await frame!.waitForXPath('//a[contains(@title,"Permits")]', { visible: true, timeout: 200000 });
                        let index = l + 1;
                        let [addressXpath] = await frame!.$x('//table[@id="ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList"]/tbody/tr[contains(@class,"ACA_TabRow_Odd") or contains(@class,"ACA_TabRow_Even")][' + index + ']/td[6]');
                        let address;
                        try {
                            address = await addressXpath.evaluate(el => el.textContent?.trim());
                        } catch (err) {
                            console.log(err)
                            continue
                        }


                        let [fillingDateXpath] = await frame!.$x('//table[@id="ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList"]/tbody/tr[contains(@class,"ACA_TabRow_Odd") or contains(@class,"ACA_TabRow_Even")][' + index + ']/td[2]');
                        let fillingDate;
                        try {
                            fillingDate = await fillingDateXpath!.evaluate(el => el.textContent?.trim());
                        } catch (err) {
                            console.log(err)
                            continue
                        }
                        const timestamp = (new Date(fillingDate!)).getTime();
                        counts += (await this.saveRecord(address!, caseType!, fillingDate!!, 0, timestamp));

                    }


                    try {
                        await page.waitForSelector("iframe", { visible: true, timeout: 200000 });
                        const elementFrame = await page.$('form#theForm iframe');
                        const frameNext = await elementFrame!.contentFrame();
                        let btnNext = await frame!.$x('//a[contains(.,"Next") and contains(@href,"javascript")]');
                        await btnNext[0].click();
                        await this.sleep(2000);
                    } catch (err) {
                        flagStop = true
                    }
                }

            }
        } catch (e) {
            console.log(e)
        }
        await page.waitForSelector("iframe", { visible: true, timeout: 200000 });
        const elementFrame = await page.$('form#theForm iframe');
        const frameLogout = await elementFrame!.contentFrame();
        let btnLogout = await frameLogout!.$x('//span[@id="ctl00_HeaderNavigation_com_headIsLoggedInStatus_label_logout"]')
        await btnLogout[0].click();

        return counts;
    }

    async saveRecord(address: string, caseType: string, fillingDate: string, sourceId: number, codeViolationId: number) {
        let count = 0;
        const parsed = parser.parseLocation(address);
        let number;
        let street;
        let type;
        let propertyAddress;
        try {
            number = parsed.number ? parsed.number : '';
            street = parsed.street ? parsed.street : '';
            type = parsed.type ? parsed.type : '';
            propertyAddress = number + ' ' + street + ' ' + type;
        } catch (err) {
            return count;
        }

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