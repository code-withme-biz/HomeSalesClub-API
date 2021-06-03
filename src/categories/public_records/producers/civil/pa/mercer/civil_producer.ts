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
    'UNKNOWN', 'VILLAGE', 'TRANSPORTATION', 'GLENVIEW', 'CPD', 'CENTRAL', 'NONE', 'Defender', 'Baltimore', 'Inc'
];
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i');

export default class CivilProducer extends AbstractProducer {
    urls = {
        generalInfoPage: 'https://recorder.mcc.co.mercer.pa.us/LandRecords/protected/SrchDateRange.aspx'
    }

    xpaths = {
        isPageLoaded: '//input[contains(@id, "blkLogin_btnGuestLogin"]'
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
            // guest login
            const [docBtnHandle] = await page.$x('//input[contains(@id, "_btnGuestLogin")]');
            await Promise.all([
                docBtnHandle.click(),
                page.waitForNavigation()
            ])

            // search with date range
            let result1 = await this.waitForSuccess(async ()=> {
                await Promise.all([
                    page.click('input[id*="_btnNav_IdxRec_Date"]'),
                    page.waitForNavigation()
                ])
            })

            if (!result1) {
                await AbstractProducer.sendMessage('Mercer', 'Pennsylvania', countRecords, 'Civil & Lien');
                return false;
            }

            const dateRange = await this.getDateRange('Pennsylvania', 'Mercer');
            let fromDate = await this.getFormattedDate(dateRange.from);
            let toDate = await this.getFormattedDate(dateRange.to);

            // set date range  
            await page.waitForSelector('input[id*="_SrchDates1_txtFiledFrom"]');
            const fromDateHandle = await page.$('input[id*="_SrchDates1_txtFiledFrom"]');
            await fromDateHandle?.click({clickCount: 3});
            await fromDateHandle?.press('Backspace');
            await fromDateHandle?.type(fromDate, { delay: 100 });

            await page.waitForSelector('input[id*="_SrchDates1_txtFiledThru"]');
            const toDateHandle = await page.$('input[id*="_SrchDates1_txtFiledThru"]');
            await toDateHandle?.click({clickCount: 3});
            await toDateHandle?.press('Backspace');
            await toDateHandle?.type(toDate, { delay: 100 });    
            
            // click search button
            let result2 = await this.waitForSuccess(async () => {
                await Promise.all([
                    page.click('input[id*="_btnSearch"]'),
                    page.waitForNavigation()
                ]);
            });

            if (!result2) {
                await AbstractProducer.sendMessage('Mercer', 'Pennsylvania', countRecords, 'Civil & Lien');
                await page.close();
                await this.browser?.close();
                return true;
            }

            // getting data
            const rowsXpath = '//table[contains(@id, "lrrgResults_cgvResults")]/tbody/tr';
            let rows = await page.$x(rowsXpath);
            let pageNum = 1;
            if (rows.length > 0) {
                while (true) {
                    rows = await page.$x(rowsXpath);
                    for (let i = 0; i < rows.length; i++) {
                        let nameHandles = await page.$x(`${rowsXpath}[${i + 1}]/td[7]//tr/td`);
                        for (const nameHandle of nameHandles) {
                            const name = await nameHandle.evaluate(el => el.textContent?.trim());
                            if (name?.includes('-') || name?.includes('+') || this.isEmptyOrSpaces(name!)) {
                                continue;
                            }
                            let type = await rows[i].evaluate(el => el.children[4].textContent?.trim());
                            let date = await rows[i].evaluate(el => el.children[3].innerHTML);
                            date = date?.split('<br>')[0].trim();
                            let caseID = await rows[i].evaluate(el => el.children[8].children[0].textContent?.trim());
                            if (await this.getData(page, name, type, date, caseID)) {
                                countRecords++
                            }  
                        }
                    }
                    
                    const nextEl = await page.$x(`//table[contains(@id, "lrrgResults_cgvResults")]/thead//tbody//a[contains(text(), "${pageNum + 1}")]`);
                    if (nextEl.length > 0) {
                        pageNum++
                        const rst = await this.waitForSuccess(async () => {
                            nextEl[0].click(),
                            page.waitForXPath(`//table[contains(@id, "lrrgResults_cgvResults")]/thead//tbody//span[text()="${pageNum}"]`);
                        })
                        if (!rst) {
                            break;
                        }
                    } else {
                        break;
                    };
                }       
            } else {
                console.log('no records')
            }
            await AbstractProducer.sendMessage('Mercer', 'Pennsylvania', countRecords, 'Civil & Lien');
            await page.close();
            await this.browser?.close();
            return true;
        }
        catch (error) {
            console.log('Error: ', error);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Mercer', 'Pennsylvania', countRecords, 'Civil & Lien', errorImage);
            return false;
        }
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
        if (removeRowRegex.test(name)) return false;
        const parseName: any = this.newParseName(name.trim())
        if (parseName?.type && parseName?.type == 'COMPANY') return false;

        let practiceType = this.getPracticeType(type)

        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({ name: productName }).exec();
        
        const data = {
            'caseUniqueId': caseID,
            'Property State': 'AL',
            'County': 'Mercer',
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