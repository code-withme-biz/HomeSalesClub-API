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
        generalInfoPage: 'http://54.69.64.35/RW/?ln=en'
    }

    xpaths = {
        isPAloaded: '//a[text()="Document Type"]'
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
    
    async checkForTimeout(page: puppeteer.Page) {
        const okbutton = await page.$('#btnOk');
        if (okbutton) {
            console.log('~~~ Detected timeout dialog, and resolved');
            await okbutton.click();
        }
    }

    // This is main function
    async parseAndSave(): Promise<boolean> {
        const civilUrl: string = 'http://54.69.64.35/RW/?ln=en';
        let countRecords = 0;

        try{
            let dateRange = await this.getDateRange('Califonia', 'Contra Costa');
            let fromDate = dateRange.from;
            let toDate = dateRange.to;
            
            let fromDateString = this.getFormattedDate(fromDate);
            let toDateString = this.getFormattedDate(toDate);

            let page = this.browserPages.generalInfoPage!;
            await page.goto(civilUrl, {waitUntil: 'load'});
            // click document type
            let docButton = await page.$x('//a[contains(text(), "Document Type")]');
            await docButton[0].click();

            await this.sleep(500);
            await page.waitForSelector('#MainContent_MainMenu1_SearchByDocType1_DocumentTypes1_CtrlWidget #chkTypes', {visible: true});
            await page.click('#MainContent_MainMenu1_SearchByDocType1_DocumentTypes1_CtrlWidget #chkTypes');
            await page.type('#MainContent_MainMenu1_SearchByDocType1_FromDate', fromDateString);
            await page.type('#MainContent_MainMenu1_SearchByDocType1_ToDate', toDateString);
            await page.click('div#MainContent_MainMenu1_SearchByDocType1_btnSearch');

            await page.waitForXPath('//span[@id="SearchResultsTitle1_resultCount"]');
            const ok_button = await page.$x('//input[@id="MainContent_AlertMessageBox_btnOK"]');
            try { if (ok_button.length > 0) await ok_button[0].click(); } catch (error) {}

            // get count of results
            let countResults: any = await page.$x('//span[@id="SearchResultsTitle1_resultCount"]');
            countResults = await page.evaluate(el => el.textContent, countResults[0]);
            countResults = parseInt(countResults);
            if (countResults  === 0) {
                console.log('No Results Found');
                return false;
            }
            else {
                console.log(`${countResults} Results Found`);
            }

            
            let nextPage: any = true;
            while (nextPage) {
                const rows = await page.$x('//tr[@id="row1"]');
                for (let index = 0 ; index < rows.length ; index++) {
                    try {
                        // document number
                        let caseId = await page.evaluate(el => el.children[1].textContent.trim(), rows[index]);
                        // name
                        let names = [];
                        const name_handles = await page.$x(`//tr[@id="row1"][position()=${index+1}]/td[3]/div/div[2]/p`);
                        for (const name_handle of name_handles) {
                            const name = await page.evaluate(el => el.textContent.trim(), name_handle);
                            names.push(name);
                        }
                        // document type
                        let docType = await page.evaluate(el => el.children[2].children[0].children[2].textContent.trim(), rows[index]);
                        // filling date
                        let recordDate = await page.evaluate(el => el.children[3].textContent.trim(), rows[index]);

                        let practiceType = this.getPracticeType(docType);
                        // console.log(directName, indirectName, caseId);
                        for(const name of names){
                            if (this.isEmptyOrSpaces(name!)){
                                continue;
                            }
                            // console.log(name);
                            const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                            const prod = await db.models.Product.findOne({ name: productName }).exec();
                            const parseName: any = this.newParseName(name!.trim());
                            if (parseName.type === 'COMPANY') continue;
                            const data = {
                                'caseUniqueId': caseId,
                                'Property State': 'CA',
                                'County': 'Contra Costa',
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
                            await this.checkForTimeout(page);
                        }
                    } catch (error) {
                        console.log('Error during checking row: ', error);
                    }
                }
                try {
                    let next_page_handle = await page.$x('//td[contains(@class, "pagingCellDisable")][contains(text(), "Next")]');
                    if (next_page_handle.length > 0) {
                        nextPage = false;
                    } else {
                        console.log('~~~ clicking next page');
                        next_page_handle = await page.$x('//td[contains(@class, "pagingCell")][contains(text(), "Next")]');
                        await next_page_handle[0].click();
                        await page.waitFor(200);
                        await page.waitForXPath('//div[@id="MainContent_ResultLoading_ContentBlocker"]', {visible: false});
                        await page.waitFor(1000);
                        nextPage = true;
                    }
                } catch (error) {
                    console.log('Error during clicking next page: ', error);
                }
            }
            console.log(countRecords);
            await AbstractProducer.sendMessage('Contra Costa', 'California', countRecords, 'Civil & Lien');
            await page.close();
            await this.browser?.close();
            return true;
        } catch(e){
            console.log(e);
            await AbstractProducer.sendMessage('Contra Costa', 'California', countRecords, 'Civil & Lien');
            return false;
        }
    }
}