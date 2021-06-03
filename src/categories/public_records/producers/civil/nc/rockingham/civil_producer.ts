import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import _ from 'lodash'
import puppeteer from 'puppeteer';

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
        generalInfoPage: 'http://72.15.246.187/RockinghamNCNW/application.asp?resize=true'
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
            await this.browserPages.generalInfoPage.setDefaultNavigationTimeout(60000);
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
        let countRecords = 0, data = [], records = 0;

        try {
            let frame: puppeteer.Frame | null | undefined;
            await page.waitForXPath('//iframe[@id="tabframe0"]');
            let elementHandle = await page.$('iframe#tabframe0');
            frame = await elementHandle?.contentFrame();
            if (!frame) {
                return false;
            }
            
            const dateRange = await this.getDateRange('North Carolina', 'Rockingham');
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
                const fromDateHandle = await frame.$x('//input[@id="fromdate"]');
                const toDateHandle = await frame.$x('//input[@id="todate"]')
                await fromDateHandle[0].click({clickCount: 3});
                await fromDateHandle[0].press('Backspace');
                await fromDateHandle[0].type(dateVal, { delay: 200 });

                await toDateHandle[0].click({clickCount: 3});
                await toDateHandle[0].press('Backspace');
                await toDateHandle[0].type(dateVal, { delay: 200 });  

                const eitherHandle = await frame.$x('//input[@id="searchtype" and @value="2"]');
                await eitherHandle[0].click();
                
                const searchHandle = await frame.$x('//a[@id="advancedsearch"]/parent::span/parent::div/span[1]');
                await searchHandle[0].click();

                await frame.waitForSelector('#queryworking', {visible: true});
                await frame.waitForSelector('#queryworking', {hidden: true});
                await frame.waitForXPath('//div[@id="pagingElements"]', {visible: true});
                await this.sleep(1000);
                
                
                const rows1 = await frame.$x('//div[@id="directoryresultspane"]/table//tr[contains(@style, "cursor")]');
                if (rows1.length > 0) {
                    let pageNum1 = 1;
                    let totalNumHandle1 = await frame.$x('//div[@id="totalpagecount"]');
                    let totalNumStr1 = await totalNumHandle1[0].evaluate(el => el.textContent?.trim());
                    let totalNum1 = parseInt(totalNumStr1!);

                    while (true) {
                        await frame.click('#filterSelectAll>a');    
                        const nextEL = await frame.$x('//div[@id="pagingElements"]//a[@id="nextpage"]');
                        if (pageNum1 < totalNum1) {
                            pageNum1++;
                            await nextEL[0].click();
                            await frame.waitForSelector('#queryworking', {visible: true});
                            await frame.waitForSelector('#queryworking', {hidden: true});
                            await this.sleep(1000);
                        } else {
                            break;
                        } 
                    } 
                    await frame.click('#filterDirectoryResults>a');
                    await frame.waitForSelector('#queryworking', {visible: true});
                    await frame.waitForSelector('#queryworking', {hidden: true});
                    await frame.waitForXPath('//div[@id="resultspane"]', {visible: true});
                    await this.sleep(1000)

                    let pageNum2 = 1;
                    let totalNumHandle2 = await frame.$x('//div[@id="totalpagecount"]');
                    let totalNumStr2 = await totalNumHandle2[0].evaluate(el => el.textContent?.trim());
                    let totalNum2 = parseInt(totalNumStr2!);
                    while (true) {
                        const rows2 = await frame.$x('//div[@id="resultspane"]/table//tr[contains(@style, "cursor")]');
                        for (let j = 0; j < rows2.length; j++) {
                            let dateHandle = await frame.$x(`//div[@id="resultspane"]/table//tr[contains(@style, "cursor")][${j + 1}]/td[@class="col c4"]`);
                            let date = await dateHandle[0].evaluate(el => el.textContent?.trim());
                            let nameHandle = await frame.$x(`//div[@id="resultspane"]/table//tr[contains(@style, "cursor")][${j + 1}]/td[@class="col c56"]/div`);
                            let name;
                            if (nameHandle[0]) {
                                name = await nameHandle[0].evaluate(el => el.textContent?.trim());
                            } else {
                                let fnameHandle = await frame.$x(`//div[@id="resultspane"]/table//tr[contains(@style, "cursor")][${j + 1}]/td[@class="col c5"]/div`);
                                let fname = await fnameHandle[0].evaluate(el => el.textContent?.trim());
                                let lnameHandle = await frame.$x(`//div[@id="resultspane"]/table//tr[contains(@style, "cursor")][${j + 1}]/td[@class="col c6"]/div/span`);
                                let lname = await lnameHandle[0].evaluate(el => el.textContent?.trim());
                                name = fname + ' ' + lname;
                            }
                            
                            let typeHandle = await frame.$x(`//div[@id="resultspane"]/table//tr[contains(@style, "cursor")][${j + 1}]/td[@class="col c8"]/div`);
                            let type = await typeHandle[0].evaluate(el => el.textContent?.trim());
                            if (name?.includes('-') || name?.includes('+') || this.isEmptyOrSpaces(name!) || removeRowRegex.test(name!)) {
                                continue;
                            }
                            const parserName: any = this.newParseName(name!);
                            if(parserName.type && parserName.type == 'COMPANY'){
                                continue;
                            }
                            let practiceType = this.getPracticeType(type!);
                            const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                            data.push({
                                parseName: parserName,
                                fillingDate: date,
                                docType: type,
                                productName
                            })
                        }
                        const nextEL = await frame.$x('//div[@id="pagingElements"]//a[@id="nextpage"]');
                        if (pageNum2 < totalNum2) {
                            pageNum2++;
                            await nextEL[0].click();
                            await frame.waitForSelector('#queryworking', {visible: true});
                            await frame.waitForSelector('#queryworking', {hidden: true});
                            await this.sleep(1000);
                        } else {
                            break;
                        } 
                    }
                } 
            }
            console.log('/////// FINISHED TO FETCH DATA length = ', data.length);
            records = await this.saveRecords(data, this.publicRecordProducer.state, this.publicRecordProducer.county);
            await AbstractProducer.sendMessage('Rockingham', 'North Carolina', countRecords, 'Civil & Lien');
        } catch (error) {
            console.log(error);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Rockingham', 'North Carolina', countRecords, 'Civil & Lien', errorImage);
            return false;
        }
        return true;
    }
}