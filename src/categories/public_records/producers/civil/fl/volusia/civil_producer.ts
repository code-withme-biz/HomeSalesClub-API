import puppeteer from 'puppeteer';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import db from '../../../../../../models/db';
import SnsService from '../../../../../../services/sns_service';
import { delay } from 'lodash';


export default class CivilProducer extends AbstractProducer {
    urls = {
        generalInfoPage: 'https://app02.clerk.org/or_m/'
    }

    xpaths = {
        isPageLoaded: '//input[@id="accept"]'
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
            await this.browserPages.generalInfoPage?.waitForXPath(this.xpaths.isPageLoaded);
            console.warn('Page Loaded')
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }    
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let countRecords = 0;
        try {
            const dateRange = await this.getDateRange('Florida', 'Volusia');

            try {
                const [docBtnHandle] = await page.$x('//input[@id="accept"]');
                await docBtnHandle.click();
                await page.waitForNavigation();
            } catch (error) {
                console.log(error);
                return false;
            }

            await page.waitForXPath('//div[@id="main"]');
            await page.waitForXPath('//input[@id="search"]');
            await page.waitForXPath('//input[@id="keepOpen"]');
            await page.waitFor(2000);
            const openHandle = await page.$x('//input[@id="keepOpen"]');
            await openHandle[0].click();

            // setting date range
            await page.waitFor(3000);
            await page.waitForXPath('//input[@id="fromDateTxt"]');
            const fromDateHandle = await page.$x('//input[@id="fromDateTxt"]');
            await fromDateHandle[0].click({clickCount: 3});
            await fromDateHandle[0].press('Backspace');
            await fromDateHandle[0].type(this.getFormattedDate(dateRange.from), {delay: 150});
            const toDateHandle = await page.$x('//input[@id="toDateTxt"]');
            await toDateHandle[0].click({clickCount: 3});
            await toDateHandle[0].press('Backspace');
            await toDateHandle[0].type(this.getFormattedDate(dateRange.to), {delay: 150});

            // setting name type
            await page.select('select[id="nameType"]', 'REVERSE');

            // setting doc type
            let docTypeSelects = ['BANKRUPTCY', 'DEED', 'LIEN', 'LIS PENDENS', 'MARRIAGE', 'MORTGAGE'];
            for (const docTypeSelect of docTypeSelects) {
                await page.select('select[id="doctype"]', this.parseType(docTypeSelect));
                const [searchHandle] = await page.$x('//input[@id="search"]');
                searchHandle.click();
                await page.waitForNavigation();
                await page.waitForXPath('//div[@id="gridarea"]/div/table/tbody/tr');
                const results = await page.$x('//div[@id="gridarea"]/div/table/tbody/tr');
                if (results.length > 0) {
                    let pageNum = 0;
                    let isLast = false;

                    while (!isLast) {
                        await page.waitForXPath('//div[@id="gridarea"]/div/table/tbody/tr');
                        const rows = await page.$x('//div[@id="gridarea"]/div/table/tbody/tr');
                        for (let i = 2; i < rows.length; i++) {
                            const caseID = await page.evaluate(el => el.children[1].children[0].textContent.trim(), rows[i]);
                            const date = await page.evaluate(el => el.children[2].textContent.trim(), rows[i]);
                            const type = await page.evaluate(el => el.children[4].children[0].getAttribute('data-content'), rows[i]);
                            const name = await page.evaluate(el => el.children[5].textContent.trim(), rows[i]);
                            if (this.isEmptyOrSpaces(name!)) {
                                continue;
                            }
                            if (await this.getData(page, name, type, date, caseID)) {
                                countRecords++;
                            }
                        }

                        await page.waitFor(3000);

                        const nextButtonXpath = '//a[@id="LinkButton3"]';
                        const [nextButtonEL] = await page.$x(nextButtonXpath);
                        if (nextButtonEL) {
                            pageNum++;
                            await nextButtonEL.click();
                            await page.waitForNavigation();
                            await page.waitFor(3000);
                        } else {
                            isLast = true;
                        }
                    }
                } else {
                    console.log('No Data');
                }
            }

            await AbstractProducer.sendMessage('Volusia', 'Florida', countRecords, 'Civil & Lien');
            await page.close();
            await this.browser?.close();
            return true;
        }
        catch (error) {
            console.log('Error: ', error);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Volusia', 'Florida', countRecords, 'Civil & Lien', errorImage);
            return false;
        }
    }

    async waitForSuccess(func: Function): Promise<boolean> {
        let retry_count = 0;
        while (true){
            if (retry_count > 3){
                console.error('Connection/website error for 15 iteration.');
                return false;
            }
            try {
                await func();
                break;
            }
            catch (error) {
                retry_count++;
            }
        }
        return true;
    }

    async getData(page: puppeteer.Page, name: any, type: any, date: any, caseID: any): Promise<any> {
        const parseName: any = this.newParseName(name!.trim());
        if(parseName.type && parseName.type == 'COMPANY'){
            return false;
        }
        let practiceType = this.getPracticeType(type);

        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({ name: productName }).exec();
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
            originalDocType: type
        };
        
        return (await this.civilAndLienSaveToNewSchema(data));
    }
     // To check empty or space
    isEmptyOrSpaces(str: string) {
        return str === null || str.match(/^\s*$/) !== null;
    }
    /**
     * parse type
     * @param type: string
     */
    parseType(type: string) {
        let array = type.split('');
        let length = array.length;
        for (let i = 0; i < (20 - length); i++) {
            array.push(' ')
        }
        return array.join('');
    }
}