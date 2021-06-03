import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
import db from '../../../../../../models/db';
const parser = require('parse-address');

export default class CivilProducer extends AbstractProducer {
    productId = '';

    sources =
        [
            { url: 'https://aca-louisville.accela.com/ljcmg/Login.aspx', handler: this.handleSource1 }
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
        const isPageLoaded = await this.openPage(page, link, '//input[@id="ctl00_PlaceHolderMain_LoginBox_txtUserId"]');
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
        let email = 'homesalesllc@gmail.com';
        let password = 'test12345'
        await page.goto('https://aca-louisville.accela.com/ljcmg/Login.aspx');
        await page.waitForXPath('//input[@id="ctl00_PlaceHolderMain_LoginBox_txtUserId"]', { visible: true, timeout: 200000 });
        await page.evaluate(() => {
            // @ts-ignore
            document.querySelector('#ctl00_PlaceHolderMain_LoginBox_txtUserId').value = '';
            // @ts-ignore
            document.querySelector('#ctl00_PlaceHolderMain_LoginBox_txtPassword').value = '';
        })
        await page.type('#ctl00_PlaceHolderMain_LoginBox_txtUserId', email, { delay: 150 });
        await page.type('#ctl00_PlaceHolderMain_LoginBox_txtPassword', password, { delay: 150 });

        let btnLogin = await page.$x('//a[@id="ctl00_PlaceHolderMain_LoginBox_btnLogin"]')
        await btnLogin[0].click();
        await page.waitForXPath('//span[@id="ctl00_PlaceHolderMain_lblHellow"]', { visible: true, timeout: 200000 });

        let counts = 0;
        let dateRange = {
            from: this.getFormattedDate(new Date(await this.getPrevCodeViolationId(sourceId, true))),
            to: this.getFormattedDate(new Date())
        };
        let fromDate = dateRange.from;
        let toDate = dateRange.to;
        try {
            let valueForSelect = ['Enforcement/Building Permit Enforcement/Case/NA', 'Enforcement/Code Enforcement Board/Case/NA', 'Enforcement/Noise Citation Management/Case/NA', 'Enforcement/Property Maintenance/Case/NA', 'Enforcement/Property Maintenance/Demolition/NA', 'Enforcement/Property Maintenance/Foreclosure/NA', 'Enforcement/Property Maintenance/Site Visit/NA', 'Enforcement/Public Nuisance/Case/NA', 'Enforcement/SWMS/Waste Management Enforcement/Case', 'Enforcement/Zoning Enforcement/Case/NA', 'Enforcement/Zoning Enforcement/Site Visit/NA'];
            let docTypeArr = ['Building Permit Enforcement Case', 'Code Enforcement Board Case', 'Noise Citation Management Case', 'Property Maintenance Case', 'Property Maintenance Demolition', 'Property Maintenance Foreclosure', 'Property Maintenance Site Visit', 'Public Nuisance Case', 'SWMS Waste Management Enforcement Case', 'Zoning Enforcement Case', 'Zoning Enforcement Site Visit'];

            for (let j = 0; j < valueForSelect.length; j++) {
                await page.goto('https://aca-louisville.accela.com/ljcmg/Cap/CapHome.aspx?module=Enforcement&TabName=Enforcement');
                await page.waitForXPath('//select[@id="ctl00_PlaceHolderMain_generalSearchForm_ddlGSPermitType"]', { visible: true, timeout: 200000 });
                await page.select('#ctl00_PlaceHolderMain_generalSearchForm_ddlGSPermitType', valueForSelect[j]);

                await page.waitForXPath('//div[@id="divGlobalLoading" and contains(@style,"display: block;")]', { visible: true, timeout: 5000 });
                await this.sleep(5000);
                await page.click('input#ctl00_PlaceHolderMain_generalSearchForm_txtGSStartDate', { clickCount: 3 });
                await page.type('input#ctl00_PlaceHolderMain_generalSearchForm_txtGSStartDate', fromDate);
                await page.click('input#ctl00_PlaceHolderMain_generalSearchForm_txtGSEndDate', { clickCount: 3 });
                await page.type('input#ctl00_PlaceHolderMain_generalSearchForm_txtGSEndDate', toDate);

                await this.sleep(3000);
                let buttonSearch = await page.$x('//a[@id="ctl00_PlaceHolderMain_btnNewSearch"]');
                await buttonSearch[0]!.click();

                console.log('Inserting Data to Array Before Get OwnerName ...')
                try {
                    await page.waitForXPath('//span[contains(.,"Showing")]', { visible: true, timeout: 8000 });
                } catch (err) {
                    console.log('No Result For ' + docTypeArr[j]);
                    continue
                }
                let flagStop = false;
                while (!flagStop) {
                    await page.waitForXPath('//div[@id="divGlobalLoading" and contains(@style,"display: none;")]', { timeout: 60000 });
                    let caseType = docTypeArr[j];
                    let totalRow = await page.$x('//table[@id="ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList"]/tbody/tr[contains(@class,"ACA_TabRow_Odd") or contains(@class,"ACA_TabRow_Even")]');

                    for (let l = 0; l < totalRow!.length; l++) {
                        let index = l + 1;
                        let [addressXpath] = await page.$x('//table[@id="ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList"]/tbody/tr[contains(@class,"ACA_TabRow_Odd") or contains(@class,"ACA_TabRow_Even")][' + index + ']/td[5]');
                        let [fillingDateXpath] = await page.$x('//table[@id="ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList"]/tbody/tr[contains(@class,"ACA_TabRow_Odd") or contains(@class,"ACA_TabRow_Even")][' + index + ']/td[2]');
                        let address, fillingDate, linkToGetOwnerName;
                        try {
                            address = await addressXpath.evaluate(el => el.textContent?.trim());
                            fillingDate = await fillingDateXpath!.evaluate(el => el.textContent?.trim());
                        } catch (err) {
                            continue
                        }
                        const timestamp = (new Date(fillingDate!)).getTime();

                        const data = {
                            property_address: address,
                            casetype: caseType,
                            fillingdate: fillingDate,
                            codeViolationId: timestamp,
                            sourceId
                        };
                        if (await this.saveRecord(data))
                            counts++;
                    }

                    try {
                        let btnNext = await page.$x('//a[contains(.,"Next") and contains(@href,"javascript")]');
                        await btnNext[0].click();
                        await this.sleep(2000);
                    } catch (err) {
                        flagStop = true
                    }
                }
            }
        } catch (e) {
        }
        let btnLogout = await page.$x('//span[@id="ctl00_HeaderNavigation_com_headIsLoggedInStatus_label_logout"]')
        await btnLogout[0].click();

        return counts;
    }

    async saveRecord(record: any) {
        const parsed = parser.parseLocation(record.property_address);
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
            fillingDate: record.fillingdate,
            sourceId: record.sourceId,
            codeViolationId: record.codeViolationId,
            originalDocType: record.casetype
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }
}