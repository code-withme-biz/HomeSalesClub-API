import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
const parser = require('parse-address');

export default class CivilProducer extends AbstractProducer {

    sources = [
        { url: 'https://newhanovercountync-energovpub.tylerhost.net/apps/selfservice#/search', handler: this.handleSource }
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

        const isPageLoaded = await this.openPage(page, link, '//*[@id="overlay"]');
        if (!isPageLoaded) {
            console.log("Website loading is failed!");
            return counts;
        }
        await this.sleep(20000);
        await page.waitForSelector('#SearchModule', { visible: true });
        await page.select('#SearchModule', 'number:5');
        await page.click('#button-Advanced');
        await page.waitForSelector('#collapseFilter', { visible: true });
        await page.waitForSelector('#OpenedDateFrom', { visible: true });
        await page.type('#OpenedDateFrom', dateRange.from, { delay: 100 });
        await page.type('#OpenedDateTo', dateRange.to, { delay: 100 });
        await page.click('#button-Search');
        await page.waitForSelector('#overlay', { visible: true });
        await page.waitForSelector('#overlay', { hidden: true });

        while (true) {
            await page.waitForXPath('//div[contains(@name,"label-SearchResult")]', { visible: true, timeout: 60000 });
            let fillingdates = await page.$x('//div[@name="label-OpenedDate"]//span[1]');
            let casetypes = await page.$x('//div[@name="label-CodeCaseType"]//span[1]');
            let property_addresses = await page.$x('//div[@name="label-Address"]//span[1]');
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
            const [endpage] = await page.$x('//li[@class="disabled"]/a[@id="link-NextPage"]');
            if (endpage) {
                break;
            } else {
                const [nextpage] = await page.$x('//a[@id="link-NextPage"]');
                await nextpage.click();
                await page.waitForSelector('#overlay', { visible: true });
                await page.waitForSelector('#overlay', { hidden: true });
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