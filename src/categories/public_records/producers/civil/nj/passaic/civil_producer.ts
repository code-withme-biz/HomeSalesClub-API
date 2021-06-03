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
        generalInfoPage: 'http://records.passaiccountynj.org/press/Clerk/clerkhome.aspx?op=basic'
    }

    xpaths = {
        isPageLoaded: '//input[@id="_ctl0_PageContent_btnSearchTab2"]'
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
            await page.select('select#_ctl0_PageContent_ddlShowRecTab2', '100');
            await page.select('select#_ctl0_PageContent_ddlTotalRecTab2', '750');

            let docTypeSelects = [
                'ACL', 'ADC', 'ANU', '5', 'BTD', '4', 'CLC', 'CLB', 'CTORDCN', 
                '23A', 'selected" value="1', 'DANU', 'DAC', 'DCL', 'DLB', '21', 
                '6', 'DPL', '22', '29', '3', '28', '9', 'ITW', 'JUDG', '8', 
                '25', 'MISC', '2', '31', '20', '20D', 'NOD', 'NUB', 'PRCL', 
                'PHYREG', 'PL', '1A', 'DNU', '7', '1B', '23', 'SCL', '2TAX', 
                '2TAXCANC', 'WOL', 'WFS', 'WSJ', '12W'
            ];
            const dateRange = await this.getDateRange('New Jersey', 'Passaic');
            let date = dateRange.from;
            let today = dateRange.to;
            let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24)) - 1;
            for (let i = days < 0 ? 1 : days; i >= 0; i--) { 
                let dateSearch = new Date();
                dateSearch.setDate(dateSearch.getDate() - i);
                console.log('Start search with date: ', dateSearch.toLocaleDateString('en-US'));   

                for (let j = 0; j < docTypeSelects.length; j++) {      
                    // set date range  
                    const fromDateHandle = await page.$x('//input[@id="_ctl0_PageContent_txtFromTab2"]');
                    await fromDateHandle[0].click({clickCount: 3});
                    await fromDateHandle[0].press('Backspace');
                    await fromDateHandle[0].type(dateSearch.toLocaleDateString('en-US', {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit"
                    }), { delay: 100 });

                    const toDateHandle = await page.$x('//input[@id="_ctl0_PageContent_txtToTab2"]');
                    await toDateHandle[0].click({clickCount: 3});
                    await toDateHandle[0].press('Backspace');
                    await toDateHandle[0].type(dateSearch.toLocaleDateString('en-US', {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit"
                    }), { delay: 100 });     

                    // set doc type
                    await page.select(`select[name="_ctl0:PageContent:ddlDocTypeTab2"]`, docTypeSelects[j]);
                    await Promise.all([
                        page.click('input#_ctl0_PageContent_btnSearchTab2'),
                        page.waitForNavigation()
                    ])
                    let rows = await page.$x('//tr[contains(@class, "ItemStyle")]');
                    if (rows.length > 0) {
                        let pageNum = 1;
                        while (true) {
                            rows = await page.$x('//tr[contains(@class, "ItemStyle")]');
                            for (let k = 0; k < rows.length; k++) {
                                const typeHandle = await page.$x(`//tr[contains(@class, "ItemStyle")][${k + 1}]/td[2]`);
                                let type = await typeHandle[0].evaluate(el => el.textContent?.trim());
                                const nameHandle = await page.$x(`//tr[contains(@class, "ItemStyle")][${k + 1}]/td[4]`);
                                let name = await nameHandle[0].evaluate(el => el.textContent?.trim());
                                const caseHandle = await page.$x(`//tr[contains(@class, "ItemStyle")][${k + 1}]/td[5]`);
                                let caseID = await caseHandle[0].evaluate(el => el.textContent?.trim());
                                const dateHandle = await page.$x(`//tr[contains(@class, "ItemStyle")][${k + 1}]/td[6]`);
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
                            let nextEL2 = await page.$x(`//a[text()="..." and contains(@href, "ctl${pageNum > 15 ? 11 : 10}")]`);
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
                        page.click('input#_ctl0_PageContent_btnNewSearch'),
                        page.waitForNavigation()
                    ])
                }
            }
            await AbstractProducer.sendMessage('Passaic', 'New Jersey', countRecords, 'Civil & Lien');
            console.log('********', countRecords, '********');
            return true;
        }
        catch (error) {
            console.log(error);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Passaic', 'New Jersey', countRecords, 'Civil & Lien', errorImage);
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
            'Property State': 'NJ',
            'County': 'Passaic',
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