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
    'UNKNOWN', 'VILLAGE', 'TRANSPORTATION', 'GLENVIEW', 'CPD', 'CENTRAL', 'NONE', 'Defender', 'Baltimore', 'Inc', 'NAME',
    'SHOP', 'NEWPORT'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')

export default class CivilProducer extends AbstractProducer {
    urls = {
        generalInfoPage: 'https://rod.moorecountync.gov/'
    }

    xpaths = {
        isPageLoaded: '//a[@id="cph1_lnkAccept"]'
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
            await Promise.all([
                page.click('a#cph1_lnkAccept'),
                page.waitForNavigation()
            ])

            const realEL = await page.$x('//li[@data-ig="x:273746300.41:adr:10"]');
            await Promise.all([
                realEL[0].click(),
                page.waitForXPath('//span[contains(text(), "Search Real Estate Index")]/parent::a')
            ])   
            
            const mainHandle = await page.$x('//span[contains(text(), "Search Real Estate Index")]/parent::a');
            await Promise.all([
                mainHandle[0].click(),
                page.waitForNavigation()
            ])

            const dateRange = await this.getDateRange('North Carolina', 'Moore');

            let date = dateRange.from;
            let today = dateRange.to;
            let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24));
            for (let i = days < 0 ? 1 : days; i >= 0; i--) {
                let dateSearch = new Date();
                dateSearch.setDate(dateSearch.getDate() - i);
                console.log('Start search with date: ', dateSearch.toLocaleDateString('en-US'));   
                const dateHandle = await page.$x('//table[contains(@id, "cphNoMargin_f_ddcDateFiled")]//input');
                await dateHandle[0].focus()
                await dateHandle[0].type(dateSearch.toLocaleDateString('en-US', {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit"
                }), { delay: 500 })

                await dateHandle[1].focus();
                await dateHandle[1].type(dateSearch.toLocaleDateString('en-US', {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit"
                }), { delay: 500 })

                let retry_count = 0;
                while (true) {
                    if (retry_count > 3) {
                        console.error('Connection/website error for 15 iteration.');
                        return false;
                    }
                    try {
                        await Promise.all([
                            page.click('#cphNoMargin_SearchButtons1_btnSearch__3'),
                            page.waitForNavigation()
                        ])
                        break;
                    } catch (error3) {
                        retry_count++;
                    }
                }

                let retry_count1 = 0;
                while (true) {
                    if (retry_count1 > 15) {
                        console.error('Connection/website error for 15 iteration.');
                        return false;
                    }
                    try {
                        await Promise.all([
                            page.click('#cphNoMargin_cphNoMargin_SearchCriteriaTop_FullCount1'),
                            page.waitForNavigation()
                        ])
                        break;
                    } catch (error2) {
                        retry_count1++;
                    }
                }             
    
                const rowXpath = '//tr[contains(@data-ig, "chlGCnt")]';
                while (true) {
                    const rows = await page.$x(rowXpath);
                    if (rows.length > 0) {
                        for (let i = 0; i < rows.length; i++) {
                            const caseHandle = await page.$x(rowXpath + `[${i + 1}]//a[contains(@href, "SearchResults")]`);
                            let caseID = await caseHandle[0].evaluate(el => el.textContent?.trim());
                            const dateHandle = await page.$x(rowXpath + `[${i + 1}]/td[9]`);
                            let date = await dateHandle[0].evaluate(el => el.textContent?.trim());
                            const typeHandle = await page.$x(rowXpath + `[${i + 1}]/td[10]`);
                            let type = await typeHandle[0].evaluate(el => el.textContent?.trim());
                            const nameHandle = await page.$x(rowXpath + `[${i + 1}]//span[contains(text(), "[E]")]/parent::div/span[2]`);
                            let name = await nameHandle[0].evaluate(el => el.textContent?.trim());
                            if (name?.includes('-') || name?.includes('+') || this.isEmptyOrSpaces(name!) || removeRowRegex.test(name!)) {
                                continue;
                            }
                            const parserName: any = this.newParseName(name!);
                            if(parserName.type && parserName.type == 'COMPANY'){
                                continue;
                            }
                            if (await this.getData(page, name!.trim(), type, date, caseID)) {
                                countRecords++
                            } 
                        }
                        const nextEL = await page.$x('//input[@id="OptionsBar1_imgNext"]');
                        const disable = await nextEL[0].evaluate(el => el.getAttribute('disabled'));
                        if (disable == null) {
                            await Promise.all([
                                nextEL[0].click(),
                                page.waitForNavigation()
                            ])
                        } else {
                            break;
                        }
                    } else {
                        break;
                    }                
                }
                const newSearch = await page.$x('//a[text()="New Search"]');
                await Promise.all([
                    newSearch[0].click(),
                    page.waitForNavigation()
                ])
            }

            await AbstractProducer.sendMessage('Moore', 'North Carolina', countRecords, 'Civil & Lien');
            console.log('**********', countRecords, '**********');
            await page.close();
            await this.browser?.close();
            return true;
        }
        catch (error1) {
            console.log('Error: ', error1);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Moore', 'North Carolina', countRecords, 'Civil & Lien', errorImage);
        }

        return false;
    }

    async getData(page: puppeteer.Page, name: any, type: any, date: any, caseID: any): Promise<any> {
        const { firstName, lastName, middleName, fullName, suffix } = this.newParseName(name!);
        let practiceType = this.getPracticeType(type);
        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({ name: productName }).exec();

        const data = {
            'caseUniqueId': caseID,
            'Property State': 'NC',
            'County': 'Moore',
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