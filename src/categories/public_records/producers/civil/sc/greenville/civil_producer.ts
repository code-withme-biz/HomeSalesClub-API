import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';

export default class CivilProducer extends AbstractProducer {
    browser: puppeteer.Browser | undefined;
    browserPages = {
        generalInfoPage: undefined as undefined | puppeteer.Page
    };
    urls = {
        generalInfoPage: 'https://www2.greenvillecounty.org/scjd/publicindex/'
    }

    xpaths = {
        isPAloaded: '//input[@id="ContentPlaceHolder1_ButtonAccept"]'
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
            this.browserPages.generalInfoPage?.setDefaultTimeout(100000);
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

    getDateStringDDMMYY(date: Date): string {
        return ("00" + date.getDate()).slice(-2) + "/" + ("00" + (date.getMonth() + 1)).slice(-2) + "/" + date.getFullYear();
    }

    async getData(page: puppeteer.Page, date: any, name: any, docType: any): Promise<any> {
        let recordedDate = date.split(/\s+/g)[0];
        const parseName: any = this.newParseName(name.trim())
        if (parseName?.type && parseName?.type == 'COMPANY') return false;
        let practiceType = this.getPracticeType(docType)
        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({name: productName}).exec();
        const data = {
            'Property State': 'SC',
            'County': 'Greenville',
            'First Name': parseName.firstName,
            'Last Name': parseName.lastName,
            'Middle Name': parseName.middleName,
            'Name Suffix': parseName.suffix,
            'Full Name': parseName.fullName,
            "vacancyProcessed": false,
            fillingDate: recordedDate,
            productId: prod._id,
            originalDocType: docType
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }

    // This is main function
    async parseAndSave(): Promise<boolean> {
        let countRecords = 0;
        try{
            const civilUrl: string = 'https://www2.greenvillecounty.org/scjd/publicindex/';
            let dateRange = await this.getDateRange('South Carolina', 'Greenville');
            let fromDate = dateRange.from;
            let toDate = dateRange.to;
            let page = this.browserPages.generalInfoPage!;
            
            while (fromDate <= toDate) {
                let caseTypes = ['Civil', 'Civil-Acctng', 'Common Pleas', 'Judgment', 'Liens', 'Lis Pendens'];
                let dateStringDay = this.getFormattedDate(new Date(fromDate));
                for(const caseType of caseTypes){
                    console.log(caseType, dateStringDay);
                    await page.goto(civilUrl, { waitUntil: 'networkidle0' });
                    await Promise.all([
                        page.click('#ContentPlaceHolder1_ButtonAccept'),
                        page.waitForNavigation()
                    ]);
                    let option = (await page.$x('//select[@id="ContentPlaceHolder1_DropDownListCaseTypes"]/option[contains(., "' + caseType + '")]'))[0];
                    let optionVal: any = await (await option.getProperty('value')).jsonValue();
                    await Promise.all([
                        page.select('#ContentPlaceHolder1_DropDownListCaseTypes', optionVal),
                        page.waitForNavigation()
                    ]);
                    await page.select('#ContentPlaceHolder1_DropDownListDateFilter', 'Filed');
                    await page.type('#ContentPlaceHolder1_TextBoxDateFrom', dateStringDay, {delay: 150});
                    await page.type('#ContentPlaceHolder1_TextBoxDateTo', dateStringDay, {delay: 150});
                    let searchButton = await page.$x('//input[@id="ContentPlaceHolder1_ButtonSearch"]');
                    await searchButton[0].click();
                    try {
                        await page.waitForXPath('//table[@id="ContentPlaceHolder1_SearchResults"]/tbody/tr', {timeout: 15000});
                    } catch {
                        continue;
                    }
                    let resultRows = await page.$x('//table[@id="ContentPlaceHolder1_SearchResults"]/tbody/tr');
                    for (let i = 1; i < resultRows.length; i++) {
                        try{
                            let indXpath = i + 1;
                            let nameHandle = await page.$x('//table[@id="ContentPlaceHolder1_SearchResults"]/tbody/tr['+indXpath+']/td[1]');
                            let name = await nameHandle[0].evaluate(el => el.textContent?.trim());
                            console.log(name);
                            if(name?.match(/others/i) || name?.match(/representative/i)){
                                continue;
                            }
                            let docTypeHandle = await page.$x('//table[@id="ContentPlaceHolder1_SearchResults"]/tbody/tr['+indXpath+']/td[8]');
                            let docType = await docTypeHandle[0].evaluate(el => el.textContent?.trim());
                            let recordDateHandle = await page.$x('//table[@id="ContentPlaceHolder1_SearchResults"]/tbody/tr['+indXpath+']/td[4]');
                            let recordDate = await recordDateHandle[0].evaluate(el => el.textContent?.trim());
                            if(await this.getData(page, recordDate, name, docType)){
                                countRecords += 1;
                            }
                        } catch(e){
                            continue;
                        }
                    }
                }
                fromDate.setDate(fromDate.getDate() + 1);
                await this.randomSleepIn5Sec();
            }
            
            console.log(countRecords);
            await AbstractProducer.sendMessage('Greenville', 'South Carolina', countRecords, 'Civil & Lien');
            return true;
        } catch (error){
            console.log(error);
            await AbstractProducer.sendMessage('Greenville', 'South Carolina', countRecords, 'Civil & Lien');
            return false;
        }
    }
}