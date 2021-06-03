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
        generalInfoPage: 'http://alamancerod.org/'
    }

    xpaths = {
        isPageLoaded: '//a[contains(text(), "Searching Records")]'
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
                page.click('a[href*="welcome.asp"]'),
                page.waitForNavigation()
            ])
            
            await Promise.all([
                page.click('a[href*="searchstart"]'),
                page.waitForNavigation()
            ])

            await page.waitForSelector('#VWG_LoadingScreen', {visible: true});
            await page.waitForSelector('#VWG_LoadingScreen', {hidden: true});
            await page.waitForSelector('span#TXT_42', {timeout: 5000});
            
            await Promise.all([
                page.click('span#TXT_42'),
                page.waitForXPath('//input[contains(@id, "TRG_98")]')
            ])

            const dateRange = await this.getDateRange('North Carolina', 'Alamance');
            let date = dateRange.from;
            let today = dateRange.to;
            let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24));
            for (let i = days < 0 ? 1 : days; i >= 0; i--) {
                let dateSearch = new Date();
                dateSearch.setDate(dateSearch.getDate() - i);
                console.log('Start search with date: ', dateSearch.toLocaleDateString('en-US'));   
                const fromDateHandle = await page.$x('//input[contains(@id, "TRG_98")]');
                const toDateHandle = await page.$x('//input[contains(@id, "TRG_99")]');
                await fromDateHandle[0].click({clickCount: 3});
                await fromDateHandle[0].press('Backspace');
                await fromDateHandle[0].type(dateSearch.toLocaleDateString('en-US', {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit"
                }), { delay: 500 })
                await toDateHandle[0].click({clickCount: 3});
                await toDateHandle[0].press('Backspace');
                await toDateHandle[0].type(`${i == days ? 1 : ''}` + dateSearch.toLocaleDateString('en-US', {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit"
                }), { delay: 500 })

                const searchHandle = await page.$x('//span[text()="Search"]');
                await Promise.all([
                    searchHandle[0].click(),
                    page.waitForXPath('//div[@id="VWG_LoadingScreen"]', {hidden: true}),
                    page.waitForXPath(`//span[contains(text(), "Recorded Date Search : ${dateSearch.toLocaleDateString('en-US', {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit"
                    })}")]`)
                ]);

                const rows = await page.$x('//div[contains(@id, "VWGROW2_143_R")]');
                for (let j = 0; j < rows.length; j++) {
                    const dateHandle = await page.$x(`//div[contains(@id, "VWGROW2_143_R")][${j + 1}]/div[3]//span`);
                    let date = await dateHandle[0].evaluate(el => el.textContent?.trim());
                    const caseHandle = await page.$x(`//div[contains(@id, "VWGROW2_143_R")][${j + 1}]/div[4]//span`);
                    let caseID = await caseHandle[0].evaluate(el => el.textContent?.trim());
                    const typeHandle = await page.$x(`//div[contains(@id, "VWGROW2_143_R")][${j + 1}]/div[7]//span`);
                    let type = await typeHandle[0].evaluate(el => el.textContent?.trim()); 
                    const clickHandle = await page.$x(`//div[contains(@id, "VWGROW2_143_R")][${j + 1}]//table[contains(@id, "TRG_143_D")]/parent::div/parent::div`)
                    
                    if (j > 0) {
                        await Promise.all([
                            clickHandle[0].click(),
                            page.waitForXPath(`//div[@id="VWGROW2_151_R0"]//span[contains(text(), "${caseID}")]`)
                        ])
                    }
                    
                    const nameXpath = `//div[contains(@id, "VWGROW2_164_R")]/div[1]//span[contains(text(), "2")]/parent::div/parent::div/parent::div/parent::div/parent::div/parent::div/parent::div/div[2]//span`;
                    let nameHandles = await page.$x(nameXpath);
                    for (const nameHandle of nameHandles) {
                        let name = await nameHandle.evaluate(el => el.textContent?.trim());
                        if (name?.includes('-') || name?.includes('+') || this.isEmptyOrSpaces(name!) || removeRowRegex.test(name!)) {
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
                    await this.sleep(1000);
                }

                await Promise.all([
                    page.click('span#TXT_11'),
                    page.waitForXPath('//input[contains(@id, "TRG_98")]', {visible: true})
                ])
            }

            await AbstractProducer.sendMessage('Alamance', 'North Carolina', countRecords, 'Civil & Lien');
            console.log('**********', countRecords, '**********');
            await page.close();
            await this.browser?.close();
            return true;
        }
        catch (error1) {
            console.log('Error: ', error1);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Alamance', 'North Carolina', countRecords, 'Civil & Lien', errorImage);
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
            'County': 'Alamance',
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