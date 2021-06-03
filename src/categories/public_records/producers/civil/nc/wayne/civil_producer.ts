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
    'UNKNOWN', 'VILLAGE', 'TRANSPORTATION', 'GLENVIEW', 'CPD', 'CENTRAL', 'NONE', 'Defender', 'Baltimore', 'Inc'
];
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i');

export default class CivilProducer extends AbstractProducer {
    urls = {
        generalInfoPage: 'http://rod.waynegov.com/External/LandRecords/protected/v4/SrchName.aspx'
    }

    xpaths = {
        isPageLoaded: '//input[@id="ctl00_NavMenuIdxRec_btnNav_IdxRec_Date_NEW"]'
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
            let retry_count = 0;
            while (true) {
                if (retry_count > 3) {
                    console.error('Connection/website error for 15 iteration.');
                    return false;
                }
                try {
                    await Promise.all([
                        page.click('#ctl00_NavMenuIdxRec_btnNav_IdxRec_Date_NEW'),
                        page.waitForNavigation()
                    ])
                    break;
                } catch (error1) {
                    retry_count++;
                }
            }

            const dateRange = await this.getDateRange('North Carolina', 'Wayne');
            let date = dateRange.from;
            let today = dateRange.to;
            let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24));

            for (let i = days < 0 ? 1 : days; i >= 0; i--) { 
                let dateSearch = new Date();
                dateSearch.setDate(dateSearch.getDate() - i);
                console.log('Start search with date: ', dateSearch.toLocaleDateString('en-US')); 
                let dateVal = dateSearch.toLocaleDateString('en-US', {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit"
                }).replace(/\//g, '');

                // set date range  
                await page.waitForSelector('#ctl00_cphMain_tcMain_tpNewSearch_ucSrchDates_txtFiledFrom');
                await this.sleep(1000);
                const fromDateHandle = await page.$('#ctl00_cphMain_tcMain_tpNewSearch_ucSrchDates_txtFiledFrom');
                await fromDateHandle?.click({clickCount: 3});
                await fromDateHandle?.press('Backspace');
                await fromDateHandle?.type(dateVal, { delay: 300 });

                await page.waitForSelector('#ctl00_cphMain_tcMain_tpNewSearch_ucSrchDates_txtFiledThru');
                const toDateHandle = await page.$('#ctl00_cphMain_tcMain_tpNewSearch_ucSrchDates_txtFiledThru');
                await toDateHandle?.click({clickCount: 3});
                await toDateHandle?.press('Backspace');
                await toDateHandle?.type(dateVal, { delay: 300 });    
                
                // click search button
                let retry_count1 = 0;
                while (true) {
                    if (retry_count1) {
                        console.error('Connection/website error for 15 iteration.');
                        return false;
                    }
                    try {
                        await Promise.all([
                            page.click('#ctl00_cphMain_tcMain_tpNewSearch_ucSrchDates_btnSearch'),
                            page.waitForNavigation()
                        ]);
                        break;
                    } catch (error2) {
                        retry_count1++;
                    }
                }

                // getting data
                const rowsXpath = '//*[@id="ctl00_cphMain_tcMain_tpInstruments_ucInstrumentsGridV2_cpgvInstruments"]//tr[contains(@class, "RowStyle")]';
                let rows = await page.$x(rowsXpath);
                if (rows.length > 0) {
                    let pageNum = 1;
                    while (true) {
                        await this.randomSleepIn5Sec()
                        if (pageNum > 1) {
                           await page.waitForXPath(`//*[@id="ctl00_cphMain_tcMain_tpInstruments_ucInstrumentsGridV2_cpInstruments_Top_txtResultsCurrentPage" and @value="${pageNum}"]`);
                            await page.waitForXPath(rowsXpath);
                        }
                        rows = await page.$x(rowsXpath);
                        for (let i = 0; i < rows.length; i++) {
                            let nameHandles = await page.$x(`${rowsXpath}[${i + 1}]/td[6]//td`);
                            for (const nameHandle of nameHandles) {
                                let name = await nameHandle.evaluate(el => el.textContent?.trim());
                                if (name?.includes('-') || name?.includes('+') || this.isEmptyOrSpaces(name!) || removeRowRegex.test(name!)) {
                                    continue;
                                }
                                const parserName: any = this.newParseName(name!);
                                if(parserName.type && parserName.type == 'COMPANY'){
                                    continue;
                                }
                                let type = await rows[i].evaluate(el => el.children[3].textContent?.trim());
                                let date = await rows[i].evaluate(el => el.children[1].innerHTML);
                                date = date?.split('<br>')[0].trim();
                                let caseID = await rows[i].evaluate(el => el.children[8].children[1].children[0].textContent?.trim());
                                if (await this.getData(page, name, type, date, caseID)) {
                                    countRecords++
                                }  
                            }
                        }
                        
                        const nextEl = await page.$x(`//*[@id="ctl00_cphMain_tcMain_tpInstruments_ucInstrumentsGridV2_cpInstruments_Top_ibResultsNextPage"]`);
                        if (nextEl.length > 0) {
                            pageNum++
                            const rst = await this.waitForSuccess(async () => {
                                nextEl[0].click(),
                                page.waitForXPath(`//*[@id="ctl00_cphMain_tcMain_tpInstruments_ucInstrumentsGridV2_cpInstruments_Top_txtResultsCurrentPage" and @value="${pageNum}"]`);
                            })
                            if (!rst) {
                                break;
                            }
                        } else {
                            break;
                        };
                    } 
                    await Promise.all([
                        page.click('#__tab_ctl00_cphMain_tcMain_tpNewSearch'),
                        page.waitForSelector('#ctl00_cphMain_tcMain_tpNewSearch_ucSrchDates_txtFiledFrom')
                    ])             
                } else {
                    console.log('No Records matched');
                    await Promise.all([
                        page.click('#btnReturn'),
                        page.waitForNavigation()
                    ]) 
                }
            }            

            console.log('******* ', countRecords, ' *******')
            await AbstractProducer.sendMessage('Wayne', 'North Carolina', countRecords, 'Civil & Lien');
            await page.close();
            await this.browser?.close();
            return true;
        }
        catch (error) {
            console.log('Error: ', error);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Wayne', 'North Carolina', countRecords, 'Civil & Lien', errorImage);
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
        if (removeRowRegex.test(name)) return false;
        const parseName: any = this.newParseName(name.trim())
        if (parseName?.type && parseName?.type == 'COMPANY') return false;

        let practiceType = this.getPracticeType(type)

        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({ name: productName }).exec();
        
        const data = {
            'caseUniqueId': caseID,
            'Property State': 'AL',
            'County': 'Wayne',
            'First Name': parseName.firstName,
            'Last Name': parseName.lastName,
            'Middle Name': parseName.middleName,
            'Name Suffix': parseName.suffix,
            'Full Name': parseName.fullName,
            "vacancyProcessed": false,
            fillingDate: date,
            productId: prod._id,
            originalDocType: type
        };
        return (await this.civilAndLienSaveToNewSchema(data));
    }
     // To check empty or space
    isEmptyOrSpaces(str: string) {
        return str === null || str.match(/^\s*$/) !== null;
    }
}