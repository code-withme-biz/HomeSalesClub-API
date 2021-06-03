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
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')

export default class CivilProducer extends AbstractProducer {
    urls = {
        generalInfoPage: 'https://press.essexregister.com/prodpress/clerk/ClerkHome.aspx?op=basic'
    }

    xpaths = {
        isPageLoaded: '//a[contains(text(), "By Document Type")]'
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
                const [docBtnHandle] = await page.$x('//a[contains(text(), "By Document Type")]');
                await docBtnHandle.click();
            } catch (error) {
            }
            await page.select('select[name="ctl00$ContentPlaceHolder1$ddlShowRecTab2"]', '100');
            await page.select('select[name="ctl00$ContentPlaceHolder1$ddlTotalRecTab2"]', '750');

            let docTypeSelects = [
                '17','3','3N','26','1','37','5','15','36','8','22','23','25','21','24','2',
                '41','42','7','6','35','9','4','11','13','33','30','31','32','27','16'
            ];
            const dateRange = await this.getDateRange('New Jersey', 'Essex');
            let date = dateRange.from;
            let today = dateRange.to;
            let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24)) - 1;
            for (let i = days < 0 ? 1 : days; i >= 0; i--) { 
                let dateSearch = new Date();
                dateSearch.setDate(dateSearch.getDate() - i);
                console.log('Start search with date: ', dateSearch.toLocaleDateString('en-US'));   

                for (let j = 0; j < docTypeSelects.length; j++) {      
                    // set date range  
                    const fromDateHandle = await page.$x('//input[@id="ctl00_ContentPlaceHolder1_txtFromTab2"]');
                    await fromDateHandle[0].click({clickCount: 3});
                    await fromDateHandle[0].press('Backspace');
                    await fromDateHandle[0].type(dateSearch.toLocaleDateString('en-US', {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit"
                    }), { delay: 100 });

                    const toDateHandle = await page.$x('//input[@id="ctl00_ContentPlaceHolder1_txtToTab2"]');
                    await toDateHandle[0].click({clickCount: 3});
                    await toDateHandle[0].press('Backspace');
                    await toDateHandle[0].type(dateSearch.toLocaleDateString('en-US', {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit"
                    }), { delay: 100 });     

                    // set doc type
                    await page.select('select[name="ctl00$ContentPlaceHolder1$ddlDocTypeTab2"]', docTypeSelects[j]);
                    await Promise.all([
                        page.click('input#ctl00_ContentPlaceHolder1_btnSearchTab2'),
                        page.waitForNavigation()
                    ])
                    let rows = await page.$x('//tr[contains(@class, "style")]');
                    if (rows.length > 0) {
                        let pageNum = 1;
                        while (true) {
                            rows = await page.$x('//tr[contains(@class, "style")]');
                            for (let k = 0; k < rows.length; k++) {
                                const typeHandle = await page.$x(`//tr[contains(@class, "style")][${k + 1}]/td[1]`);
                                let type = await typeHandle[0].evaluate(el => el.textContent?.trim());
                                const nameHandle = await page.$x(`//tr[contains(@class, "style")][${k + 1}]/td[3]`);
                                let name = await nameHandle[0].evaluate(el => el.textContent?.trim());
                                const caseHandle = await page.$x(`//tr[contains(@class, "style")][${k + 1}]/td[4]`);
                                let caseID = await caseHandle[0].evaluate(el => el.textContent?.trim());
                                const dateHandle = await page.$x(`//tr[contains(@class, "style")][${k + 1}]/td[5]`);
                                let date = await dateHandle[0].evaluate(el => el.textContent?.trim());
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
                                if (await this.getData(page, name!.trim(), type, date, caseID)) {
                                    countRecords++
                                }  
                            }

                            let nextEL1 = await page.$x(`//a[text()="${pageNum + 1}"]`);
                            let nextEL2 = await page.$x(`//a[text()="..." and contains(@href, "$ctl${pageNum > 15 ? 11 : 10}")]`);
                            if (nextEL1.length > 0) {
                                pageNum++;
                                await Promise.all([
                                    nextEL1[0].click(),
                                    page.waitForNavigation()
                                ])
                            } else {
                                if (nextEL2.length > 0) {
                                    pageNum++;
                                    await Promise.all([
                                        nextEL2[0].click(),
                                        page.waitForNavigation()
                                    ])
                                } else {
                                    break;
                                }
                            }
                        }
                    } else {
                        console.log('No Records')
                    }
                    await Promise.all([
                        page.click('a#ctl00_ContentPlaceHolder1_hypBasic'),
                        page.waitForNavigation()
                    ])
                }
            }

            await AbstractProducer.sendMessage('Essex', 'New Jersey', countRecords, 'Civil & Lien');
            return true;
        }
        catch (error) {
            console.log(error);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Essex', 'New Jersey', countRecords, 'Civil & Lien', errorImage);
        }
        console.log(countRecords);
        return false;
    }

    async getData(page: puppeteer.Page, name: any, type: any, date: any, caseID: any): Promise<any> {
        const { firstName, lastName, middleName, fullName, suffix } = this.newParseName(name!);
        let practiceType = this.getPracticeType(type);
        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({ name: productName }).exec();
        
        const data = {
            'caseUniqueId': caseID,
            'Property State': 'NJ',
            'County': 'Essex',
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