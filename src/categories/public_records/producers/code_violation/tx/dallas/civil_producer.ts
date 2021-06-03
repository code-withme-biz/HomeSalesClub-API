import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../abstract_producer';
import axios from 'axios';
import { countReset } from 'console';

export default class CivilProducer extends AbstractProducer {

    sources = [
        { url: 'https://www.dallasopendata.com/resource/x9pz-kdq9.json', handler: this.handleSource },
        { url: 'https://energov.cityofmesquite.com/selfservice#/search', handler: this.handleSource2 },
        { url: 'https://egov.addisontx.gov/EnerGovProd/selfservice/EnerGovProd#/search', handler: this.handleSource2 }
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

    async handleSource(page: puppeteer.Page, url: string, sourceId: number) {
        let dateRange = {
            from: new Date(await this.getPrevCodeViolationId(sourceId, true, (new Date('1/1/2010').getTime()))),
            to: new Date()
        };
        let countRecords = 0;
        let limit = 1000;
        let offset = 0;
    
        while (true) {
            const response = await this.getCodeViolationData(url, limit, offset, 'created', dateRange.from, dateRange.to);
            if (response.success) {
                for (const record of response.data) {
                    if (!record.location) continue;
                    const full_addr = JSON.parse(record.location.human_address);
                    const property_address = full_addr.address;
                    const fillingdate = record.created;
                    const codeViolationId = (new Date(fillingdate)).getTime();
                    const casetype = record.type;

                    const res = {
                        property_address,
                        fillingdate,
                        casetype,
                        sourceId,
                        codeViolationId
                    }                    
                    if (await this.saveRecord(res))
                        countRecords++;
                }
                offset += limit;
                if (response.end) break;
                await this.sleep(this.getRandomInt(1000, 2000));
            }
            else {
                break;
            }
        }
        
        return countRecords;
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
        if (sourceId == 1) {
            await page.click('#button-Advanced')
        }
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