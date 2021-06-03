import puppeteer from 'puppeteer';
import axios from 'axios';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import { sleep } from '../../../../../../core/sleepable';
import db from '../../../../../../models/db';

export default class CivilProducer extends AbstractProducer {

    urls = {
        generalInfoPage: 'https://countyclerk.traviscountytx.gov/component/chronoconnectivity6/?cont=manager&conn=civil-data'
    }

    xpaths = {
        isPageLoaded: '//input[@id="calendar_civil_start"]'
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
            // input fillingdate
            const dateRange = await this.getDateRange('Texas', 'Travis');
            // console.log(`from: ${dateRange.from}, to: ${dateRange.to}`);
            const url = `https://countyclerk.traviscountytx.gov/component/chronoconnectivity6/?cont=manager&conn=civil-data&calendar_civil_start=${this.getDateString(dateRange.from)}&calendar_civil_end=${this.getDateString(dateRange.to)}&event=index`
            await page.goto(url, { waitUntil: 'load' });

            // get all links
            let lastStartIndex = 0;
            const endHandle = await page.$('div.pagination > a:last-of-type');
            if (endHandle) {
                const lastStartLink = await page.evaluate(el => el.href, endHandle);
                const lastStart = lastStartLink.match(/(?<=\&start=)[0-9]+/i);
                if (lastStart === null) {
                    console.log("Not found");
                    await AbstractProducer.sendMessage('Travis', 'Texas', countRecords, 'Civil');
                    return true;
                }
                lastStartIndex = parseInt(lastStart[0]);
            }
            const links = [];
            const caseTypeArray = [];
            for (let index = 0; index <= lastStartIndex; index += 50) {
                await page.goto(`${url}&start=${index}`, { waitUntil: 'load' });
                const causeNos = await page.$$('form#civil-table > table > tbody > tr > td:first-child > a');
                const caseTypeHandles = await page.$x('//form[@name="civil-table"]/table/tbody//tr/td[4]');
                for (const causeno of causeNos) {
                    const link = await page.evaluate(el => el.href, causeno);
                    links.push(link);
                }
                for (const caseTypeHandle of caseTypeHandles) {
                    const caseTypeString = await caseTypeHandle.evaluate(el => el.textContent?.trim());
                    caseTypeArray.push(caseTypeString);
                }
            }
            // check cause nos.
            if (links.length > 0) {
                console.log(`Found ${links.length}`);
                let caseTypeCount = 0;
                for (let link of links) {
                    const caseType: any = caseTypeArray[caseTypeCount];
                    await page.goto(link, { waitUntil: 'load' });
                    let records = await this.getData(page, caseType);
                    countRecords += records;
                    caseTypeCount++;
                }
            }
            else {
                console.log("Not found");
            }
            
            await AbstractProducer.sendMessage('Travis', 'Texas', countRecords, 'Civil');
            return true;
        }
        catch (error) {
            console.log('Error: ', error);
            await AbstractProducer.sendMessage('Travis', 'Texas', countRecords, 'Civil');
        }

        return false;
    }

    async getData(page: puppeteer.Page, caseType: any): Promise<any> {
        let records = 0;
        const fillingDateSelector = 'div.semanticui-body > div:nth-child(2) > div:first-child > div:first-child > table > tbody > tr:nth-child(3) > td:nth-child(2)';
        const fillingDate = (await this.getElementTextContent(page, fillingDateSelector)).replace(/(\n)|(\s+)/g, '');

        const name_rows_selector = 'div.semanticui-body > div:nth-child(2) > div:first-child > div:nth-child(2) > table > tbody > tr > td:first-child';
        const name_rows = await page.$$(name_rows_selector);
        const full_names = [];
        for (const name_row of name_rows) {
            const full_name = (await name_row.evaluate(el => el.textContent))!.trim();
            full_names.push(full_name.replace(/\n/g, '').replace(/\s+/g, ' '));
        }

        let practiceType = this.getPracticeType(caseType);

        for (const full_name of full_names) {
            const parseName: any = this.newParseName(full_name);
            if (parseName.type === 'COMPANY' || parseName.fullName === '') continue;
            const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
            const prod = await db.models.Product.findOne({ name: productName }).exec();
            const data = {
                'Property State': 'TX',
                'County': 'Travis',
                'First Name': parseName.firstName,
                'Last Name': parseName.lastName,
                'Middle Name': parseName.middleName,
                'Name Suffix': parseName.suffix,
                'Full Name': full_name,
                "vacancyProcessed": false,
                fillingDate: fillingDate,
                "productId": prod._id
            };
            if(await this.civilAndLienSaveToNewSchema(data)){
                records++;
            }
        }
        return records;
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

    getDateString(date: Date): string {
        return date.getFullYear() + '-' + ("00" + (date.getMonth() + 1)).slice(-2) + "-" + ("00" + date.getDate()).slice(-2);
    }
}