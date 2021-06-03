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
        generalInfoPage: 'https://recorder.cuyahogacounty.us/searchs/generalsearchs.aspx'
    }

    xpaths = {
        isPAloaded: '//input[@id="txtRecStart"]'
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

    // To check empty or space
    isEmptyOrSpaces(str: string) {
        return str === null || str.match(/^\s*$/) !== null;
    }

    async getData(page: puppeteer.Page, date: any, name: any, docType: any): Promise<any> {
        const parseName: any = this.newParseNameFML(name.trim())
        if (parseName?.type && parseName?.type == 'COMPANY') return false;

        let practiceType = this.getPracticeType(docType)

        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({name: productName}).exec();
        const data = {
            'Property State': 'OH',
            'County': 'cuyahoga',
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
            const civilUrl: string = 'https://recorder.cuyahogacounty.us/searchs/generalsearchs.aspx';
            let dateRange = await this.getDateRange('Ohio', 'Cuyahoga');
            let fromDate = dateRange.from;
            let toDate = dateRange.to;
            let page = this.browserPages.generalInfoPage!;
            let selectDocs = await page.$x('//select[@id="doc1"]/option');
            let countDocs = selectDocs.length;
            while (fromDate <= toDate) {
                let dateStringDay = this.getFormattedDate(fromDate);
                console.log("Processing for date:", dateStringDay);
                for(let j = 1; j < countDocs; j++){
                    let indXpathCountDocs = j + 1;
                    await page.goto(civilUrl);
                    await page.waitForXPath('//input[@id="txtRecStart"]');
                    await page.click('#txtRecStart', {clickCount: 3});
                    await page.type('#txtRecStart', dateStringDay, {delay: 50});
                    await page.click('#txtRecEnd', {clickCount: 3});
                    await page.type('#txtRecEnd', dateStringDay, {delay: 50});
                    let option = (await page.$x('//select[@id="doc1"]/option[' +indXpathCountDocs + ']'))[0];
                    let docType = await option.evaluate(el => el.textContent?.trim());
                    console.log("Processing for date:", dateStringDay, "on docs:", docType);
                    let optionVal: any = await (await option.getProperty('value')).jsonValue();
                    await page.select('#doc1', optionVal);
                    await Promise.all([
                        page.waitForNavigation(),
                        page.click('#ValidateButton')
                    ]);
                    let nextPage = true;
                    let thisPage = 1;
                    while(nextPage){
                        try{
                            console.log("Processing => Page "+thisPage+" on "+dateStringDay);
                            let resultRows = await page.$x('//table[@id="ctl00_ContentPlaceHolder1_GridView1"]/tbody/tr');
                            console.log(resultRows.length);
                            for(let i = 1; i < resultRows.length; i++){
                                try{
                                    let indXpath = i + 1;
                                    let names = [];
                                    let nameFirstHandle = await page.$x('//table[@id="ctl00_ContentPlaceHolder1_GridView1"]/tbody/tr['+indXpath+']/td[4]');
                                    let nameSecondHandle = await page.$x('//table[@id="ctl00_ContentPlaceHolder1_GridView1"]/tbody/tr['+indXpath+']/td[5]');
                                    let fillingDateHandle = await page.$x('//table[@id="ctl00_ContentPlaceHolder1_GridView1"]/tbody/tr['+indXpath+']/td[6]');
                                    try{
                                        let nameFirst = await nameFirstHandle[0].evaluate(el => el.textContent?.trim());
                                        names.push(nameFirst);
                                    } catch(e){
                                        // console.log(e);
                                    }
                                    try{
                                        let nameSecond = await nameSecondHandle[0].evaluate(el => el.textContent?.trim());
                                        names.push(nameSecond);
                                    } catch(e){
                                        // console.log(e);
                                    }
                                    let fillingDate = await fillingDateHandle[0].evaluate(el => el.textContent?.trim());
                                    console.log(names, thisPage, fillingDate);
                                    for(const name of names){
                                        if (this.isEmptyOrSpaces(name!)){
                                            continue;
                                        }
                                        if(await this.getData(page, fillingDate, name, docType)){
                                            countRecords += 1;
                                        }
                                    }
                                } catch(e){
                                    // console.log(e);
                                    continue;
                                }
                            }
                            let nextPageNumber = thisPage + 1;
                            let nextPageHandle = await page.$x(`//td/a[contains(@href, "Page$${nextPageNumber}")]`);
                            if(nextPageHandle.length > 0){
                                console.log("Detected next page by number, clicking...");
                                await nextPageHandle[0].click();
                                await this.randomSleepIn5Sec();
                                console.log("Next page clicked! waiting for result...");
                                await page.waitForXPath('//table[@id="ctl00_ContentPlaceHolder1_GridView1"]/tbody/tr');
                                console.log("Result loaded successfully");
                                thisPage += 1;
                            } else {
                                console.log("Pagination is over, stopped.")
                                nextPage = false;
                            }
                        } catch(e){
                            console.log(e);
                            break;
                        }
                    }
                }
                console.log("Stopped for date:", dateStringDay);
                fromDate.setDate(fromDate.getDate() + 1);
                await this.randomSleepIn5Sec();
            }
            
            console.log(countRecords);
            await AbstractProducer.sendMessage('Cuyahoga', 'Ohio', countRecords, 'Civil & Lien');
            return true;
        } catch (error){
            console.log(error);
            await AbstractProducer.sendMessage('Cuyahoga', 'Ohio', countRecords, 'Civil & Lien');
            return false;
        }
    }
}