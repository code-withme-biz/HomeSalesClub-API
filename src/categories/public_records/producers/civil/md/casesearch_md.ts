import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../models/public_record_producer';

import db from '../../../../../models/db';
import SnsService from '../../../../../services/sns_service';

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
    'UNKNOWN', 'VILLAGE', 'TRANSPORTATION', 'GLENVIEW', 'CPD', 'CENTRAL', 'NONE', 'Defender', 'Inc'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')

let countRecords = 0;

export default abstract class CivilProducerMD extends AbstractProducer {
    url: string = 'http://casesearch.courts.state.md.us/casesearch/inquiry-index.jsp';
    abstract state: string;
    abstract fullState: string;
    abstract county: string;
    abstract fullcounty: string;

    xpaths = {
        isPageLoaded: '//input[@value="I Agree"]'
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
            const pageLoadResult = await this.waitForSuccessPageLoad(this.browserPages.generalInfoPage, this.url);
            if (!pageLoadResult) {
                return false;
            }           
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
        removeRowArray.push(this.county.charAt(0).toUpperCase() + this.county.slice(1))
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;

        try {
            await page.waitForXPath('//input[@name="disclaimer"]');
            await this.checkDisclaimer(page);

            const dateRange = await this.getDateRange(this.fullState, this.county);
            let fromDate = dateRange.from;
            let toDate = dateRange.to;

            let name = ' ';
            let days = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 3600 * 24)) - 1;
            for (let i = days < 0 ? 1 : days; i >= 0; i--) {
                try {
                    let dateSearch: any = new Date();
                    dateSearch.setDate(dateSearch.getDate() - i);
                    dateSearch = this.getFormattedDate(dateSearch);

                    const discalimer = await page.$x('//input[@name="disclaimer"]');
                    if (discalimer.length > 0) {
                        await this.checkDisclaimer(page);
                    }
                    await this.setSearchCriteria(page, dateSearch, name);            
                    await this.clickSearchButton(page, dateSearch, name);
                    const errorHandle = await page.$x('//span[@class="error"]');
                    if (errorHandle.length > 0) {
                        const fnameHandle = await page.$('input[name="firstName"]');
                        await Promise.all([
                            fnameHandle?.click({clickCount: 3}),
                            fnameHandle?.press('Backspace')
                        ]);
                        continue;
                    }

                    let rows = await page.$x('//table[@id="row"]/tbody/tr');
                    if (rows.length > 0) {
                        while (true) {
                            await this.processRow(page);
                            const nextEL = await page.$x('//a[text()="Next"]');
                            if (nextEL.length > 0) {
                                let currentURL = await page.url();
                                await this.gotoNextPage(page, currentURL);
                                rows = await page.$x('//table[@id="row"]/tbody/tr');
                                if (rows.length == 0) {
                                    await this.gobackSearch(page);
                                    await this.setSearchCriteria(page, dateSearch, name);
                                    await this.clickSearchButton(page, dateSearch, name);
                                    await page.goto(currentURL, {waitUntil: 'load'});
                                    await this.gotoNextPage(page, currentURL);
                                }
                            } else {
                                break;
                            }
                        }
                    } else {
                        console.log('No Records')
                    }
                    await this.gobackSearch(page);
                    await this.randomSleepIn5Sec();
                } catch (error) {

                }
            }

            await AbstractProducer.sendMessage(this.county, this.fullState, countRecords, 'Civil & Lien');
            await page.close();
            await this.browser?.close();
            return true;
        }
        catch (error) {
            console.log('Error: ', error);
            await AbstractProducer.sendMessage(this.county, this.fullState, countRecords, 'Civil & Lien');
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

    async waitForSuccessPageLoad(page: puppeteer.Page, url: string): Promise<boolean> {
        let retry_count = 0;
        while (true){
            if (retry_count > 30){
                console.error('Connection/website error for 30 iteration.');
                return false;
            }
            try {
                await page.goto(url, {waitUntil: 'networkidle0'});
                break;
            }
            catch (error) {
                retry_count++;
                console.log(`retrying page loading -- ${retry_count}`);
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
            'Property State': this.state,
            'County': this.county,
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

    async checkDisclaimer(page: puppeteer.Page) {
        await page.click('input[name="disclaimer"]');
        await Promise.all([
            page.click('input[value="I Agree"]'),
            page.waitForNavigation()
        ])   
        return;
    }

    async setSearchCriteria(page: puppeteer.Page, date: string, name: string) {
        try {
            const fnameHandle = await page.$('input[name="firstName"]');
            await Promise.all([
                fnameHandle?.click({clickCount: 3}),
                fnameHandle?.press('Backspace'),
                fnameHandle?.type(name, {delay: 100})
            ]);
            await page.select('select[name="countyName"]', this.fullcounty.toUpperCase() + ' COUNTY');
            await page.select('select[name="partyType"]', 'DEF');
            await page.click('input[value="CIVIL"]');
            const dateFromElement = await page.$('input#filingStart');
            if (dateFromElement) {
                await dateFromElement.type(date, { delay: 100 });
            }
            const dateToElement = await page.$('input#filingEnd');
            if (dateToElement) {
                await dateToElement.type(date, { delay: 100 });
            }
        } catch (error) {
        }
        return;
    }

    async clickSearchButton(page: puppeteer.Page, date: string, name: string) {
        const searchResult = await this.waitForSuccess(async () => {
            await Promise.all([
                page.click('input[value="Search"]'),
                page.waitForNavigation()
            ])
        })
        if (!searchResult) {
            return false;
        }
        const discalimer = await page.$x('//input[@name="disclaimer"]');
        if (discalimer.length > 0) {
            await this.checkDisclaimer(page);
            await this.setSearchCriteria(page, date, name);
            const searchResult = await this.waitForSuccess(async () => {
                await Promise.all([
                    page.click('input[value="Search"]'),
                    page.waitForNavigation()
                ])
            })
            if (!searchResult) {
                return false;
            }
        } 
        return;
    }

    async gotoDetailPage(page: puppeteer.Page, url: string) {
        const detailResult = await this.waitForSuccessPageLoad(page, url);
        if (!detailResult) {
            return false;
        }  
        const discalimer = await page.$x('//input[@name="disclaimer"]');
        if (discalimer.length > 0) {
            await this.checkDisclaimer(page);
            const detailResult = await this.waitForSuccessPageLoad(page, url);
            if (!detailResult) {
                return false;
            }   
        }   
        return;     
    }

    async gotoNextPage(page: puppeteer.Page, url: string) {
        const nextEL = await page.$x('//a[text()="Next"]');
        const nextResult = await this.waitForSuccess(async () => {
            await Promise.all([
                nextEL[0].click(),
                page.waitForNavigation()
            ])
        });
        if (!nextResult) {
            return false;
        }
        const discalimer = await page.$x('//input[@name="disclaimer"]');
        if (discalimer.length > 0) {
            await this.checkDisclaimer(page);
            await page.goto(url, {waitUntil: 'load'});
            const nextEL = await page.$x('//a[text()="Next"]');
            const nextResult = await this.waitForSuccess(async () => {
                await Promise.all([
                    nextEL[0].click(),
                    page.waitForNavigation()
                ])
            });
            if (!nextResult) {
                return false;
            }
        } 
        return; 
    }

    async gobackSearch(page: puppeteer.Page) {
        const backResult = await this.waitForSuccess(async () => {
            await Promise.all([
                page.click('a[href*="inquirySearchParam"]'),
                page.waitForNavigation()
            ])
        })
        if (!backResult) {
            return false;
        }
        return;
    }

    async processRow(page: puppeteer.Page) {
        let linkArray = [], names = [], caseArray = [], dateArray = [];
        let rows = await page.$x('//table[@id="row"]/tbody/tr');
        for (let j = 0; j < rows.length; j++) {
            const statusHandle = await page.$x(`//table[@id="row"]/tbody/tr[${j + 1}]/td[7]`);
            const status = await statusHandle[0].evaluate(el => el.textContent?.trim());
            if (status === 'Closed') {
                continue;
            }
            const nameHandle = await page.$x(`//table[@id="row"]/tbody/tr[${j + 1}]/td[2]`);
            let name1 = await nameHandle[0].evaluate(el => el.textContent?.trim());
            if (this.isEmptyOrSpaces(name1!)) {
                continue;
            }
            if (removeRowRegex.test(name1!)) {
                continue;
            }
            const url = 'http://casesearch.courts.state.md.us/casesearch/'
            const prevLinkHandle = await page.$x(`//table[@id="row"]/tbody/tr[${j + 1}]/td[1]/a`);
            const nextLinkHandle = await page.$x(`//table[@id="row"]/tbody/tr[${j < rows.length - 1 ? j + 2 : 1}]/td[1]/a`);
            const caseID = await prevLinkHandle[0].evaluate(el => el.textContent?.trim());
            const nextCaseID = await nextLinkHandle[0].evaluate(el => el.textContent?.trim());
            if (caseID === nextCaseID) {
                continue;
            }
            const prevLink = await prevLinkHandle[0].evaluate(el => el.getAttribute('href')); 
            const dateHandle = await page.$x(`//table[@id="row"]/tbody/tr[${j + 1}]/td[8]`);
            const date = await dateHandle[0].evaluate(el => el.textContent?.trim());
            const parserName: any = this.newParseName(name1!);
            if(parserName.type && parserName.type == 'COMPANY'){
                continue;
            }
            names.push(name1);
            caseArray.push(caseID);
            dateArray.push(date);
            linkArray.push(url + prevLink?.trim());
        }
        
        for (let i = 0; i < linkArray.length; i++) {
            const detailPage = await this.browser?.newPage();
            if (!detailPage) {
                break;
            }
            await this.gotoDetailPage(detailPage, linkArray[i]);                            
            const typeHandle = await detailPage.$x('//span[text()="Case Type:"]/parent::td/parent::tr/td[2]/span');
            if (typeHandle.length > 0) {
                const type = await typeHandle[0].evaluate(el => el.textContent?.trim());
                if (await this.getData(page, names[i], type, dateArray[i], caseArray[i])) {
                    countRecords++
                }   
                await this.sleep(1000);
            }                           
            await detailPage.close()
        }
        return;
    }
}