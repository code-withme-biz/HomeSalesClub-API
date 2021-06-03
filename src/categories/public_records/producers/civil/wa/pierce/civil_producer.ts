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
    'CU', 'BK', 'UN', 'PA', 'DOLLAR', 'ASSN', 'REVOLUTION', 'COMMUNITY', 'PLACE', 'SPECTRUM',
    'BAR OF CALIFORNIA', 'COMPENSATION', 'STATE', 'TARGET', 'CAPISTRANO', 'UNIFIED', 'CENTER', 'WEST',
    'MASSAGE', 'INTERINSURANCE', 'PARTNERS', 'COLLECTIONS', 'N A', 'OFFICE', 'HUMAN', 'FAMILY',
    'INTERBANK', 'BBVA', 'HEIRS', 'EECU', 'BBVA', 'FIRSTBANK', 'GROUP', 'INTERBANK', 'GRANTEE', 'SCHOOL', 'DELETE', 'LIVING', 
    'LOANDEPOTCOM', 'JOINT', 'TEXASLENDINGCOM', 'FINANCIAL', 'PRIMELENDING', 'BOKF', 'USAA', 'IBERIABANK',
    'DBA', 'GOODMORTGAGECOM', 'BENEFICIARY', 'HOMEBUYERS', 'NEXBANK', 'ACCESSBANK', 'PROFIT', 'DATCU',
    'CFBANK', 'CORPORTION', 'LOANDEPOTCOM', 'CAPITAL', 'HOMEBANK', 'FSB', 'FELLOWSHIP', 'ASSOCIATES',
    'ACADEMY', 'VENTURE', 'REVOCABLE', 'CONSTRUCTION', 'HOMETOWN', 'ORANGE', 'CALIFORNIA', 'X',
    'NATIONALBK', 'MICHIGAN', 'FOUNDATION', 'GRAPHICS', 'UNITY', 'NORTHPARK', 'PLAZA', 'FOREST', 'REALTY', 
    'OUTDOORSOLUTIONS', 'NEWREZ', 'LOANPAL', 'MICROF', 'GRAPHICS', 'CARRINGTON', 'COLORADO', 'DISTRICT',
    'CLUB', 'GIVEN', 'NONE', 'INIMPENDENT', 'TRUS', 'AND', 'TRUST', 'CLINTON', 'WASHINGTON', 'NATIONWIDE',
    'INVESTMENT'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')

export default class CivilProducer extends AbstractProducer {
    urls = {
        generalInfoPage: 'https://armsweb.co.pierce.wa.us/'
    }

    xpaths = {
        isPageLoaded: `//a[@id="cph1_lnkAccept"]`
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
            await this.browserPages.generalInfoPage.setDefaultTimeout(60000);
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

        try {          
            try {
                const [claimHandle] = await page.$x('//a[@id="cph1_lnkAccept"]');
                await claimHandle.click();
                await page.waitForNavigation();
            } catch (error) {
                console.log(error);
                return false;
            }

            const docHandle = await page.$x('//a/span[text()="Recorded Documents"]');
            await docHandle[0].click();
            await page.waitForXPath('//a/span[text()="Search Documents"]');
            const searchHandle = await page.$x('//a/span[text()="Search Documents"]');
            await searchHandle[0].click();
            await page.waitForNavigation();

            await page.waitForSelector('u[ig_b="cphNoMargin_SearchButtons1_btnSearch"]');

            const dateRange = await this.getDateRange('Washington', 'Pierce');
            let fromDate = this.getFormattedDate(dateRange.from);
            let toDate = this.getFormattedDate(dateRange.to);
            let countRecords = 0;

            // setting date range
            const fromDateHandle = await page.$x(`//table[@id="cphNoMargin_f_ddcDateFiledFrom"]//tr/td[1]/input`);
            const toDateHandle = await page.$x(`//table[@id="cphNoMargin_f_ddcDateFiledTo"]//tr/td[1]/input`)
            await fromDateHandle[0].click();
            await fromDateHandle[0].type(fromDate, {delay: 100});
            await toDateHandle[0].click();
            await toDateHandle[0].type(toDate, {delay: 100});

            // setting doc types
            const docTypeList = await page.$x('//table[@id="cphNoMargin_f_dclDocType"]//tr');
            for (let i = 0; i < docTypeList.length; i++) {
                await page.click(`input#cphNoMargin_f_dclDocType_${i}`);
            }

            // click search button
            const result = await this.waitForSuccess(async () => {
                await Promise.all([
                    page.click('u[ig_b="cphNoMargin_SearchButtons1_btnSearch"]'),
                    page.waitForNavigation()
                ])
            });
            if (!result) {
                return false;
            }

            // get full count
            await page.click('a#cphNoMargin_cphNoMargin_SearchCriteriaTop_FullCount1');
            await page.waitForXPath('//a[text()="count again"]', {visible: true});
            await this.sleep(3000)

            // getting data
            let results = await page.$x('//tr[contains(@data-ig, "x:1533160306.14:adr:")]');
            if (results.length > 0) {
                let isLast = false, pageNum = 1;
                while (!isLast) {
                    results = await page.$x('//tr[contains(@data-ig, "x:1533160306.14:adr:")]');
                    for (let i = 0; i < results.length; i++) {
                        const caseID = await results[i].evaluate(el => el.children[3].children[0].textContent?.trim());
                        const date = await results[i].evaluate(el => el.children[7].textContent?.trim());
                        const type = await results[i].evaluate(el => el.children[9].textContent?.trim());
                        const nameHandles = await page.$x(`//tr[@data-ig="x:1533160306.14:adr:${i}:tag::chlGCnt:0:exp:False:iep:False:ppd:False"]/td[12]/div/span[2]`);
                        for (const nameHandle of nameHandles) {
                            let name = await nameHandle.evaluate(el => el.textContent?.trim());
                            name = name?.replace(/[^a-zA-Z ]/g, '');
                            if (name?.includes('LAST NAME FIRST NAME MIDDLE INITIAL ')) {
                                name.replace('LAST NAME FIRST NAME MIDDLE INITIAL ', '');
                            }
                            if (this.isEmptyOrSpaces(name!)) {
                                continue;
                            }
                            if (removeRowRegex.test(name!)) {
                                continue;
                            }        
                            if (await this.getData(page, name!.trim(), type, date, caseID)) {
                                countRecords++
                            }  
                        }
                    }
                    const nextEl = await page.$x('//input[@id="OptionsBar1_imgNext"]');
                    const val = await nextEl[0].evaluate(el => el.getAttribute('disabled'));
                    if (val == null) {
                        isLast = false;
                        pageNum++;
                        await nextEl[0].click();
                        await page.waitForNavigation();    
                    } else {
                        isLast = true;
                    }
                    
                }
            } else {
                console.log('No Records');
            }

            await AbstractProducer.sendMessage('Pierce', 'Washington', countRecords, 'Civil & Lien');
            return true;
        }
        catch (error) {
            console.log('Error: ', error);
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
        const parserName: any = this.newParseName(name!);
        if(parserName.type && parserName.type == 'COMPANY'){
            return false;
        }
        const { firstName, lastName, middleName, fullName, suffix } = this.newParseName(name!);
        let practiceType = this.getPracticeType(type);
        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({ name: productName }).exec();

        const data = {
            'caseUniqueId': caseID,
            'Property State': 'WA',
            'County': 'Pierce',
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