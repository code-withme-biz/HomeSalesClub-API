import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import { result } from 'lodash';

export default class CivilProducer extends AbstractProducer {
    browser: puppeteer.Browser | undefined;
    browserPages = {
        generalInfoPage: undefined as undefined | puppeteer.Page
    };
    urls = {
        generalInfoPage: 'http://www.jococourts.org/Newlyfiledcases.aspx'
    }

    xpaths = {
        isPAloaded: '//input[@id="txtBegDT"]'
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
    
    async getData(page: puppeteer.Page, date: any, name: any, docType: any): Promise<any> {
        const parseName: any = this.newParseName(name.trim())
        if (parseName?.type && parseName?.type == 'COMPANY') return false;
        let practiceType = this.getPracticeType(docType)
        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({name: productName}).exec();
        const data = {
            'Property State': 'KS',
            'County': 'johnson',
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
        // 2000
        try{
            let dateRange = await this.getDateRange('Kansas', 'Johnson');
            let fromDate = dateRange.from;
            let toDate = dateRange.to;
            let fromDateFix = '';
            let toDateFix = '';
            let fromDateString = this.getFormattedDate(fromDate);
            let toDateString = this.getFormattedDate(toDate);
            let fromDateArr = fromDateString.split('/');
            let toDateArr = toDateString.split('/');
            fromDateFix += fromDateArr.shift();
            fromDateFix += fromDateArr.shift();
            fromDateFix += fromDateArr.shift()?.slice(0,2);
            toDateFix += toDateArr.shift();
            toDateFix += toDateArr.shift();
            toDateFix += toDateArr.shift()?.slice(0,2);
            console.log(fromDateFix, toDateFix);
            let page = this.browserPages.generalInfoPage!;
            await page.type('#txtBegDT', fromDateFix, {delay: 150});
            await page.type('#txtEndDT', toDateFix, {delay: 150});
            let searchButton = await page.$x('//input[@id="btnSearch"]');
            await Promise.all([
                searchButton[0].click(),
                page.waitForNavigation()
            ]);
            let resultRows = await page.$x('//table/tbody/tr[@bgcolor="wheat"]');
            for(const resultRow of resultRows){
                let namesHandle = await resultRow.evaluate(el => el.children[1].textContent?.trim());
                let namesArr = namesHandle?.split(' VS ');
                let docType = await resultRow.evaluate(el => el.children[5].textContent?.trim());
                let recordDate = await resultRow.evaluate(el => el.children[6].textContent?.trim());
                if(namesArr){
                    for(const name of namesArr){
                        if(await this.getData(page, recordDate, name, docType)){
                            countRecords += 1;
                        }
                    }
                }
            }
            
            console.log(countRecords);
            await AbstractProducer.sendMessage('Johnson', 'Kansas', countRecords, 'Civil & Lien');
            return true;
        } catch (error){
            console.log(error);
            await AbstractProducer.sendMessage('Johnson', 'Kansas', countRecords, 'Civil & Lien');
            return false;
        }
    }
}