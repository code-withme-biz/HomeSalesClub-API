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
        generalInfoPage: 'https://clerkapps.okaloosaclerk.com/LandmarkWeb/home/index'
    }

    xpaths = {
        isPAloaded: '//span[text()="document"]/parent::div[1]/a'
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
        const civilUrl: string = this.urls.generalInfoPage;
        let page = this.browserPages.generalInfoPage!;

        // get date range
        let countRecords = 0;
        let dateRange = await this.getDateRange('Florida', 'Okaloosa');
        let fromDate = dateRange.from;
        let toDate = dateRange.to;
        try {
            let fromDateString = this.getFormattedDate(fromDate);
            let toDateString = this.getFormattedDate(toDate);

            await page.goto(civilUrl, {waitUntil: 'load'});

            // click search by document
            const [button_document] = await page.$x('//span[text()="document"]/parent::div[1]/a');
            await button_document.click();
            await page.waitFor(1000);

            // accept condition
            let tosSubmit = await page.$x('//a[@id="idAcceptYes"]');
            if (tosSubmit.length > 0) {
                await Promise.all([tosSubmit[0].click(),
                    page.waitForNavigation()
                ]);
            }

            // input doctype
            const [doc_type_select_button] = await page.$x('//a[@id="documentTypeSelection-DocumentType"]');
            await doc_type_select_button.click();
            await page.waitForXPath('//h3[text()="Document Types"]');
            let docTypeSelects = [31, 65, 72, 104, 106, 125, 244, 124, 242, 241, 233, 122, 123, ]; // ['DEED', 'LIEN', 'LIS PENDENS', 'MARRIAGE LICENSE', 'PROBATE', 'MORTGAGE', 'BANKCRUPTCY'];
            for (const docTypeSelect of docTypeSelects) {
                const input = await page.$x(`//form[@id="documentTypeSearchForm"]//input[@value="${docTypeSelect}"]`);
                await input[0].click();
                await page.waitFor(200);
            }
            await page.waitFor(1000);
            // click done button
            const [select_button] = await page.$x('//form[@id="documentTypeSearchForm"]//a[contains(@onclick, "UpdateDocumentTypeListFromModal")]');
            await select_button.click();
            await page.waitFor(500);
            // input date range
            await page.click('#beginDate-DocumentType', {clickCount: 3});
            await page.type('#beginDate-DocumentType', fromDateString);
            await page.click('#endDate-DocumentType', {clickCount: 3});
            await page.type('#endDate-DocumentType', toDateString);
            await page.click('#submit-DocumentType');
            await page.waitForSelector('#resultsTable');
            await page.waitFor(1000);
            await this.randomSleepIn5Sec();
            
            let resultRows = await page.$x('//table[@id="resultsTable"]/tbody/tr');
            for (const row of resultRows) {
                let names = await page.evaluate(el => el.children[6].textContent.trim(), row);
                names = names.split('&');
                let recordDate = await page.evaluate(el => el.children[7].textContent.trim(), row);
                let docType = await page.evaluate(el => el.children[8].textContent.trim(), row);

                let practiceType = this.getPracticeType(docType);
                for (const name of names) {
                    if (this.isEmptyOrSpaces(name!)) {
                        continue;
                    }
                    // console.log(name);
                    const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                    const prod = await db.models.Product.findOne({ name: productName }).exec();
                    const parseName: any = this.newParseName(name!.trim());
                    if(parseName.type && parseName.type == 'COMPANY'){
                        continue;
                    }

                    const data = {
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

                    if (await this.civilAndLienSaveToNewSchema(data))
                        countRecords += 1;
                }
            }
            await AbstractProducer.sendMessage('Okaloosa', 'Florida', countRecords, 'Civil & Lien');
            return true;
        } catch (error) {
            console.log(error);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Okaloosa', 'Florida', countRecords, 'Civil & Lien');
            return false;
        }                
        
    }
}