import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

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
        generalInfoPage: 'https://countyfusion5.kofiletech.us/index.jsp'
    }

    xpaths = {
        isPAloaded: '//a[contains(text(), "Arapahoe")]'
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
            // choose county
            const [county_handle] = await page.$x('//a[contains(text(), "Arapahoe")]');
            await Promise.all([
                county_handle.click(),
                page.waitForNavigation()
            ]);
            await page.waitFor(1000);

            // click login as public
            try {
                const [recordsBtnHandle] = await page.$x(`//input[@onclick="doGuestLogin(true, 'GuestStartPage')"]`);
                await recordsBtnHandle.click();
                await page.waitForNavigation();
            } catch (error) {
                console.log(error);
                return false;
            }

            const dateRange = await this.getDateRange('Colorado', 'Arapahoe');
            let fromDateVal = this.getFormattedDate(dateRange.from);
            let toDateVal = this.getFormattedDate(dateRange.to);

            let frame: puppeteer.Frame | null | undefined;
            await page.waitForXPath('//iframe[@name="bodyframe"]');
            let elementHandle = await page.$('iframe[name="bodyframe"]');
            frame = await elementHandle?.contentFrame();

            await frame?.waitForXPath('//input[@id="accept"]');
            let [accpetBtn]: any = await frame?.$x('//input[@id="accept"]');
            await accpetBtn?.click();
            await page.waitForNavigation();

            let frame4: puppeteer.Frame | null | undefined;
            await page.waitForXPath('//iframe[@name="bodyframe"]');
            let element4 = await page.$('iframe[name="bodyframe"]');
            frame4 = await element4?.contentFrame();

            let frame5: puppeteer.Frame | null | undefined;
            await frame4?.waitForXPath('//iframe[@id="dynSearchFrame"]')
            let element5 = await frame4?.$('iframe#dynSearchFrame');
            frame5 = await element5?.contentFrame();

            let frame6: puppeteer.Frame | null | undefined;
            await frame5?.waitForXPath('//iframe[@id="criteriaframe"]');
            let elementHandle6 = await frame5?.$('iframe#criteriaframe');
            frame6 = await elementHandle6?.contentFrame();

            await frame5?.waitForXPath('//tr[@id="datagrid-row-r2-2-0"]', {visible: true});
            await frame6?.waitForXPath('//input[@id="FROMDATE"]');
            await frame6?.waitForXPath('//div[@id="searchFields"]');
            await page.waitFor(3000);
            let [fromDate]: any = await frame6?.$x('//input[@id="FROMDATE"]/parent::td/span/input[1]');
            let [endDate]: any = await frame6?.$x('//input[@id="TODATE"]/parent::td/span/input[1]');
            await fromDate?.click();
            await fromDate?.type(fromDateVal, {delay: 150});
            await endDate?.click();
            await endDate?.type(toDateVal, {delay: 150});

            let [searchEL]: any = await frame5?.$x('//img[@id="imgSearch"]/parent::a');
            await searchEL?.click();
            await page.waitFor(3000);

            let nextPage = true;
            while (nextPage) {
                await page.waitForXPath('//iframe[@name="bodyframe"]', {visible: true});
                let [body_frame]: any = await page.$x('//iframe[@name="bodyframe"]');
                body_frame = await body_frame.contentFrame();
                await this.checkCaptcha(page);

                try{
                    await body_frame.waitForXPath('//iframe[@name="progressFrame"]', {hidden: true});
                } catch (error) {
                    await body_frame.waitForXPath('//iframe[@name="progressFrame"]', {hidden: true});
                }

                try {
                    await body_frame.waitForXPath('//iframe[@name="resultFrame"]', {visible: true});
                } catch (error) {
                    console.log('Not found');
                    break;
                }

                await body_frame.waitForXPath('//iframe[@name="resultFrame"]', {visible: true});
                let result_frame: puppeteer.Frame | null | undefined, result_list_frame: puppeteer.Frame | null | undefined;
                let result_frame_handle = await body_frame.$x('//iframe[@name="resultFrame"]');
                result_frame = await result_frame_handle[0].contentFrame();
        
                await result_frame?.waitForXPath('//iframe[@name="resultListFrame"]', {visible: true});
                let result_list_frame_handle: any = await result_frame?.$x('//iframe[@name="resultListFrame"]');
                result_list_frame = await result_list_frame_handle[0].contentFrame();

                await result_list_frame?.waitForXPath('//table[contains(@class, "datagrid-btable")]/tbody/tr/td/table/tbody/tr', {visible: true});
                const resultRows = await result_list_frame?.$x('//table[contains(@class, "datagrid-btable")]/tbody/tr/td/table/tbody/tr');

                for (let i = 0; i < resultRows!.length; i++) {
                    let caseHandle = await result_list_frame?.$x(`//a[@id="inst${i}"]`);
                    let caseID = caseHandle && await caseHandle[0].evaluate(el => el.textContent?.trim());
                    let nameHandle = await result_list_frame?.$x(`//div[@id="instList"]//div[@class="datagrid-view2"]/div[@class="datagrid-body"]/table/tbody/tr[${i + 1}]//tr/td[10]//span`);
                    let namesHTML = nameHandle ? await nameHandle[0].evaluate(el => el.innerHTML) : '';
                    let names = namesHTML.split('<br>');
                    let typeHandle = await result_list_frame?.$x(`//div[@id="instList"]//div[@class="datagrid-view2"]/div[@class="datagrid-body"]/table/tbody/tr[${i + 1}]//tr/td[6]/div`);
                    let type = typeHandle && await typeHandle[0].evaluate(el => el.textContent?.trim());
                    let dateHandle = await result_list_frame?.$x(`//div[@id="instList"]//div[@class="datagrid-view2"]/div[@class="datagrid-body"]/table/tbody/tr[${i + 1}]//tr/td[11]/div`);
                    let date = dateHandle && await dateHandle[0].evaluate(el => el.textContent?.trim());
                    type = type?.replace(/[^a-zA-Z ]/g, "");

                    let practiceType = this.getPracticeType(type!);

                    for (const name of names) {
                        if (this.isEmptyOrSpaces(name!)) {
                            continue;
                        }
                        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                        const prod = await db.models.Product.findOne({ name: productName }).exec();
                        const parseName: any = this.newParseName(name!.trim());
                        if (removeRowRegex.test(name!)) {
                            continue;
                        }
                        const parserName: any = this.newParseName(name!);
                        if(parserName.type && parserName.type == 'COMPANY'){
                            continue;
                        }
                        const data = {
                            'Property State': 'CO',
                            'County': 'Arapahoe',
                            'First Name': parseName.firstName,
                            'Last Name': parseName.lastName,
                            'Middle Name': parseName.middleName,
                            'Name Suffix': parseName.suffix,
                            'Full Name': parseName.fullName,
                            "vacancyProcessed": false,
                            fillingDate: date,
                            "productId": prod._id,
                            originalDocType: type
                        };
                        if (await this.civilAndLienSaveToNewSchema(data))
                            countRecords += 1;
                    }
                }
                                    
                await result_frame?.waitForXPath('//iframe[@name="subnav"]');
                let [subnav_frame]: any = await result_frame?.$x('//iframe[@name="subnav"]');
                subnav_frame = await subnav_frame.contentFrame();

                let nextPageEnabled = await subnav_frame.$x(`//a[contains(@onclick, "parent.navigateResults('next')")]`);
                if (nextPageEnabled.length === 0) {
                    nextPage = false;
                } else {
                    let nextPageButton = await subnav_frame.$x(`//a[contains(@onclick, "parent.navigateResults('next')")]`);
                    await nextPageButton[0].click();
                    await this.sleep(5000);
                }
            }
            
            console.log(countRecords);
            await AbstractProducer.sendMessage('Arapahoe', 'Colorado', countRecords, 'Civil & Lien');
        } catch (error) {
            console.log(error);
            await AbstractProducer.sendMessage('Arapahoe', 'Colorado', countRecords, 'Civil & Lien');
            return false;
        }
        return true;
    }
    async checkCaptcha(page: puppeteer.Page) {
        let frame7: puppeteer.Frame | null | undefined, captcha_frame: puppeteer.Frame | null | undefined;
        await page.waitForXPath('//iframe[@name="bodyframe"]', {visible: true});
        let elementHandle7 = await page.$('iframe[name="bodyframe"]');
        frame7 = await elementHandle7?.contentFrame();
        let result_frame: puppeteer.Frame | null | undefined;
        await frame7?.waitForXPath('//iframe[@name="resultFrame"]');
        let result_frame_element = await frame7?.$('iframe#resultFrame');
        result_frame = await result_frame_element?.contentFrame();
        let captcha_frame_element = await result_frame?.$('iframe#img');
        captcha_frame = await captcha_frame_element?.contentFrame();

        if (captcha_frame) {
            try {
                await captcha_frame?.waitForSelector('img', {timeout: 10000})
                let captchaEl = await captcha_frame?.$('img');
                let base64String = await captchaEl?.screenshot({encoding: "base64"});
                console.log("Resolving captcha...");
                const captchaSolution: any = await resolveRecaptchaNormal(base64String);
                let captchaHandle = await result_frame?.$('input#code');
                await captchaHandle?.type(captchaSolution, {delay: 100});
                await Promise.all([
                    result_frame?.click('input[value="OK"]')
                ]);
            } catch (e) {
            }   
        }
        return;
    }
}