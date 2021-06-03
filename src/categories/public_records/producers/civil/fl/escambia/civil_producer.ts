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
        generalInfoPage: 'http://dory.escambiaclerk.com/LandmarkWeb1.4.6.134/home/index'
    }

    xpaths = {
        isPAloaded: '//span[contains(., "document")]'
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

    // This is main function
    async parseAndSave(): Promise<boolean> {
        const civilUrl: string = 'http://dory.escambiaclerk.com/LandmarkWeb1.4.6.134/home/index';

        let page = this.browserPages.generalInfoPage!;
        let countRecords = 0;
        try{
            await page.goto(civilUrl);
            await page.waitForXPath('//img[@data-title="Document Search"]', { visible: true });
            let searchByDocument = await page.$x('//img[@data-title="Document Search"]');
            await searchByDocument[0].click();
            await page.waitForSelector('a#idAcceptYes');
            await Promise.all([
                page.click('a#idAcceptYes'),
                page.waitForNavigation()
            ]);
            let documentTypes = ['Deeds', 'Judgments', 'Liens', 'Lis Pendens', 'Marriage', 'Mortgages', 'Probate'];
            for (const docTypeSelect of documentTypes) {
                // console.log(docTypeSelect);
                let option = (await page.$x('//select[@id="documentCategory-DocumentType"]/option[contains(., "' + docTypeSelect + '")]'))[0];
                let optionVal: any = await (await option.getProperty('value')).jsonValue();
                await page.select('#documentCategory-DocumentType', optionVal);
                await page.waitFor(1000);
            }
            let dateRange = await this.getDateRange('Florida', 'Escambia');
            let fromDate = dateRange.from;
            let toDate = dateRange.to;
            let fromDateString = this.getFormattedDate(fromDate);
            let toDateString = this.getFormattedDate(toDate);
            await page.click('input#beginDate-DocumentType', { clickCount: 3 });
            await page.type('input#beginDate-DocumentType', fromDateString);
            await page.click('input#endDate-DocumentType', { clickCount: 3 });
            await page.type('input#endDate-DocumentType', toDateString);
            // await page.select('#lastNumOfDays-DocumentType', '30');
            await page.select('#numberOfRecords-DocumentType', '2000');
            await page.click('a#submit-DocumentType');
            await page.waitForXPath('//table[@id="resultsTable"]/tbody/tr', { visible: true, timeout: 60000 });
            await this.randomSleepIn5Sec();
            let docTypeHandles = await page.$x('//table[@id="resultsTable"]/tbody/tr/td[9]');
            let recordDateHandles = await page.$x('//table[@id="resultsTable"]/tbody/tr/td[8]');
            let uniqueIdHandles = await page.$x('//table[@id="resultsTable"]/tbody/tr/td[13]');
            for (let i = 0; i < docTypeHandles.length; i++) {
                let indexName = i + 1;
                let docType = await docTypeHandles[i].evaluate(el => el.textContent?.trim());
                let recordDate = await recordDateHandles[i].evaluate(el => el.textContent?.trim());
                let uniqueId = await uniqueIdHandles[i].evaluate(el => el.textContent?.trim());
                // let practiceType = '';
                let names = [];
                let reverseNameHandles = await page.$x('//table[@id="resultsTable"]/tbody/tr[' + indexName + ']/td[7]/text()');
                let directNameHandles = await page.$x('//table[@id="resultsTable"]/tbody/tr[' + indexName + ']/td[6]/text()');
                let reverseName: any = '';
                let directName: any = '';
                if (docType?.match(/marriage/i) || docType?.match(/deed/i) || docType?.match(/family/i)) {
                    for (let reverseNameHandle of reverseNameHandles) {
                        reverseName = await reverseNameHandle.evaluate(el => el.textContent?.trim());
                        names.push(reverseName);
                    }
                    for (let directNameHandle of directNameHandles) {
                        directName = await directNameHandle.evaluate(el => el.textContent?.trim());
                        names.push(directName);
                    }
                } else if (docType?.match(/mortgage/i) || docType?.match(/probate/i)) {
                    for (let directNameHandle of directNameHandles) {
                        directName = await directNameHandle.evaluate(el => el.textContent?.trim());
                        names.push(directName);
                    }
                } else {
                    for (let reverseNameHandle of reverseNameHandles) {
                        reverseName = await reverseNameHandle.evaluate(el => el.textContent?.trim());
                        names.push(reverseName);
                    }
                }

                let practiceType = this.getPracticeType(docType!);
                // console.log(names);
                for (const name of names) {
                    const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                    const prod = await db.models.Product.findOne({ name: productName }).exec();
                    const parseName: any = this.newParseName(name!.trim());
                    if(parseName.type && parseName.type == 'COMPANY'){
                        continue;
                    }
                    const data = {
                        'caseUniqueId': uniqueId,
                        'Property State': this.publicRecordProducer.state,
                        'County': this.publicRecordProducer.county,
                        'First Name': parseName.firstName,
                        'Last Name': parseName.lastName,
                        'Middle Name': parseName.middleName,
                        'Name Suffix': parseName.suffix,
                        'Full Name': parseName.fullName,
                        "vacancyProcessed": false,
                        fillingDate: recordDate,
                        "productId": prod._id,
                        originalDocType: docType
                    };
                    if(await this.civilAndLienSaveToNewSchema(data)){
                        countRecords += 1;
                    }
                    await this.sleep(500);
                }
            }

            await AbstractProducer.sendMessage('Escambia', 'Florida', countRecords, 'Civil & Lien');
            return true;
        } catch(e){
            console.log(e);
            await AbstractProducer.sendMessage('Escambia', 'Florida', countRecords, 'Civil & Lien');
            return false;
        }
    }
}