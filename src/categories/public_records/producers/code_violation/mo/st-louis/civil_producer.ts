import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
import db from '../../../../../../models/db';
const parser = require('parse-address');

export default class CivilProducer extends AbstractProducer {
    productId = '';

    sources =
        [
            { url: 'https://aca.stlouisco.com/citizenaccess/', handler: this.handleSource1 },
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
        const isPageLoaded = await this.openPage(page, link, '//iframe');
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
        let fromDate = dateRange.from;
        let toDate = dateRange.to;
        console.log(this.getFormattedDate(fromDate))
        let username = 'homesalesllc@gmail.com';
        let password = 'test12345';
        await page.goto('https://aca.stlouisco.com/citizenaccess/');
        await page.waitForXPath('//iframe[@id="ACAFrame"]', { visible: true, timeout: 200000 });
        let [iframe]: any = await page.$x('//iframe[@id="ACAFrame"]');
        iframe = await iframe.contentFrame();
        await iframe.waitForXPath('//input[@id="ctl00_PlaceHolderMain_LoginBox_txtUserId"]', { visible: true, timeout: 200000 });
        await iframe.type('#ctl00_PlaceHolderMain_LoginBox_txtUserId', username, { delay: 150 });
        await iframe.type('#ctl00_PlaceHolderMain_LoginBox_txtPassword', password, { delay: 150 });
        let [btnLogin] = await iframe.$x('//a[@id="ctl00_PlaceHolderMain_LoginBox_btnLogin"]');

        await btnLogin.click();

        await iframe.waitForXPath('//span[@id="ctl00_HeaderNavigation_com_headIsLoggedInStatus_label_logout"]', { visible: true, timeout: 200000 });

        try {
            let valueForSelect = ['PublicWorks/Code Enforcement/Commercial/Re-Occupancy'];
            let docTypeArr = ['BUILDING COMMERCIAL RE-OCCUPANCY'];

            for (let j = 0; j < valueForSelect.length; j++) {
                await page.goto('https://aca.stlouisco.com/citizenaccess/');

                await page.waitForXPath('//iframe[@id="ACAFrame"]', { visible: true, timeout: 200000 });
                let [iframe]: any = await page.$x('//iframe[@id="ACAFrame"]');
                iframe = await iframe.contentFrame();

                let [btnPermit] = await iframe.$x('//a[contains(@title,"Construction Permits")]')
                await btnPermit.click();

                await iframe.waitForXPath('//select[@id="ctl00_PlaceHolderMain_generalSearchForm_ddlGSPermitType"]', { visible: true, timeout: 200000 });
                await iframe.evaluate(() => {
                    // @ts-ignore
                    document.querySelector('#ctl00_PlaceHolderMain_generalSearchForm_txtGSStartDate').value = '';
                    // @ts-ignore
                    document.querySelector('#ctl00_PlaceHolderMain_generalSearchForm_txtGSEndDate').value = '';
                })
                await iframe.select('#ctl00_PlaceHolderMain_generalSearchForm_ddlGSPermitType', valueForSelect[j]);

                await iframe.waitForXPath('//div[@id="divGlobalLoading" and contains(@style,"display: block;")]', { visible: true, timeout: 5000 });
                await this.sleep(5000);
                console.log(this.getFormattedDate(fromDate))
                await iframe.type('#ctl00_PlaceHolderMain_generalSearchForm_txtGSStartDate', this.getFormattedDate(fromDate), { delay: 150 });
                await iframe.type('#ctl00_PlaceHolderMain_generalSearchForm_txtGSEndDate', this.getFormattedDate(toDate), { delay: 150 });


                let buttonSearch = await iframe.$x('//a[@id="ctl00_PlaceHolderMain_btnNewSearch"]');
                await buttonSearch[0]!.click();

                try {
                    await iframe.waitForXPath('//span[contains(.,"Showing")]', { visible: true, timeout: 8000 });
                } catch (err) {
                    console.log('No Result For ' + docTypeArr[j]);
                    continue
                }
                let flagStop = false;
                while (!flagStop) {
                    await iframe.waitForXPath('//div[@id="divGlobalLoading" and contains(@style,"display: none;")]', { timeout: 60000 });
                    let casetype = docTypeArr[j];
                    let totalRow = await iframe.$x('//table[@id="ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList"]/tbody/tr[contains(@class,"ACA_TabRow_Odd") or contains(@class,"ACA_TabRow_Even")]');
                    for (let l = 0; l < totalRow!.length; l++) {
                        let index = l + 1;
                        let [addressXpath] = await iframe.$x('//table[@id="ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList"]/tbody/tr[contains(@class,"ACA_TabRow_Odd") or contains(@class,"ACA_TabRow_Even")][' + index + ']/td[7]');
                        let [fillingdateXpath] = await iframe.$x('//table[@id="ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList"]/tbody/tr[contains(@class,"ACA_TabRow_Odd") or contains(@class,"ACA_TabRow_Even")][' + index + ']/td[2]');
                        let address, fillingdate;
                        try {
                            address = await addressXpath.evaluate((el: any) => el.textContent?.trim());
                            fillingdate = await fillingdateXpath.evaluate((el: any) => el.textContent?.trim());
                        } catch (err) {
                            continue
                        }

                        console.log(address, casetype, fillingdate)
                        let record = {
                            property_address: address,
                            fillingdate,
                            casetype,
                            sourceId,
                            codeViolationId: (new Date(fillingdate!)).getTime()
                        };
                        if (await this.saveRecord(record)) {
                            counts++;
                        }
                    }
                    try {
                        let btnNext = await iframe.$x('//a[contains(.,"Next") and contains(@href,"javascript")]');
                        await btnNext[0].click();
                        await this.sleep(2000);
                    } catch (err) {
                        flagStop = true
                    }
                }

            }
        } catch (e) {
            console.log('No Result')
        }

        await page.waitForXPath('//iframe[@id="ACAFrame"]', { visible: true, timeout: 200000 });
        let [iframeNow]: any = await page.$x('//iframe[@id="ACAFrame"]');
        iframeNow = await iframeNow.contentFrame();

        let [btnLogout] = await iframeNow.$x('//a[@id="ctl00_HeaderNavigation_btnLogout"]');
        await btnLogout.click();
        return counts;
    }

    // async saveRecord(address: string, caseType: string, fillingDate: string, sourceId: number, codeViolationId: number) {
    async saveRecord(record: any) {
        const data: any = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'Property Address': record.property_address,
            "vacancyProcessed": false,
            "productId": this.productId,
            originalDocType: record.casetype,
            fillingDate: record.fillingdate,
            sourceId: record.sourceId,
            codeViolationId: record.codeViolationId
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }
}