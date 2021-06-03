import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../abstract_producer';
import axios from 'axios';
import {countReset} from 'console';

export default class CivilProducer extends AbstractProducer {

    sources =
        [
            {url: 'http://permits.hcbcc.org//eGovPlus90/code/codeenf.aspx', handler: this.handleSource1}
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
        let fromDate = new Date(await this.getPrevCodeViolationId(sourceId, true, (new Date('1/1/2020')).getTime()));
        let toDate = new Date();
        
        while (fromDate <= toDate) {
            // load page
            const isPageLoaded = await this.openPage(page, link, '//*[@name="case_no"]');
            if (!isPageLoaded) {
                console.log('Page loading is failed, trying next...');
                continue;
            }
            let month = fromDate.getMonth() + 1;
            await this.setSearchCriteria1(page, month);
            // click search button
            await Promise.all([
                page.click('input[value="SEARCH"]',{clickCount:2}),
                page.waitForNavigation({timeout:80000})
            ]);
            const [noresult] = await page.$x('//*[contains(text(), "No matching records found.")]');
            if (noresult) continue;

            await page.waitForXPath('//*[@class="search_results"]/tbody/tr[position()>1]/td[1]/a');
            // get results
            counts += await this.getData1(page, month, sourceId);
            await this.sleep(3000);
            fromDate.setDate(fromDate.getDate()+1);
        }
        return counts;
    }

    async setSearchCriteria1(page: puppeteer.Page, month: number) {
        // get year
        let year = (new Date()).getFullYear();
        // page loaded successfully
        let [input_handle] = await page.$x('//*[@name="case_no"]');
        let search_str = (year % 100).toString().padStart(2, '0') + month.toString().padStart(2, '0');
        await input_handle.type(`CE${search_str}`, {delay: 100});
    }

    async getData1(page: puppeteer.Page, month: number, sourceId: number) {
        let counts = 0;
        const rows = await page.$x('//*[@class="search_results"]/tbody/tr[position()>1]/td[1]/a');
        const links = [];
        for (const row of rows) {
            let link = await page.evaluate(el => el.href, row);
            links.push(link);
        }
        for (const link of links) {
            await this.openPage(page, link, '//*[@class="search_results"]');
            let fillingdate = await this.getTextByXpathFromPage(page, '//*[text()="Case Date"]/following-sibling::td[1]');
            let casetype = await this.getTextByXpathFromPage(page, '//*[text()="Type"]/following-sibling::td[1]');
            let property_addresss = await this.getTextByXpathFromPage(page, '//*[text()="Property Address"]/following-sibling::td[1]');
            let ownername = await this.getTextByXpathFromPage(page, '//*[text()="Owner"]/following-sibling::td[1]');
            ownername = ownername.slice(0, ownername.indexOf('&')).trim();
            let mailing_address = await this.getTextByXpathFromPage(page, '//*[text()="Owner Address"]/following-sibling::td[1]');

            if (await this.saveRecord({
                ownername,
                property_addresss,
                mailing_address,
                fillingdate,
                casetype,
                sourceId,
                codeViolationId: month
            })) counts++;
        }
        return counts;
    }

    async saveRecord(record: any) {
        // save property data
        let data: any = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'Property Address': record.property_addresss,
            "vacancyProcessed": false,
            "productId": this.productId,
            fillingDate: record.fillingdate,
            originalDocType: record.casetype,
            sourceId: record.sourceId,
            codeViolationId: record.codeViolationId
        };
        // save owner data
        let parseName: any = this.newParseName(record.ownername.trim());
        if (parseName.type && parseName.type == 'COMPANY') {
            return false;
        }
        data = {
            ...data,
            'First Name': parseName.firstName,
            'Last Name': parseName.lastName,
            'Middle Name': parseName.middleName,
            'Name Suffix': parseName.suffix,
            'Full Name': parseName.fullName,
            'Mailing Address': record.mailing_address
        }
        return await this.civilAndLienSaveToNewSchema(data);
    }
}