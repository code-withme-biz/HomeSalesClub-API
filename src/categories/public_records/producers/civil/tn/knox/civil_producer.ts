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
        generalInfoPage: 'https://knoxcounty.org/criminalcourt/online_tools/fourth_docket_search.php'
    }

    xpaths = {
        isPAloaded: '//input[@id="from"]'
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
            'Property State': 'TN',
            'County': 'Knox',
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
            let page = this.browserPages.generalInfoPage!;
            await page.click('input#from');
            let [currentDay] = await page.$x('//td[contains(@class, "datepicker-today")]/a');
            await currentDay.click();
            await page.click('input#to');
            [currentDay] = await page.$x('//td[contains(@class, "datepicker-today")]/a');
            await currentDay.click();
            let searchButton = await page.$x('//input[@id="submit"]');
            await Promise.all([
                searchButton[0].click(),
                page.waitForNavigation()
            ]);
            let defendantRows = await page.$x('//strong[text()="Lead Defendant: "]/following::text()[1]');
            let plaintiffRows = await page.$x('//strong[text()="Lead Plaintiff: "]/following::text()[1]');
            let caseTypeRows = await page.$x('//strong[text()="Case Type: "]/following::text()[1]');
            let filingDateRows = await page.$x('//strong[text()="Court Date: "]/following::text()[1]');
            for(let i = 0; i < defendantRows.length; i++){
                let names = [];
                let defendant = await defendantRows[i].evaluate(el => el.textContent?.trim());
                names.push(defendant);
                let plaintiff = await plaintiffRows[i].evaluate(el => el.textContent?.trim());
                names.push(plaintiff);
                let caseType = await caseTypeRows[i].evaluate(el => el.textContent?.trim());
                let filingDate = await filingDateRows[i].evaluate(el => el.textContent?.trim());
                for(const name of names){
                    if(await this.getData(page, filingDate, name, caseType)){
                        countRecords += 1;
                    }
                }
            }
            
            console.log(countRecords);
            await AbstractProducer.sendMessage('Knox', 'Tennessee', countRecords, 'Civil & Lien');
            return true;
        } catch (error){
            console.log(error);
            await AbstractProducer.sendMessage('Knox', 'Tennessee', countRecords, 'Civil & Lien');
            return false;
        }
    }
}