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
        generalInfoPage: 'https://search.dorchesterdeeds.com/NameSearch.php?Accept=Accept'
    }

    xpaths = {
        isPAloaded: '//input[@id="start_date"]'
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
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
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
        let page = this.browserPages.generalInfoPage!;
        try{
            const civilUrl: string = this.urls.generalInfoPage;
            let dateRange = await this.getDateRange('South Carolina', 'Dorchester', 60);
            let fromDate = dateRange.from;
            let toDate = dateRange.to;
            let tryCount = 0;
            while (fromDate <= toDate) {
                if (tryCount > 5){
                    break;
                }
                try{
                    let dateStringDay = this.getFormattedDate(new Date(fromDate));
                    console.log(dateStringDay);
                    const client = await page.target().createCDPSession();
                    await client.send('Network.clearBrowserCookies');
                    await page.goto(civilUrl, { waitUntil: 'networkidle0' });
                    await page.click('#start_date', {clickCount: 3, delay: 200});
                    await page.type('#start_date', dateStringDay, {delay: 500});
                    await page.click('#end_date', {clickCount: 3, delay: 200});
                    await page.type('#end_date', dateStringDay, {delay: 500});
                    await page.click('#checkAllBoxes');
                    await this.sleep(5000);
                    let searchButton = await page.$x('//input[@value="Search"]');
                    await Promise.all([
                        searchButton[0].click(),
                        page.waitForNavigation()
                    ]);
                    let resultRows = await page.$x('//div[@id="result_list"]/table/tbody/tr[@style="cursor:pointer;"]');
                    console.log(resultRows.length);
                    if(resultRows.length < 1){
                        fromDate.setDate(fromDate.getDate() + 1);
                        continue;
                    }
                    let checkAllButton = await page.$x('//input[@onclick="CheckAll()"]');
                    await checkAllButton[0].click();
                    await Promise.all([
                        page.click('#displaybutton'),
                        page.waitForNavigation()
                    ]);
                    let grantorNames = await page.$x('//tr[@bgcolor="#eeeeee" or @bgcolor="#FFFFFF"]/td[5]');
                    let docTypes = await page.$x('//tr[@bgcolor="#eeeeee" or @bgcolor="#FFFFFF"]/td[3]');
                    let dateRecordings = await page.$x('//tr[@bgcolor="#eeeeee" or @bgcolor="#FFFFFF"]/td[1]');
                    for (let i = 1; i < grantorNames.length; i++) {
                        let grantorName = await grantorNames[i].evaluate(el => el.textContent?.trim());
                        let docType = await docTypes[i].evaluate(el => el.textContent?.trim());
                        let dateRecording = await dateRecordings[i].evaluate(el => el.textContent?.trim());
                        console.log(grantorName, docType, dateRecording);
                        if(await this.getData(page, dateRecording, grantorName, docType)){
                            countRecords += 1;
                        }
                    }
                    fromDate.setDate(fromDate.getDate() + 1);
                    await this.randomSleepIn5Sec();
                    tryCount = 0;
                } catch(e){
                    console.log(e);
                    tryCount += 1;
                    await this.randomSleepIn5Sec();
                }
            }
            console.log(countRecords);
            await AbstractProducer.sendMessage('South Carolina', 'Dorchester', countRecords, 'Civil');
            return true;
        } catch (error){
            console.log(error);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('South Carolina', 'Dorchester', countRecords, 'Civil', errorImage);
            return false;
        }
    }
}