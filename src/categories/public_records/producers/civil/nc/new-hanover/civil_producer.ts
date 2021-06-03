import puppeteer from 'puppeteer';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import db from '../../../../../../models/db';

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
    'ACADEMY', 'VENTURE', 'REVOCABLE', 'CONSTRUCTION', 'HOMETOWN', 'ORANGE', 'CALIFORNIA', 'TRANSPORT', 'NON-RECORD', 
    'CHICAGO', 'STATE', 'COMP', 'SUMMIT', 'COURTS', 'CONDOMINIU', 'FINANCIAL', 'OFFICE', 'FORETHOUGHT', 'COM', 'ST', 'WORKERS',
    'MARKET', 'ENERGY', 'GOVERNMENT', 'IDOC', 'DPRT', 'ELECTRIC', 'TRADITIONS', 'REGIONAL', 'WELCOME', 'LILLIE',
    'UNKNOWN', 'VILLAGE', 'TRANSPORTATION', 'GLENVIEW', 'CPD', 'CENTRAL', 'NONE', 'Defender', 'Baltimore', 'Inc',
    'INTERNATIONAL', 'NOBODY', 'INCORPORATED'
];
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i');

export default class CivilProducer extends AbstractProducer {
    urls = {
        generalInfoPage: 'https://search.newhanoverdeeds.com/NameSearch.php?Accept=Accept'
    }

    xpaths = {
        isPageLoaded: '//form/table[1]/tbody/tr[4]//input[@value="Search"]'
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
            const dateRange = await this.getDateRange('North Carolina', 'New Hanover');
            let date = dateRange.from;
            let today = dateRange.to;
            let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24));
            for (let i = days < 0 ? 1 : days; i >= 0; i--) {
                let dateSearch = new Date();
                dateSearch.setDate(dateSearch.getDate() - i);
                console.log('Start search with date: ', dateSearch.toLocaleDateString('en-US'));   
                const dateHandle = await page.$x('//form/table[1]/tbody/tr[4]//input[contains(@id, "date")]');
                await dateHandle[0].focus()
                await this.sleep(500);
                await dateHandle[0].type(' ' + dateSearch.toLocaleDateString('en-US', {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit"
                }), { delay: 100 })
                await dateHandle[0].press('Enter');

                await dateHandle[1].focus()
                await this.sleep(500);
                await dateHandle[1].type(' ' + dateSearch.toLocaleDateString('en-US', {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit"
                }), { delay: 100 })
                await dateHandle[1].press('Enter');

                await this.sleep(1000)

                const searchHandle = await page.$x('//form/table[1]/tbody/tr[4]//input[@value="Search"]');
                let retry_count = 0;
                while (true){
                    if (retry_count > 14){
                        console.error('Connection/website error for 15 iteration.');
                        return false;
                    }
                    try {
                        await Promise.all([
                            searchHandle[0].click(),
                            page.waitForNavigation()
                        ]);
                        break;
                    }
                    catch (e) {
                        retry_count++;
                        console.log('retrying search records data...', retry_count)
                    }
                }

                const rowsXpath = '//tr[contains(@style, "cur")]';
                const rows = await page.$x('//tr[contains(@style, "cur")]');
                if (rows.length > 0) {
                    for (let j = 0; j < rows.length; j++) {
                        const lastNameHandle = await page.$x(rowsXpath + `[${j + 1}]/td[2]`);
                        let lastName = await lastNameHandle[0].evaluate(el => el.textContent?.trim());
                        const firstNameHandle = await page.$x(rowsXpath + `[${j + 1}]/td[3]`);
                        let firstName = await firstNameHandle[0].evaluate(el => el.textContent?.trim());
                        let name = lastName + ' ' + firstName;
                        if (this.isEmptyOrSpaces(name!) || removeRowRegex.test(name!)) {
                            continue;
                        }
                        const parserName: any = this.newParseName(name!);
                        if(parserName.type && parserName.type == 'COMPANY'){
                            continue;
                        }
                        const clickHandle = await page.$x(rowsXpath + `[${j + 1}]/td[1]/input`);
                        await clickHandle[0].click();
                        await this.sleep(1000);
                        await page.click('#displaybutton')

                        let retry_count1 = 0;
                        while (true){
                            if (retry_count1 > 14){
                                console.error('Connection/website error for 15 iteration.');
                                return false;
                            }
                            try {
                                await page.waitForNavigation();
                                break;
                            }
                            catch (e1) {
                                retry_count1++;
                                console.log('retrying displaying data ...', retry_count1)
                            }
                        }
                        
                        const resultXpath = '//body/table/tbody/tr/td/table[1]/tbody/tr';
                        const results = await page.$x(resultXpath);
                        for (let k = 4; k < results.length; k++) {
                            let bgColor = await results[k].evaluate(el => el.getAttribute('bgcolor'));
                            if (bgColor) {
                                continue;
                            } else {
                                let str = await results[k].evaluate(el => el.children[0].children[0].textContent?.trim()); 
                                if (str?.includes('Grantee')) {
                                    for (let l = k + 2; l < results.length - 1; l++) {
                                        let date = await results[l].evaluate(el => el.children[0].children[0].textContent?.trim());
                                        let caseID = await results[l].evaluate(el => el.children[1].textContent?.trim());
                                        let type = await results[l].evaluate(el => el.children[2].textContent?.trim());
                                        if (await this.getData(page, name, type, date, caseID)) {
                                            countRecords++
                                        };
                                    }
                                }
                            }
                        }
                        let retry_count2 = 0;
                        while (true){
                            if (retry_count2 > 14){
                                console.error('Connection/website error for 15 iteration.');
                                return false;
                            }
                            try {
                                await Promise.all([
                                    page.click('input[value="Name Pick"]'),
                                    page.waitForNavigation()
                                ])
                                break;
                            }
                            catch (e2) {
                                retry_count2++;
                                console.log('retrying picking name...', retry_count2)
                            }
                        }
                    }
                } 
                let retry_count3 = 0;
                while (true){
                    if (retry_count3 > 14){
                        console.error('Connection/website error for 15 iteration.');
                        return false;
                    }
                    try {
                        await Promise.all([
                            page.click('input[value="Back to Look Up"]'),
                            page.waitForNavigation()
                        ])
                        break;
                    }
                    catch (e3) {
                        retry_count3++;
                        console.log('retrying back to look up...', retry_count3)
                    }
                }                
            }
                      
            console.log('******* ', countRecords, ' *******')
            await AbstractProducer.sendMessage('New Hanover', 'North Carolina', countRecords, 'Civil & Lien');
        }
        catch (error) {
            console.log('Error: ', error);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('New Hanover', 'North Carolina', countRecords, 'Civil & Lien', errorImage);
        }
        await page.close();
        await this.browser?.close();
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
            'Property State': 'NC',
            'County': 'New Hanover',
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