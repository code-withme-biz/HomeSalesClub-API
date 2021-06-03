import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';

const parser = require('parse-address');

export default class CivilProducer extends AbstractProducer {
    productId = '';

    sources =
        [
            {url: 'https://permits.osceola.org/CitizenAccess/Cap/CapHome.aspx?module=Enforcement&TabName=Home', handler: this.handleSource1}
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
        await page?.setDefaultNavigationTimeout(60000);
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
        const isPageLoaded = await this.openPage(page, link, '//*[contains(@id,"txtGSStartDate")]');
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
        let counts = 0;
        let dateRange = {
            from: new Date(await this.getPrevCodeViolationId(sourceId, true, (new Date('1/1/2020')).getTime())),
            to: new Date()
        };
        let fromDate = dateRange.from;
        let toDate = dateRange.to;
        let nextPage;
        while (fromDate <= toDate) {
            try {
                const [startDateElement] = await page.$x('//input[contains(@id,"txtGSStartDate")]')
                await startDateElement.type( this.getFormattedDate(fromDate), {delay: 150});

                const [endDateElement] = await page.$x('//input[contains(@id,"txtGSEndDate")]')
                await endDateElement.type( this.getFormattedDate(fromDate), {delay: 150});

                let [buttonSearch] = await page.$x('//a[contains(@id,"btnNewSearch")]');
                await buttonSearch.click();
                await page.waitForXPath('//div[@id="divGlobalLoading"]', {visible: true});
                await page.waitForXPath('//div[@id="divGlobalLoading"]', {hidden: true});
                await page.waitForXPath('//table[contains(@id,"gdvPermitList")]/tbody/tr[position()>2][contains(@class, "ACA_TabRow_")]', {timeout: 60000});
                let fillingdate = fromDate.toLocaleDateString('en-US');
                while (true) {
                    nextPage = false
                    let rows = await page.$x('//table[contains(@id,"gdvPermitList")]/tbody/tr[position()>2][contains(@class, "ACA_TabRow_")]');
                    for (const row of rows) {
                        try {
                            let casetype: any = await row.evaluate(el => el.children[3].textContent);
                            casetype = casetype?.replace(/\s+|\n/gm, ' ').trim();
                            let address: any = await row.evaluate(el => el.children[4].textContent);
                            address = address?.replace(/\s+|\n/gm, ' ').trim();
                            const timestamp = (new Date(fillingdate)).getTime();

                            if (await this.saveRecord(address!, casetype!, fillingdate, sourceId, timestamp))
                                counts++;
                        } catch (e) {
                            console.log(e)
                        }

                    }

                    const [nextPageBtnElement] = await page.$x('//a[contains(text(),"Next >")]')
                    if (nextPageBtnElement) {
                        await nextPageBtnElement.click();
                        await page.waitForXPath('//div[@id="divGlobalLoading"]', {visible: true});
                        await page.waitForXPath('//div[@id="divGlobalLoading"]', {hidden: true});
                        nextPage = true
                    } else {
                        break;
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
            fillingDate,
            sourceId,
            codeViolationId,
            originalDocType: caseType
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }
}