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
    'ACADEMY', 'VENTURE', 'REVOCABLE', 'CONSTRUCTION', 'HOMETOWN', 'ORANGE', 'CALIFORNIA', 'TRANSPORT', 'NON-RECORD', 
    'CHICAGO', 'STATE', 'COMP', 'SUMMIT', 'COURTS', 'CONDOMINIU', 'FINANCIAL', 'OFFICE', 'FORETHOUGHT', 'COM', 'ST', 'WORKERS',
    'MARKET', 'ENERGY', 'GOVERNMENT', 'IDOC', 'DPRT', 'ELECTRIC', 'TRADITIONS', 'REGIONAL', 'WELCOME', 'LILLIE',
    'UNKNOWN', 'VILLAGE', 'TRANSPORTATION', 'GLENVIEW', 'CPD', 'CENTRAL', 'NONE', 'Defender', 'Baltimore', 'Inc', 'NAME'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')

export default class CivilProducer extends AbstractProducer {
    urls = {
        generalInfoPage: 'https://registerofdeeds.buncombecounty.org/External/LandRecords/protected/v4/SrchName.aspx'
    }

    xpaths = {
        isPageLoaded: '//input[@id="ctl00_NavMenuIdxRec_btnNav_IdxRec_Date_NEW"]'
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
            await this.browserPages.generalInfoPage.setDefaultNavigationTimeout(150000);
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
            const dateRange = await this.getDateRange('North Carolina', 'Buncombe');
            let fromDate = this.getFormattedDate(dateRange.from);
            let toDateVal = new Date();
            toDateVal.setDate(dateRange.to.getDate() - 1);
            let toDate = this.getFormattedDate(toDateVal);
            
            // search with date range
            let result1 = await this.waitForSuccess(async ()=> {
                await Promise.all([
                    page.click('input#ctl00_NavMenuIdxRec_btnNav_IdxRec_Date_NEW'),
                    page.waitForNavigation()
                ])
            })

            if (!result1) {
                await AbstractProducer.sendMessage('Buncombe', 'North Carolina', countRecords, 'Civil & Lien');
                return false;
            }

            // setting date range
            const from = fromDate.replace(/\//g, '');
            const to = toDate.replace(/\//g, '');
            await page.waitForSelector('input#ctl00_cphMain_tcMain_tpNewSearch_ucSrchDates_txtFiledFrom');
            await page.waitFor(1000)
            const fromDateHandle = await page.$('input#ctl00_cphMain_tcMain_tpNewSearch_ucSrchDates_txtFiledFrom');
            await fromDateHandle?.focus();
            await fromDateHandle?.click({clickCount: 3});
            await fromDateHandle?.press('Backspace');
            await fromDateHandle?.type(from, {delay: 100});
            await page.waitForSelector('input#ctl00_cphMain_tcMain_tpNewSearch_ucSrchDates_txtFiledThru');
            const toDateHandle = await page.$('input#ctl00_cphMain_tcMain_tpNewSearch_ucSrchDates_txtFiledThru');
            await toDateHandle?.focus();
            await toDateHandle?.click({clickCount: 3});
            await toDateHandle?.press('Backspace');
            await toDateHandle?.type(to, {delay: 100});

            // click search button
            let result2 = await this.waitForSuccess(async () => {
                await Promise.all([
                    page.click('input#ctl00_cphMain_tcMain_tpNewSearch_ucSrchDates_btnSearch'),
                    page.waitForNavigation()
                ]);
            });

            if (!result2) {
                await AbstractProducer.sendMessage('Buncombe', 'North Carolina', countRecords, 'Civil & Lien');
                return false;
            }

            // getting data
            await page.waitForXPath('//table[@id="ctl00_cphMain_tcMain_tpInstruments_ucInstrumentsGridV2_cpgvInstruments"]/tbody/tr[@tabindex="-1"]')
            let rows = await page.$x('//table[@id="ctl00_cphMain_tcMain_tpInstruments_ucInstrumentsGridV2_cpgvInstruments"]/tbody/tr[@tabindex="-1"]');

            if (rows.length > 0) {
                let pageNum = 1;
                let isLast = false;
                while (!isLast) {
                    await page.waitForXPath(`//input[@id="ctl00_cphMain_tcMain_tpInstruments_ucInstrumentsGridV2_cpInstruments_Top_txtResultsCurrentPage" and @value="${pageNum}"]`);
                    await page.waitForXPath(`//table[@id="ctl00_cphMain_tcMain_tpInstruments_ucInstrumentsGridV2_cpgvInstruments"]/tbody/tr[@tabindex="-1"]`);
                    rows = await page.$x('//table[@id="ctl00_cphMain_tcMain_tpInstruments_ucInstrumentsGridV2_cpgvInstruments"]/tbody/tr[@tabindex="-1"]');
                    const rowsXpath = '//table[@id="ctl00_cphMain_tcMain_tpInstruments_ucInstrumentsGridV2_cpgvInstruments"]/tbody/tr[@tabindex="-1"]';
                    for (let i = 0; i < rows.length; i++) {
                        let type = await rows[i].evaluate(el => el.children[3].textContent?.trim());
                        if (type == '' || type == 'MARRIED') {
                            continue;
                        }
                        let nameHandles = await page.$x(`${rowsXpath}[${i + 1}]/td[6]//tr/td`);
                        for (const nameHandle of nameHandles) {
                            const name = await nameHandle.evaluate(el => el.textContent?.trim());
                            if (name?.includes('-') || name?.includes('+') || this.isEmptyOrSpaces(name!) || removeRowRegex.test(name!)) {
                                continue;
                            }
                            let date = await rows[i].evaluate(el => el.children[1].innerHTML);
                            date = date?.split('<br>')[0].trim();
                            let caseID = await rows[i].evaluate(el => el.children[8].children[1].children[0].textContent?.trim());
                            const parserName: any = this.newParseName(name!);
                            if(parserName.type && parserName.type == 'COMPANY'){
                                continue;
                            }
                            if (await this.getData(page, name!.trim(), type, date, caseID)) {
                                countRecords++
                            }  
                        }
                    }
                    
                    const nextEl = await page.$x('//input[@title="Next page"]');
                    if (nextEl.length > 0) {
                        pageNum++
                        isLast = false;
                        const rst = await this.waitForSuccess(async () => {
                            nextEl[0].click(),
                            page.waitForXPath(`//input[@id="ctl00_cphMain_tcMain_tpInstruments_ucInstrumentsGridV2_cpInstruments_Top_txtResultsCurrentPage" and @value="${pageNum}"]`);
                        })
                        if (!rst) {
                            return false;
                        }
                    } else {
                        isLast = true;
                    };
                }                
            } else {
                console.log('No Records matched')
            }

            await AbstractProducer.sendMessage('Buncombe', 'North Carolina', countRecords, 'Civil & Lien');
            console.log('**********', countRecords, '**********');
            await page.close();
            await this.browser?.close();
            return true;
        }
        catch (error1) {
            console.log('Error: ', error1);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Buncombe', 'North Carolina', countRecords, 'Civil & Lien', errorImage);
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
                console.log('retrying ...', retry_count)
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
            'Property State': 'NC',
            'County': 'Buncombe',
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