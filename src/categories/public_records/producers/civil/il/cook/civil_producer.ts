import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';


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
    'UNKNOWN', 'VILLAGE', 'TRANSPORTATION', 'GLENVIEW', 'CPD', 'CENTRAL', 'NONE'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')

export default class CivilProducer extends AbstractProducer {
    divisionArray = [
        'Chancery',
        'Domestic Relations / Child Support',
        'Civil',
        'Law'
    ]

    urls = {
        generalInfoPage: 'http://www.cookcountyclerkofcourt.org/CourtCaseSearch/DocketSearch.aspx'
    };

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
            await this.browserPages.generalInfoPage?.waitForXPath('//*[@id="MainContent_pnlSearch"]');
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    async saveRecord(fillingDate: string, parseName: any, prod: any, caseType: any) {

        const data = {
            'Property State': 'IL',
            'County': 'Cook',
            'First Name': parseName.firstName,
            'Last Name': parseName.lastName,
            'Middle Name': parseName.middleName,
            'Name Suffix': parseName.suffix,
            'Full Name': parseName.fullName,
            "vacancyProcessed": false,
            fillingDate: fillingDate,
            productId: prod._id,
            originalDocType: caseType
        };

        return await this.civilAndLienSaveToNewSchema(data);
    }

    async getData(page: puppeteer.Page, fillingDate: string) {
        let count = 0;
        try {
            await page.waitForSelector('#MainContent_gvResults');
            const rows = await page.$x('//*[@id="MainContent_gvResults"]/tbody/tr');
            for (let i = 1; i < rows.length; i++) {
                const partyType = (await rows[i].$eval('td:nth-child(4)', elem => elem.textContent))!.trim();
                if (partyType == 'P') continue;
                const caseType = (await rows[i].$eval('td:nth-child(5)', elem => elem.textContent))!.trim();
                let name = (await rows[i].$eval('td:nth-child(1)', elem => elem.textContent))!.trim();
                if (removeRowRegex.test(name)) continue;
                name = name.replace(',', '')
                const parseName: any = this.newParseName(name!.trim());
                if (parseName.type && parseName.type == 'COMPANY') {
                    continue
                }
                let practiceType = this.getPracticeType(caseType);
                const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                const prod = await db.models.Product.findOne({ name: productName }).exec();
                const saveRecord = await this.saveRecord(fillingDate, parseName, prod, caseType);
                saveRecord && count++
            }
        } catch (e) {
        }
        return count
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let countRecords = 0;
        try {
            let dateRange = await this.getDateRange('Illinois', 'Cook');
            let date = dateRange.from;
            let today = dateRange.to;
            let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24)) - 1;
            for (let i = days < 0 ? 1 : days; i >= 0; i--) {
                try {
                    let dateSearch = new Date();
                    dateSearch.setDate(dateSearch.getDate() - i);
                    console.log('Start search with date: ', dateSearch.toLocaleDateString('en-US'));
                    for (let j = 0; j < this.divisionArray.length; j++) {
                        try {
                            const division = this.divisionArray[j];
                            await page.goto('http://www.cookcountyclerkofcourt.org/CourtCaseSearch/DocketSearch.aspx', { waitUntil: 'load' });
                            await page.waitForXPath('//*[contains(@id,"ddlDatabase") and @type="text"]');
                            const [searchTypeElement] = await page.$x('//*[contains(text(), "Search by Filing Date")]');
                            await searchTypeElement.click();
                            await page.waitForXPath('//*[contains(@id,"dtFilingDate") and @type="text"]');
                            const [dateElement] = await page.$x('//*[contains(@id,"dtFilingDate") and @type="text"]');
                            await dateElement.click();
                            await page.keyboard.type(dateSearch.toLocaleDateString('en-US'), { delay: 50 });
                            const [divisionElement] = await page.$x('//*[contains(@id,"ddlDatabase") and @type="text"]');
                            await divisionElement.click();
                            await page.keyboard.type(division, { delay: 50 });
                            const [buttonSearch] = await page.$x('//*[contains(text(), "Start New Search")]');
                            await page.keyboard.press('Enter');
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            await buttonSearch.click({ clickCount: 3 });
                            const count = await this.getData(page, dateSearch.toLocaleDateString('en-US'));
                            countRecords += count;
                            console.log(`${dateSearch.toLocaleDateString('en-US')} found ${count} records. (${division})`);
                        } catch (e) {
                        }
                    }
                } catch (e) {
                }
            }
        } catch (e) {
            console.log(e);
            console.log('Error search');
            console.log(`TOTAL SAVED: ${countRecords}`);
            await AbstractProducer.sendMessage('Cook', 'Illinois', countRecords, 'Civil');
            return false;
        }
        console.log(`TOTAL SAVED: ${countRecords}`);
        await AbstractProducer.sendMessage('Cook', 'Illinois', countRecords, 'Civil');
        return true;
    }
}

