import puppeteer from 'puppeteer';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import db from '../../../../../../models/db';
import SnsService from '../../../../../../services/sns_service';

const removeRowArray = [
    'CITY', 'DEPT', 'CTY', 'UNITED STATES', 'BANK', 'FIA CARD SERVICES NA',
    'FLORIDA PACE FUNDING AGENCY', 'COUNTY', 'CREDIT', 'HOSPITAL', 'FUNDING', 'UNIVERSITY',
    'MEDICAL', 'CONDOMINIUM ASSOCIATION', 'LOTS', 'TEXAS STATE', 'VETERANS', 'SECRETARY', 'DEPARTMENT',
    'INDIVIDUAL', 'INDIVIDUALLY', 'FINANCE', 'CITIBANK', 'MERS', 'STATE TAX COMMISSION'
];
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i');

export default class CivilProducer extends AbstractProducer {
    urls = {
        generalInfoPage: 'https://www.nylandrecords.com/nylr/NylrApp/index.jsp'
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
            const dateRange = await this.getDateRange('New York', 'Rockland');
            let fromDate = this.getFormattedDate(dateRange.from);
            let toDate = this.getFormattedDate(dateRange.to);

            // select orleans county
            try {                
                await page.select('select[name="countycode"]', `javascript:clickCounty("ny073")`);
                await page.waitForNavigation();
            } catch (error) {
                console.log(error);
                await AbstractProducer.sendMessage('Orleans', 'New York', countRecords, 'Civil & Lien');
                return false;
            }
            
            // select date search
            await page.waitForSelector('select[name="searchType"]', {visible: true});
            await page.select('select[name="searchType"]', 'searchByDateType');

            // setting date range
            const fromDateHandle = await page.$x('//input[@name="fromdate"]');
            const toDateHandle = await page.$x('//input[@name="todate"]');
            await fromDateHandle[0].click({clickCount: 3});
            await fromDateHandle[0].press('Backspace');
            await fromDateHandle[0].type(fromDate, {delay: 100});
            await toDateHandle[0].click({clickCount: 3});
            await toDateHandle[0].press('Backspace');
            await toDateHandle[0].type(toDate, {delay: 100});

            // click search button
            const searchBtnHandle = await page.$x('//input[@id="inputbutton"]');
            await searchBtnHandle[0].click();
            await page.waitForNavigation();

            let docTypes = ['DEED', 'TAX LIEN', 'LIS PENDENS', 'MORTGAGE'];
            let pageNum = 1;
            let isLast = false;
            while (!isLast) {
                await page.waitForXPath('//div[@id="searchResults"]/table/tbody/tr[2]/td[2]/table[2]/tbody/tr[contains(@id, "myRow")]');
                let results = await page.$x('//div[@id="searchResults"]/table/tbody/tr[2]/td[2]/table[2]/tbody/tr[contains(@id, "myRow")]');
                let typeArray: any = [], caseArray: any = [], dateArray: any = [];
                await this.randomSleepIn5Sec()

                if (results.length > 0) {
                    console.log(results.length);
                    if (pageNum == 1) {
                        let nextEl = await page.$x('//a[text()="Next"]');
                        if (nextEl.length > 0) {
                            await nextEl[0].click();
                            await page.waitForXPath('//b[text()="Result Matches:"]/parent::font[contains(text(), "21 - 40")]');
                            let prevEL = await page.$x('//a[text()="Previous"]');
                            await prevEL[0].click();
                            await page.waitForNavigation();
                            await page.waitForXPath('//b[text()="Result Matches:"]/parent::font[contains(text(), "1 - 20")]');
                            await page.waitForXPath('//div[@id="searchResults"]/table/tbody/tr[2]/td[2]/table[2]/tbody/tr[contains(@id, "myRow")]');
                        }
                        results = await page.$x('//div[@id="searchResults"]/table/tbody/tr[2]/td[2]/table[2]/tbody/tr[contains(@id, "myRow")]');
                    }
                    for (let i = 0; i < results.length; i++) {
                        let type = await results[i].evaluate(el => el.children[4].children[0].textContent?.trim());
                        type = type?.replace('&nbsp;', '').trim();
                        typeArray.push(type);
                        let caseID;
                        if (pageNum == 1) {
                            caseID = await results[i].evaluate(el => el.children[1].children[0].textContent?.trim());
                        } else {
                            caseID = await results[i].evaluate(el => el.children[7].children[0].textContent?.trim());
                        }
                        caseID?.replace('&nbsp;', '').trim();
                        caseArray.push(caseID);
                        let date = await results[i].evaluate(el => el.children[2].children[0].textContent?.trim());
                        date = date?.split(' ')[0].trim();
                        dateArray.push(date);
                    }

                    for (let i = 0; i < results.length; i++) {
                        let type = typeArray[i]
                        if (type?.includes(docTypes[0]) || type?.includes(docTypes[1]) || type?.includes(docTypes[2]) || type?.includes(docTypes[3])) {
                            const result = await this.waitForSuccess(async () => {
                                await Promise.all([
                                    page.click(`div#searchResults > table > tbody > tr:nth-child(2) > td:nth-child(2) > table:nth-child(2) > tbody > tr:nth-child(${i + 2}) > td:nth-child(2) > a`),
                                    page.waitForNavigation()
                                ])
                            })
                            if (!result) {
                                return false;
                            }
                            let namesHandles =  await page.$x('//td[@id="bottom"]/b[text()="Grantee"]/parent::td/parent::tr/td[2]/table/tbody/tr//a/font');
                            for (const nameHandle of namesHandles) {
                                const name = await nameHandle.evaluate(el => el.textContent?.trim());
                                if (this.isEmptyOrSpaces(name!)) {
                                    continue;
                                }
                                if (await this.getData(page, name, type, dateArray[i], caseArray[i])) {
                                    countRecords++
                                }                                   
                            }
                            await Promise.all([
                                page.goBack(),
                                page.waitForNavigation()
                            ])   
                        } else {
                            continue;
                        }
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
                    console.log('No Record Found');
                    break;
                }
            }

            await AbstractProducer.sendMessage('Orleans', 'New York', countRecords, 'Civil & Lien');
            await page.close();
            await this.browser?.close();
            return true;
        }
        catch (error) {
            console.log('Error: ', error);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Orleans', 'New York', countRecords, 'Civil & Lien', errorImage);
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
            }
        }
        return true;
    }

    async getData(page: puppeteer.Page, name: any, type: any, date: any, caseID: any): Promise<any> {
        if (removeRowRegex.test(name)) return false;
        const parseName: any = this.newParseName(name.trim())
        if (parseName?.type && parseName?.type == 'COMPANY') return false;

        let practiceType = this.getPracticeType(type)

        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({ name: productName }).exec();
        
        const data = {
            'caseUniqueId': caseID,
            'Property State': 'NY',
            'County': 'Orleans',
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
     // To check empty or space
    isEmptyOrSpaces(str: string) {
        return str === null || str.match(/^\s*$/) !== null;
    }
}