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
        generalInfoPage: 'https://www.myfloridacounty.com/ori/index.do'
    }

    xpaths = {
        isPAloaded: '//select[@id="or_county"]'
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
        const civilUrl: string = 'https://www.myfloridacounty.com/ori/index.do';

        let countRecords = 0;
        try{
            let dateRange = await this.getDateRange('Florida', 'Marion');
            let fromDate = dateRange.from;
            let toDate = dateRange.to;
            let fromDateString = this.getFormattedDate(fromDate);
            let toDateString = this.getFormattedDate(toDate);
            let page = this.browserPages.generalInfoPage!;
            console.log(fromDateString)
            await page.goto(civilUrl, { waitUntil: 'load' });
            // choose county
            await page.select('#or_county', '42');
            // type date range
            const startDate = fromDateString.split('/');
            const endDate = toDateString.split('/');
            await page.select('#start_date_month', parseInt(startDate[0]).toString());
            await page.select('#start_date_day', parseInt(startDate[1]).toString());
            await page.type('input#start_date_year', startDate[2]);
            await page.select('#end_date_month', parseInt(endDate[0]).toString());
            await page.select('#end_date_day', parseInt(endDate[1]).toString());
            await page.type('input#end_date_year', endDate[2]);
            // choose doc type
            await page.select('select[name="documentTypes"]', '00');
            await this.sleep(10000);
            await Promise.all([
                page.click('input[value="Submit"]'),
                page.waitForNavigation()
            ]);
            
            let nextPage = true;
            while (nextPage) {
                try {
                    let resultRows = await page.$x('//*[@id="search_results1"]/tbody/tr');
                    for (const row of resultRows) {
                        let caseId = await page.evaluate(el => el.children[6].textContent.trim(), row);
                        let names = await page.evaluate(el => el.children[1].textContent.trim(), row);
                        names = names.split(',').map((name: string) => name.trim());
                        let docType = await page.evaluate(el => el.children[4].textContent.trim(), row);
                        let recordDate = await page.evaluate(el => el.children[3].textContent.trim(), row);

                        let practiceType = this.getPracticeType(docType);
                        if(practiceType == 'debt'){
                            if (docType == 'J/L' || docType == 'LN' || docType == 'NCL') {
                                practiceType = 'tax-lien';
                            } else if (docType == 'MAR' || docType == 'MAR_INACTIVE' || docType == 'MAR') {
                                practiceType = 'marriage';
                            } else if (docType == 'PRO') {
                                practiceType = 'probate';
                            }
                        }
                        for (const name of names) {
                            if (this.isEmptyOrSpaces(name!)) {
                                continue;
                            }
                            const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                            const prod = await db.models.Product.findOne({ name: productName }).exec();
                            const parseName: any = this.newParseName(name!.trim());
                            if(parseName.type && parseName.type == 'COMPANY'){
                                continue;
                            }

                            const data = {
                                'caseUniqueId': caseId,
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
                    let nextPageEnabeld = await page.$x('//a[text()="Next"]');
                    if (nextPageEnabeld.length === 0) {
                        nextPage = false;
                    } else {
                        await Promise.all([
                            nextPageEnabeld[0].click(),
                            page.waitForNavigation()
                        ]);
                        await page.waitForXPath('//*[@id="search_results1"]');
                        nextPage = true;
                        await this.sleep(3000);
                    }
                } catch (error) {
                    await page.waitForXPath('//*[@id="search_results1"]');
                    nextPage = true;
                    await this.sleep(3000);
                }
            }
            
            console.log(countRecords);
            await AbstractProducer.sendMessage('Marion', 'Florida', countRecords, 'Civil & Lien');
            return true;
        } catch(e){
            console.log(e);
            await AbstractProducer.sendMessage('Marion', 'Florida', countRecords, 'Civil & Lien');
            return false;
        }
    }
}