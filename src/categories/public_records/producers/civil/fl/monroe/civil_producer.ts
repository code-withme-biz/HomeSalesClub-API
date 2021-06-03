import puppeteer from 'puppeteer';
import axios from 'axios';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import { sleep } from '../../../../../../core/sleepable';
import db from '../../../../../../models/db';
const parseFullName = require('parse-full-name').parseFullName;

export default class CivilProducer extends AbstractProducer {

    urls = {
        generalInfoPage: 'https://cr.monroe-clerk.com/Cases/Search?caseType=ALL&caseTypeDesc=SearchAll'
    }

    xpaths = {
        isPageLoaded: '//button[@id="caseSearch"]'
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
            // set case type
            const setCaseHandle = await page.$x('//button[contains(@data-toggle, "dropdown")]');
            await setCaseHandle[0].click();
            await page.waitForXPath('//form[@name="SearchForm"]//ul');
            const deselectHandle = await page.$x('//form[@name="SearchForm"]//ul/li[2]');
            await deselectHandle[0].click();
            const docTypeSelects = ['Eviction', 'Lien', 'Marriage License', 'Mortage'];
            for (const docTypeSelect of docTypeSelects) {
                const handles = await page.$x(`//form[@name="SearchForm"]//ul/li//label[contains(text(), "${docTypeSelect}")]`);
                for (let i = 0; i < handles.length; i++) {
                    await handles[i].click();
                }
            }
            await page.click('form[name="SearchForm"] label[for="ct"]');

            // input fillingdate
            let dateRange = await this.getDateRange('Florida', 'Monroe');
            let fromDate = this.getFormattedDate(dateRange.from);
            let toDate = this.getFormattedDate(dateRange.to);
            const beginDateSelector = 'input#DateFrom';
            const endDateSelector = 'input#DateTo';
            const beginDateHandle = await page.$(beginDateSelector);
            const endDateHandle = await page.$(endDateSelector);
            await beginDateHandle?.click({clickCount: 3});
            await beginDateHandle?.press('Backspace');
            await beginDateHandle?.type(fromDate, { delay: 150 });
            await endDateHandle?.click({clickCount: 3});
            await endDateHandle?.press('Backspace');
            await endDateHandle?.type(toDate, { delay: 150 });

            const firstNameSelector = 'input#FirstName';
            const firstNameHandle = await page.$(firstNameSelector);
            await firstNameHandle?.click();
            await firstNameHandle?.type('', { delay: 150 })

            // click searchbutton
            await page.waitFor(3000);
            try {
                await Promise.all([
                    page.$eval('button#caseSearch', el => el.removeAttribute('disabled')),
                    page.click('button#caseSearch'),
                    page.waitForNavigation()
                ]);
            } catch (error) {
                console.log(error);
                return false;
            }
            await page.waitForSelector('select[name="caseList_length"]');
            await page.select('select[name="caseList_length"]', '-1');

            // get all links
            const case_number_handles = await page.$$('table#caseList > tbody > tr > td.colCaseNumber > a');
            let caseTypeArray = [];
            const caseTypeHandles = await page.$x('//table[@id="caseList"]/tbody//tr/td[4]');
            for (const caseTypeHandle of caseTypeHandles) {
                const caseTypeString = await caseTypeHandle.evaluate(el => el.textContent?.trim());
                caseTypeArray.push(caseTypeString);
            }
            let caseTypeCount = 0;
            // check cause nos.
            if (case_number_handles.length > 0) {
                console.log(`Found ${case_number_handles.length}`);
                const length = case_number_handles.length;
                for (let i = 1; i < length + 1; i++) {
                    const result = await this.waitForSuccess(async () => {
                        await Promise.all([
                            page.click(`table#caseList > tbody > tr:nth-child(${i}) > td.colCaseNumber > a`),
                            page.waitForNavigation()
                        ]);
                    });
                    if (!result) return false;
                    let caseType = caseTypeArray[caseTypeCount];
                    let saveDoc = await this.getData(page, caseType);
                    caseTypeCount++;
                    if (saveDoc) {
                        countRecords++;
                    }
                    await Promise.all([
                        page.goBack(),
                        page.waitForNavigation()
                    ]);
                    await page.select('select[name="caseList_length"]', '25');
                    await page.select('select[name="caseList_length"]', '-1');
                }
            }
            else {
                console.log("Not found");
            }
            
            await AbstractProducer.sendMessage('Monroe', 'Florida', countRecords, 'Civil & Lien');
            return true;
        }
        catch (error) {
            console.log('Error: ', error);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Monroe', 'Florida', countRecords, 'Civil & Lien', errorImage);
            return false;
        }
    }

    async waitForSuccess(func: Function): Promise<boolean> {
        let retry_count = 0;
        while (true) {
            if (retry_count > 3) {
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

    async getData(page: puppeteer.Page, caseType: any): Promise<any> {
        const fillingDateSelector = 'div#caseDetails > div:nth-child(2) > div:first-child > div:first-child > div:first-child > div:nth-child(2) > div:first-child > div:nth-child(2) > div:nth-child(2)';
        const fillingDate = await this.getElementTextContent(page, fillingDateSelector);

        const full_name_selector = 'table[summary="case parties"] > tbody > tr:nth-child(2) > td:first-child';
        let full_name = (await this.getElementTextContent(page, full_name_selector)).replace(/\n/g, '');
        let parseName: any = this.newParseName(full_name);
        if(parseName.type && parseName.type == 'COMPANY'){
            return false;
        }
        full_name = full_name.replace(/\s+/, ' ');
        let parseNameFixed = parseFullName(full_name);  
        let practiceType = this.getPracticeType(caseType);

        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({ name: productName }).exec();
        const data = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'First Name': parseNameFixed.first,
            'Last Name': parseNameFixed.last,
            'Middle Name': parseNameFixed.middle,
            'Name Suffix': parseNameFixed.suffix,
            'Full Name': full_name,
            "vacancyProcessed": false,
            fillingDate: fillingDate,
            "productId": prod._id,
            originalDocType: caseType
        };
        return await this.civilAndLienSaveToNewSchema(data);
        
    }

    /**
     * check if element exists
     * @param page 
     * @param selector 
     */
    async checkExistElement(page: puppeteer.Page, selector: string): Promise<Boolean> {
        const exist = await page.$(selector).then(res => res !== null);
        return exist;
    }

    /**
     * get textcontent from specified element
     * @param page 
     * @param root 
     * @param selector 
     */
    async getElementTextContent(page: puppeteer.Page, selector: string): Promise<string> {
        try {
            const existSel = await this.checkExistElement(page, selector);
            if (!existSel) return '';
            let content = await page.$eval(selector, el => el.textContent)
            return content ? content.trim() : '';
        } catch (error) {
            console.log(error)
            return '';
        }
    }
}