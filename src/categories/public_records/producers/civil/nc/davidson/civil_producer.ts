import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import _ from 'lodash'
import puppeteer from 'puppeteer';
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
    'ACADEMY', 'VENTURE', 'REVOCABLE', 'CONSTRUCTION', 'HOMETOWN', 'ORANGE', 'CALIFORNIA', 'X',
    'NATIONALBK', 'MICHIGAN', 'FOUNDATION', 'GRAPHICS', 'UNITY', 'NORTHPARK', 'PLAZA', 'FOREST', 'REALTY', 
    'OUTDOORSOLUTIONS', 'NEWREZ', 'LOANPAL', 'MICROF', 'GRAPHICS', 'CARRINGTON', 'COLORADO', 'DISTRICT',
    'CLUB', 'GIVEN', 'NONE', 'INIMPENDENT', 'TRUS', 'AND', 'TRUST', 'CLINTON', 'WASHINGTON', 'NATIONWIDE',
    'INVESTMENT', 'INDIANA'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')

export default class CivilProducer extends AbstractProducer {
    browser: puppeteer.Browser | undefined;
    browserPages = {
        generalInfoPage: undefined as undefined | puppeteer.Page
    };
    urls = {
        generalInfoPage: 'https://www.davidsondeeds.com/search/davidsonNameSearch.php'
    }

    xpaths = {
        isPAloaded: '//input[@id="Accept"]'
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
            await this.browserPages.generalInfoPage.goto(this.urls.generalInfoPage, { waitUntil: 'load' });
            return true;
        } catch (err) {
            console.warn(err);
            return false;
        }
    }

    async read(): Promise<boolean> {
        try {
            await this.browserPages.generalInfoPage?.waitForXPath(this.xpaths.isPAloaded);
            return true;
        } catch (err) {
            console.warn('Problem loading civil producer page.');
            return false;
        }
    }

    // To check empty or space
    isEmptyOrSpaces(str: string) {
        return str === null || str.match(/^\s*$/) !== null;
    }

    // This is main function
    async parseAndSave(): Promise<boolean> {
        const civilUrl: string = this.urls.generalInfoPage;
        let page = this.browserPages.generalInfoPage!;
        let countRecords = 0;

        try {
            try {
                await Promise.all([
                    page.click('#Accept'),
                    page.waitForNavigation()
                ])
            } catch (error1) {
                
            }
            
            const dateRange = await this.getDateRange('North Carolina', 'Davidson');
            let date = dateRange.from;
            let today = dateRange.to;
            let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24));

            for (let i = days < 0 ? 1 : days; i >= 0; i--) {
                let dateSearch = new Date();
                dateSearch.setDate(dateSearch.getDate() - i);
                console.log('Start search with date: ', dateSearch.toLocaleDateString('en-US'));   
                const dateHandle = await page.$x('//input[contains(@id, "date")]');
                await dateHandle[0].click({clickCount: 3});
                await dateHandle[0].press('Backspace');
                await dateHandle[0].type(dateSearch.toLocaleDateString('en-US', {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit"
                }), { delay: 100 })
                await dateHandle[1].click({clickCount: 3});
                await dateHandle[1].press('Backspace');
                await dateHandle[1].type(dateSearch.toLocaleDateString('en-US', {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit"
                }), { delay: 100 })

                const granteeHandle = await page.$x('//input[@value="Grantee"]');
                await granteeHandle[0].click();

                await Promise.all([
                    page.click('#frmlookup_form_search'),
                    page.waitForNavigation()
                ])

                const results = await page.$x('//table[@bgcolor="#CCCCCC"]/tbody/tr[contains(@bgcolor, "#FFFFFF")]');
                for (let i = 0; i < results.length; i++) {
                    const prev = await page.$x(`//table[@bgcolor="#CCCCCC"]/tbody/tr[contains(@bgcolor, "#FFFFFF")][${i}]/td[1]/input`);
                    const next = await page.$x(`//table[@bgcolor="#CCCCCC"]/tbody/tr[contains(@bgcolor, "#FFFFFF")][${i + 1}]/td[1]/input`);
                    if (prev[0]) {
                        await prev[0].click()
                    }
                    if (next[0]) {
                        await next[0].click()
                    }
                    const lnameHandle = await page.$x(`//table[@bgcolor="#CCCCCC"]/tbody/tr[contains(@bgcolor, "#FFFFFF")][${i + 1}]/td[2]`);
                    const fnameHandle = await page.$x(`//table[@bgcolor="#CCCCCC"]/tbody/tr[contains(@bgcolor, "#FFFFFF")][${i + 1}]/td[3]`);
                    const lname = await lnameHandle[0].evaluate(el => el.textContent?.trim());
                    const fname = await fnameHandle[0].evaluate(el => el.textContent?.trim());
                    let name = lname + ' ' + fname;
                    await Promise.all([
                        page.click('#displaybutton'),
                        page.waitForNavigation()
                    ])
                    const rows = await page.$x(`//font/parent::b/parent::td/parent::tr/parent::tbody/tr`);
                    for (let i = 6; i < rows.length - 1; i++) {
                        let date = await rows[i].evaluate(el => el.children[0].children[0].textContent?.trim());
                        let caseID = await rows[i].evaluate(el => el.children[1].textContent?.trim());
                        let type = await rows[i].evaluate(el => el.children[2].textContent?.trim());
                        if (await this.getData(page, name!.trim(), type, date, caseID)) {
                            countRecords++
                        } 
                    }
                    await Promise.all([
                        page.click('input[value="Name Pick"]'),
                        page.waitForNavigation()
                    ])
                }

                await Promise.all([
                    page.click('input[value="Back to Lookup"]'),
                    page.waitForNavigation()
                ])
            }

            await AbstractProducer.sendMessage('Davidson', 'North Carolina', countRecords, 'Civil & Lien');
        } catch (error) {
            console.log(error);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Davidson', 'North Carolina', countRecords, 'Civil & Lien', errorImage);
            return false;
        }
        console.log('******* ', countRecords, ' *******')
        return true;
    }

    async getData(page: puppeteer.Page, name: any, type: any, date: any, caseID: any): Promise<any> {
        if (this.isEmptyOrSpaces(name!) || removeRowRegex.test(name!)) {
            return false;
        }
        const parserName: any = this.newParseName(name!);
        if(parserName.type && parserName.type == 'COMPANY'){
            return false;
        }

        const { firstName, lastName, middleName, fullName, suffix } = this.newParseName(name!);
        let practiceType = this.getPracticeType(type);
        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({ name: productName }).exec();

        const data = {
            'caseUniqueId': caseID,
            'Property State': 'NC',
            'County': 'Davidson',
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
}