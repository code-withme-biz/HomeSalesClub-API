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
        generalInfoPage: 'http://beta.co.gregg.tx.us/OdysseyPA/default.aspx'
    }

    xpaths = {
        isPAloaded: '//a[@class="ssSearchHyperlink"]'
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

    // This is main function
    async parseAndSave(): Promise<boolean> {
        const civilUrl: string = 'http://beta.co.gregg.tx.us/OdysseyPA/default.aspx';

        let countRecords = 0;
        try{
            let dateRange = await this.getDateRange('Texas', 'Gregg');
            let fromDate = dateRange.from;
            let toDate = dateRange.to;
            let page = this.browserPages.generalInfoPage!;

            while (fromDate <= toDate) {
                let dateStringDay = this.getFormattedDate(new Date(fromDate));
                await page.goto(civilUrl);
                await page.waitForXPath('//a[contains(text(), "Civil, Family & Probate Case Records")]', {visible: true});
                let civilButton = await page.$x('//a[contains(text(), "Civil, Family & Probate Case Records")]');
                await civilButton[0].click();
                await page.waitForXPath('//select[@id="SearchBy"]', {visible: true});
                // let searchDateFilled = await page.$x('//label[contains(text(), "Date Filed")]');
                // await searchDateFilled[0].click();
                await page.select('#SearchBy', '6');
                await page.type('#DateFiledOnAfter', dateStringDay);
                await page.type('#DateFiledOnBefore', dateStringDay);
                await page.click('#SearchSubmit');
                await page.waitForXPath('//th[@class="ssSearchResultHeader"]', {visible: true});
                let caseDetailLinks = await page.$x('//a[contains(@href, "CaseDetail")]');
                // console.log(caseDetailLinks.length);
                for(let i = 0; i < caseDetailLinks.length; i++){
                    caseDetailLinks = await page.$x('//a[contains(@href, "CaseDetail")]');
                    await caseDetailLinks[i].click();
                    await page.waitForXPath('//div[@class="ssCaseDetailROA"]', {visible: true});
                    let caseTypeHandle = await page.$x('//th[contains(text(), "Case Type:")]/parent::tr/td');
                    let caseType = await caseTypeHandle[0].evaluate((el: any) => el.textContent?.trim());
                    let dateFilledHandle = await page.$x('//th[contains(text(), "Date Filed:")]/parent::tr/td');
                    let dateFilled = await dateFilledHandle[0].evaluate((el: any) => el.textContent?.trim());
                    let practiceType = this.getPracticeType(caseType);
                    let caseIdHandle = await page.$x('//div[contains(., "Case No.")]/span');
                    let caseId = await caseIdHandle[0].evaluate((el: any) => el.textContent?.trim());
                    let nameHandles = await page.$x('//th[contains(text(), "Defendant") or contains(text(), "Decedent")]/parent::tr/th[2]');
                    for(const nameHandle of nameHandles){
                        let name = await nameHandle.evaluate((el: any) => el.textContent?.trim());
                        if(name.match(/county/i) || name.match(/gregg/i) || name.match(/officer/i) || name.match(/state/i) || name.match(/texas/i)){
                            continue;
                        }
                        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                        const prod = await db.models.Product.findOne({ name: productName }).exec();
                        const parseName: any = this.newParseName(name!.trim());
                        if (parseName.type === 'COMPANY' || parseName.fullName === '') continue;
                        const data = {
                            'caseUniqueId': caseId,
                            'County': 'Gregg',
                            'Property State': 'TX',
                            'First Name': parseName.firstName,
                            'Last Name': parseName.lastName,
                            'Middle Name': parseName.middleName,
                            'Name Suffix': parseName.suffix,
                            'Full Name': parseName.fullName,
                            'practiceType': practiceType,
                            "vacancyProcessed": false,
                            fillingDate: dateFilled,
                            "productId": prod._id,
                            originalDocType: caseType
                        };
                        if (await this.civilAndLienSaveToNewSchema(data)){
                            countRecords += 1;
                        }
                    }
                    await Promise.all([
                        page.goBack(),
                        page.waitForNavigation()
                    ]);
                }
                fromDate.setDate(fromDate.getDate() + 1);
            }

            await AbstractProducer.sendMessage('Gregg', 'Texas', countRecords, 'Civil');
            console.log(countRecords);
            return true;
        } catch(e){
            console.log(e);
            await AbstractProducer.sendMessage('Gregg', 'Texas', countRecords, 'Civil');
            return true;
        }
    }
}