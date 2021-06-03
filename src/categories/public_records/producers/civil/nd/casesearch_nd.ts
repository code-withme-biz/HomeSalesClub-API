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
    url: string = 'https://publicsearch.ndcourts.gov/default.aspx';
    abstract state: string;
    abstract fullState: string;
    abstract county: string;

    xpaths = {
        isPageLoaded: '//label[@for="DateFiled"]'
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
            const pageLoadResult = await this.waitForSuccessPageLoad(this.browserPages.generalInfoPage);
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
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        
        try {
            const dateRange = await this.getDateRange(this.fullState, this.county);
            let fromDate = this.getFormattedDate(dateRange.from);
            let toDate = this.getFormattedDate(dateRange.to);

            await page.waitForXPath('//select[@id="sbxControlID2"]');
            const county = this.county.charAt(0).toUpperCase() + this.county.slice(1).toLowerCase();
            const [countyOption] = await page.$x(`//select[@id="sbxControlID2"]/option[contains(text(), "${county}")]`)
            const countyValue = await page.evaluate(el => el.value, countyOption);
            await page.select('select#sbxControlID2', countyValue);
            
            const [civillink] = await page.$x('//a[text()="Civil, Family & Probate Case Records"]')
            await Promise.all([
                civillink.click(),
                page.waitForNavigation()
            ]);
            
            await page.waitForXPath('//label[@for="DateFiled"]');
            await page.click('label[for="DateFiled"]');
            await page.click('label[for="OpenOption"]');
            await page.type('input#DateFiledOnAfter', fromDate, {delay: 100});
            await page.type('input#DateFiledOnBefore', toDate, {delay: 100});
            
            let casetypes = [];
            const options = await page.$$('select#selCaseTypeGroups > option');
            for (const option of options) {
                const casetype = await page.evaluate(el => el.value, option);
                casetypes.push(casetype);
            }

            await page.select('select#selCaseTypeGroups', ...casetypes);
            await Promise.all([
                page.click('input#SearchSubmit'),
                page.waitForNavigation()
            ]);

            const [nomatches] = await page.$x('//*[contains(text(), "No cases matched your search criteria.")]')
            if (nomatches) {
                console.log('No matches found');
                return false;
            }

            let rows = await page.$x('//*[contains(text(), "Case Number")]/ancestor::tbody[1]/tr[position()>1]');
            for (const row of rows) {
                let fillingdate = await page.evaluate(el => el.children[2].children[0].textContent, row);
                fillingdate = fillingdate.replace(/\s+|\n/gm, ' ').trim();
                let name = await page.evaluate(el => el.children[2].children[2].textContent, row);
                name = name.replace(/\s+|\n/gm, ' ').trim();
                let casetype = await page.evaluate(el => el.children[3].children[0].textContent, row);
                casetype = casetype.replace(/\s+|\n/gm, ' ').trim();

                if (await this.saveData(name, casetype, fillingdate))
                    countRecords++;
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

    async waitForSuccessPageLoad(page: puppeteer.Page): Promise<boolean> {
        let retry_count = 0;
        while (true){
            if (retry_count > 3){
                console.error('Connection/website error for 15 iteration.');
                return false;
            }
            try {
                await page.goto(this.url, {waitUntil: 'load'});
                break;
            }
            catch (error) {
                retry_count++;
                console.log(`retrying page loading -- ${retry_count}`);
                await this.sleep(3000);
            }
        } 
        return true;
    }

    async saveData(name: string, type: string, fillingdate: string): Promise<any> {
        const parseName: any = this.newParseName(name);
        if (parseName.type === 'COMPANY' || parseName.fullName === '') return false;
        
        let practiceType = this.getPracticeType(type);
        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({ name: productName }).exec();

        const data = {
            'Property State': 'NV',
            'County': this.county,
            'First Name': parseName.firstName,
            'Last Name': parseName.lastName,
            'Middle Name': parseName.middleName,
            'Name Suffix': parseName.suffix,
            'Full Name': parseName.fullName,
            "vacancyProcessed": false,
            fillingDate: fillingdate,
            productId: prod._id,
            originalDocType: type
        };

        return (await this.civilAndLienSaveToNewSchema(data));
    }
}