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
        generalInfoPage: 'https://pa.uslandrecords.com/palr2/PalrApp/index.jsp'
    }

    xpaths = {
        isPageLoaded: '//select[@name="countycode"]'
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
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let countRecords = 0;
        try {            
            // select Wayne county
            const selectCountyResult = await this.waitForSuccess(async () => {
                await Promise.all([
                    page.select('select[name="countycode"]', 'pa127'),
                    page.waitForNavigation()
                ])
            })
            if (!selectCountyResult) {
                return false;
            }

            // setting date search
            await page.waitForXPath('//a[text()="Date Search"]/parent::h3');
            const [dateSearch] = await page.$x('//a[text()="Date Search"]/parent::h3');
            const selectDateResult = await this.waitForSuccess(async () => {
                await Promise.all([
                    dateSearch.click(),
                    page.waitForXPath('//a[text()="Date Search"]/parent::h3/span[@class="ui-icon ui-icon-triangle-1-s"]'),
                    page.waitFor(1000)
                ])
            })

            if (!selectDateResult) {
                return false
            }
            
            // setting date range
            const dateRange = await this.getDateRange('Pennsylvania', 'Wayne');
            let fromDate = this.getFormattedDate(dateRange.from);
            let toDate = this.getFormattedDate(dateRange.to);
            const fromDateHandle = await page.$x('//input[@name="fromdate"]');
            const toDateHandle = await page.$x('//input[@name="todate"]');
            await fromDateHandle[0].click({clickCount: 3});
            await fromDateHandle[0].press('Backspace');
            await fromDateHandle[0].type(fromDate, {delay: 100});
            await page.waitFor(3000)
            await toDateHandle[0].focus();
            await toDateHandle[0].click({clickCount: 4});
            await toDateHandle[0].press('Backspace');
            await toDateHandle[0].type(toDate, {delay: 100});

            // click search button
            const [searchButton] = await page.$x('//button[@id="inputbutton"]');
            const clickResult = await this.waitForSuccess(async () => {
                await Promise.all([
                    searchButton.click(),
                    page.waitForNavigation()
                ])
            })
            if (!clickResult) {
                return false;
            }

            let pageNum = 1, isLast = false;
            while (!isLast) {
                await page.waitForXPath('//div[@id="searchResults"]/table/tbody/tr[2]/td[2]/table[2]/tbody/tr[contains(@id, "myRow")]');
                let results = await page.$x('//div[@id="searchResults"]/table/tbody/tr[2]/td[2]/table[2]/tbody/tr[contains(@id, "myRow")]');
                if (results.length > 0) {
                    let typeArray: any = [], caseArray: any = [], dateArray: any = [];
                    for (let i = 0; i < results.length; i++) {
                        let type = await results[i].evaluate(el => el.children[2].children[0].textContent?.trim());
                        type = type?.replace('&nbsp;', '').trim();
                        typeArray.push(type);
                        let caseID = await results[i].evaluate(el => el.children[1].children[0].children[0].textContent?.trim());
                        caseID?.replace('&nbsp;', '').trim();
                        caseArray.push(caseID);
                        let date = await results[i].evaluate(el => el.children[3].children[0].textContent?.trim());
                        date = date?.replace('&nbsp;', '').trim();
                        dateArray.push(date);
                    }
                    for (let i = 0; i < results.length; i++) {
                        const result = await this.waitForSuccess(async () => {
                            await Promise.all([
                                page.click(`div#searchResults > table > tbody > tr:nth-child(2) > td:nth-child(2) > table tr[id*="myRow"]:nth-child(${i + 2}) > td:nth-child(2) > a`),
                                page.waitForNavigation()
                            ])
                        })
                        if (!result) {
                            return false;
                        }
                        let namesHandles =  await page.$x('//font[contains(text(), "Grantee")]/parent::td/parent::tr/td[2]/a/font');
                        for (const nameHandle of namesHandles) {
                            const name = await nameHandle.evaluate(el => el.textContent?.trim());
                            if (this.isEmptyOrSpaces(name!) || removeRowRegex.test(name!)) {
                                continue;
                            }
                            const parserName: any = this.newParseName(name!);
                            if(parserName.type && parserName.type == 'COMPANY'){
                                continue;
                            }
                            if (await this.getData(page, name, typeArray[i], dateArray[i], caseArray[i])) {
                                countRecords++
                            }      
                        }
                        await Promise.all([
                            page.goBack(),
                            page.waitForNavigation()
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
                    break;
                }             
            }
            
            await AbstractProducer.sendMessage('Wayne', 'Pennsylvania', countRecords, 'Civil & Lien');
            await page.close();
            await this.browser?.close();
            return true;
        }
        catch (error) {
            console.log('Error: ', error);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Wayne', 'Pennsylvania', countRecords, 'Civil & Lien', errorImage);
        }

        return false;
    }

    async waitForSuccess(func: Function): Promise<boolean> {
        let retry_count = 0;
        while (true){
            if (retry_count > 3){
                console.error('Connection/website error for 15 iteration.');
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
            'County': 'Wayne',
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