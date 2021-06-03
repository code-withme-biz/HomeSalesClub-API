import { property } from 'lodash';
import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';

export default class CivilProducer extends AbstractProducer {

    sources = [
        { url: 'https://www.palmcoastgov.com/government/codesearch/details/', handler: this.handleSource },
        { url: 'https://energovweb.flaglercounty.org/EnerGovProd/SelfService#/search', handler: this.handleSource2 },
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

        let prevCodeViolationId = await this.getPrevCodeViolationId(sourceId, false, 2020010001, true);       
        let year = (new Date()).getFullYear();
        let startNum = prevCodeViolationId % 10000;
        let currMonth = (new Date()).getMonth()+1;
        let startMonth = Math.floor(prevCodeViolationId / 10000);
        let onehand = 0;
        for (let month = startMonth ; month <= currMonth ; month++) {
            let num = month === startMonth ? startNum : 1;
            while (true) {
                const casenumber = `${year}${month.toString().padStart(2, '0')}${num.toString().padStart(4, '0')}`;
                const isPageLoaded = await this.openPage(page, link+casenumber, '//*[@class="white-container"]');
                if (!isPageLoaded) {
                    console.log("Website loading is failed!");
                    return counts;
                }
                const [property_address_handle] = await page.$x('//*[contains(text(), "Address :")]/following-sibling::td[1]');
                if (property_address_handle) {
                    onehand = 0;
                    let property_address = await property_address_handle.evaluate(el => el.textContent) || '';
                    property_address = property_address.replace(/\s+|\n/gm, ' ').trim();
                    let fillingdate = await this.getTextByXpathFromPage(page, '//*[contains(text(), "Date Opened")]/following-sibling::td[1]');
                    let codeViolationId = parseInt(casenumber);
                    const record = {
                        property_address,
                        casetype: '',
                        fillingdate,
                        codeViolationId,
                        sourceId
                    };
                    if (await this.saveRecord(record)) counts++;
                } else {
                    console.log('No results found');
                    break;
                }
                num++;
            }
        }
        return counts;
    }

    async handleSource2(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;

        let dateRange = {
            from: this.getFormattedDate(new Date(await this.getPrevCodeViolationId(sourceId, true))),
            to: this.getFormattedDate(new Date())
        };
        console.log('loading page')
        const isPageLoaded = await this.openPage(page, link, '//select[@name="SearchModule"]');
        if (!isPageLoaded) {
            console.log('Page loading failed');
            return counts;
        }

        await this.setSearchCriteria2(page, dateRange, sourceId);
        await page.click('#button-Search');
        await page.waitForXPath('//div[@id="overlay"]', {visible: true});
        await page.waitForXPath('//div[@id="overlay"]', {hidden: true});

        // get results
        counts += await this.getData2(page, sourceId);
        await this.sleep(3000);
        return counts;
    }

    async setSearchCriteria2(page: puppeteer.Page, dateRange: any, sourceId: number) {
        // setting code case
        await this.sleep(20000);
        await page.waitForSelector('#SearchModule', { visible: true });
        await page.select('#SearchModule', 'number:5');
        await page.waitForXPath('//input[@id="OpenedDateFrom"]', {visible: true});
        // setting date range
        const fromDateHandle = await page.$x('//input[@id="OpenedDateFrom"]');
        await fromDateHandle[0].click({clickCount: 3});
        await fromDateHandle[0].press('Backspace');
        await fromDateHandle[0].type(dateRange.from, {delay: 150});

        const toDateHandle = await page.$x('//input[@id="OpenedDateTo"]');
        await toDateHandle[0].click({clickCount: 3});
        await toDateHandle[0].press('Backspace');
        await toDateHandle[0].type(dateRange.to, {delay: 150});
    }

    async getData2(page: puppeteer.Page, sourceId: number) {
        let counts = 0, pageNum = 1;

        while (true) {            
            const rowXpath = '//*[contains(@id, "entityRecordDiv")]';
            const rows = await page.$x(rowXpath);
            if (rows.length == 0) {
                break;
            } else {
                for (let i = 0; i < rows.length; i++) {
                    let dateHandle = await page.$x(rowXpath + `[${i + 1}]//*[@name="label-OpenedDate"]//span`);
                    let fillingDate = await dateHandle[0].evaluate(el => el.textContent?.trim());
                    let typeHandle = await page.$x(rowXpath + `[${i + 1}]//*[@name="label-CodeCaseType"]//span`);
                    let originalDocType = await typeHandle[0].evaluate(el => el.textContent?.trim());
                    let addressHandle = await page.$x(rowXpath + `[${i + 1}]//*[@name="label-Address"]//span`);
                    let address = await addressHandle[0].evaluate(el => el.textContent?.trim());
                    let record = {
                        property_address: address,
                        fillingdate: fillingDate,
                        casetype: originalDocType,
                        sourceId,
                        codeViolationId: (new Date(fillingDate!)).getTime()
                    };
                    if (await this.saveRecord(record)) {
                        counts++;
                    }
                }
                let nextHandle = await page.$x(`//*[@id="link-NextPage"]`);
                let nextSuperHandle = await page.$x('//*[@id="link-NextPage"]/parent::li');
                let className = await nextSuperHandle[0].evaluate(el => el.getAttribute('class'));
                if (className != "disabled") {
                    await nextHandle[0].click();
                    await page.waitForXPath('//div[@id="overlay"]', {visible: true});
                    await page.waitForXPath('//div[@id="overlay"]', {hidden: true});
                    pageNum++;
                } else {
                    break;
                }  
            }          
        }
        return counts;
    }

    async saveRecord(record: any) {
        const data = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'Property Address': record.property_address,
            "vacancyProcessed": false,
            "productId": this.productId,
            "caseUniqueId": record.caseno,
            fillingDate: record.fillingdate,
            originalDocType: record.casetype,
            sourceId: record.sourceId,
            codeViolationId: record.codeViolationId
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }
}