import puppeteer from 'puppeteer';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import db from '../../../../../../models/db';
import SnsService from '../../../../../../services/sns_service';

const removeRowArray = [
    'CITY', 'DEPT', 'CTY', 'UNITED STATES', 'BANK', 'FIA CARD SERVICES NA',
    'FLORIDA PACE FUNDING AGENCY', 'COUNTY', 'CREDIT', 'HOSPITAL', 'FUNDING', 'UNIVERSITY',
    'MEDICAL', 'CONDOMINIUM ASSOCIATION', 'LOTS', 'TEXAS STATE', 'VETERANS', 'SECRETARY', 'DEPARTMENT',
    'INDIVIDUAL', 'INDIVIDUALLY', 'FINANCE', 'CITIBANK', 'MERS', 'STATE TAX COMMISSION'
];
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i');

export default class CivilProducer extends AbstractProducer {
    urls = {
        generalInfoPage: 'https://a836-acris.nyc.gov/CP/'
    }

    xpaths = {
        isPageLoaded: '//font[text()="Search Property Records"]'
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

    async getDateRangeLocal(): Promise<any> {
        let dateRange = await this.getDateRange('Nevada', 'Clark');
        let date = dateRange.from;
        let today = dateRange.to;
        
        const day = ("00" + (date.getDate())).slice(-2);
        const month = ("00" + (date.getMonth() + 1)).slice(-2);
        const year =  date.getFullYear();

        const day1 = ("00" + (today.getDate())).slice(-2);
        const month1 = ("00" + (today.getMonth() + 1)).slice(-2);
        const year1 =  today.getFullYear();

        return { from: {day: day, month: month, year: year}, to: {day: day1, month: month1, year: year1} };
    }
    
    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let countRecords = 0;
        try {

            try {
                const [searchRecordHandle] = await page.$x('//font[text()="Search Property Records"]/parent::font/parent::div/parent::td/parent::tr');
                await searchRecordHandle.click();
                await page.waitForNavigation();
            } catch (error) {
                console.log(error);
                return false;
            }

            try {
                const [docTypeHandle] = await page.$x('//td[contains(@onclick, "DocumentType")]/parent::tr');
                await docTypeHandle.click();
                await page.waitForNavigation();
            } catch (error) {
                console.log(error);
                return false;
            }

            const dateRange = await this.getDateRangeLocal();
            console.log(`from: ${dateRange.from.year}, to: ${dateRange.to.year}`);

            let docTypeSelects = ['AMTX', 'AMFL', 'AMTL', 'ATL', 'ASST', 'ASPM', 'DEED', 'DEEDO', 'DEEDP', 'DTL', 'MTGE', 'M&CON', 'TLS'];
            for (const docTypeSelect of docTypeSelects) {
                console.log(docTypeSelect)
                await page.waitForSelector('select[name="combox_doc_doctype"]', {visible: true});
                // setting doc type
                await page.select('select[name="combox_doc_doctype"]', docTypeSelect);
                
                // setting county
                await page.select('select[name="borough"]', '4');

                // setting date range
                await page.select('select[name="cmb_date"]', 'DR');
                const [fromm] = await page.$x('//input[@name="edt_fromm"]');
                await fromm.click({ clickCount: 3 });
                await fromm.press('Backspace');
                await fromm.type(dateRange.from.month, { delay: 150 });
                const [fromd] = await page.$x('//input[@name="edt_fromd"]');
                await fromd.click({ clickCount: 3 });
                await fromd.press('Backspace');
                await fromd.type(dateRange.from.day, { delay: 150 });
                const [fromy] = await page.$x('//input[@name="edt_fromy"]');
                await fromy.click({ clickCount: 3 });
                await fromy.press('Backspace');
                await fromy.type(dateRange.from.year.toString(), { delay: 150 });
                const [tom] = await page.$x('//input[@name="edt_tom"]');
                await tom.click({clickCount: 3});
                await tom.press('Backspace');
                await tom.type(dateRange.to.month, {delay: 150});
                const [tod] = await page.$x('//input[@name="edt_tod"]');
                await tod.click({clickCount: 3});
                await tod.press('Backspace');
                await tod.type(dateRange.to.day, {delay: 150});
                const [toy] = await page.$x('//input[@name="edt_toy"]');
                await toy.click({clickCount: 3});
                await toy.press('Backspace');
                await toy.type(dateRange.to.year.toString(), {delay: 150});

                // click search button
                const [searchBtnHandle] = await page.$x('//input[@name="Submit2"]');
                await searchBtnHandle.click();
                await page.waitForNavigation();

                // getting data
                await page.waitForXPath('//form[@name="DATA"]/table/tbody/tr[1]/td/font');
                const resultHandle = await page.$x('//form[@name="DATA"]/table/tbody/tr[1]/td/font');
                const resultText = await resultHandle[0].evaluate(el => el.textContent?.trim());
                if (resultText?.includes('No Records Found')) {
                    console.log('No Records Found')
                } else {
                    let pageNum = 1;
                    let isLast = false;

                    await page.waitForXPath('//b[contains(text(), "Current Search")]/parent::i/parent::font/parent::td');
                    const [typeHandle] = await page.$x('//b[contains(text(), "Current Search")]/parent::i/parent::font/parent::td/font[2]');
                    let type = await typeHandle.evaluate(el => el.innerHTML);
                    type = type?.split('<br>')[0].split('</b>')[1].replace(/(?:&nbsp;)/g, '').replace(':', '').trim();
                    console.log(type);
                    while (!isLast) {
                        const results = await page.$x('//form[@name="DATA"]/table/tbody/tr[2]/td/table/tbody/tr');
                        for (let i = 1; i < results.length; i++) {
                            const element = results[i];
                            let caseID = await element.evaluate(el => el.children[4].children[0].children[0].textContent?.trim());
                            let date = await element.evaluate(el => el.children[8].children[0].children[0].textContent?.trim());
                            date = date?.split(' ')[0].trim();
                            let name = await element.evaluate(el => el.children[10].children[0].children[0].textContent?.trim()); 

                            if (this.isEmptyOrSpaces(name!)) {
                                continue;
                            }
                            if (await this.getData(page, name, type, date, caseID)) {
                                countRecords++
                            }
                        }  
                        
                        await page.waitForXPath('//font[text()="next"]');
                        const nextButtonHandle = await page.$x('//font[text()="next"]/parent::a/parent::u');
                        if (nextButtonHandle.length > 0) {
                            pageNum++;
                            isLast = false;
                            await nextButtonHandle[0].click();
                            await page.waitForNavigation();
                        } else {
                            isLast = true;
                        }
                    }
                }

                const [newSearchHandle] = await page.$x('//input[@name="Submit2"]');
                await newSearchHandle.click();
                await page.waitForNavigation();
            }

            await AbstractProducer.sendMessage('Queens', 'New York', countRecords, 'Civil & Lien');
            await page.close();
            await this.browser?.close();
            return true;
        }
        catch (error) {
            console.log('Error: ', error);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Queens', 'New York', countRecords, 'Civil & Lien', errorImage);
        }

        return false;
    }

    async getData(page: puppeteer.Page, name: any, type: any, date: any, caseID: any): Promise<any> {
        if (removeRowRegex.test(name)) return false;
        const parseName: any = this.newParseName(name.trim())
        if (parseName?.type && parseName?.type == 'COMPANY') return false;

        let practiceType = this.getPracticeType(type)

        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({ name: productName }).exec();
        const data = {
            'caseUniqueId': caseID,
            'Property State': 'NY',
            'County': 'Queens',
            'First Name': parseName.firstName,
            'Last Name': parseName.lastName,
            'Middle Name': parseName.middleName,
            'Name Suffix': parseName.suffix,
            'Full Name': parseName.fullName,
            "vacancyProcessed": false,
            fillingDate: date,
            productId: prod._id,
            originalDocType: type
        };
        return (await this.civilAndLienSaveToNewSchema(data));
    }
     // To check empty or space
    isEmptyOrSpaces(str: string) {
        return str === null || str.match(/^\s*$/) !== null;
    }
}