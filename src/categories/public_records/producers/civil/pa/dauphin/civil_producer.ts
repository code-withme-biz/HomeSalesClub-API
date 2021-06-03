import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import axios from "axios";
import {sleep} from "../../../../../../core/sleepable";

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
    'OUTDOORSOLUTIONS', 'NEWREZ', 'LOANPAL', 'MICROF', 'GRAPHICS', 'CARRINGTON', 'Pennsylvania', 'DISTRICT',
    'CLUB', 'GIVEN', 'NONE', 'INIMPENDENT', 'TRUS', 'AND', 'TRUST', 'CLINTON', 'WASHINGTON', 'NATIONWIDE',
    'INVESTMENT', 'INDIANA', 'PHASE'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')

export default class CivilProducer extends AbstractProducer {
    browser: puppeteer.Browser | undefined;
    browserPages = {
        generalInfoPage: undefined as undefined | puppeteer.Page
    };
    urls = {
        generalInfoPage: 'https://deeds.dauphinc.org/OnCoreweb/Search.aspx'
    }

    xpaths = {
        isPAloaded: '//input[@id="cmdSubmit"]'
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

            const dateRange = await this.getDateRange('Pennsylvania', 'Dauphin');
            let fromDateVal = this.getFormattedDate(dateRange.from);
            let toDateVal = this.getFormattedDate(dateRange.to);

            try {
                const docTypeHandle = await page.$x('//a[@title="Search By Document Type"]');
                await docTypeHandle[0].click();
                const fromDateHandle = await page.$x('//input[contains(@name, "txtBeginDate")]');
                const endDateHandle = await page.$x('//input[contains(@name, "txtEndDate")]');
                await fromDateHandle[0].click({clickCount: 3});
                await fromDateHandle[0].press('Backspace');
                await fromDateHandle[0].type(fromDateVal, {delay: 100});
                await endDateHandle[0].click({clickCount: 3});
                await endDateHandle[0].press('Backspace');
                await endDateHandle[0].type(toDateVal, {delay: 100});
            } catch (error1) {
            }
            
            const searchClickResult = await this.waitForSuccess(async () => {
                await Promise.all([
                    page.click('input#cmdSubmit'),
                    page.waitForNavigation()
                ])
            })
            if (!searchClickResult) {
                return false;
            }

            let pageNum = 1;
            let rowsXpath = '//tr[contains(@onmouseover, "this.style")]';
            let url = 'https://deeds.dauphinc.org/OnCoreweb/';
            while (true) {
                const rows = await page.$x(rowsXpath);
                if (rows.length > 0) {
                    for (let i = 0; i < rows.length; i++) {
                        const nameHandle = await page.$x(`//tr[contains(@onmouseover, "this.style")][${i + 1}]/td[5]`);
                        let name = await nameHandle[0].evaluate(el => el.textContent?.trim());
                        const dateHandle = await page.$x(`//tr[contains(@onmouseover, "this.style")][${i + 1}]/td[6]`);
                        let date = await dateHandle[0].evaluate(el => el.textContent?.trim());
                        const caseHandle = await page.$x(`//tr[contains(@onmouseover, "this.style")][${i + 1}]/td[12]`);
                        let caseID = await caseHandle[0].evaluate(el => el.textContent?.trim());
                        const linkHandle = await page.$x(`//tr[contains(@onmouseover, "this.style")][${i + 1}]/td[1]/a`);
                        let href = await linkHandle[0].evaluate(el => el.getAttribute('href'));
                        if (this.isEmptyOrSpaces(name!) || removeRowRegex.test(name!)) {
                            continue;
                        }  
                        const detailPage = await this.browser?.newPage();
                        if (!detailPage) {
                            break;
                        }
                        let retry_count = 1;
                        while (true) {
                            if (retry_count > 3) {
                                console.log('network issue');
                                await AbstractProducer.sendMessage('Dauphin', 'Pennsylvania', countRecords, 'Civil & Lien');
                                return false;
                            }
                            try {
                                await detailPage.goto(url + href, {waitUntil: 'load'});
                                break;
                            } catch (error) {
                                console.log('retrying detail page load - ', retry_count);
                                retry_count++;
                            }
                        }
                        const frame = detailPage.frames().find(f => f.name() === 'contents');
                        if (!frame) {
                            await detailPage.close();
                            continue;
                        }
                        const typeHandle = await frame.$x('//span[@id="lblDocumentType"]');
                        if (typeHandle.length == 0) {
                            await detailPage.close();
                            continue;
                        }
                        let type = await typeHandle[0].evaluate(el => el.textContent?.trim());                       
                        type = type?.split(')')[1].trim();
                        const parserName: any = this.newParseName(name!);
                        if(parserName.type && parserName.type == 'COMPANY'){
                            await detailPage.close();
                            continue;
                        }
                        if (await this.getData(page, name!, type, date, caseID)) {
                            countRecords++
                        }                         
                        await detailPage.close();
                    }
                    let nextEL1 = await page.$x(`//a[text()="${pageNum + 1}"]`);
                    let nextEL2 = await page.$x(`//a[text()="..." and contains(@href, "$ctl${pageNum > 15 ? 11 : 10}")]`);
                    if (nextEL1.length > 0) {
                        pageNum++;
                        const nextClickResult = await this.waitForSuccess(async () => {
                            await Promise.all([
                                nextEL1[0].click(),
                                page.waitForNavigation()
                            ])
                        })
                        if (!nextClickResult) {
                            break;
                        }
                    } else {
                        if (nextEL2.length > 0) {
                            pageNum++;
                            const nextClickResult = await this.waitForSuccess(async () => {
                                await Promise.all([
                                    nextEL2[0].click(),
                                    page.waitForNavigation()
                                ])
                            })
                            if (!nextClickResult) {
                                break;
                            }
                        } else {
                            break;
                        }
                    }
                } else {
                    break;
                }
            }


        } catch (error2) {
            console.log(error2);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Dauphin', 'Pennsylvania', countRecords, 'Civil & Lien', errorImage);
            return false;
        }
        await AbstractProducer.sendMessage('Dauphin', 'Pennsylvania', countRecords, 'Civil & Lien');
        return true;
    }

    async getData(page: puppeteer.Page, name: any, type: any, date: any, caseID: any): Promise<any> {
        const { firstName, lastName, middleName, fullName, suffix } = this.newParseName(name!);
        let practiceType = this.getPracticeType(type);
        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({ name: productName }).exec();

        const data = {
            'caseUniqueId': caseID,
            'Property State': 'PA',
            'County': 'Dauphin',
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
            }
        }
        return true;
    }
}