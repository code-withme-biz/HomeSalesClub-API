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
        generalInfoPage: 'http://lcapps.co.lucas.oh.us/PAXAreis5/views/search'
    }

    xpaths = {
        isPAloaded: '//input[@id="dtFrom"]'
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
        const parseName: any = this.newParseName(name.trim())
        if (parseName?.type && parseName?.type == 'COMPANY') return false;
        let practiceType = this.getPracticeType(docType)
        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({name: productName}).exec();
        const data = {
            'Property State': 'OH',
            'County': 'Lucas',
            'First Name': parseName.firstName,
            'Last Name': parseName.lastName,
            'Middle Name': parseName.middleName,
            'Name Suffix': parseName.suffix,
            'Full Name': parseName.fullName,
            "vacancyProcessed": false,
            fillingDate: date,
            productId: prod._id,
            originalDocType: docType
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }

    // This is main function
    async parseAndSave(): Promise<boolean> {
        let countRecords = 0;
        try{
            const civilUrl: string = 'http://lcapps.co.lucas.oh.us/PAXAreis5/views/search';
            let dateRange = await this.getDateRange('Ohio', 'Lucas');
            let fromDate = dateRange.from;
            let toDate = dateRange.to;
            let page = this.browserPages.generalInfoPage!;
            while (fromDate <= toDate) {
                let dateStringDay = this.getFormattedDate(new Date(fromDate));
                console.log(dateStringDay);
                await page.goto(civilUrl, { waitUntil: 'load' });
                await page.type('#dtFrom', dateStringDay, {delay: 150});
                await page.type('#dtTo', dateStringDay, {delay: 150});
                let searchButton = await page.$x('//button[@id="btnSummarySearch"]');
                await searchButton[0].click();
                await page.waitForXPath('//table[@id="gridResults"]/tbody/tr/td');
                console.log("Waiting 10 seconds...");
                await this.sleep(10000);
                let notFound = await page.$x('//table[@id="gridResults"]/tbody/tr/td[contains(text(), "No data available in table")]');
                if(notFound.length > 0){
                    console.log('Not found!');
                    fromDate.setDate(fromDate.getDate() + 1);
                    await this.randomSleepIn5Sec();
                    continue;
                }
                let currentPage = 1;
                let goNextPage = true;
                while(goNextPage){
                    let resultRows = await page.$x('//table[@id="gridResults"]/tbody/tr');
                    for (let i = 0; i < resultRows.length; i++) {
                        let indXpath = i + 1;
                        let lastNameHandle = await page.$x('//table[@id="gridResults"]/tbody/tr['+indXpath+']/td[2]');
                        let lastName = await lastNameHandle[0].evaluate(el => el.textContent?.trim());
                        let firstNameHandle = await page.$x('//table[@id="gridResults"]/tbody/tr['+indXpath+']/td[4]');
                        let firstName = await firstNameHandle[0].evaluate(el => el.textContent?.trim());
                        let name = lastName + " " + firstName?.replace(',',' ');
                        name = name.trim();
                        console.log(name);
                        let docTypeHandle = await page.$x('//table[@id="gridResults"]/tbody/tr['+indXpath+']/td[7]');
                        let docType = await docTypeHandle[0].evaluate(el => el.textContent?.trim());
                        let recordDateHandle = await page.$x('//table[@id="gridResults"]/tbody/tr['+indXpath+']/td[8]');
                        let recordDate = await recordDateHandle[0].evaluate(el => el.textContent?.trim());
                        if(await this.getData(page, recordDate, name, docType)){
                            countRecords += 1;
                        }
                    }
                    let lastPage = await page.$x('//a[@class="paginate_button next disabled"]');
                    if (lastPage.length > 0){
                        goNextPage = false;
                        break;
                    }
                    let pageInfoHandle = await page.$x('//div[@id="gridResults_info"]');
                    let pageInfo = await pageInfoHandle[0].evaluate(el => el.textContent);
                    let idPageInfo: string = 'gridResults_info';
                    console.log(dateStringDay, currentPage, resultRows.length);
                    await Promise.all([
                        page.click('a#gridResults_next'),
                        page.waitForFunction((pageInfo: any, idPageInfo: any) => {
                            return document.getElementById(idPageInfo)!.textContent != pageInfo
                        }, {}, pageInfo, idPageInfo)
                    ]);
                    currentPage += 1;
                    await this.randomSleepIn5Sec();
                }
                fromDate.setDate(fromDate.getDate() + 1);
            }
            
            console.log(countRecords);
            await AbstractProducer.sendMessage('Lucas', 'Ohio', countRecords, 'Civil');
            return true;
        } catch (error){
            console.log(error);
            await AbstractProducer.sendMessage('Lucas', 'Ohio', countRecords, 'Civil');
            return false;
        }
    }
}