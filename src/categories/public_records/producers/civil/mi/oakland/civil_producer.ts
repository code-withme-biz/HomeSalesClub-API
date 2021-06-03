import puppeteer from 'puppeteer';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import db from '../../../../../../models/db';
import SnsService from '../../../../../../services/sns_service';
import { promises } from 'dns';

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
    'OUTDOORSOLUTIONS', 'NEWREZ', 'LOANPAL', 'MICROF', 'GRAPHICS', 'CARRINGTON'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')

export default class CivilProducer extends AbstractProducer {
    urls = {
        generalInfoPage: 'https://ocmideeds.com/#advanced'
    }

    xpaths = {
        isPageLoaded: `//i[@class="icon-search"]/parent::button`
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

        const dateRange = await this.getDateRange('Michigan', 'Oakland');
        let fromDate = this.getFormattedDate(dateRange.from);
        let toDate = this.getFormattedDate(dateRange.to);
        let countRecords = 0;

        try {          
            await page.waitForXPath('//input[@id="inputRecordedDateFrom"]', {visible: true});
            await this.sleep(3000);
            const fromDateHandle = await page.$x('//input[@id="inputRecordedDateFrom"]');
            const toDateHandle = await page.$x('//input[@id="inputRecordedDateTo"]');
            await fromDateHandle[0].type(fromDate, {delay: 100});
            await toDateHandle[0].type(toDate, {delay: 100});

            // click search button
            const searchHandle = await page.$x('//i[@class="icon-search"]/parent::button');
            const searchResult = this.waitForSuccess(async () => {
                await Promise.all([
                    searchHandle[0].click(),
                    page.waitForXPath('//table[@id="gridResults"]/thead')
                ])
            });
            if (!searchResult) {
                return false;
            }

            try {
                await page.waitForXPath('//small[contains(text(), "Total Matches")]', {visible: true});
            } catch (error) {
                console.log('No Records')
                await AbstractProducer.sendMessage('Oakland', 'Michigan', countRecords, 'Civil & Lien');
                return false;
            }

            let isLast = false, pageNum = 1;
            while (!isLast) {
                if (pageNum > 1) {
                    await page.waitForXPath('//button[@id="nextnavbtn"]', {visible: true});
                }
                let results = await page.$x('//table[@id="gridResults"]/tbody/tr');
                results = await page.$x('//table[@id="gridResults"]/tbody/tr');
                for (let i = 0; i < results.length; i++) {
                    const caseHandle = await page.$x(`//table[@id="gridResults"]/tbody/tr[${i + 1}]/td[3]//a`)
                    let href = await caseHandle[0].evaluate(el => el.getAttribute('href'));
                    let caseID = href?.split(' ')[0].replace(/\D/g, '');
                    const typeHandle = await page.$x(`//table[@id="gridResults"]/tbody/tr[${i + 1}]/td[3]//span`);
                    const type = await typeHandle[0].evaluate(el => el.textContent?.trim());
                    const dateHandle = await page.$x(`//table[@id="gridResults"]/tbody/tr[${i + 1}]/td[4]//span`);
                    const date1 = await dateHandle[0].evaluate(el => el.textContent?.trim());
                    let date2 = new Date(date1!);
                    let date = date2.toLocaleDateString('en-US', {year: 'numeric', month: '2-digit', day: '2-digit'});
                    const nameHandles = await page.$x(`//table[@id="gridResults"]/tbody/tr[${i + 1}]/td[8]//tr//span`);
                    for (const nameHandle of nameHandles) {
                        let name = await nameHandle.evaluate(el => el.textContent?.trim());
                        if (this.isEmptyOrSpaces(name!)) {
                            continue;
                        }
                        if (removeRowRegex.test(name!)) {
                            continue;
                        }
                        const parserName: any = this.newParseName(name!);
                        if(parserName.type && parserName.type == 'COMPANY'){
                            continue;
                        }
                        if (await this.getData(page, name, type, date, caseID)) {
                            countRecords++
                        }  
                    }
                }
                
                const nextEL = await page.$x('//button[@id="nextnavbtn"]');
                const nextELClass = await nextEL[0].evaluate(el => el.getAttribute('class'));
                if (nextELClass?.includes('disabled')) {
                    isLast = true;
                } else {
                    isLast = false;
                    pageNum++;
                    await nextEL[0].click();
                    await page.waitForXPath('//small[contains(text(), "Total Matches")]', {visible: true});
                    await page.waitForXPath('//table[@id="gridResults"]/tbody/tr', {visible: true});
                    await page.waitFor(3000)
                }
            }

            await AbstractProducer.sendMessage('Oakland', 'Michigan', countRecords, 'Civil & Lien');
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
        const { firstName, lastName, middleName, fullName, suffix } = this.newParseName(name!);
        let practiceType = this.getPracticeType(type);
        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({ name: productName }).exec();
        
        const data = {
            'caseUniqueId': caseID,
            'Property State': 'MI',
            'County': 'Oakland',
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