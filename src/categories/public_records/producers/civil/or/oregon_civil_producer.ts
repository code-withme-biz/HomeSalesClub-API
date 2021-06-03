import AbstractProducer from '../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../models/public_record_producer';

import puppeteer from 'puppeteer';
import db from '../../../../../models/db';

export default abstract class OregonCivilProducer extends AbstractProducer {
    browser: puppeteer.Browser | undefined;
    browserPages = {
        generalInfoPage: undefined as undefined | puppeteer.Page
    };
    urls = {
        generalInfoPage: 'https://publicaccess.courts.oregon.gov/PublicAccess/default.aspx'
    }
    abstract county: string;

    xpaths = {
        isPAloaded: '//select[@id="sbxControlID2"]'
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
        const parseName: any = this.newParseNameFML(name.trim())
        if (parseName?.type && parseName?.type == 'COMPANY') return false;
        let practiceType = this.getPracticeType(docType)
        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({name: productName}).exec();
        const data = {
            'Property State': 'OR',
            'County': this.county,
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
            let option = (await page.$x('//select[@id="sbxControlID2"]/option[text()="'+ this.county + '"]'))[0];
            let optionVal: any = await (await option.getProperty('value')).jsonValue();
            await page.select('#sbxControlID2', optionVal);
            let calendarButton = await page.$x('//a[@class="ssSearchHyperlink"]');
            await Promise.all([
                calendarButton[0].click(),
                page.waitForNavigation()
            ]);
            await page.select('#SearchBy', '5');
            await this.sleep(1000);
            let searchButton = await page.$x('//input[@id="SearchSubmit"]');
            await Promise.all([
                searchButton[0].click(),
                page.waitForNavigation()
            ]);
            let resultRows = await page.$x('//b[text()="Case Number"]/ancestor::tbody[2]/tr');
            resultRows.shift();
            for(const row of resultRows){
                if(countRecords > 45){
                    break;
                }
                let caseType = await row.evaluate(el => el.children[0].children[0].children[0].children[1].children[0].textContent?.trim());
                let names = await row.evaluate(el => el.children[1].textContent?.trim());
                let namesArray: any = [];
                if(names?.match(/\s+vs\s+/gi)){
                    namesArray = names.split(/\s+vs\s+/gi);
                } else if(names?.match(/\s+vs\.\s+/gi)){
                    namesArray = names.split(/\s+vs\.\s+/gi);
                }
                let fillingDate = await row.evaluate(el => el.children[3].children[0].children[0].children[0].children[0].textContent?.trim());
                for(let name of namesArray){
                    if(name.includes(', ')){
                        name = name.split(', ')[0].trim();
                    }
                    console.log(name, caseType, fillingDate);
                    if(await this.getData(page, fillingDate, name, caseType)){
                        countRecords += 1;
                    }
                }
            }
            
            console.log(countRecords);
            await AbstractProducer.sendMessage(this.county, 'Oregon', countRecords, 'Civil & Lien');
            return true;
        } catch (error){
            console.log(error);
            await AbstractProducer.sendMessage(this.county, 'Oregon', countRecords, 'Civil & Lien');
            return false;
        }
    }
}