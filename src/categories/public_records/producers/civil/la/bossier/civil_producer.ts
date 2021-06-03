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

    urls = {
        generalInfoPage: 'http://www.bossiercitycourt.org/Civil/Inquiries.aspx'
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
            let retries = 0;
            while (retries < 15) {
                try {
                    await this.browserPages.generalInfoPage.goto(this.urls.generalInfoPage, { waitUntil: 'load' });
                    break;
                } catch (error) {
                    retries++;
                    console.log(`Website loading failed, retrying now -- [${retries}]`);
                    await this.sleep(3000);
                }
            }
            if (retries === 15) {
                console.log('#### Website loading was failed');
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
            await this.browserPages.generalInfoPage?.waitForXPath('//*[@id="MainContent_pnlSearch"]');
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    async saveRecord(fillingDate: string, parseName: any, prod: any, caseType: any) {

        const data = {
            'Property State': 'LA',
            'County': 'Bossier',
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

    async getData(page: puppeteer.Page) {
        let count = 0;
        try {
            let nextpage = true;
            while (nextpage) {
                const rows = await page.$x('//tr[contains(@id, "_DXDataRow")]');
                for (let row of rows) {
                    // name: 2 date: 4 type: 6
                    let defendant = await page.evaluate(el => el.children[2].textContent.trim(), row);
                    let fillingDate = await page.evaluate(el => el.children[4].textContent.trim(), row);
                    let doctype = await page.evaluate(el => el.children[6].textContent.trim(), row);
                    
                    if (removeRowRegex.test(defendant)) continue;
                    defendant = defendant.replace(/\n|\s+/gm, ' ').trim();
                    const parseName: any = this.newParseName(defendant!.trim());
                    if (parseName.type && parseName.type == 'COMPANY') {
                        continue
                    }
                    let practiceType = this.getPracticeType(doctype);
                    const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                    const prod = await db.models.Product.findOne({ name: productName }).exec();
                    const saveRecord = await this.saveRecord(fillingDate, parseName, prod, doctype);
                    saveRecord && count++
                }
                const [nextpagebutton] = await page.$x('//a[contains(@onclick, "PBN")]');
                if (nextpagebutton) {
                    await nextpagebutton.click();
                    await page.waitForSelector('table[id$="_SuitGridView_LPV"]', {hidden: true});
                    await this.randomSleepIn5Sec();
                } else {
                    nextpage = false;
                    break;
                }
            }
        } catch (e) {
        }
        return count;
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let countRecords = 0;
        try {
            let dateRange = await this.getDateRange('LA', 'Bossier');
            let fromDate = this.getFormattedDate(dateRange.from);
            let toDate = this.getFormattedDate(dateRange.to);
            let names = 'abcdefghijklmnopqrstuvwxyz';
            for (const name of names) {
                let retries = 0;
                while (retries < 15) {
                    try {
                        await page.goto(this.urls.generalInfoPage, { waitUntil: 'load' });
                        break;
                    } catch (error) {
                        retries++;
                        console.log(`Website loading failed, retrying now -- [${retries}]`);
                        await this.sleep(3000);
                    }
                }
                if (retries === 15) {
                    console.log('#### Website loading was failed');
                    break;
                }

                let [lastname_handle] = await page.$x('//*[contains(@id, "_tbLastName_I")]');
                await lastname_handle.type(name);
                await page.waitForSelector('input[id$="_SearchBySelection_RB2_I"]', {visible: true});
                const [defendant] = await page.$x('//label[text()="Defendant"]');
                await defendant.click();
                const [daterange] = await page.$x('//label[text()="Date Range"]');
                await daterange.click();
                
                let startdate_handle = await page.$('input[id$="_FromDateEdit_I"]');
                await startdate_handle?.click({clickCount: 3});
                await startdate_handle?.press('Backspace');
                await startdate_handle?.type(fromDate, {delay: 100});
                let enddate_handle = await page.$('input[id$="_ToDateEdit_I"]');
                await enddate_handle?.click({clickCount: 3});
                await enddate_handle?.press('Backspace');
                await enddate_handle?.type(toDate, {delay: 100});

                await page.click('div[id$="_btnSelectCase"]');
                await page.waitForSelector('table[id$="_SuitGridView_LPV"]', {hidden: true});

                let hasdata = await page.$('tr[id$="_DXDataRow0"]');
                if (!hasdata) {
                    console.log('Not found');
                    continue;
                }
                countRecords += await this.getData(page);
            }
        } catch (e) {
            console.log(e);
            console.log('Error search');
            console.log(`TOTAL SAVED: ${countRecords}`);
            await AbstractProducer.sendMessage('Bossier', 'Louisiana', countRecords, 'Civil');
            return false;
        }
        console.log(`TOTAL SAVED: ${countRecords}`);
        await AbstractProducer.sendMessage('Bossier', 'Louisiana', countRecords, 'Civil');
        return true;
    }
}

