import puppeteer from 'puppeteer';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import db from '../../../../../../models/db';
import SnsService from '../../../../../../services/sns_service';

const removeRowArray = [
    'CITY', 'DEPT', 'CTY', 'UNITED STATES', 'BANK', 'FIA CARD SERVICES NA',
    'FLORIDA PACE FUNDING AGENCY', 'COUNTY', 'CREDIT', 'HOSPITAL', 'FUNDING', 'UNIVERSITY',
    'MEDICAL', 'CONDOMINIUM ASSOCIATION', 'LOTS', 'TEXAS STATE', 'VETERANS', 'SECRETARY', 'DEPARTMENT',
    'INDIVIDUAL', 'INDIVIDUALLY', 'FINANCE', 'CITIBANK', 'MERS', 'STATE TAX COMMISSION', 'BUSINESS',
	'CU', 'BK', 'UN', 'PA', 'DOLLAR', 'ASSN', 'REVOLUTION', 'COMMUNITY', 'PLACE', 'SPECTRUM'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')

export default class CivilProducer extends AbstractProducer {
    urls = {
        generalInfoPage: 'https://pa_allegheny.uslandrecords.com/palr/'
    }

    xpaths = {
        isPageLoaded: '//td[@id="results"]/a[contains(text(), "Free Search")]'
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
            await this.browserPages.generalInfoPage.setDefaultNavigationTimeout(60000);
            await this.browserPages.generalInfoPage.goto(this.urls.generalInfoPage, {waitUntil: 'load'});
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
        let countRecords = 0;
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;

        try {            
            const dateRange = await this.getDateRange('Pennsylvania', 'Allegheny');
            let fromDate = this.getFormattedDate(dateRange.from);
            let toDate = this.getFormattedDate(dateRange.to);

            const officeTypes = ['60', '61'];
            for (const officeType of officeTypes) {
                // goto search page
                const freeHandle = await page.$x('//td[@id="results"]/a[contains(text(), "Free Search")]');
                const freeResult = await this.waitForSuccess(async () => {
                    await Promise.all([
                        freeHandle[0].click(),
                        page.waitForNavigation()
                    ])
                });
                if (!freeResult) {
                    return false;
                };

                const docSearchHandle = await page.$x('//button[@name="Button2"]');
                const docResult = await this.waitForSuccess(async () => {
                    await Promise.all([
                        docSearchHandle[0].click(),
                        page.waitForNavigation()
                    ])
                });
                if (!docResult) {
                    return false;
                }

                page.waitForXPath('//img[@src="images/instrumentsearch.gif"]');
                page.waitFor(3000)

                 // setting office type
                await page.select('select[name="officeid"]', officeType);
                await page.waitForNavigation();
                await page.waitFor(1000);

                // setting the date range                
                const [fromDateHandle] = await page.$x('//input[@name="fromdate"]');
                const [toDateHandle] = await page.$x('//input[@name="todate"]');
                await fromDateHandle.focus();
                await fromDateHandle.click({clickCount: 3});
                await fromDateHandle.press('Backspace');
                await fromDateHandle.type(fromDate, {delay: 100});
                // await page.waitFor(3000);
                await toDateHandle.focus();
                await toDateHandle.click({clickCount: 3});
                await toDateHandle.press('Backspace');
                await toDateHandle.type(toDate, {delay: 100});

                // click search button
                const [searchButtonHandle] = await page.$x('//b[contains(text(), "Search now")]/parent::font/parent::a');
                const searchBtnResult = await this.waitForSuccess(async () => {
                    await Promise.all([
                        searchButtonHandle.click(),
                        page.waitForNavigation()
                    ]);
                });
                if (!searchBtnResult) {
                    return false;
                };
                let pageNum = 1, isLast = false, tableXpath = '//div[@id="detail"]/table/tbody//tr[contains(@onmouseover, "bgColor")]';
                while (!isLast) {
                    let results = await page.$x(tableXpath);
                    if (results.length > 0) {
                        await page.waitForXPath(`//b[text()="Result Matches:"]/parent::font[contains(text(), "${(pageNum - 1) * 20 + 1} - ")]`)
                        await page.waitForXPath(tableXpath);
                        results = await page.$x(tableXpath);
                        let typeArray: any = [], caseArray: any = [], dateArray: any = [];
                        for (let i = 0; i < results.length; i++) {
                            let type = await results[i].evaluate(el => el.children[3].children[0].textContent?.trim());
                            type = type?.replace('&nbsp;', '').trim();
                            typeArray.push(type);
                            let caseID = await results[i].evaluate(el => el.children[1].children[0].children[0].textContent?.trim());
                            caseID?.replace('&nbsp;', '').trim();
                            caseArray.push(caseID);
                            let date = await results[i].evaluate(el => el.children[2].children[0].textContent?.trim());
                            date = date?.replace('&nbsp;', '').trim();
                            dateArray.push(date);
                        }
                        for (let i = 0; i < results.length; i++) {
                            const result = await this.waitForSuccess(async () => {
                                await Promise.all([
                                    page.click(`table > tbody > tr[onmouseover]:nth-child(${i + 2}) > td:nth-child(2) > a`),
                                    page.waitForNavigation()
                                ])
                            })
                            if (!result) {
                                return false;
                            }
                            let namesHandles =  await page.$x('//div[@id="detail"]/form[@name="frmdetail"]/center/table[1]//b[contains(text(), "ee")]/parent::td/parent::tr/td[2]//a/font');
                            for (const nameHandle of namesHandles) {
                                const name = await nameHandle.evaluate(el => el.textContent?.trim());
                                if (this.isEmptyOrSpaces(name!) || removeRowRegex.test(name!)) {
                                    continue;
                                }
                                const result = this.newParseName(name!);
                                const {type:nameType} = result as any;
                                if (!nameType || nameType == 'LLC') {
                                    if (await this.getData(page, name, typeArray[i], dateArray[i], caseArray[i])) {
                                        countRecords++
                                    }            
                                }
                                
                            }

                            await Promise.all([
                                page.goBack(),
                                page.waitForNavigation(),
                                this.sleep(500)
                            ])   
                        }

                        let nextEl = await page.$x('//a[text()="Next"]');
                        if (nextEl.length > 0) {
                            pageNum++;
                            isLast = false;
                            await nextEl[0].click();
                            await page.waitForNavigation();
                        } else {
                            isLast = true;
                        }
                    } else {
                        console.log('No Results');
                        await this.sleep(3000);
                        break;
                    }             
                }
            }    
            
            await AbstractProducer.sendMessage('Allegheny', 'Pennsylvania', countRecords, 'Civil & Lien');
            await page.close();
            await this.browser?.close();
            return true;
        }
        catch (error) {
            console.log('Error: ', error);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Allegheny', 'Pennsylvania', countRecords, 'Civil & Lien', errorImage);
        }

        return false;
    }

    async waitForSuccess(func: Function): Promise<boolean> {
        let retry_count = 0;
        while (true){
            if (retry_count > 30){
                console.error('Connection/website error for 30 iteration.');
                return false;
            }
            try {
                await func();
                break;
            }
            catch (error) {
                retry_count++;
                console.log(`retrying search -- ${retry_count}`);
            }
        }
        return true;
    }

    async getData(page: puppeteer.Page, name: any, type: any, date: any, caseID: any): Promise<any> {
        const { firstName, lastName, middleName, fullName, suffix } = this.newParseName(name!);

        let practiceType = this.getPracticeType(type);
        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({ name: productName }).exec();

        const data = {
            'caseUniqueId': caseID,
            'Property State': 'PA',
            'County': 'Allegheny',
            'First Name': firstName,
            'Last Name': lastName,
            'Middle Name': middleName,
            'Name Suffix': suffix,
            'Full Name': fullName,
            "vacancyProcessed": false,
            fillingDate: date,
            'productId': prod._id,
            originalDocType: type
        };

        return (await this.civilAndLienSaveToNewSchema(data));
    }
     // To check empty or space
    isEmptyOrSpaces(str: string) {
        return str === null || str.match(/^\s*$/) !== null;
    }
}