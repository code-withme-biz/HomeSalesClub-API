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
    'UNKNOWN', 'VILLAGE', 'TRANSPORTATION', 'GLENVIEW', 'CPD', 'CENTRAL', 'NONE', 'Defender', 'Baltimore', 'Inc', 'NAME'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')

export default class CivilProducer extends AbstractProducer {
    urls = {
        generalInfoPage: 'https://www.co.dutchess.ny.us/countyclerkdocumentsearch/search.aspx'
    }

    xpaths = {
        isPageLoaded: '//input[@id="SearchButton"]'
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
            const dateRange = await this.getDateRange('New York', 'Dutchess');
            let fromDate = this.getFormattedDate(dateRange.from);
            let toDate = this.getFormattedDate(dateRange.to);
            console.log(fromDate, toDate);
			

            // setting party type
            const [partyTypeSelectHandle] = await page.$x('//span[text()="All Party Types"]/parent::button');
            await partyTypeSelectHandle.click();
            await page.waitForXPath('//label[@for="ui-multiselect-PartyTypeList-option-6"]/parent::li');
            const [granteeHandle] = await page.$x('//label[@for="ui-multiselect-PartyTypeList-option-6"]/parent::li');
            const [mortgageeHandle] = await page.$x('//label[@for="ui-multiselect-PartyTypeList-option-8"]/parent::li');            
            await granteeHandle.click();
            await mortgageeHandle.click();

            await page.click('#Name3TextBox', {delay: 500})

            // setting date range
            const [startDateHandle] = await page.$x('//input[@id="StartDateTextBox"]');
            const [endDateHandle] = await page.$x('//input[@id="EndDateTextBox"]');
            await startDateHandle.focus();
            await startDateHandle.type(fromDate.replace(/\//g, ''), {delay: 100});

            await endDateHandle.focus();
            await endDateHandle.type(toDate.replace(/\//g, ''), {delay: 100});
            await page.click('#Name3TextBox', {delay: 500})

            await Promise.all([
                page.click('#SearchButton'),
                page.waitForNavigation()
            ])
            
            const noResultHandle = await page.$x('//p[text()="No Results Found"]')
            if (noResultHandle.length > 0) {
                console.log('No Results Found');
                return false;
            }
            let pageNum = 1;

            while (true) {
                await page.waitForXPath('//div[@id="search-results"]');
                const results = await page.$x('//div[@id="search-results"]/table/tbody/tr');
                for (const result of results) {
                    const type = await result.evaluate(el => el.children[3].textContent?.trim());
                    const caseID = await result.evaluate(el => el.children[5].textContent?.trim());
                    const date = await result.evaluate(el => el.children[10].textContent?.trim());
                    const name = await result.evaluate(el => el.children[12].innerHTML);
                    
                    if (this.isEmptyOrSpaces(name!) || removeRowRegex.test(name)) {
                        continue;
                    }
                    const parserName: any = this.newParseName(name);
                    if(parserName.type && parserName.type == 'COMPANY'){
                        continue;
                    }
                    if (await this.getData(page, name.trim(), type, date, caseID)) {
                        countRecords++
                    }  
                }
                const nextElement = await page.$x('//a[@id="NextLink1"]');
                if (nextElement.length > 0) {
                    pageNum++;
                    await Promise.all([
                        nextElement[0].click(),
                        page.waitForNavigation()
                    ])
                } else {
                    break;
                }                
            }

            await AbstractProducer.sendMessage('Dutchess', 'New York', countRecords, 'Civil & Lien');
            await page.close();
            await this.browser?.close();
            return true;
        }
        catch (error) {
            console.log('Error: ', error);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Dutchess', 'New York', countRecords, 'Civil & Lien', errorImage);
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
            'Property State': 'NY',
            'County': 'Dutchess',
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