import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import { fill } from 'lodash';

export default class CivilProducer extends AbstractProducer {
    browser: puppeteer.Browser | undefined;
    browserPages = {
        generalInfoPage: undefined as undefined | puppeteer.Page
    };
    urls = {
        generalInfoPage: 'https://records.manateeclerk.com/CourtRecords/Search/CaseType/'
    }

    xpaths = {
        isPAloaded: '//select[@id="CaseType"]'
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

    getDateString2(date: Date): string {
        return date.getFullYear() + "-" + ("00" + (date.getMonth() + 1)).slice(-2) + "-" + ("00" + date.getDate()).slice(-2);
    }

    // This is main function
    async parseAndSave(): Promise<boolean> {
        const civilUrl: string = 'https://records.manateeclerk.com/CourtRecords/Search/CaseType/';
        let countRecords = 0;

        try{
            let page = this.browserPages.generalInfoPage!;
            let caseTypeValues = ['5', '15', '17', '8', '14', '34', '39', '41', '54']; // This is case type value that will selected

            let dateRange = await this.getDateRange('Florida', 'Manatee');
            let fromDate = dateRange.from;
            let toDate = dateRange.to;
            let fromDateString = this.getDateString2(fromDate);
            let toDateString = this.getDateString2(toDate);
            // console.log(fromDateString, toDateString);
            // Loop through case type value
            for (const caseTypeValue of caseTypeValues) {
                console.log("Current case type:", caseTypeValue);
                await page.goto(civilUrl);
                await page.waitForXPath('//select[@id="CaseType"]', { visible: true });
                await page.select('select#CaseType', caseTypeValue);
                let getStartDate = await page.$('input#StartDate');
                await page.evaluate((el, startValue) => { el.setAttribute('value', startValue) }, getStartDate, fromDateString);
                // await page.waitFor(2000);
                let getEndDate = await page.$('input#EndDate');
                await page.evaluate((el, endValue) => { el.setAttribute('value', endValue) }, getEndDate, toDateString);
                let submitHandle = await page.$x('//input[@value="Search"]');
                await submitHandle[0].click();
                await this.randomSleepIn5Sec();
                let nextPage = true;
                let currentPage = 1;
                while (nextPage) {
                    await page.waitForXPath('//table[@id="results-table"]/tbody/tr/th', { visible: true });
                    let matchingHandles = await page.$x('//div[contains(text(), "Matching Results:")]');
                    try {
                        let maching = await matchingHandles[0].evaluate(val => val.textContent?.trim());
                        console.log(maching);
                    } catch {
                        console.log("Found: 0")
                        break;
                    }
                    let detailButtonHandles = await page.$x('//table[@id="results-table"]/tbody[2]/tr/td/form');
                    console.log("Page: " + currentPage + ", Found: " + detailButtonHandles.length);
                    for (let j = 0; j < detailButtonHandles.length; j++) {
                        let index = j + 1;
                        await page.waitForXPath('//table[@id="results-table"]/tbody[2]/tr[' + index + ']/td/form', { timeout: 60000 });
                        let detailButtonHandle = await page.$x('//table[@id="results-table"]/tbody[2]/tr[' + index + ']/td/form')
                        await detailButtonHandle[0].click();
                        await page.waitForXPath('//strong[contains(., "Case:")]', { visible: true, timeout: 60000 });
                        let nameRowHandles = await page.$x('//th[contains(.,"Party Type")]/ancestor::table/tbody/tr');
                        for (let i = 0; i < nameRowHandles.length; i++) {
                            let indXpath = i + 1;
                            let partyTypeHandle = await page.$x('//th[contains(.,"Party Type")]/ancestor::table/tbody/tr[' + indXpath + ']/td');
                            let partyType: any = await partyTypeHandle[0].evaluate(el => el.textContent?.trim());
                            if (partyType.match(/respondent|defendant/i)) {
                                let partyNameHandle = await page.$x('//th[contains(.,"Party Type")]/ancestor::table/tbody/tr[' + indXpath + ']/td[2]/text()');
                                let partyName: any = await partyNameHandle[0].evaluate(el => el.textContent?.trim());
                                if (partyName.match(/florida|manatee|county|states/i)) {
                                    continue;
                                }
                                let caseIdHandle = await page.$x('//strong[contains(.,"Case:")]/parent::div/span');
                                let caseId: any = await caseIdHandle[0].evaluate(el => el.textContent?.trim());
                                let fillDateHandle = await page.$x('//strong[contains(.,"Filed:")]/parent::div/span');
                                let fillDate: any = await fillDateHandle[0].evaluate(el => el.textContent?.trim());
                                let fillTypeHandle = await page.$x('//div[contains(., "Filings")]/parent::div/div[2]/div[2]/div[4]');
                                let caseType: any;
                                try {
                                    caseType = await fillTypeHandle[0].evaluate(el => el.textContent?.trim());
                                } catch {
                                    caseType = '';
                                }

                                let practiceType = this.getPracticeType(caseType);

                                const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                                const prod = await db.models.Product.findOne({ name: productName }).exec();
                                const parseName: any = this.newParseName(partyName!.trim());
                                if(parseName.type && parseName.type == 'COMPANY'){
                                    continue;
                                }

                                const data = {
                                    'caseUniqueId': caseId,
                                    'Property State': this.publicRecordProducer.state,
                                    'County': this.publicRecordProducer.county,
                                    'First Name': parseName.firstName,
                                    'Last Name': parseName.lastName,
                                    'Middle Name': parseName.middleName,
                                    'Name Suffix': parseName.suffix,
                                    'Full Name': parseName.fullName,
                                    "vacancyProcessed": false,
                                    fillingDate: fillDate,
                                    "productId": prod._id,
                                    originalDocType: caseType
                                };

                                if (await this.civilAndLienSaveToNewSchema(data))
                                    countRecords += 1;
                            } else {
                                continue;
                            }
                        }
                        // let backToSearchButton = await page.$x('//a[contains(., "Back to Search Results")]');
                        // await backToSearchButton[0].click();
                        await page.goBack();
                    }
                    await page.waitForXPath('//table[@id="results-table"]/tbody/tr/th', { timeout: 60000, visible: true });
                    try {
                        let nextPageButton = await page.$x('//li[contains(@class, "PagedList-skipToNext")]/a');
                        await nextPageButton[0].click();
                    } catch (e) {
                        nextPage = false;
                    }
                    await this.randomSleepIn5Sec();
                }
            }
            await AbstractProducer.sendMessage('Manatee', 'Florida', countRecords, 'Civil');
            return true;
        } catch(e){
            console.log(e);
            await AbstractProducer.sendMessage('Manatee', 'Florida', countRecords, 'Civil');
            return false;
        }
    }
}