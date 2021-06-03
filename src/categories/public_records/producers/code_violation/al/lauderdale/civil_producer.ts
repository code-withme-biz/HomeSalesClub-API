import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
import db from '../../../../../../models/db';

const parser = require('parse-address');

export default class CivilProducer extends AbstractProducer {
    productId = '';
    sources =
        [
            {
                url: 'https://aca-prod.accela.com/FTL/Cap/CapHome.aspx?ShowMyPermitList=Y&SearchType=ByPermit&module=Enforcement',
                handler: this.handleSource1
            }
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
        const isPageLoaded = await this.openPage(page, link, '//*[contains(@id,"txtGSPermitNumber")]');
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
        let nextPage;
        let fromMonth = fromDate.getMonth()
        let toMonth = toDate.getMonth();
        let fromYear = fromDate.getFullYear().toString().substr(-2)
        let toYear = toDate.getFullYear().toString().substr(-2)
        let flagEnd = true

        do  {
            try {
                await page.goto('https://aca-prod.accela.com/FTL/Cap/CapHome.aspx?ShowMyPermitList=Y&SearchType=ByPermit&module=Enforcement', {waitUntil: 'load'})
                await page.waitForXPath('//input[contains(@id,"txtGSPermitNumber")]')
                const searchValue = `CE${fromYear}${fromMonth+1}%`
                const [permitNumberElement] = await page.$x('//input[contains(@id,"txtGSPermitNumber")]')
                await permitNumberElement.type(searchValue, {delay: 150});

                let [buttonSearch] = await page.$x('//*[contains(@id,"btnNewSearch")]');
                await buttonSearch.click();

                await page.waitForXPath('//table[contains(@id,"gdvPermitList")]');
                do {
                    nextPage = false
                    let totalRow = await page.$x('//table[contains(@id,"gdvPermitList")]/tbody/tr[position()>2]');
                    for (let i = 0; i < totalRow!.length; i++) {
                        try {
                            let fillingdate = (await totalRow[i].$eval('td:nth-child(2) > div > span', elem => elem.textContent))?.trim();;
                            let casetype = 'Code Case';
                            let address = (await totalRow[i].$eval('td:nth-child(5) > div > span', elem => elem.textContent))?.replace(/\,.*$/, '');
                            const timestamp = (new Date(fillingdate!)).getTime();
                            if (await this.saveRecord(address!, casetype!, fillingdate!, sourceId, timestamp))
                                counts++;
                        } catch (e) {
                        }
                    }

                    await this.sleep(500)
                    const [nextPageBtnElement] = await page.$x('//a[contains(text(),"Next >")]')
                    if (!!nextPageBtnElement) {
                        await nextPageBtnElement.click();
                        await page.waitForXPath('//div[@id="divGlobalLoading"]', {visible: true});
                await page.waitForXPath('//div[@id="divGlobalLoading"]', {hidden: true});
                        nextPage = true
                    }
                } while (nextPage)
            } catch (e) {
                console.log(e)
            }

            fromMonth++
            if  (fromYear == toYear && fromMonth > toMonth) flagEnd = false
            if (fromMonth > 11) {
                fromYear = toYear
                fromMonth = 0
            }
        } while (flagEnd)
        return counts;
    }

    async saveRecord(address: string, caseType: string, fillingDate: string, sourceId: number, codeViolationId: number) {
        const data = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'Property Address': address,
            'Property City': 'SPRINGFIELD',
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