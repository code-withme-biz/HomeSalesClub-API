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
        generalInfoPage: 'https://searchdocs.lancasterdeeds.com/countyweb/login.do?countyname=Lancaster'
    }

    xpaths = {
        isPageLoaded: '//input[@onclick="doGuestLogin()"]'
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
        let countRecords = 0;
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;

        try {            
            const dateRange = await this.getDateRange('Pennsylvania', 'Lancaster');
            let fromDateVal = this.getFormattedDate(dateRange.from);
            let toDateVal = this.getFormattedDate(dateRange.to);
            
            // select Lancaster county
            const selectGuestResult = await this.waitForSuccess(async () => {
                await Promise.all([
                    page.click('input[onclick="doGuestLogin()"]'),
                    page.waitForNavigation()
                ])
            })
            if (!selectGuestResult) {
                return false;
            }
            
            let frame: puppeteer.Frame | null | undefined;
            await page.waitForXPath('//iframe[@name="bodyframe"]');
            let elementHandle = await page.$('iframe[name="bodyframe"]');
            frame = await elementHandle?.contentFrame();

            await frame?.waitForXPath('//input[@id="accept"]');
            let [accpetBtn]: any = await frame?.$x('//input[@id="accept"]');
            await accpetBtn?.click();
            await page.waitForNavigation();

            // setting date range

            let frame3: puppeteer.Frame | null | undefined;
            await page.waitForXPath('//iframe[@name="bodyframe"]');
            let elementHandle3 = await page.$('iframe[name="bodyframe"]');
            frame3 = await elementHandle3?.contentFrame();

            await frame3?.waitForXPath('//tr[@id="datagrid-row-r1-2-0"]');
            let [searchBtn]: any = await frame3?.$x('//tr[@id="datagrid-row-r1-2-0"]');
            await page.waitFor(3000);
            await searchBtn?.focus();
            await searchBtn?.click();

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

            await frame6?.waitForXPath('//div[@id="searchFields"]');
            await page.waitFor(3000);
            let [fromDate]: any = await frame6?.$x('//input[@id="FROMDATE"]/parent::td/span/input[1]');
            let [endDate]: any = await frame6?.$x('//input[@id="TODATE"]/parent::td/span/input[1]');
            await fromDate?.click();
            await fromDate?.type(fromDateVal, {delay: 150});
            await endDate?.click();
            await endDate?.type(toDateVal, {delay: 150}); 
            
            // click search button
            let [searchEL]: any = await frame5?.$x('//img[@id="imgSearch"]/parent::a');
            await searchEL?.click();

            await page.waitFor(3000);
            let frame7: puppeteer.Frame | null | undefined;
            await page.waitForXPath('//iframe[@name="bodyframe"]');
            let elementHandle7 = await page.$('iframe[name="bodyframe"]');
            frame7 = await elementHandle7?.contentFrame();

            let frame8: puppeteer.Frame | null | undefined;
            await frame7?.waitForXPath('//iframe[@id="dynSearchFrame"]');
            let elementHandle8 = await frame7?.$('iframe#dynSearchFrame');
            frame8 = await elementHandle8?.contentFrame();
            await frame8?.waitForXPath('//form[@name="searchForm"]')
            const textEL = await frame8?.$('div#msgDiv > span');;
            const text = await textEL?.evaluate(el => el.textContent?.trim());
            
            if (text?.includes('No documents')) {
                console.log('No Documents were found that match the specified criteria');
            } else {
                let pageNum = 0;
                let isLast = false;
                
                while (!isLast) {
                    let frame9, frame10, frame11: puppeteer.Frame | null | undefined;
                    await frame7?.waitForXPath('//iframe[@id="resultFrame"]');
                    let elementHandle9 = await frame7?.$('iframe#resultFrame');
                    frame9 = await elementHandle9?.contentFrame();
                    await frame9?.waitForXPath('//iframe[@id="resultListFrame"]');
                    let elementHandle10 = await frame9?.$('iframe#resultListFrame');
                    frame10 = await elementHandle10?.contentFrame();
                    const resultXpath = '//div[@id="instList"]//div[@class="datagrid-view2"]/div[@class="datagrid-body"]/table/tbody/tr';
                    await frame10?.waitForXPath(resultXpath);

                    const results = await frame10?.$x(resultXpath);
                    if (results) {
                        for (const result of results) {
                            let caseID = await result.evaluate(el => el.children[1].children[0].children[0].children[0].textContent?.trim());
                            let namesHTML = await result.evaluate(el => el.children[3].children[0].children[0].innerHTML);
                            let names = namesHTML.split('<br>');
                            let type = await result.evaluate(el => el.children[6].children[0].textContent?.trim());
                            let date = await result.evaluate(el => el.children[7].children[0].textContent?.trim());
                            type = type?.split('(')[0].trim();
                            for (const name of names) {
                                if (name) {
                                    if (this.isEmptyOrSpaces(name!) || removeRowRegex.test(name)) {
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
                        }
                    }

                    await page.waitFor(5000);
                    await frame9?.waitForXPath('//iframe[@name="subnav"]');
                    let elementHandle11 = await frame9?.$('iframe[name="subnav"]');
                    frame11 = await elementHandle11?.contentFrame();
                    
                    const nextButtonXpath = `//a[contains(@onclick, "navigateResults('next")]`;
                    const nextButtonEl = await frame11?.$x(nextButtonXpath);
                    if (nextButtonEl) {
                        if (nextButtonEl?.length > 0) {
                            pageNum++;
                            await nextButtonEl[0].click();
                            await this.sleep(5000);
                        } else {
                            isLast = true;
                        }
                    }
                }
            }
            
            await AbstractProducer.sendMessage('Lancaster', 'Pennsylvania', countRecords, 'Civil & Lien');
            await page.close();
            await this.browser?.close();
            return true;
        }
        catch (error) {
            console.log('Error: ', error);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Lancaster', 'Pennsylvania', countRecords, 'Civil & Lien', errorImage);
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
                console.log(`retrying search -- ${retry_count}`);
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
            'County': 'Lancaster',
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