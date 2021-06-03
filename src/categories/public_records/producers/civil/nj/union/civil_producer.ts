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
        generalInfoPage: 'http://clerk.ucnj.org/UCPA/DocIndex'
    }

    xpaths = {
        isPageLoaded: `//a[@onmouseover="F_roll('ByDate',1)"]`
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
        let countRecords = 0;
        try {
            try {
                await Promise.all([
                    page.click(`a[onmouseover="F_roll('ByDate',1)"]`),
                    page.waitForNavigation()
                ])
            } catch (error1) {
                
            }

            let docTypeSelects = [
                '1', '2', '3', '4', '6', '5', '15', 
                '39', '10', '30', '7', '17', '11', 
                '57', '58', '31', '50', '59', '32', 
                '33', '35', '34', '36'

            ];
            const dateRange = await this.getDateRange('New Jersey', 'Union');
            const fromDate = this.getFormattedDate(dateRange.from);
            const toDate = this.getFormattedDate(dateRange.to);
            
            for (let i = 0; i < docTypeSelects.length; i++) {
                await page.select('select[name="dt"]', docTypeSelects[i]);
                const dateHandle = await page.$x('//input[contains(@onblur, "convertDate")]');
                await dateHandle[0].click({clickCount: 3});
                await dateHandle[0].press('Backspace');
                await dateHandle[0].type(fromDate, {delay: 100});
                await dateHandle[1].click({clickCount: 3});
                await dateHandle[1].press('Backspace');
                await dateHandle[1].type(toDate, {delay: 100});

                const range = await page.$('input[name="rpp"]');
                await range?.click({clickCount: 3});
                await range?.press('Backspace');
                await range?.type('100', {delay: 100});

                const grantee = await page.$$('input[name="pOpt"]');
                await grantee[1].click();
                
                const result = await this.waitForSuccess(async () => {
                    await Promise.all([
                        page.click('input[value="Search"]'),
                        page.waitForNavigation()
                    ])
                })
                if (!result) {
                    break;
                }

                let pageNum = 1;
                while (true) {
                    const rows = await page.$x('//div[@id="main"]/table[2]//table//tr/td[contains(@rowspan, "2") and contains(@align, "left")]//parent::tr//parent::tbody');
                    for (let j = 0; j < rows.length; j++) {
                        const element = rows[j];
                        const type = await element.evaluate(el => el.children[0].children[0].textContent?.trim());
                        const nameHandle = await page.$x(`//a[contains(@href, "NameDetails")]`)
                        const name = await nameHandle[j].evaluate(el => el.textContent?.trim());
                        const date = await element.evaluate(el => el.children[0].children[3].children[0].textContent?.trim());
                        const caseID = await element.evaluate(el => el.children[1].children[2].children[0].children[0].textContent?.trim());
                        if (this.isEmptyOrSpaces(name!) || removeRowRegex.test(name!)) {
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
                    
                    const nextEL = await page.$x('//a[contains(text(), "Next")]');
                    if (nextEL.length > 0) {
                        pageNum++;
                        let result1 = await this.waitForSuccess(async () => {
                            await Promise.all([
                                nextEL[0].click(),
                                page.waitForNavigation()
                            ])
                        })
                        if (!result1) {
                            break;
                        }
                    } else {
                        break;
                    }
                }
                const newSearchEL = await page.$x('//a[contains(text(), "Back to Date Search Form")]');
                if (newSearchEL.length > 0) {
                    let result2 = await this.waitForSuccess(async () => {
                        await Promise.all([
                            newSearchEL[0].click(),
                            page.waitForNavigation()
                        ])
                    })
                    if (!result2) {
                        break;
                    }
                } else {
                    break;
                }
            }

            await AbstractProducer.sendMessage('Union', 'New Jersey', countRecords, 'Civil & Lien');
            console.log('********', countRecords, '********');
            return true;
        }
        catch (error) {
            console.log(error);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Union', 'New Jersey', countRecords, 'Civil & Lien', errorImage);
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
            'Property State': 'NJ',
            'County': 'Union',
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