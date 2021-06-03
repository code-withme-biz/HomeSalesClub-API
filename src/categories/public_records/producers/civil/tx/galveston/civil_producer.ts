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
        generalInfoPage: 'http://publicaccess.co.galveston.tx.us/default.aspx'
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
        const civilUrl: string = 'http://publicaccess.co.galveston.tx.us/default.aspx';
        let countRecords = 0;

        try{
            let dateRange = await this.getDateRange('Texas', 'Galveston');
            let fromDate = dateRange.from;
            let toDate = dateRange.to;
            let page = this.browserPages.generalInfoPage!;

            while (fromDate <= toDate) {
                let dateStringDay = this.getFormattedDate(new Date(fromDate));
                await page.goto(civilUrl);
                await page.waitForXPath('//a[contains(text(), "Civil and Family Case Records")]', {visible: true});
                let civilButton = await page.$x('//a[contains(text(), "Civil and Family Case Records")]');
                await civilButton[0].click();
                await page.waitForXPath('//label[contains(text(), "Date Filed")]', {visible: true});
                let searchDateFilled = await page.$x('//label[contains(text(), "Date Filed")]');
                await searchDateFilled[0].click();
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
                    let nameHandles = await page.$x('//th[contains(text(), "Defendant") or contains(text(), "Respondent")]/parent::tr/th[2]');
                    for(const nameHandle of nameHandles){
                        let name = await nameHandle.evaluate((el: any) => el.textContent?.trim());
                        if(name.match(/county/i) || name.match(/galveston/i) || name.match(/officer/i) || name.match(/state/i) || name.match(/texas/i)){
                            continue;
                        }
                        let nameId = await nameHandle.evaluate((el: any) => el.getAttribute('id').trim());
                        let addressRowHandle = await page.$x('//td[contains(@headers, "'+nameId+'") and contains(., "TX")]/text()[1]');
                        let propertyZip = '';
                        let propertyAddress = '';
                        let propertyCity = '';
                        if (addressRowHandle.length > 0){
                            let addressHandle = await page.$x('//td[contains(@headers, "'+nameId+'") and contains(., "TX")]/text()[1]');
                            let cityStateZipHandle = await page.$x('//td[contains(@headers, "'+nameId+'") and contains(., "TX")]/text()[last()]');
                            propertyAddress = await addressHandle[0].evaluate((el: any) => el.textContent?.trim());
                            let cityStateZip = await cityStateZipHandle[0].evaluate((el: any) => el.textContent?.trim());
                            let cityStateZipArr = cityStateZip.split(',');
                            propertyCity = cityStateZipArr[0].trim();
                            let stateZip = cityStateZipArr[1].trim();
                            let stateZipArr = stateZip.split(/\s+/g);
                            propertyZip = stateZipArr[1];
                        }

                        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                        const prod = await db.models.Product.findOne({ name: productName }).exec();
                        const parseName: any = this.newParseName(name!.trim());
                        if (parseName.type === 'COMPANY' || parseName.fullName === '') continue;
                        const ownerData = {
                            'caseUniqueId': caseId,
                            'Property State': 'TX',
                            'County': 'Galveston',
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
                        const propertyData = {
                            'caseUniqueId': caseId,
                            'Property Address': propertyAddress,
                            'Property State': 'TX',
                            'Property Unit #': '',
                            'Property City': propertyCity,
                            'Property Zip': propertyZip,
                            'County': 'Galveston',
                            'practiceType': practiceType,
                            "vacancyProcessed": false,
                            fillingDate: dateFilled,
                            "productId": prod._id,
                            originalDocType: caseType
                        };
                        if (await this.civilAndLienSaveToNewSchema(ownerData)){
                            countRecords += 1;
                        }
                        if (await this.civilAndLienSaveToNewSchema(propertyData)){
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

            await AbstractProducer.sendMessage('Galveston', 'Texas', countRecords, 'Civil');
            console.log(countRecords);
            return true;
        } catch(e){
            console.log(e);
            await AbstractProducer.sendMessage('Galveston', 'Texas', countRecords, 'Civil');
            return false;
        }
    }
}