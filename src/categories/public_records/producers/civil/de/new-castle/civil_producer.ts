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
        generalInfoPage: 'https://deeds.nccde.org/Pax/views/search'
    }

    xpaths = {
        isPAloaded: '//button[@id="disclaimerAgreement"]'
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
    
    async getData(page: puppeteer.Page, date: any, name: any, docType: any): Promise<any> {
        const parseName: any = this.newParseName(name.trim())
        if (parseName?.type && parseName?.type == 'COMPANY') return false;
        let practiceType = this.getPracticeType(docType)
        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({name: productName}).exec();
        const data = {
            'Property State': 'DE',
            'County': 'New Castle',
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
            const civilUrl: string = 'https://deeds.nccde.org/Pax/views/search';
            let dateRange = await this.getDateRange('Delaware', 'New Castle');
            let fromDate = dateRange.from;
            let toDate = dateRange.to;
            let page = this.browserPages.generalInfoPage!;
            let tosButton = await page.$x('//button[@id="disclaimerAgreement"]');
            await Promise.all([
                tosButton[0].click(),
                page.waitForNavigation()]);
            while (fromDate <= toDate) {
                try{
                    let dateStringDay = this.getFormattedDate(new Date(fromDate));
                    console.log(dateStringDay);
                    await page.goto(civilUrl, { waitUntil: 'load' });
                    await this.sleep(2000);
                    await page.type('#dtFrom', dateStringDay, {delay: 150});
                    await page.type('#dtTo', dateStringDay, {delay: 150});
                    let searchButton = await page.$x('//button[@id="btnSummarySearch"]');
                    await searchButton[0].click();
                    await page.waitForXPath('//table[@id="gridResults"]/tbody/tr/td');
                    await this.sleep(10000);
                    let notFound = await page.$x('//table[@id="gridResults"]/tbody/tr/td[contains(text(), "No data available in table")]');
                    if(notFound.length > 0){
                        console.log('Not found!');
                        fromDate.setDate(fromDate.getDate() + 1);
                        await this.randomSleepIn5Sec();
                        continue;
                    }
                    let totalPagesHandle = await page.$x('//div[@id="gridResults_paginate"]/span[@class="paginate_of"]');
                    let totalPages: any = await totalPagesHandle[0].evaluate(el => el.textContent?.trim());
                    totalPages = totalPages?.split(/\s+/g).pop();
                    totalPages = parseInt(totalPages);
                    let currentPage = 1;
                    while(currentPage <= totalPages){
                        try{
                            let resultRows = await page.$x('//table[@id="gridResults"]/tbody/tr');
                            for (let i = 0; i < resultRows.length; i++) {
                                try{
                                    let indXpath = i + 1;
                                    let lastNameHandle = await page.$x('//table[@id="gridResults"]/tbody/tr['+indXpath+']/td[2]');
                                    let lastName = await lastNameHandle[0].evaluate(el => el.textContent?.trim());
                                    let firstNameHandle = await page.$x('//table[@id="gridResults"]/tbody/tr['+indXpath+']/td[3]');
                                    let firstName = await firstNameHandle[0].evaluate(el => el.textContent?.trim());
                                    let name = lastName + " " + firstName?.replace(',',' ');
                                    name = name.trim();
                                    console.log(name);
                                    let docTypeHandle = await page.$x('//table[@id="gridResults"]/tbody/tr['+indXpath+']/td[6]');
                                    let docType = await docTypeHandle[0].evaluate(el => el.textContent?.trim());
                                    let recordDateHandle = await page.$x('//table[@id="gridResults"]/tbody/tr['+indXpath+']/td[11]');
                                    let recordDate = await recordDateHandle[0].evaluate(el => el.textContent?.trim());
                                    if(await this.getData(page, recordDate, name, docType)){
                                        countRecords += 1;
                                    }
                                } catch(e){
                                    continue;
                                }
                            }
                            let pageInfoHandle = await page.$x('//div[@id="gridResults_info"]');
                            let pageInfo = await pageInfoHandle[0].evaluate(el => el.textContent);
                            let idPageInfo: string = 'gridResults_info';
                            let pageClick = await page.$x('//div[@id="gridResults_paginate"]/button[@class="paginate_button next"]');
                            console.log(dateStringDay, currentPage, resultRows.length, totalPages);
                            if(currentPage != totalPages){
                                await Promise.all([
                                    pageClick[0].click(),
                                    page.waitForFunction((pageInfo: any, idPageInfo: any) => {
                                        return document.getElementById(idPageInfo)!.textContent != pageInfo
                                    }, {}, pageInfo, idPageInfo)
                                ]);
                            }
                            currentPage += 1;
                            await this.randomSleepIn5Sec();
                        } catch(e){
                            break;
                        }
                    }
                    fromDate.setDate(fromDate.getDate() + 1);
                    await this.randomSleepIn5Sec();
                } catch(e){
                    console.log(e)
                    fromDate.setDate(fromDate.getDate() + 1);
                    await this.randomSleepIn5Sec();
                }
            }
            
            console.log(countRecords);
            await AbstractProducer.sendMessage('New Castle', 'Delaware', countRecords, 'Civil');
            return true;
        } catch (error){
            console.log(error);
            await AbstractProducer.sendMessage('New Castle', 'Delaware', countRecords, 'Civil');
            return false;
        }
    }
}