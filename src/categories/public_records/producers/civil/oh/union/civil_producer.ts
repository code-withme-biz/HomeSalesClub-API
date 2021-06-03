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
        generalInfoPage: 'https://www5.co.union.oh.us/PaxWorld5/views/search'
    }

    xpaths = {
        isPAloaded: '//input[@id="dtFrom"]'
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

    async getTextContentByXpathFromPage(page: puppeteer.Page, xPath: string) {
        const [elm] = await page.$x(xPath);
        if (elm == null) {
            return '';
        }
        let text = await page.evaluate(j => j.textContent, elm);
        return text.replace(/\n/g, ' ');
    }

    // This is main function
    async parseAndSave(): Promise<boolean> {
        const civilUrl: string = this.urls.generalInfoPage;
        let page = this.browserPages.generalInfoPage!;

        // get date range
        let dateRange = await this.getDateRange('Ohio', 'Union');
        let fromDate = dateRange.from;
        let toDate = dateRange.to;
        let countRecords = 0;

        
        let fromDateString = this.getFormattedDate(fromDate);
        let toDateString = this.getFormattedDate(toDate);
        
        // input date range
        await page.type('input#dtFrom', fromDateString, {delay: 100});
        await page.type('input#dtTo', toDateString, {delay: 100});
        await page.click('button#btnSummarySearch');
        const result_handle = await page.waitForSelector('div#gridResults_info');
        const result_text = await page.evaluate(el => el.textContent.trim(), result_handle);
        if (result_text === 'Showing 0 to 0 of 0 entries') {
            console.log('No Matches Found');
            return false;
        }
        await page.waitFor(3000);
        
        let nextPage = true;
        let nextPageNum = 1;
        while (nextPage) {
            let resultRows = await page.$x('//div[@id="gridResults_wrapper"]//table[@id="gridResults"]/tbody/tr');
            for (const row of resultRows) {
                let names = [];
                const lastname = await page.evaluate(el => el.children[4].textContent.trim(), row);
                const firstmiddlename = await page.evaluate(el => el.children[5].textContent.trim(), row);
                names.push(`${lastname}, ${firstmiddlename}`);
                let recordDate = await page.evaluate(el => el.children[2].textContent.trim(), row);
                let caseType = await page.evaluate(el => el.children[3].textContent.trim(), row);
                let practiceType = this.getPracticeType(caseType);

                for (const name of names) {
                    if (this.isEmptyOrSpaces(name!)) {
                        continue;
                    }
                    // console.log(name);
                    const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                    console.log(productName, caseType)
                    const prod = await db.models.Product.findOne({ name: productName }).exec();
                    const parseName: any = this.newParseName(name!.trim());
                    if (parseName.type === 'COMPANY' || parseName.fullName === '') continue;

                    const data = {
                        'Property State': 'OH',
                        'County': 'Union',
                        'First Name': parseName.firstName,
                        'Last Name': parseName.lastName,
                        'Middle Name': parseName.middleName,
                        'Name Suffix': parseName.suffix,
                        'Full Name': parseName.fullName,
                        "vacancyProcessed": false,
                        fillingDate: recordDate,
                        "productId": prod._id,
                        originalDocType: caseType
                    };

                    if (await this.civilAndLienSaveToNewSchema(data))
                        countRecords += 1;
                }
            }

            let totalPages = await this.getTextContentByXpathFromPage(page, '//div[@id="gridResults_wrapper"]//button[@class="paginate_button next"]/preceding-sibling::span[1]');
            totalPages = parseInt(totalPages.slice(3));

            if (totalPages === nextPageNum) {
                nextPage = false;
            } else {
                let [nextPageButton] = await page.$x('//div[@id="gridResults_wrapper"]//button[@class="paginate_button next"]');
                await nextPageButton.click();
                await page.waitForSelector('div#loading', {hidden: true});
                await this.sleep(1000);
                nextPageNum++;
            }
        }
        
        console.log(countRecords);
        await AbstractProducer.sendMessage('Union', 'Ohio', countRecords, 'Civil & Lien');
        return true;
    }
}