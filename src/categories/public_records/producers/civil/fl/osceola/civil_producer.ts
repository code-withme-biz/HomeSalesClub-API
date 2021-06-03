import puppeteer from 'puppeteer';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import db from '../../../../../../models/db';
import SnsService from '../../../../../../services/sns_service';


export default class CivilProducer extends AbstractProducer {
    urls = {
        generalInfoPage: 'http://198.140.240.30/or_web1/or_sch_1.asp'
    }

    xpaths = {
        isPageLoaded: '//td[text()="PUBLIC SEARCH"]'
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
            await this.browserPages.generalInfoPage?.waitForXPath(this.xpaths.isPageLoaded);
            console.warn('Page Loaded')
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }    
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let countRecords = 0;
        const docTypeHandleXpath = '//a[contains(@onclick, "window2")]';
        const docTypeInputXpath = '//form[@name="formSearch2"]//input[@name="search_entry"]';
        const dateRangeHandleXpath = '//a[contains(@onclick, "formSearch2,90")]';
        const newSearchHandleXpath = '//a[text()="New Search"]';
        const beginDateInputXpath = '//input[@name="FromDate"]';
        const endDateInputXpath = '//input[@name="ToDate"]';
        const searchBtnHandleXpath = '//input[contains(@onclick, "ValidateAndSubmit")]';
        const noResultHandleXpath = '//*[contains(text(), "No record matches")]';
        const resultsHandleXpath = '//form[@name="formFilter1"]/table[4]/tbody';
        const nextBtnHandleXpath = '//form[@name="formFilter1"]/strong//a[text()="Next Page"]';

        try {
            let docTypeSelects = [
                "BANK", "DEED", "FTL", "LIEN", "LP", "MARR LIC", "MTG", "MTG1", "MTG2", "MTG3", "PROB", "PROBATE", "TAX", "TSDEED", "TSMOD", "TSMTG", "TSMTG1", "TSMTG2"
            ];

            let dateRange = await this.getDateRange('Florida', 'Osceola')

            for (let i = 0; i < docTypeSelects.length; i++) {
                let start = dateRange.from;
                let end = dateRange.to;

                while (start < end) {                     
                    await page.goto(this.urls.generalInfoPage, {waitUntil: 'networkidle0'});
                    const from = this.getFormattedDate(start);
                    let newDate = start.setDate(start.getDate() + 1);
                    start = new Date(newDate);
                    const to = this.getFormattedDate(start);

                    try {
                        const docTypeHandle1 = await page.$x(docTypeHandleXpath);
                        await docTypeHandle1[0].click();
                    } catch (error) {
                        console.log(error);
                        return false;
                    }
                    
                    // setting doc type
                    const docTypeSelect = docTypeSelects[i];
                    const [docTypeInputHandle] = await page.$x(docTypeInputXpath);
                    await docTypeInputHandle.click();
                    await docTypeInputHandle.type(docTypeSelect, {delay: 100});

                    // setting date range
                    await (await page.$x(beginDateInputXpath))[0].click({clickCount: 3});
                    await (await page.$x(beginDateInputXpath))[0].press('Backspace');
                    await (await page.$x(beginDateInputXpath))[0].type(from, {delay: 50});
                    await (await page.$x(endDateInputXpath))[0].click({clickCount: 3});
                    await (await page.$x(endDateInputXpath))[0].press('Backspace');
                    await (await page.$x(endDateInputXpath))[0].type(to, {delay: 50}); 

                    // setting records count
                    await page.select('div#window2 select[name="RecSetSize"]', '2000');

                    // click search 
                    const [SearchBtnHandle] = await page.$x(searchBtnHandleXpath);
                    await SearchBtnHandle.click();
                    await page.waitForNavigation();
                    await page.waitFor(3000);

                    const noResultHandle = await page.$x(noResultHandleXpath);

                    let pageNum = 1;
                    let isLast = false;

                    if (noResultHandle.length > 0) {
                        console.log('No records matches');
                    } else {
                        while (!isLast) {
                            await page.waitForXPath(`${resultsHandleXpath}/tr`);
                            const results = await page.$x('//form[@name="formFilter1"]/table[4]/tbody/tr/td/font[not(contains(text(), "*"))]/parent::td/parent::tr');

                            for (let i = 0; i < results.length; i++) {
                                const name = await results[i].evaluate(el => el.children[1].textContent?.trim());
                                const date = await results[i].evaluate(el => el.children[2].textContent?.trim());
                                const type = await results[i].evaluate(el => el.children[3].textContent?.trim());
                                const caseId = await results[i].evaluate(el => el.children[7].textContent?.trim());

                                await this.getData(page, name, type, date, caseId);
                                countRecords++;
                            }
                            
                            const [nextBtnHandle] = await page.$x(nextBtnHandleXpath);
                            if (nextBtnHandle) {
                                pageNum++;
                                await nextBtnHandle.click();
                            } else {
                                isLast = true;
                            }
                        }
                    }
                }
            }
            
            await AbstractProducer.sendMessage('Osceola', 'Florida', countRecords, 'Civil & Lien');
            await page.close();
            await this.browser?.close();
            return true;
        }
        catch (error) {
            console.log('Error: ', error);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Osceola', 'Florida', countRecords, 'Civil & Lien', errorImage);
            return false;
        }
    }

    async getData(page: puppeteer.Page, name: any, type: any, date: any, caseId: any): Promise<any> {
        const parseName: any = this.newParseName(name!.trim());
        if(parseName.type && parseName.type == 'COMPANY'){
            return false;
        }
        let practiceType = this.getPracticeType(type);

        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({ name: productName }).exec();
        const data = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'First Name': parseName.firstName,
            'Last Name': parseName.lastName,
            'Middle Name': parseName.middleName,
            'Name Suffix': parseName.suffix,
            'Full Name': parseName.fullName,
            "vacancyProcessed": false,
            fillingDate: date,
            productId: prod._id,
            originalDocType: type
        };

        return (await this.civilAndLienSaveToNewSchema(data));
    }
}