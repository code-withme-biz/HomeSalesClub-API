import puppeteer from 'puppeteer';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import axios from 'axios';

import db from '../../../../../../models/db';
import SnsService from '../../../../../../services/sns_service';
import { resolveRecaptcha2 } from '../../../../../../services/general_service';

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
    urls = {
        generalInfoPage: 'https://in3laredo.fidlar.com/INMarion/DirectSearch/#!/search#%2Fsearch'
    }

    xpaths = {
        isPageLoaded: `//button[@ng-click="vm.searchClick()"]`
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
            await this.browserPages.generalInfoPage.setDefaultTimeout(60000);
            await this.browserPages.generalInfoPage.goto(this.urls.generalInfoPage, { waitUntil: 'load' });
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

    async sendMessage(county: string, state: string, countRecords: number, sourceType: string) {
        const snsService = new SnsService();
        let topicName = 'CIVIL_TOPIC_DEV';
        if (! await snsService.exists(topicName)) {
            await snsService.create(topicName);
        }

        if (! await snsService.subscribersReady(topicName, SnsService.CIVIL_UPDATE_SUBSCRIBERS)) {
            await snsService.subscribeList(topicName);
        }
        await snsService.publish(topicName, `${county} county, ${state} total ${sourceType} data saved: ${countRecords}`);
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;

        try {         
            const dateRange = await this.getDateRange('Indiana', 'Marion');
            let date = dateRange.from;
            let today = new Date();
            today.setDate((dateRange.to).getDate());
            let countRecords = 0;
            let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24)) - 1;
            for (let i = days < 0 ? 1 : days; i >= 6; i--) {
                try {
                    // setting date range
                    let dateSearch = new Date();
                    dateSearch.setDate(dateSearch.getDate() - i);
                    console.log('Start search with date: ', dateSearch.toLocaleDateString('en-US'))
                    const fromDateHandle = await page.$x(`//input[@id="StartDate"]`);
                    const toDateHandle = await page.$x(`//input[@ng-model="vm.searchCriteria.endDate"]`)
                    await fromDateHandle[0].type(dateSearch.toLocaleDateString('en-US', {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit"
                    }), {delay: 100});
                    await toDateHandle[0].type(dateSearch.toLocaleDateString('en-US', {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit"
                    }), {delay: 100});

                    // click search button
                    const clickSearch = await page.$x('//button[@ng-click="vm.searchClick()"]');
                    await clickSearch[0].click();
                    // let isCaptcha = await this.checkForRecaptcha(page);
                    // if (isCaptcha) {
                        await page.waitFor(5000);
                        const noResultHandle = await page.$x('//label[contains(text(), "No results found")]');
                        if (noResultHandle.length > 0) {
                            const okBtnHandle = await page.$x('//button[@ng-click="ok()"]');
                            await okBtnHandle[0].click();
                        } else {
                            await page.waitForXPath('//div[@id="resultsContainer"]/ul/li');
                            const rows = await page.$x('//div[@id="resultsContainer"]/ul/li'); 
                            for (let j = 0; j < rows.length; j++) {
                                const caseHandle = await page.$x(`//div[@id="resultsContainer"]/ul/li[${j + 1}]/div/div/div/label[1]`);
                                let caseID = await caseHandle[0].evaluate(el => el.textContent?.trim());
                                const typeHandle = await page.$x(`//div[@id="resultsContainer"]/ul/li[${j + 1}]/div/div/div/label[2]`);
                                let type = await typeHandle[0].evaluate(el => el.textContent?.trim());
                                const dateHandle = await page.$x(`//div[@id="resultsContainer"]/ul/li[${j + 1}]/div/div/div/label[3]`);
                                let date = await dateHandle[0].evaluate(el => el.textContent?.trim().split(' ')[0].trim());
                                const nameHandle = await page.$x(`//div[@id="resultsContainer"]/ul/li[${j + 1}]/div/div/div/label[4]`);
                                let name = await nameHandle[0].evaluate(el => el.textContent?.trim());
                                if (this.isEmptyOrSpaces(name!)) {
                                    continue;
                                }
                                if (removeRowRegex.test(name!)) {
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
                            const backBtnHandle = await page.$x('//button[@ng-click="vm.backToSearch()"]');
                            await backBtnHandle[0].click();
                        }
                        await page.waitFor(3000);
                    // }                    
                } catch (error) {
                    console.log('----', error)
                }
                
            }           

            await AbstractProducer.sendMessage('Marion', 'Indiana', countRecords, 'Civil & Lien');
            return true;
        }
        catch (error) {
            console.log('Error: ', error);
        }

        return false;
    }

    async getData(page: puppeteer.Page, name: any, type: any, date: any, caseID: any): Promise<any> {
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
            'Property State': 'IN',
            'County': 'Marion',
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

    async checkForRecaptcha(page: puppeteer.Page): Promise<boolean> {
        await page.waitFor(2000);
        const isRecaptcha = await page.$x('//span[contains(text(), "Captcha")]');
        console.log(isRecaptcha.length)
        if (isRecaptcha.length > 0) {
            // captcha
            console.log("Resolving captcha...");
            const captchaSolution: any = await resolveRecaptcha2('6LfXFjUUAAAAALGskqYP81KhD65-lCWFTJ1VIZSd', await page.url());
            let recaptchaHandle = await page.$x('//*[contains(@id, "g-recaptcha-response")]');
            await recaptchaHandle[0].evaluate((elem: any, captchaSolution: any) => {
                elem.innerHTML = captchaSolution
            }, captchaSolution);
            console.log("Done.");
            await page.waitFor
            // let submit_recaptcha = await page.$x('//button[@ng-click="submitCaptcha()"]');
            // await Promise.all([
            //     submit_recaptcha[0].click()
            // ]);
        }
        console.log('captcha passed');
        return true;
    }
}