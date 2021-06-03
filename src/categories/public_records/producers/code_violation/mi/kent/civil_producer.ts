import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
import db from '../../../../../../models/db';
const parser = require('parse-address');

export default class CivilProducer extends AbstractProducer {
    productId = '';

    sources =
        [
            { url: 'https://inspections.grcity.us/CitizenAccess/Cap/CapHome.aspx?module=Enforcement', handler: this.handleSource1 }
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

    async getData1(page: puppeteer.Page, sourceId: number) {
        let counts = 0;
        let dateRange = {
            from: this.getFormattedDate(new Date(await this.getPrevCodeViolationId(sourceId, true, (new Date('1/1/2020')).getTime()))),
            to: this.getFormattedDate(new Date())
        };
        let fromDate = dateRange.from;
        let toDate = dateRange.to;
        try {
            await page.goto('https://inspections.grcity.us/CitizenAccess/Cap/CapHome.aspx?module=Enforcement');
            await page.waitForXPath('//select[@id="ctl00_PlaceHolderMain_generalSearchForm_ddlGSPermitType"]', { visible: true, timeout: 200000 });


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
                console.log('No Result');
                return counts
            }
            let flagStop = false;
            let temp10RowBeforeGetOwnerName = [];
            while (!flagStop) {
                await page.waitForXPath('//div[@id="divGlobalLoading" and contains(@style,"display: none;")]', { timeout: 60000 });
                let totalRow = await page.$x('//table[@id="ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList"]/tbody/tr[contains(@class,"ACA_TabRow_Odd") or contains(@class,"ACA_TabRow_Even")]');

                for (let l = 0; l < totalRow!.length; l++) {
                    let index = l + 1;
                    let [addressXpath] = await page.$x('//table[@id="ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList"]/tbody/tr[contains(@class,"ACA_TabRow_Odd") or contains(@class,"ACA_TabRow_Even")][' + index + ']/td[5]');
                    let [caseTypeXpath] = await page.$x('//table[@id="ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList"]/tbody/tr[contains(@class,"ACA_TabRow_Odd") or contains(@class,"ACA_TabRow_Even")][' + index + ']/td[4]');
                    let [codeViolationIdXpath] = await page.$x('//table[@id="ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList"]/tbody/tr[contains(@class,"ACA_TabRow_Odd") or contains(@class,"ACA_TabRow_Even")][' + index + ']/td[3]/div/a');
                    let [fillingDateXpath] = await page.$x('//table[@id="ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList"]/tbody/tr[contains(@class,"ACA_TabRow_Odd") or contains(@class,"ACA_TabRow_Even")][' + index + ']/td[2]');
                    let address, fillingDate, linkToGetOwnerName, caseType;
                    try {
                        address = await addressXpath.evaluate(el => el.textContent?.trim());
                        caseType = await caseTypeXpath.evaluate(el => el.textContent?.trim());
                        linkToGetOwnerName = await codeViolationIdXpath.evaluate(el => el.getAttribute('href')?.trim());
                        fillingDate = await fillingDateXpath!.evaluate(el => el.textContent?.trim());
                    } catch (err) {
                        continue
                    }

                    const timestamp = (new Date(fillingDate!)).getTime();
                    const data = {
                        property_address: address,
                        casetype: caseType,
                        fillingdate: fillingDate,
                        sourceId,
                        codeViolationId: timestamp
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
        } catch (e) {
        }

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