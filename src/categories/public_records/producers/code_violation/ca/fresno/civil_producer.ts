import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
const parser = require('parse-address');
export default class CivilProducer extends AbstractProducer {

    sources = [
        { url: 'https://permitportal.fresnocountyca.gov/citizenportal/app/public-search', handler: this.handleSource }
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

        await page.setDefaultTimeout(60000);

        let sourceId = 0;
        for (const source of this.sources) {
            countRecords += await source.handler.call(this, page, source.url, sourceId);
            sourceId++;
        }

        await AbstractProducer.sendMessage(this.publicRecordProducer.state, this.publicRecordProducer.county ? this.publicRecordProducer.county : this.publicRecordProducer.city, countRecords, 'Code Violation');
        return true;
    }

    async handleSource(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;
        let dateRange = {
            from: this.getFormattedDate(new Date(await this.getPrevCodeViolationId(sourceId, true, (new Date('1/1/2020')).getTime()))),
            to: this.getFormattedDate(new Date())
        };

        const isPageLoaded = await this.openPage(page, link, '//*[@title="Advanced"]');
        if (!isPageLoaded) {
            console.log("Website loading is failed!");
            return counts;
        }
        await this.sleep(10000);
        let [btnAdvanced] = await page.$x('//*[@title="Advanced"]');
        await btnAdvanced.click();
        await page.waitForSelector('#inDateFrom_ID', { visible: true });

        let arrDateFrom = dateRange.from.split('/');
        let arrDateTo = dateRange.to.split('/');
        let fromDate = arrDateFrom[2] + '-' + arrDateFrom[1] + '-' + arrDateFrom[0];
        let toDate = arrDateTo[2] + '-' + arrDateTo[1] + '-' + arrDateTo[0];
        await page.waitForSelector('#folderType_ID', { visible: true });
        await page.select('#folderType_ID', 'VI');
        await page.type('#inDateFrom_ID', fromDate, { delay: 100 });
        await page.type('#inDateTo_ID', toDate, { delay: 100 });
        let btnSearch = await page.$x('//button[@type="submit"]');
        await btnSearch[1].click();

        try {
            await page.waitForXPath('//ngx-datatable', { visible: true, timeout: 60000 });
        } catch (err) {
            return counts;
        }

        while (true) {
            await page.waitForXPath('//ngx-datatable', { visible: true, timeout: 60000 });
            let caseNumberXpath = await page.$x('//datatable-body-cell[1]');
            let caseNumber: any = await caseNumberXpath[0].evaluate(el => el.textContent?.trim());
            let fillingdates = await page.$x('//datatable-body-cell[5]');
            let casetypes = await page.$x('//datatable-body-cell[3]')
            let property_addresses = await page.$x('//datatable-body-cell[7]')
            for (let index = 0; index < fillingdates.length; index++) {
                let property_address: any = await property_addresses[index].evaluate(el => el.textContent);
                property_address = property_address.replace(/\s+|\n/gm, ' ').trim();
                let fillingdate: any = await fillingdates[index].evaluate(el => el.textContent);
                fillingdate = fillingdate.replace(/\s+|\n/gm, ' ').trim();
                let casetype: any = await casetypes[index].evaluate(el => el.textContent);
                casetype = casetype.replace(/\s+|\n/gm, ' ').trim();
                let codeViolationId = (new Date(fillingdate)).getTime();
                if (property_address == '' || casetype == '' || fillingdate == '')
                    continue
                const record = {
                    property_address,
                    casetype,
                    fillingdate,
                    codeViolationId,
                    sourceId
                };
                if (await this.saveRecord(record)) counts++;
            }
            const [endpage] = await page.$x('//a[contains(@aria-label,"go to next page")]/parent::li[@class="disabled"]')
            if (endpage) {
                break;
            } else {
                const [nextpage] = await page.$x('//a[contains(@aria-label,"go to next page")]');
                await nextpage.click();
                let flagStop = false;
                while (!flagStop) {
                    await this.sleep(1000);
                    let caseNumberXpath = await page.$x('//datatable-body-cell[1]');
                    let caseNumberNow: any = await caseNumberXpath[0].evaluate(el => el.textContent?.trim());
                    if (caseNumberNow != caseNumber) {
                        flagStop = true;
                    }
                }
                await this.randomSleepIn5Sec();
            }
        }
        return counts;
    }

    async saveRecord(record: any) {
        try {
            const parsed = parser.parseLocation(record.property_address);
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
                "caseUniqueId": record.caseno,
                fillingDate: record.fillingdate,
                originalDocType: record.casetype,
                sourceId: record.sourceId,
                codeViolationId: record.codeViolationId
            };
            return await this.civilAndLienSaveToNewSchema(data);
        } catch (err) {
            console.log('Not Saved, Address not complete')
            return false
        }
    }
}