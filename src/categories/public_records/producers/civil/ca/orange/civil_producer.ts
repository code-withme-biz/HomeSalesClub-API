import puppeteer from 'puppeteer';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import db from '../../../../../../models/db';
import SnsService from '../../../../../../services/sns_service';

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
    'ACADEMY', 'VENTURE', 'REVOCABLE', 'CONSTRUCTION', 'HOMETOWN', 'ORANGE', 'CALIFORNIA', 'INVESTIGATIONS'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')

export default class CivilProducer extends AbstractProducer {
    urls = {
        generalInfoPage: 'https://cr.ocgov.com/recorderworks/'
    }

    xpaths = {
        isPageLoaded: `//a[contains(@onclick, "AlignmentHelper.tabItemSelect('.searchByDocType")]`
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

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let data = [];
        let records = 0

        try {          
            try {
                const [docBtnHandle] = await page.$x(`//a[contains(@onclick, "AlignmentHelper.tabItemSelect('.searchByDocType")]`);
                await docBtnHandle.click();
            } catch (error) {
                console.log(error);
                return false;
            }
            const dateRange = await this.getDateRange('California', 'Orange');
            let countRecords = 0;
            let date = dateRange.from;
            let today = dateRange.to;
            let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24));
            for (let i = days < 0 ? 1 : days; i >= 0; i--) {
                const docListHandle = await page.$x('//table[@id="tblDocTypesChk"]/tbody/tr');
                let dateSearch = new Date();
                dateSearch.setDate(dateSearch.getDate() - i);
                console.log('Start search with date: ', dateSearch.toLocaleDateString('en-US')); 
                for (let j = 6; j < docListHandle.length; j += 10) {
                    try {
                        // setting date range
                        const dateFromElement = await page.$x('//input[@id="MainContent_MainMenu1_SearchByDocType1_FromDate"]');
                        await dateFromElement[0].click({clickCount: 3});
                        await dateFromElement[0].press('Backspace');
                        await dateFromElement[0].type(dateSearch.toLocaleDateString('en-US', {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit"
                        }), { delay: 100 });
    
                        const dateToElement = await page.$x('//input[@id="MainContent_MainMenu1_SearchByDocType1_ToDate"]');
                        await dateToElement[0].click({clickCount: 3});
                        await dateToElement[0].press('Backspace');
                        await dateToElement[0].type(dateSearch.toLocaleDateString('en-US', {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit"
                        }), { delay: 100 });

                        // setting doc type
                        const docType = await page.$x(`//table[@id="tblDocTypesChk"]//tr[contains(@class, "tr${j} dt_select")]`);
                        await docType[0].click();
                        const docType1 = await page.$x(`//table[@id="tblDocTypesChk"]//tr[contains(@class, "tr${j + 1} dt_select")]`);
                        await docType1[0].click();
                        const docType2 = await page.$x(`//table[@id="tblDocTypesChk"]//tr[contains(@class, "tr${j + 2} dt_select")]`);
                        await docType2[0].click();
                        const docType3 = await page.$x(`//table[@id="tblDocTypesChk"]//tr[contains(@class, "tr${j + 3} dt_select")]`);
                        await docType3[0].click();
                        const docType4 = await page.$x(`//table[@id="tblDocTypesChk"]//tr[contains(@class, "tr${j + 4} dt_select")]`);
                        await docType4[0].click();
                        const docType5 = await page.$x(`//table[@id="tblDocTypesChk"]//tr[contains(@class, "tr${j + 5} dt_select")]`);
                        await docType5[0].click();
                        const docType6 = await page.$x(`//table[@id="tblDocTypesChk"]//tr[contains(@class, "tr${j + 6} dt_select")]`);
                        await docType6[0].click();
                        const docType7 = await page.$x(`//table[@id="tblDocTypesChk"]//tr[contains(@class, "tr${j + 7} dt_select")]`);
                        await docType7[0].click();
                        const docType8 = await page.$x(`//table[@id="tblDocTypesChk"]//tr[contains(@class, "tr${j + 8} dt_select")]`);
                        await docType8[0].click();
                        const docType9 = await page.$x(`//table[@id="tblDocTypesChk"]//tr[contains(@class, "tr${j + 9} dt_select")]`);
                        await docType9[0].click();

                        // click search button
                        const searchHandle = await page.$x('//div[@id="MainContent_MainMenu1_SearchByDocType1_btnSearch"]');
                        await Promise.all([
                            searchHandle[0].click(),
                            page.waitForXPath('//span[@id="SearchResultsTitle1_resultCount"]')
                        ]);
                        await this.sleep(5000);
                        
                        const countHandle = await page.$x('//span[@id="SearchResultsTitle1_resultCount"]');
                        const count = await countHandle[0].evaluate(el => el.textContent?.trim());
                        if (parseInt(count!) > 0) {
                            console.log('checking alert box');
                            const alertHandle = await page.$x('//div[@aria-labelledby="ui-dialog-title-MainContent_AlertMessageBox_CtrlWidget"]');
                            const overBtnHandle = await page.$x('//*[@id="MainContent_AlertMessageBox_btnOK"]');
                            if (alertHandle.length > 0) {
                                await overBtnHandle[0].click();
                                console.log('clicked alert')
                            } else {
                                console.log('no alert')
                            }
                            
                            let isLast = false, pageNum = 1;
                            while (!isLast) {
                                await page.waitForXPath('//tr[@class="searchResultRow"]');
                                const results = await page.$x('//tr[@class="searchResultRow"]');
                                for (let i = 0; i < results.length; i++) {
                                    const typeHandle = await page.$x(`//tr[@class="searchResultRow"][${i + 1}]/td[3]/div/div[4]`);
                                    let type = await typeHandle[0].evaluate(el => el.textContent?.trim());
                                    const dateHandle = await page.$x(`//tr[@class="searchResultRow"][${i + 1}]/td[4]`);
                                    let date = await dateHandle[0].evaluate(el => el.textContent?.trim());
                                    const nameHandles = await page.$x(`//tr[@class="searchResultRow"][${i + 1}]/td[3]/div/div[2]/p`);
                                    for (let i = 0; i < nameHandles.length; i++) {
                                        let name = await nameHandles[i].evaluate(el => el.textContent?.trim());
                                        if (this.isEmptyOrSpaces(name!)) {
                                            continue;
                                        }
                                        if (removeRowRegex.test(name!)) {
                                            continue;
                                        }
                                        const parserName: any = this.newParseName(name!);
                                        if(parserName?.type && parserName?.type == 'COMPANY'){
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
                                }
                                if (results.length < 20) {
                                    break;
                                }

                                const nextEl = await page.$x('//td[text()="Next"]');
                                if (!nextEl) {
                                    break;
                                }

                                const nextElCls = await nextEl[0].evaluate(el => el.getAttribute('class'));
                                if (nextElCls == 'pagingCell pagingCellDisable') {
                                    isLast = true;
                                } else {
                                    pageNum++;
                                    isLast = false;
                                    await nextEl[0].click();
                                    await page.waitForXPath(`//td[@class="pagingCell pagingCellNumber pagingCellDisable pagingCellCurrent" and text()="${pageNum}"]`)
                                }
                            }
                        } else {
                            console.log('No Records')
                        }
                        // back to new search
                        const newSearchHandle = await page.$x(`//a[contains(@onclick, "AlignmentHelper.tabItemSelect('.searchByDocType")]`);
                        await newSearchHandle[0].click();
                        await this.sleep(3000)
                    } catch (e) {
                        console.log(e)
                    }
                }
                console.log(`/////// ${dateSearch.toLocaleDateString('en-US')} TO FETCH DATA length = `, data.length);
            }
            console.log('/////// FINISHED TO FETCH DATA length = ', data.length);
            records = await this.saveRecords(data, this.publicRecordProducer.state, this.publicRecordProducer.county);
            await AbstractProducer.sendMessage('Orange', 'California', countRecords, 'Civil & Lien');
            return true;
        }
        catch (error) {
            console.log('Error: ', error);
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
            }
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
            'Property State': 'CA',
            'County': 'Orange',
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

    sleep(ms: number) {
        return new Promise((resolve) => {
          setTimeout(resolve, ms);
        });
    }

}