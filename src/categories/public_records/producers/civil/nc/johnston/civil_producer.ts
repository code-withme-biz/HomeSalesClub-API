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
    'CFBANK', 'CORPORTION', 'LOANDEPOTCOM', 'CAPITAL', 'HOMEBANK', 'FSB', 'FELLOWSHIP', 'ASSOCIATES', 'DECLARATION',
    'ACADEMY', 'VENTURE', 'REVOCABLE', 'CONSTRUCTION', 'HOMETOWN', 'ORANGE', 'CALIFORNIA', 'TRANSPORT', 'NON-RECORD', 
    'CHICAGO', 'STATE', 'COMP', 'SUMMIT', 'COURTS', 'CONDOMINIU', 'FINANCIAL', 'OFFICE', 'FORETHOUGHT', 'COM', 'ST', 'WORKERS',
    'MARKET', 'ENERGY', 'GOVERNMENT', 'IDOC', 'DPRT', 'ELECTRIC', 'TRADITIONS', 'REGIONAL', 'WELCOME', 'LILLIE', 'SUBDIVISION',
    'UNKNOWN', 'VILLAGE', 'TRANSPORTATION', 'GLENVIEW', 'CPD', 'CENTRAL', 'NONE', 'Defender', 'Baltimore', 'Inc', 'NAME'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')

export default class CivilProducer extends AbstractProducer {
    urls = {
        generalInfoPage: 'http://erec.johnstonnc.com/recorder/web/login.jsp'
    }

    xpaths = {
        isPageLoaded: '//input[@value="Public Login"]'
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
                page.click('input[value="Public Login"]'),
                page.waitForNavigation()
            ])

            const dateRange = await this.getDateRange('North Carolina', 'Johnston');
            let fromDate = this.getFormattedDate(dateRange.from);
            let toDate = this.getFormattedDate(dateRange.to);

            let dateHandle = await page.$x('//input[contains(@id, "RecordingDateID")]');
            await dateHandle[0].focus();
            await dateHandle[0].type(fromDate, {delay: 100});
            await dateHandle[1].focus();
            await dateHandle[1].type(toDate, {delay: 100});

            let retry_count = 1;
            while (true) {
                if (retry_count > 3) {
                    console.error('Connection/website error for 15 iteration.');
                    return false
                }
                try {
                    await Promise.all([
                        page.click('form > p > input[value="Search"]'),
                        page.waitForNavigation()
                    ])
                    break;
                } catch (error2) {
                    retry_count++
                }
            }

            const url = 'http://erec.johnstonnc.com/recorder/'
            while (true) {
                const rows = await page.$x('//table[@id="searchResultsTable"]/tbody/tr');
                if (rows.length > 0) {
                    for (let i = 0; i < rows.length; i++) {
                        const linkHandle = await page.$x(`//table[@id="searchResultsTable"]/tbody/tr[${i + 1}]/td[1]//a`);
                        let link = await linkHandle[0].evaluate(el => el.getAttribute('href'));
                        if (link) {
                            link = url + link.replace('../', '');
                            const detailPage = await this.browser?.newPage();
                            if (!detailPage) {
                                return false;
                            }
                            await detailPage.goto(link, {waitUntil: 'networkidle0'});            
                            const caseHandle = await detailPage.$x('//span[text()="Document Number"]/parent::td/span[2]/span');
                            let caseID = await caseHandle[0].evaluate(el => el.textContent?.trim());
                            const dateHandle = await detailPage.$x('//span[text()="Recording Date"]/parent::td/span[2]/span');
                            let date = await dateHandle[0].evaluate(el => el.textContent?.trim());
                            const typeHandle = await detailPage.$x('//span[text()="Book Type"]/parent::td/span[2]/span');
                            let type = await typeHandle[0].evaluate(el => el.textContent?.trim());
                            const nameHandles = await detailPage.$x('//th[text()="Grantee"]/parent::tr/parent::tbody//span');
                            for (const nameHandle of nameHandles) {
                                let name = await nameHandle.evaluate(el => el.textContent?.trim());
                                if (this.isEmptyOrSpaces(name!) || removeRowRegex.test(name!)) {
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
                            await detailPage.close();
                            await this.sleep(500);
                        }
                    }
                    const nextEL = await page.$x('//a[text()="Next"]');
                    if (nextEL.length > 0) {
                        await nextEL[0].click();
                        await page.waitForNavigation();
                    } else {
                        break;
                    }

                } else {
                    break;
                }
            }
 
            await AbstractProducer.sendMessage('Johnston', 'North Carolina', countRecords, 'Civil & Lien');
            console.log('**********', countRecords, '**********');
            await page.close();
            await this.browser?.close();
            return true;
        }
        catch (error1) {
            console.log('Error: ', error1);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Johnston', 'North Carolina', countRecords, 'Civil & Lien', errorImage);
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
            'County': 'Johnston',
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