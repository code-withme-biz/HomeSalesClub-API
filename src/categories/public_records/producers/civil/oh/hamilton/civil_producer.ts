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
        generalInfoPage: 'https://recordersoffice.hamilton-co.org/hcro-pdi/date-range-doc-type-search'
    }

    xpaths = {
        isPAloaded: '//button[@id="submitBtn"]'
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
        const civilUrl: string = 'https://officialrecords.Hamilton.org/AcclaimWeb/search/SearchTypeDocType';
        let page = this.browserPages.generalInfoPage!;
        let countRecords = 0;
        
        // get date range
        let dateRange = await this.getDateRange('Ohio', 'Hamilton');
        let fromDate = dateRange.from;
        let toDate = dateRange.to;
        let fromDateString = this.getFormattedDate(fromDate);
        let toDateString = this.getFormattedDate(toDate);

        try {
            // input date range
            await page.type('#startDateRecorded', fromDateString, {delay: 150});
            await page.type('#endDateRecorded', toDateString, {delay: 150});
            await Promise.all([
                page.click('#submitBtn'),
                page.waitForNavigation()
            ]);
            
            let nextPage = true;
            let nextPageNum = 1;
            while (nextPage) {
                await page.waitForXPath('//table[@id="documents-table"]/tbody/tr');
                let resultRows = await page.$x('//table[@id="documents-table"]/tbody/tr');
                console.log(resultRows.length);
                for (const row of resultRows) {
                    let names: string[] = [];
                    const name = await page.evaluate(el => el.children[3].textContent.trim(), row);
                    names = [name];
                    if (name.indexOf(';') > -1) {
                        names = name.split(';').filter((nm:string) => nm.trim() !== '').map((nm:string) => nm?.trim());
                        break;
                    }
                                            
                    let recordDate = await page.evaluate(el => el.children[1].textContent.trim(), row);
                    let caseType = await page.evaluate(el => el.children[5].children[0].textContent.trim(), row);

                    let practiceType = this.getPracticeType(caseType);
                    let last_name = '';
                    for (let name of names) {
                        if (this.isEmptyOrSpaces(name!)) {
                            continue;
                        }
                        let parseName: any = this.newParseName(name!.trim());
                        if (parseName.type === 'COMPANY' || parseName.fullName === '') continue;

                        if (last_name && name.indexOf(last_name) === -1) name = last_name + ' ' + name;
                        parseName = this.newParseName(name!.trim());
                        last_name = last_name === '' ? parseName.lastName : '';

                        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                        const prod = await db.models.Product.findOne({ name: productName }).exec();

                        const data = {
                            'Property State': 'OH',
                            'County': 'Hamilton',
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

                        await this.civilAndLienSaveToNewSchema(data);
                    }
                }
                let [nextPageButton] = await page.$x('//a[@alt="Next Page"]');
                if (nextPageButton) {
                    await Promise.all([
                        nextPageButton.click(),
                        page.waitForNavigation()
                    ]);
                    await this.sleep(this.getRandomInt(3000, 5000));
                    nextPageNum++;
                } else {
                    nextPage = false;
                }
            }
        } catch (error) {
            console.log(error);
        }
        
        console.log(countRecords);
        await AbstractProducer.sendMessage('Hamilton', 'Ohio', countRecords, 'Civil & Lien');
        return true;
    }
}