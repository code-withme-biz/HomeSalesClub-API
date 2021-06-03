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
        generalInfoPage: 'http://deeds.carteretcounty.com/'
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

            const realEL = await page.$x('//li[@data-ig="x:273746300.38:adr:10"]');
            await Promise.all([
                realEL[0].click(),
                page.waitForXPath('//span[contains(text(), "Search Real Estate Index")]/parent::a')
            ])   
            
            const mainHandle = await page.$x('//span[contains(text(), "Search Real Estate Index")]/parent::a');
            await Promise.all([
                mainHandle[0].click(),
                page.waitForNavigation()
            ])

            const dateRange = await this.getDateRange('North Carolina', 'Carteret');
            let date = dateRange.from;
            let today = dateRange.to;
            let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24));
            for (let i = days < 0 ? 1 : days; i >= 0; i--) {
                let dateSearch = new Date();
                dateSearch.setDate(dateSearch.getDate() - i);
                console.log('Start search with date: ', dateSearch.toLocaleDateString('en-US'));   
                const fromDateHandle = await page.$x('//table[@id="cphNoMargin_f_ddcDateFiledFrom"]//input');
                const toDateHandle = await page.$x('//table[@id="cphNoMargin_f_ddcDateFiledTo"]//input');
                await fromDateHandle[0].click({clickCount: 3});
                await fromDateHandle[0].press('Backspace');
                await fromDateHandle[0].type(dateSearch.toLocaleDateString('en-US', {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit"
                }), { delay: 500 })
                await toDateHandle[0].click({clickCount: 3});
                await toDateHandle[0].press('Backspace');
                await toDateHandle[0].type(dateSearch.toLocaleDateString('en-US', {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit"
                }), { delay: 500 })

                let docTypes = await page.$x('//input[contains(@id, "cphNoMargin_f_dclDocType_")]');
                for (const docType of docTypes) {
                    await docType.click();
                }

                await Promise.all([
                    page.click('table#cphNoMargin_SearchButtons2_btnSearch__1'),
                    page.waitForNavigation()
                ])
                
                while (true) {
                    let rows = await page.$x('//tr[@mkr="sizeRow"]/parent::tbody/tr[contains(@data-ig, "x")]');
                    if (rows.length > 0) {
                        for (let i = 0; i < rows.length; i++) {
                            const nameHandles = await page.$x('//span[contains(text(), "[E]")]/parent::div/span[2]');
                            let name = await nameHandles[i].evaluate(el => el.innerHTML);
                            name = name.split('<b')[0].trim()
                            if (this.isEmptyOrSpaces(name!) || removeRowRegex.test(name!) || name == 'XX' || name == 'X') {
                                continue;
                            }
                            const parserName: any = this.newParseName(name!);
                            if(parserName.type && parserName.type == 'COMPANY'){
                                continue;
                            }
                            const caseID = await rows[i].evaluate(el => el.children[4].children[0].textContent?.trim());
                            const date = await rows[i].evaluate(el => el.children[8].textContent?.trim());
                            const type = await rows[i].evaluate(el => el.children[9].textContent?.trim());
                            if (await this.getData(page, name!.trim(), type, date, caseID)) {
                                countRecords++
                            } 
                        }
                        const nextEL = await page.$x('//input[@id="OptionsBar1_imgNext"]');
                        const disable = await nextEL[0].evaluate(el => el.getAttribute('disabled'));
                        if (disable == null) {
                            let result = await this.waitForSuccess(async () => {
                                await Promise.all([
                                    nextEL[0].click(),
                                    page.waitForNavigation()
                                ])
                            })
                            if (!result) {
                                break;
                            }
                        } else {
                            break;
                        }
                    } else {
                        console.log('No Records');
                        break;
                    }
                }

                const newSearch = await page.$x('//a[text()="New Search"]');
                await Promise.all([
                    newSearch[0].click(),
                    page.waitForNavigation()
                ])
            }     

            console.log('**********', countRecords, '**********');
            await AbstractProducer.sendMessage('Carteret', 'North Carolina', countRecords, 'Civil & Lien');
            await page.close();
            await this.browser?.close();
            return true;
        }
        catch (error1) {
            console.log('Error: ', error1);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Carteret', 'North Carolina', countRecords, 'Civil & Lien', errorImage);
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
            'County': 'Carteret',
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