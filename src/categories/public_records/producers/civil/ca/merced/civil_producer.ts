import puppeteer from 'puppeteer';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import db from '../../../../../../models/db';
import { assignWith } from 'lodash';

export default class CivilProducer extends AbstractProducer {
    urls = {
        generalInfoPage: 'http://web2.co.merced.ca.us/RecorderWorksInternet/'
    }

    xpaths = {
        isPageLoaded: '//td[@id="MainContent_Manager1_linkSearch"]'
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
            const dateRange = await this.getDateRange('California', 'Merced');
            const fromDate = this.getFormattedDate(dateRange.from);
            const toDate = this.getFormattedDate(dateRange.to);

            const searchSelector = 'td#MainContent_Manager1_linkSearch';
            const searchHandle = await page.$(searchSelector);
            await searchHandle?.click();
            
            const recordingSelector = 'a#MainContent_SearchParent1_StandartSearchMenu1_SearchByDocType';
            const recordingHandle = await page.$(recordingSelector);
            await recordingHandle?.click();
            
            const beginDateSelector = 'input#MainContent_SearchParent1_SearchByDocType1_StartEndDate1_fromDate';
            const endDateSelector = 'input#MainContent_SearchParent1_SearchByDocType1_StartEndDate1_toDate';
            const beginDateHandle = await page.$(beginDateSelector);
            const endDateHandle = await page.$(endDateSelector);
            await beginDateHandle?.click({clickCount: 3});
            await beginDateHandle?.press('Backspace');
            await beginDateHandle?.type(fromDate, {delay: 150});
            await endDateHandle?.click({clickCount: 3});
            await endDateHandle?.press('Backspace');
            await endDateHandle?.type(toDate, {delay: 150});
            await page.click('input#chkTypes');

            const searchSelector1 = 'div#MainContent_SearchParent1_SearchByDocType1_btnSearch';
            const searchHandle1 = await page.$(searchSelector1);
            await searchHandle1?.click();
            await page.waitFor(3000);
            await page.waitForSelector('div[id=MainContent_ResultsContainer1_CtrlWidget][style]');
            await page.waitFor(3000);

            let isLast = false;
            let countPage = 1;

            let countResults: any = await page.$x('//span[@id="SearchResultsTitle1_resultCount"]');
            countResults = await page.evaluate(el => el.textContent, countResults[0]);
            countResults = parseInt(countResults);
            if (countResults  === 0) {
                console.log('No Results Found');
                await AbstractProducer.sendMessage('Merced', 'California', countRecords, 'Civil & Lien');
                return false;
            }
            else {
                console.log(`${countResults} Results Found`);
            }

            while (!isLast) {
                // get all results               
                const [lastHandle] = await page.$x('//td[@id="SearchResultsTitle1_paging"]/table/tbody/tr/td[last()]');
                const last_class = await lastHandle.evaluate(el => el.getAttribute('class'));
                const documentHandles = await page.$x('//div[@id="SortedItems"]/div');
                for (let i = 0; i < documentHandles.length; i+=2) {
                    const [num_handle] = await page.$x(`//div[@id="SortedItems"]/div[${i+1}]//span[contains(@id, "_docNumber")]`);
                    const num = await page.evaluate(el => el.textContent.trim(), num_handle);
                    const [type_handle] = await page.$x(`//div[@id="SortedItems"]/div[${i+2}]//td[contains(text(), "Document Type:")]/following-sibling::td`);
                    const type = await page.evaluate(el => el.textContent.trim(), type_handle);
                    const [date_handle] = await page.$x(`//div[@id="SortedItems"]/div[${i+2}]//td[contains(text(), "Recording Date:")]/following-sibling::td`);
                    const date = await page.evaluate(el => el.textContent.trim(), date_handle);
                    const [name_handle] = await page.$x(`//div[@id="SortedItems"]/div[${i+2}]//td[contains(text(), "Grantee:")]/following-sibling::td`);
                    const grantee_name = await page.evaluate(el => el.textContent.trim(), name_handle);
                    if (await this.getData(page, num, type, date, grantee_name))
                        countRecords++;
                } 
                if (last_class == 'boldLinkColor') {
                    countPage++;
                    await Promise.all([
                        page.click(`td#SearchResultsTitle1_paging > table > tbody > tr > td[onclick="search.OnPage('${countPage}','.booking');"]`),
                        page.waitFor(5000)
                    ])
                    isLast = false;
                } else {
                    isLast = true;
                }
                console.log(countPage);
            };
            await AbstractProducer.sendMessage('Merced', 'California', countRecords, 'Civil & Lien');
            await page.close();
            await this.browser?.close();
            return true;
        }
        catch (error) {
            console.log('Error: ', error);
            await AbstractProducer.sendMessage('Merced', 'California', countRecords, 'Civil & Lien');
        }
        return false;
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

    async getData(page: puppeteer.Page, number: any, type: any, date: any, grantee: any): Promise<any> {
        const grantee_name: any = this.newParseName(grantee);
        if (grantee_name.type === 'COMPANY') return false;

        let practiceType = this.getPracticeType(type);

        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({ name: productName }).exec();
        const data = {
            'caseUniguqId': number,
            'Property State': 'CA',
            'County': 'Merced',
            'First Name': grantee_name.firstName,
            'Last Name': grantee_name.lastName,
            'Middle Name': grantee_name.middleName,
            'Name Suffix': grantee_name.suffix,
            'Full Name': grantee,
            "vacancyProcessed": false,
            fillingDate: date,
            "productId": prod._id,
            originalDocType: type
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