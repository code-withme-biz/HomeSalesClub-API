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
        generalInfoPage: 'https://vaclmweb1.brevardclerk.us/AcclaimWeb/search/SearchTypeDocType'
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

    // This is main function
    async parseAndSave(): Promise<boolean> {
        let countRecords = 0;
        try{
            const civilUrl: string = 'https://vaclmweb1.brevardclerk.us/AcclaimWeb/search/SearchTypeDocType';
            let dateRange = await this.getDateRange('Florida', 'Brevard');
            let fromDate = dateRange.from;
            let toDate = dateRange.to;
            let page = this.browserPages.generalInfoPage!;
            let tosSubmit = await page.$x('//input[@value="I accept the conditions above."]');
            await Promise.all([tosSubmit[0].click(),
            page.waitForNavigation()
            ]);
            while (fromDate <= toDate) {
                let docTypeSelects = ['Deeds', 'Divorce', 'Marriage License', 'Mortgages'];
                for (const docTypeSelect of docTypeSelects) {
                    let dateStringDay = this.getFormattedDate(fromDate);
                    console.log("Processing: ",docTypeSelect,dateStringDay);
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
                    await page.type('#RecordDateFrom', dateStringDay);
                    await page.type('#RecordDateTo', dateStringDay);
                    await page.click('#btnSearch');
                    let resultRows;
                    try {
                        await page.waitForResponse((response: any) => response.url().includes('Search/GridResults') && response.status() === 200);
                        await this.sleep(3000);
                        resultRows = await page.$x('//div[@class="t-grid-content"]/table/tbody/tr');
                    } catch (error) {
                        console.log("Not found!");
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
                            // console.log(directName, indirectName, caseId);
                            for (const name of names) {
                                const parseName: any = this.newParseName(name!.trim());
                                if(parseName.type && parseName.type == 'COMPANY'){
                                    continue;
                                }
                                const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                                const prod = await db.models.Product.findOne({ name: productName }).exec();
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
                fromDate.setDate(fromDate.getDate() + 1);
                await this.randomSleepIn5Sec();
            }
            
            console.log(countRecords);
            await AbstractProducer.sendMessage('Brevard', 'Florida', countRecords, 'Civil & Lien');
            return true;
        } catch (error){
            console.log(error);
            await AbstractProducer.sendMessage('Brevard', 'Florida', countRecords, 'Civil & Lien');
            return false;
        }
    }
}