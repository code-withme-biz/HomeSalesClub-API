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
        generalInfoPage: 'https://ctsearch.cobbsuperiorcourtclerk.com/CaseType'
    }

    xpaths = {
        isPAloaded: '//select[@id="civiltype"]'
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
            'Property State': 'GA',
            'County': 'cobb',
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
            const civilUrl: string = this.urls.generalInfoPage;
            let dateRange = await this.getDateRange('Georgia', 'Cobb');
            let fromDate = dateRange.from;
            let toDate = dateRange.to;
            let page = this.browserPages.generalInfoPage!;
            let docTypeSelects = ['CHILD SUPPORT', 'DIVORCE', 'FORECLOSURE', 'FAMILY VIOLENCE', 'TAX APPEAL'];
            for (const docTypeSelect of docTypeSelects) {
                await page.goto(civilUrl, { waitUntil: 'networkidle0' });
                let option = (await page.$x('//select[@id="civiltype"]/option[contains(., "' + docTypeSelect + '")]'))[0];
                let optionVal: any = await (await option.getProperty('value')).jsonValue();
                await page.select('#civiltype', optionVal);
                await this.sleep(500);
                await page.type('#datefrom', this.getFormattedDate(fromDate));
                await page.type('#datethru', this.getFormattedDate(toDate));

                await Promise.all([
                    page.click('#Search'),
                    page.waitForNavigation()
                ]);
                let checkResult = await page.$x('//div[@id="resulthits"]');
                if(checkResult.length < 1){
                    console.log(docTypeSelect, "=> Not found!");
                    continue;
                }
                let nextPage = true;
                while (nextPage) {
                    let resultRows = await page.$x('//div[@id="resulthits"]/div');
                    for (let i = 1; i < resultRows.length; i++) {
                        let names = [];
                        let indXpath = i + 1;
                        let directNameHandle = await page.$x('//div[@id="resulthits"]/div[' + indXpath + ']/div[2]');
                        let directName = await directNameHandle[0].evaluate(el => el.textContent?.trim());
                        let indirectNameHandle = await page.$x('//div[@id="resulthits"]/div[' + indXpath + ']/div[3]');
                        let indirectName = await indirectNameHandle[0].evaluate(el => el.textContent?.trim());
                        let directNameArr: any = directName?.replace(/\s+/g,' ').split(',');
                        let indirectNameArr: any = indirectName?.replace(/\s+/g,' ').split(',');
                        for(let direct of directNameArr){
                            direct = direct.replace('[D]','').replace('[P]','').trim();
                            names.push(direct);
                        }
                        for(let indirect of indirectNameArr){
                            indirect = indirect.replace('[D]','').replace('[P]','').trim();
                            names.push(indirect);
                        }
                        console.log(names);
                        let docTypeHandle = await page.$x('//div[@id="resulthits"]/div[' + indXpath + ']/div[4]');
                        let docType = await docTypeHandle[0].evaluate(el => el.textContent?.trim());
                        let recordDateHandle = await page.$x('//div[@id="resulthits"]/div[' + indXpath + ']/div[6]');
                        let recordDate = await recordDateHandle[0].evaluate(el => el.textContent?.trim());
                        for(const name of names){
                            if(await this.getData(page, recordDate, name, docType)){
                                countRecords += 1;
                            }
                        }
                    }
                    let nextPageDisabled = await page.$x('//div[@id="next" and @class="button-disabled"]');
                    if (nextPageDisabled.length > 0) {
                        nextPage = false;
                    } else {
                        await Promise.all([
                            page.click('#next'),
                            page.waitForNavigation()
                        ]);
                        await this.randomSleepIn5Sec();
                    }
                }
            }
            
            console.log(countRecords);
            await AbstractProducer.sendMessage('Cobb', 'Georgia', countRecords, 'Civil');
            return true;
        } catch (error){
            console.log(error);
            await AbstractProducer.sendMessage('Cobb', 'Georgia', countRecords, 'Civil');
            return false;
        }
    }
}