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
        generalInfoPage: 'http://72.15.246.186/FranklinNCNW/application.asp?resize=true'
    }

    xpaths = {
        isPAloaded: '//iframe[@id="tabframe0"]'
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
                        
            const dateRange = await this.getDateRange('North Carolina', 'Franklin');
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

                let frame: puppeteer.Frame | null | undefined;
                await page.waitForXPath('//iframe[@id="tabframe0"]');
                let elementHandle = await page.$('iframe#tabframe0');
                frame = await elementHandle?.contentFrame();
                if (!frame) {
                    return false;
                }
                // set date range  
                const fromDateHandle = await frame.$x('//input[@id="fromdate"]');
                const toDateHandle = await frame.$x('//input[@id="todate"]')
                await fromDateHandle[0].click({clickCount: 3});
                await fromDateHandle[0].press('Backspace');
                await fromDateHandle[0].type(dateVal, { delay: 200 });

                await toDateHandle[0].click({clickCount: 3});
                await toDateHandle[0].press('Backspace');
                await toDateHandle[0].type(dateVal, { delay: 200 });  
                
                const searchHandle = await frame.$x('//a[@id="advancedsearch"]/parent::span/parent::div/span[1]');
                await Promise.all([
                    searchHandle[0].click(),
                    frame.waitForSelector('#queryworking', {visible: true}),
                    frame.waitForSelector('#queryworking', {hidden: true}),
                    frame.waitForXPath('//div[@id="pagingElements"]', {visible: true})
                ])

                await this.sleep(3000);
                
                let pageNum = 1;
                let totalNumHandle = await frame.$x('//div[@id="totalpagecount"]');
                let totalNumStr = await totalNumHandle[0].evaluate(el => el.textContent?.trim());
                let totalNum = parseInt(totalNumStr!);
                while (true) {
                    const rows = await frame.$x('//div[@id="resultspane"]/table//tr[contains(@style, "cursor")]');
                    if (rows.length > 0) {
                        for (let i = 0; i < rows.length; i++) {
                            let dateHandle = await frame.$x(`//div[@id="resultspane"]/table//tr[contains(@style, "cursor")][${i + 1}]/td[contains(@class, "c4")]`);
                            let date = await dateHandle[0].evaluate(el => el.textContent?.trim());
                            let caseHandle = await frame.$x(`//div[@id="resultspane"]/table//tr[contains(@style, "cursor")][${i + 1}]/td[contains(@class, "c12")]/div`);
                            let caseID = await caseHandle[0].evaluate(el => el.textContent?.trim());
                            let nameHandle = await frame.$x(`//div[@id="resultspane"]/table//tr[contains(@style, "cursor")][${i + 1}]/td[contains(@class, "c7")]/div`);
                            let name = await nameHandle[0].evaluate(el => el.textContent?.trim());
                            let typeHandle = await frame.$x(`//div[@id="resultspane"]/table//tr[contains(@style, "cursor")][${i + 1}]/td[contains(@class, "c8")]/div`);
                            let type = await typeHandle[0].evaluate(el => el.textContent?.trim());
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

                        const nextEL = await frame.$x('//div[@id="pagingElements"]//a[@id="nextpage"]');
                        if (pageNum < totalNum) {
                            pageNum++;
                            await nextEL[0].click();
                            await this.sleep(3000);
                        } else {
                            break;
                        }
                    } else {
                        break;
                    }
                }
            }            

            await AbstractProducer.sendMessage('Franklin', 'North Carolina', countRecords, 'Civil & Lien');
        } catch (error) {
            console.log(error);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Franklin', 'North Carolina', countRecords, 'Civil & Lien', errorImage);
            return false;
        }
        console.log('******* ', countRecords);
        return true;
    }

    async getData(page: puppeteer.Page, name: any, type: any, date: any, caseID: any): Promise<any> {
        const { firstName, lastName, middleName, fullName, suffix } = this.newParseName(name!);
        let practiceType = this.getPracticeType(type);
        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({ name: productName }).exec();

        const data = {
            'caseUniqueId': caseID,
            'Property State': 'NC',
            'County': 'Franklin',
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