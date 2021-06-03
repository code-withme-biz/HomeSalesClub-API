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
        generalInfoPage: 'https://www.myfloridacounty.com/orisearch/s/index?q1=PUekI0zIOB3tlIGH1rpZaA'
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
        try{
            let dateRange = await this.getDateRange('Florida', 'Nassau');
            let fromDate = dateRange.from;
            let toDate = dateRange.to;
            let days = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 3600 * 24)) - 1;
            let fromDateString = this.getFormattedDate(fromDate);
            let toDateString = this.getFormattedDate(toDate);
            
            await page.goto(civilUrl, {waitUntil: 'load'});
            
            // input date range
            await page.type('#start_date', fromDateString);
            await page.type('#end_date', toDateString);
            
            // input doctype
            await page.click('select[name="instrumentTypeID"] > option[value="0"]');
            await page.waitFor(1000);
            
            await Promise.all([
                page.click('input[value="Search"]'),
                page.waitForNavigation()
            ]);
                
            await page.waitFor(1000);
                
            let nextPage = true;
            while (nextPage) {
                try {
                    let resultRows = await page.$x('//table[@id="ori_results"]/tbody/tr');
                    for (const row of resultRows) {
                        let names = await page.evaluate(el => el.children[1].textContent.trim(), row);
                        names = names.split(',');
                        console.log(names);
                        let recordDate = await page.evaluate(el => el.children[2].textContent.trim(), row);
                        let docType = await page.evaluate(el => el.children[3].textContent.trim(), row);

                        let practiceType = this.getPracticeType(docType!);
                        if (docType === 'MTG') {
                            practiceType = 'mortgage-lien';
                        } else if (docType === 'LN') {
                            practiceType = 'tax-lien';
                        } else if (docType === 'PRO') {
                            practiceType = 'probate';
                        }
                        for (const name of names) {
                            if (this.isEmptyOrSpaces(name!)) {
                                continue;
                            }
                            // console.log(name);
                            const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                            const prod = await db.models.Product.findOne({ name: productName }).exec();
                            const parseName = this.newParseName(name!.trim());
                            if(parseName.firstName == '' && parseName.lastName == '' && parseName.middleName == '' && !parseName.fullName.match(/llc/i)){
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
                    let nextPageEnabled = await page.$x('//a[text()="Next"]');
                    if (nextPageEnabled.length === 0) {
                        nextPage = false;
                    } else {
                        let nextPageButton = await page.$x('//a[text()="Next"]');
                        await Promise.all([
                            nextPageButton[0].click(),
                            page.waitForNavigation()
                        ]);                                        
                        await this.sleep(2000);
                    }
                } catch (error) {
                    console.log(error);
                    await page.waitFor(2000);
                }    
            }            
            
            console.log(countRecords);
            await AbstractProducer.sendMessage('Nassau', 'Florida', countRecords, 'Civil & Lien');
            return true;
        } catch(e){
            console.log(e);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Nassau', 'Florida', countRecords, 'Civil & Lien', errorImage);
            return false;
        }
    }
}