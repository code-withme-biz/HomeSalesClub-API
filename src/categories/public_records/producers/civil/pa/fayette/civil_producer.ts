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
	'CU', 'BK', 'UN', 'PA', 'DOLLAR', 'ASSN', 'REVOLUTION', 'COMMUNITY', 'PLACE', 'SPECTRUM'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')

export default class CivilProducer extends AbstractProducer {
    urls = {
        generalInfoPage: 'https://www.landex.com/webstore/jsp/cart/DocumentSearch.jsp'
    }

    xpaths = {
        isPageLoaded: '//input[@id="GeneralSearch"]'
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
            const dateRange = await this.getDateRange('Pennsylvania', 'Fayette');
            let fromDate = this.getFormattedDate(dateRange.from);
            let toDate = this.getFormattedDate(dateRange.to);
            
            // select Fayette county
            await page.click('input[value="28"]');
            
            // setting date range
            const fromDateHandle = await page.$x('//input[@name="StartDate"]');
            const toDateHandle = await page.$x('//input[@name="EndDate"]');
            await fromDateHandle[0].click({clickCount: 3});
            await fromDateHandle[0].press('Backspace');
            await fromDateHandle[0].type(fromDate, {delay: 100});
            await toDateHandle[0].click({clickCount: 3});
            await toDateHandle[0].press('Backspace');
            await toDateHandle[0].type(toDate, {delay: 100});

            // click search button
            const result = await this.waitForSuccess(async () => {
                await Promise.all([
                    page.click('input#GeneralSearch'),
                    page.waitForNavigation()
                ]);
            });
            
            if (!result) {
                return false;
            }

            // getting data
            await page.waitForXPath('//form[@id="form1"]//tbody/tr/td[@valign="top"]/parent::tr');
            let results = await page.$x('//form[@id="form1"]//tbody/tr/td[@valign="top"]/parent::tr');
            if (results.length > 0) {
                let pageNum = 1;
                while (true) {
                    await page.waitForXPath(`//b/span[contains(text(), "${pageNum}")]`);
                    await page.waitForXPath(`//form[@id="form1"]//tbody/tr/td[@valign="top"]/parent::tr`);
                    results = await page.$x(`//form[@id="form1"]//tbody/tr/td[@valign="top"]/parent::tr`);
                    for (const result of results) {
                        let caseID = await result.evaluate(el => el.children[4].children[0].children[0].textContent?.trim());
                        if (caseID?.length == 0) {
                            continue;
                        }
                        let type = await result.evaluate(el => el.children[1].textContent?.trim());
                        let date = await result.evaluate(el => el.children[2].textContent?.trim());
                        let nameTxt = await result.evaluate(el => el.children[4].children[0].getAttribute('onclick'));
                        let names = nameTxt?.split(`</STRONG></td></tr><tr><td width=50% valign=top>`)[1]?.split(`<BR></td><td valign=top>`)[1]?.split(`<BR></td></tr></table></td></tr></table>")`)[0]?.split(`<BR>`);
                        
                        if (nameTxt?.includes('ESTATE NAME')) {
                            continue;
                        } 
                        
                        for (const name of names!) {
                            if (this.isEmptyOrSpaces(name!) || name?.includes('NAME NOT ENTERED') || name?.includes('TO WHOM IT MAY CONCERN') || name.includes('RECORDER OF DEEDS')) {
                                continue;
                            }
                            if (removeRowRegex.test(name)) {
                                continue;
                            }
                            const parserName: any = this.newParseName(name);
                            if(parserName.type && parserName.type == 'COMPANY'){
                                continue;
                            }
                            if (await this.getData(page, name.trim(), type, date, caseID)) {
                                countRecords++
                            }  
                        }
                    }
                    
                    const nextEL = await page.$x(`//a[@href="javascript:gotoPage(${pageNum + 1})"]`);
                    if (nextEL.length > 0 ) {
                        pageNum++;
                        const result1 = await this.waitForSuccess(async () => {
                            await Promise.all([
                                nextEL[0].click(),
                                page.waitForNavigation()
                            ]);
                        });
                        
                        if (!result1) {
                            return false;
                        }
                    } else {
                        break;
                    }
                }
            } else {
                console.log('NO MATCHING RECORDS')
            }

            await AbstractProducer.sendMessage('Fayette', 'Pennsylvania', countRecords, 'Civil & Lien');
            await page.close();
            await this.browser?.close();
            return true;
        }
        catch (error) {
            console.log('Error: ', error);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Fayette', 'Pennsylvania', countRecords, 'Civil & Lien', errorImage);
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
            'Property State': 'PA',
            'County': 'Fayette',
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