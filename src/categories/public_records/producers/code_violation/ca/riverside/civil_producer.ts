import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
import db from '../../../../../../models/db';
const parser = require('parse-address');

export default class CivilProducer extends AbstractProducer {
    productId = '';

    sources =
        [
            { url: 'https://aca-prod.accela.com/MOVAL/Cap/CapHome.aspx?module=Code&TabName=Code', handler: this.handleSource1 },
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
        const isPageLoaded = await this.openPage(page, link, '//input[@id="ctl00_PlaceHolderMain_generalSearchForm_txtGSStartDate"]');
        if (!isPageLoaded) {
            console.log("Website not loaded successfully:", link);
            return counts;
        }

        // get results
        counts += await this.getData1(page, sourceId);
        await this.sleep(3000);
        return counts;
    }

    getStartNumberString(startNum: number, lengthdigit = 6) {
        let result = startNum.toString().padStart(lengthdigit, '0');
        return result;
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
        while (fromDate <= toDate) {
            try {
                await page.goto('https://aca-prod.accela.com/MOVAL/Cap/CapHome.aspx?module=Code&TabName=Code');
                await page.waitForXPath('//input[@id="ctl00_PlaceHolderMain_generalSearchForm_txtGSStartDate"]', { visible: true, timeout: 200000 });
                await page.evaluate(() => {
                    // @ts-ignore
                    document.querySelector('#ctl00_PlaceHolderMain_generalSearchForm_txtGSStartDate').value = '';
                    // @ts-ignore
                    document.querySelector('#ctl00_PlaceHolderMain_generalSearchForm_txtGSEndDate').value = '';
                });

                await this.sleep(2000);
                console.log(this.getFormattedDate(fromDate))
                await page.type('#ctl00_PlaceHolderMain_generalSearchForm_txtGSStartDate', this.getFormattedDate(fromDate), { delay: 150 });
                await page.type('#ctl00_PlaceHolderMain_generalSearchForm_txtGSEndDate', this.getFormattedDate(fromDate), { delay: 150 });


                let buttonSearch = await page.$x('//a[@id="ctl00_PlaceHolderMain_btnNewSearch"]');
                await buttonSearch[0]!.click();

                // try {
                //     await page.waitForXPath('//div[@id="ctl00_PlaceHolderMain_RecordSearchResultInfo_noDataMessageForSearchResultList_messageBar"]', { visible: true, timeout: 8000 });
                //     let noResult = await page.$x('//div[@id="ctl00_PlaceHolderMain_RecordSearchResultInfo_noDataMessageForSearchResultList_messageBar"]');
                //     if (noResult.length > 0) {
                //         continue;
                //     }
                // } catch (err) {
                //     console.log(err)
                // }

                try {
                    await page.waitForXPath('//span[contains(.,"Showing")]', { visible: true, timeout: 8000 });
                } catch (err) {
                    console.log('No Result For ' + this.getFormattedDate(fromDate));
                    fromDate.setDate(fromDate.getDate() + 1);
                    continue
                }
                let flagStop = false;
                while (!flagStop) {
                    await page.waitForXPath('//div[@id="divGlobalLoading" and contains(@style,"display: none;")]', { timeout: 60000 });
                    let fillingdate = fromDate.toLocaleDateString('en-US');
                    let totalRow = await page.$x('//table[@id="ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList"]/tbody/tr[contains(@class,"ACA_TabRow_Odd") or contains(@class,"ACA_TabRow_Even")]');
                    for (let l = 0; l < totalRow!.length; l++) {
                        let index = l + 1;
                        let [addressXpath] = await page.$x('//table[@id="ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList"]/tbody/tr[contains(@class,"ACA_TabRow_Odd") or contains(@class,"ACA_TabRow_Even")][' + index + ']/td[3]');
                        let [caseTypeXpath] = await page.$x('//table[@id="ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList"]/tbody/tr[contains(@class,"ACA_TabRow_Odd") or contains(@class,"ACA_TabRow_Even")][' + index + ']/td[8]');
                        let address, caseType;
                        try {
                            address = await addressXpath.evaluate(el => el.textContent?.trim());
                            caseType = await caseTypeXpath.evaluate(el => el.textContent?.trim());
                        } catch (err) {
                            continue
                        }
                        if (caseType == '' || address == '') {
                            continue
                        }
                        caseType = caseType!.replace('AVA ', 'Abandoned Vehicle Abatement ').trim();
                        const timestamp = (new Date(fillingdate)).getTime();
                        if (await this.saveRecord(address!, caseType!, fillingdate, sourceId, timestamp))
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
                fromDate.setDate(fromDate.getDate() + 1);
            } catch (e) {
                console.log(e)
                fromDate.setDate(fromDate.getDate() + 1);
                continue
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
            originalDocType: caseType,
            fillingDate,
            sourceId,
            codeViolationId
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }
}