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
        generalInfoPage: 'https://acclaim.srccol.com/AcclaimWeb/search/Disclaimer?st=/AcclaimWeb/search/SearchTypeDocType'
    }

    xpaths = {
        isPAloaded: '//input[@value="I accept the conditions above."]'
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
        const civilUrl: string = 'https://acclaim.srccol.com/AcclaimWeb/search/Disclaimer?st=/AcclaimWeb/search/SearchTypeDocType';

        // get date range
        let dateRange = await this.getDateRange('Florida', 'Santa Rosa');
        let fromDate = dateRange.from;
        let toDate = dateRange.to;
        let firstSearch = false;
        let countRecords = 0;

        let days = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 3600 * 24)) - 1;
        if (days > 18) {
            firstSearch = true;
        }
        for (let i = days < 1 ? 1 : days ; i >= 0 ; i--) {
            try {
                let dateSearch = new Date();
                dateSearch.setDate(dateSearch.getDate() - i);
                let dateSearchTo = new Date();
                if (firstSearch) {
                    dateSearchTo.setDate(dateSearchTo.getDate() - (i - 1))
                } else {
                    dateSearchTo.setDate(dateSearchTo.getDate() - i)
                }
                let fromDateString = this.getFormattedDate(dateSearch);
                let toDateString = this.getFormattedDate(dateSearchTo);
                
                // accept condition
                let page = this.browserPages.generalInfoPage!;
                await page.goto(civilUrl, {waitUntil: 'load'});
                let tosSubmit = await page.$x('//input[@value="I accept the conditions above."]');
                if (tosSubmit.length > 0) {
                    await Promise.all([tosSubmit[0].click(),
                        page.waitForNavigation()
                    ]);
                }

                // input doctype
                const [more_button] = await page.$x('//*[text()="..."]');
                await more_button.click();
                await page.waitForXPath('//a[text()="Doc Type List"]');
                const [doc_type_list_button] = await page.$x('//a[text()="Doc Type List"]');
                await doc_type_list_button.click();
                let docTypeSelects = ['DEED', 'LIEN', 'LIS PENDENS', 'MARRIAGE LICENSE', 'PROBATE', 'MORTGAGE'];
                for (const docTypeSelect of docTypeSelects) {
                    const inputs = await page.$x(`//input[starts-with(@title, "${docTypeSelect}")]`);
                    for (const input of inputs) {
                        await input.click();
                    }
                }
                await page.waitFor(1000);
                // click done button
                const [done_button] = await page.$x('//div[@id="DocumentTypesList-2"]//input[@value="Done"]');
                await done_button.click();
                await page.waitFor(500);
                // input date range
                await page.type('#RecordDateFrom', fromDateString);
                await page.type('#RecordDateTo', toDateString);
                await page.click('#btnSearch');

                const element = await Promise.race([
                    page.waitForXPath('//div[@id="RsltsGrid"]/div[4]/table/tbody/tr/td[3]', {visible: true}),
                    page.waitForXPath('//*[text()="No Results to Display"]', {visible: true})
                ]);
                const text = await page.evaluate(el => el.textContent.trim(), element);
                if (text === 'No Results to Display') {
                    console.log('No Results Found');
                    continue;
                }
                await page.waitFor(1000);
                
                let nextPage = true;
                let nextPageNum = 1;
                while (nextPage) {
                    let resultRows = await page.$x('//div[@id="RsltsGrid"]/div[4]/table/tbody/tr');
                    console.log(resultRows.length);
                    for (const row of resultRows) {
                        let names = [];
                        names.push(await page.evaluate(el => el.children[3].textContent.trim(), row));
                        names.push(await page.evaluate(el => el.children[4].textContent.trim(), row));
                        names = names.filter(name => name !== '');
                        let recordDate = await page.evaluate(el => el.children[6].textContent.trim(), row);
                        let docType = await page.evaluate(el => el.children[7].textContent.trim(), row);

                        let practiceType = this.getPracticeType(docType);

                        for (const name of names) {
                            if (this.isEmptyOrSpaces(name!)) {
                                continue;
                            }
                            // console.log(name);
                            const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                            const prod = await db.models.Product.findOne({ name: productName }).exec();
                            const parseName:any = this.newParseName(name!.trim());
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
                    let nextPageDisabled = await page.$x('//a[@class="t-link t-state-disabled"]/span[contains(text(), "next")]');
                    if (nextPageDisabled.length > 0) {
                        nextPage = false;
                    } else {
                        let nextPageButton = await page.$x('//a[@class="t-link"]/span[contains(text(), "next")]');
                        await nextPageButton[0].click();
                        await page.waitForXPath('//div[@class="t-page-i-of-n"]/input[@value="' + nextPageNum + '"]', { visible: true });
                        await this.sleep(3000);
                        nextPageNum++;
                    }
                }
            } catch (error) {
                console.log(error);
            }                
        }
        console.log(countRecords);
        await AbstractProducer.sendMessage('Santa Rosa', 'Florida', countRecords, 'Civil & Lien');
        return true;
    }
}