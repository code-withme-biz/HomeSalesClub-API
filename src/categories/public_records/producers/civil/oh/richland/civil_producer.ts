import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';

export default class CivilProducer extends AbstractProducer {
    browser: puppeteer.Browser | undefined;
    browserPages = {
        generalInfoPage: undefined as undefined | puppeteer.Page
    };
    urls = {
        generalInfoPage: 'https://www.uslandrecords.com/ohlr3/'
    }

    xpaths = {
        isPAloaded: '//select[@name="countycode"]"]'
    }

    constructor(publicRecordProducer: IPublicRecordProducer) {
        // @ts-ignore
        super();
        this.publicRecordProducer = publicRecordProducer;
        this.stateToCrawl = this.publicRecordProducer?.state || '';
    }

    async init(): Promise<boolean> {
        this.browser = await this.launchBrowser();
        this.browserPages.generalInfoPage = await this.browser.newPage();
        await this.setParamsForPage(this.browserPages.generalInfoPage);
        try {
            await this.browserPages.generalInfoPage.goto(this.urls.generalInfoPage, { waitUntil: 'load' });
            return true;
        } catch (err) {
            console.warn(err);
            return false;
        }
    }

    async read(): Promise<boolean> {
        try {
            await this.browserPages.generalInfoPage?.waitForXPath(this.xpaths.isPAloaded);
            return true;
        } catch (err) {
            console.warn('Problem loading civil producer page.');
            return false;
        }
    }

    // To check empty or space
    isEmptyOrSpaces(str: string) {
        return str === null || str.match(/^\s*$/) !== null;
    }

    // This is main function
    async parseAndSave(): Promise<boolean> {
        const civilUrl: string = this.urls.generalInfoPage;
        let page = this.browserPages.generalInfoPage!;

        // get date range
        let dateRange = await this.getDateRange('Ohio', 'allen');
        let fromDate = dateRange.from;
        let toDate = dateRange.to;
        let countRecords = 0;

        let days = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 3600 * 24)) - 1;
        for (let i = days < 1 ? 1 : days ; i >= 0 ; i-=7) {
            try {
                await page.goto(civilUrl, {waitUntil: 'load'});
                await page.waitForSelector('select[name="countycode"]');
                await page.select('select[name="countycode"]', 'oh045');
                await page.waitForNavigation();
                await page.waitFor(2000);
                await page.waitForXPath('//h3[*[text()="Date Search"]]');
                const [dateSearchHandle] = await page.$x('//h3[*[text()="Date Search"]]');
                await dateSearchHandle.click();
                await page.waitFor(1000);
                await page.select('select[name="rowincrement"]', '100');
                await page.waitFor(100);
                
                let dateSearch = new Date();
                dateSearch.setDate(dateSearch.getDate() - i);
                let dateSearchTo = new Date();
                dateSearchTo.setDate(dateSearchTo.getDate() - i)
                let fromDateString = this.getFormattedDate(dateSearch);
                let toDateString = this.getFormattedDate(dateSearchTo);
                
                // input date range
                await page.evaluate(selector => {
                    document.querySelector(selector).value = "";
                }, 'input#fromdate');
                await page.waitFor(100);
                await page.evaluate(selector => {
                    document.querySelector(selector).value = "";
                }, 'input#todate');
                await page.type('input#fromdate', fromDateString, {delay: 100});
                await page.waitFor(100);
                await page.type('input#todate', toDateString, {delay: 100});
                await page.waitFor(100);
                await Promise.all([
                    page.click('button#inputbutton'),
                    page.waitForNavigation()
                ]);
                const result_handle = await Promise.race([
                    page.waitForXPath('//*[contains(text(), "Search Results for")]'),
                    page.waitForXPath('//*[contains(text(), "No record found")]')
                ]);
                const result_text = await page.evaluate(el => el.textContent.trim(), result_handle);
                if (result_text.indexOf('No record found') > -1) {
                    console.log('No record Found');
                    continue;
                }
                
                let nextPage = true;
                let pages = 0;
                let records: any[] = [];
                while (nextPage) {
                    await page.waitForXPath('//*[text()="Inst Date"]/ancestor::tbody[1]/tr[position()>1]');
                    let resultRows = await page.$x('//*[text()="Inst Date"]/ancestor::tbody[1]/tr[position()>1]');
                    for (const row of resultRows) {
                        const link = await page.evaluate(el => el.children[1].children[0].href, row);
                        const recordDate = await page.evaluate(el => el.children[2].textContent.trim(), row);
                        const caseType = await page.evaluate(el => el.children[3].textContent.trim(), row);
                        records.push({link, caseType, recordDate});
                    }
                    let nextPageEnabled = await page.$x('//a[text()="Next"]');
                    if (nextPageEnabled.length === 0) {
                        nextPage = false;
                    } else {
                        let nextPageButton = await page.$x('//a[text()="Next"]');
                        await Promise.all([
                            nextPageButton[0].click(),
                            page.waitForNavigation()
                        ]);
                        pages++;
                        await this.sleep(1000);
                    }
                }
                try {
                    const newPage = await this.browser?.newPage();
                    await this.setParamsForPage(newPage!);
                    for (const record of records) {
                        countRecords += await this.getData(newPage!, record);
                        await this.sleep((5+Math.random()*5)*1000);
                    }
                    await newPage!.close();
                } catch (error) {
                    console.log(error);
                }
                await this.sleep((5+Math.random()*5)*1000);
            } catch (error) {
                console.log(error);
            }
        }
        
        console.log(countRecords);
        await AbstractProducer.sendMessage('Richland', 'Ohio', countRecords, 'Civil & Lien');
        return true;
    }

    async getData(page: puppeteer.Page, {link, caseType, recordDate}: any) {
        await page.goto(link, {waitUntil: 'load'});
        const nameHandles = await page.$x('//td[*[contains(text(), "Grantee")]]/following-sibling::td[1]');
        let names = [];
        for (const nameHandle of nameHandles) {
            let name = await page.evaluate(el => el.textContent, nameHandle);
            name = name.replace(/\s+|\n/gm, ' ').trim();
            names.push(name);
        }
        names = names.filter(name => name !== '');

        let practiceType = this.getPracticeType(caseType);
        let countRecords = 0;
        for (const name of names) {
            if (this.isEmptyOrSpaces(name!)) {
                continue;
            }
            // console.log(name);
            const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
            const prod = await db.models.Product.findOne({ name: productName }).exec();
            const parseName: any = this.newParseName(name!.trim());
            if (parseName.type === 'COMPANY' || parseName.fullName === '') continue;

            const data = {
                'Property State': 'OH',
                'County': 'Richland',
                'First Name': parseName.firstName,
                'Last Name': parseName.lastName,
                'Middle Name': parseName.middleName,
                'Name Suffix': parseName.suffix,
                'Full Name': parseName.fullName,
                "vacancyProcessed": false,
                fillingDate: recordDate,
                "productId": prod._id,
                originalDocType: caseType
            };

            if (await this.civilAndLienSaveToNewSchema(data))
                countRecords += 1;
        }
        return countRecords;
    }
}