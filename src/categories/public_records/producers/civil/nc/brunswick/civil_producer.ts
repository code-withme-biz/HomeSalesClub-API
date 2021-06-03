import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import _ from 'lodash'
import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import axios from "axios";
import {sleep} from "../../../../../../core/sleepable";
import { resolveRecaptchaNormal } from '../../../../../../services/general_service';

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
        generalInfoPage: 'http://brunswick-live.inttek.net/'
    }

    xpaths = {
        isPAloaded: '//input[@name="submit"]'
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
        const nums = {'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'zero': 0};

        try {

            const dateRange = await this.getDateRange('North Carolina', 'Brunswick');
            const fromDate = await this.getFormattedDate(dateRange.from);
            const toDate = await this.getFormattedDate(dateRange.to);

            const numHandle1 = await page.$x('//div[@id="edit-captcha-response-wrapper"]/span/span[1]/img');
            const num1 = <keyof typeof nums>await this.checkCaptcha(numHandle1[0]);
            const operHandle = await page.$x('//div[@id="edit-captcha-response-wrapper"]/span/span[2]/img');
            const operation = await this.checkCaptcha(operHandle[0]);
            const numHandle2 = await page.$x('//div[@id="edit-captcha-response-wrapper"]/span/span[3]/img');
            const num2 = <keyof typeof nums>await this.checkCaptcha(numHandle2[0]);
            let val: number;
            if (operation == 'plus') {
                val = nums[num1] + nums[num2];
            } else {
                val = nums[num1] - nums[num2];
            }

            await page.type('input#edit-captcha-response', val.toString(), {delay: 100});
            await Promise.all([
                page.click('input[name="submit"]'),
                page.waitForNavigation()
            ])
            
            const agreeEL = await page.$x('//strong[contains(text(), "I have read")]/parent::font/parent::a');
            await Promise.all([
                agreeEL[0].click(),
                page.waitForNavigation()
            ]);
            
            const mainSearchEL = await page.$x('//font[contains(text(), "Combined Real Property")]/parent::a');
            await Promise.all([
                mainSearchEL[0].click(),
                page.waitForNavigation()
            ])
            
            const dateHandles = await page.$x('//input[contains(@name, "form_date")]');
            await dateHandles[0].focus();
            await dateHandles[0].type(fromDate, {delay: 100});
            await dateHandles[1].focus();
            await dateHandles[1].type(toDate, {delay: 100});

            const searchHandle = await page.$x('//input[@id="do_search2"]');
            await Promise.all([
                searchHandle[0].click(),
                page.waitForNavigation()
            ])
            
            let pageNum = 1;
            const rows = await page.$x('//tr[contains(@onclick, "document")]');
            while (true) {
                if (rows.length > 0) {
                    const bookHandles = await page.$x('//tr[contains(@onclick, "document")]//b[contains(text(), "Book")]/parent::td');
                    const namesHandles = await page.$x('//td[@class="Data" and @colspan="3"]//td/b[contains(text(), "ee") and not(contains(text(), "No"))]/parent::td/parent::tr/parent::tbody');
                    const dateHandle = await page.$x('//tr[contains(@onclick, "document")]//b[contains(text(), "Filing Date:")]/parent::td');
                    const typeHandle = await page.$x('//tr[contains(@onclick, "document")]//b[contains(text(), "Type")]/parent::td/font');
                    for (let i = 0; i < namesHandles.length; i++) {
                        let caseID = await bookHandles[i].evaluate(el => el.textContent?.trim());
                        caseID = caseID?.replace(/[^0-9]/g, '');
                        if (!namesHandles[i]) {
                            continue;
                        }
                        let name = await namesHandles[i].evaluate(el => el.children[0].children[1].children[0].textContent?.trim());  
                        let date = await dateHandle[i].evaluate(el => el.innerHTML);
                        date = date.split('</b>')[1].trim();
                        let type = await typeHandle[i].evaluate(el => el.textContent?.trim());
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
                    const nextEL = await page.$x('//input[@id="next_page"]');
                    if (nextEL.length > 0) {
                        await Promise.all([
                            nextEL[0].click(),
                            page.waitForNavigation()
                        ])
                        pageNum++;
                    } else {
                        break;
                    }
                } else {
                    console.log('No Records')
                    break;
                }
            }
            await AbstractProducer.sendMessage('Brunswick', 'North Carolina', countRecords, 'Civil & Lien');
        } catch (error) {
            console.log(error);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Brunswick', 'North Carolina', countRecords, 'Civil & Lien', errorImage);
            return false;
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
            'Property State': 'NC',
            'County': 'Brunswick',
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

    async checkCaptcha(element: puppeteer.ElementHandle<Element>) : Promise<string> {
        try {
            let base64String = await element.screenshot({encoding: "base64"});
            console.log("Resolving captcha...");
            const captchaSolution = <string>await resolveRecaptchaNormal(base64String);
            return _.lowerCase(captchaSolution);
        } catch (e) {
            return '';
        }  
    }
}