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
        generalInfoPage: 'https://arsaline.fidlar.com/ARSaline/AvaWeb/#!/search'
    }

    xpaths = {
        isPAloaded: '//input[@id="StartDate"]'
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
            this.browserPages.generalInfoPage?.setDefaultTimeout(200000);
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
            'Property State': 'AR',
            'County': 'saline',
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
        // 2000
        try{
            const civilUrl: string = 'https://arsaline.fidlar.com/ARSaline/AvaWeb/#!/search';
            let dateRange = await this.getDateRange('Arkansas', 'Saline');
            let fromDate = dateRange.from;
            let toDate = dateRange.to;
            let page = this.browserPages.generalInfoPage!;
            while (fromDate <= toDate) {
            let dateStringDay = this.getDateStringDDMMYY(new Date(fromDate));
            console.log(dateStringDay);
                await page.goto(civilUrl, { waitUntil: 'networkidle0' });
                await page.type('#StartDate', dateStringDay, {delay: 150});
                let endDateHandle = await page.$x('//input[@ng-model="vm.searchCriteria.endDate"]');
                await endDateHandle[0].type(dateStringDay, {delay: 150});
                let searchButton = await page.$x('//button[@ng-click="vm.searchClick()"]');
                await searchButton[0].click();
                await this.sleep(5000);
                let noResultHandle = await page.$x('//label[contains(text(), "No results found")]');
                if (noResultHandle.length > 0){
                    console.log(dateStringDay,"=> Not found!");
                    fromDate.setDate(fromDate.getDate() + 1);
                    await this.randomSleepIn5Sec();
                    continue;
                }
                try {
                    await page.waitForXPath('//div[@id="resultsContainer"]/ul/li', {timeout: 15000});
                } catch {
                    console.log(dateStringDay,"=> Not found!");
                    fromDate.setDate(fromDate.getDate() + 1);
                    await this.randomSleepIn5Sec();
                    continue;
                }
                let resultRows = await page.$x('//div[@id="resultsContainer"]/ul/li');
                for (let i = 0; i < resultRows.length; i++) {
                    let names = [];
                    let indXpath = i + 1;
                    let directNameHandle = await page.$x('//div[@id="resultsContainer"]/ul/li['+indXpath+']/div/div/div/label[4]');
                    let directName = await directNameHandle[0].evaluate(el => el.textContent?.trim());
                    let indirectNameHandle = await page.$x('//div[@id="resultsContainer"]/ul/li['+indXpath+']/div/div/div/label[5]');
                    let indirectName = await indirectNameHandle[0].evaluate(el => el.textContent?.trim());
                    names.push(directName);
                    names.push(indirectName);
                    let docTypeHandle = await page.$x('//div[@id="resultsContainer"]/ul/li['+indXpath+']/div/div/div/label[2]');
                    let docType = await docTypeHandle[0].evaluate(el => el.textContent?.trim());
                    let recordDateHandle = await page.$x('//div[@id="resultsContainer"]/ul/li['+indXpath+']/div/div/div/label[3]');
                    let recordDate = await recordDateHandle[0].evaluate(el => el.textContent?.trim());
                    for(const name of names){
                        if(await this.getData(page, recordDate, name, docType)){
                            countRecords += 1;
                        }
                    }
                }
                fromDate.setDate(fromDate.getDate() + 1);
                await this.randomSleepIn5Sec();
            }
            
            console.log(countRecords);
            await AbstractProducer.sendMessage('Saline', 'Arkansas', countRecords, 'Civil & Lien');
            return true;
        } catch (error){
            console.log(error);
            await AbstractProducer.sendMessage('Saline', 'Arkansas', countRecords, 'Civil & Lien');
            return false;
        }
    }
}