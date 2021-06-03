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
        generalInfoPage: 'https://officialrecords.lakecountyclerk.org/search/SearchTypeDocType'
    }

    xpaths = {
        isPAloaded: '//input[@value="I accept the conditions above."]'
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
        const civilUrl: string = 'https://officialrecords.lakecountyclerk.org/search/SearchTypeDocType';

        let countRecords = 0;
        try{
            let dateRange = await this.getDateRange('Florida', 'Lake');
            let fromDate = dateRange.from;
            let toDate = dateRange.to;
            let fromDateString = this.getFormattedDate(fromDate);
            let toDateString = this.getFormattedDate(toDate);
            let page = this.browserPages.generalInfoPage!;
            let tosSubmit = await page.$x('//input[@value="I accept the conditions above."]');
            await Promise.all([tosSubmit[0].click(),
            page.waitForNavigation()
            ]);
            let docTypeSelects = ['DEEDS', 'LIENS', 'LIS PENDENS', 'MARRIAGE LICENSE', 'MORTGAGES'];
            for (const docTypeSelect of docTypeSelects) {
                await page.goto(civilUrl, { waitUntil: 'networkidle0' });
                let docButton = await page.$x('//button[@onclick="ShowDocTypes();"]');
                await docButton[0].click();
                await this.sleep(500);
                let option = (await page.$x('//select[@id="DocTypeGroupDropDown"]/option[contains(., "' + docTypeSelect + '")]'))[0];
                let optionVal: any = await (await option.getProperty('value')).jsonValue();
                await page.select('#DocTypeGroupDropDown', optionVal);
                let submitDoc = await page.$x('//input[@onclick="GetDocTypeStringFromGroup();"]');
                await submitDoc[0].click();
                await this.sleep(500);
                await page.type('#RecordDateFrom', fromDateString);
                await page.type('#RecordDateTo', toDateString);
                await page.click('#btnSearch');
                let resultRows;
                try {
                    await page.waitForResponse((response: any) => response.url().includes('Search/GridResults') && response.status() === 200);
                    await this.sleep(3000);
                    resultRows = await page.$x('//div[@class="t-grid-content"]/table/tbody/tr');
                    // console.log(resultRows.length);
                } catch (error) {
                    // console.log(error);
                    continue;
                }
                let nextPage = true;
                while (nextPage) {
                    resultRows = await page.$x('//div[@class="t-grid-content"]/table/tbody/tr');
                    let currentPageNumHandle = await page.$x('//div[@class="t-page-i-of-n"]/input');
                    let currentPageNum: any = await (await currentPageNumHandle[0].getProperty('value')).jsonValue();
                    console.log(docTypeSelect + " Current Page Number: " + currentPageNum + " Found: " + resultRows.length);
                    currentPageNum = parseInt(currentPageNum);
                    for (let i = 0; i < resultRows.length; i++) {
                        let names = [];
                        let indXpath = i + 1;
                        let caseIdHandle = await page.$x('//div[@class="t-grid-content"]/table/tbody/tr[' + indXpath + ']/td[9]');
                        let caseId = await caseIdHandle[0].evaluate(el => el.textContent?.trim());
                        let directNameHandle = await page.$x('//div[@class="t-grid-content"]/table/tbody/tr[' + indXpath + ']/td[3]');
                        let directName = await directNameHandle[0].evaluate(el => el.textContent?.trim());
                        names.push(directName);
                        let indirectNameHandle = await page.$x('//div[@class="t-grid-content"]/table/tbody/tr[' + indXpath + ']/td[4]');
                        let indirectName = await indirectNameHandle[0].evaluate(el => el.textContent?.trim());
                        names.push(indirectName);
                        let docTypeHandle = await page.$x('//div[@class="t-grid-content"]/table/tbody/tr[' + indXpath + ']/td[6]');
                        let docType = await docTypeHandle[0].evaluate(el => el.textContent?.trim());
                        let recordDateHandle = await page.$x('//div[@class="t-grid-content"]/table/tbody/tr[' + indXpath + ']/td[5]');
                        let recordDate = await recordDateHandle[0].evaluate(el => el.textContent?.trim());

                        let practiceType = this.getPracticeType(docType!);
                        if(practiceType == 'debt'){
                            if (docType == 'J/L' || docType == 'LN' || docType == 'NCL') {
                                practiceType = 'tax-lien';
                            } else if (docType == 'MAR' || docType == 'MAR_INACTIVE' || docType == 'MAR') {
                                practiceType = 'marriage';
                            } else if (docType == 'PRO') {
                                practiceType = 'probate';
                            } else if (docType == 'MTG') {
                                practiceType = 'mortgage-lien';
                            }
                        }
                        // console.log(directName, indirectName, caseId);
                        for (const name of names) {
                            if (this.isEmptyOrSpaces(name!)) {
                                continue;
                            }
                            // console.log(name);
                            const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                            const prod = await db.models.Product.findOne({ name: productName }).exec();
                            const parseName: any = this.newParseName(name!.trim());
                            if(parseName.type && parseName.type == 'COMPANY'){
                                continue;
                            }

                            const data = {
                                'Property State': this.publicRecordProducer.state,
                                'County': this.publicRecordProducer.county,
                                'First Name': parseName.firstName,
                                'Last Name': parseName.lastName,
                                'Middle Name': parseName.middleName,
                                'Name Suffix': parseName.suffix,
                                'Full Name': parseName.fullName,
                                "vacancyProcessed": false,
                                fillingDate: recordDate,
                                "productId": prod._id,
                                originalDocType: docType
                            };

                            if(await this.civilAndLienSaveToNewSchema(data)){
                                countRecords += 1;
                            }
                        }
                    }
                    let nextPageDisabled = await page.$x('//a[@class="t-link t-state-disabled"]/span[contains(text(), "next")]');
                    if (nextPageDisabled.length > 0) {
                        nextPage = false;
                    } else {
                        let nextPageNum = currentPageNum + 1;
                        let nextPageButton = await page.$x('//a[@class="t-link"]/span[contains(text(), "next")]');
                        await nextPageButton[0].click();
                        await page.waitForXPath('//div[@class="t-page-i-of-n"]/input[@value="' + nextPageNum + '"]', { visible: true });
                        await this.sleep(3000);
                    }
                }
            }
            
            console.log(countRecords);
            await AbstractProducer.sendMessage('Lake', 'Florida', countRecords, 'Civil & Lien');
            return true;
        } catch(e){
            console.log(e);
            await AbstractProducer.sendMessage('Lake', 'Florida', countRecords, 'Civil & Lien');
            return false;
        }
    }
}