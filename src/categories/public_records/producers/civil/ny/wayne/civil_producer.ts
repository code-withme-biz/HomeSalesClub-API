import puppeteer from 'puppeteer';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import db from '../../../../../../models/db';
import SnsService from '../../../../../../services/sns_service';

const removeRowArray = [
    'CITY', 'DEPT', 'CTY', 'UNITED STATES', 'BANK', 'FIA CARD SERVICES NA',
    'FLORIDA PACE FUNDING AGENCY', 'COUNTY', 'CREDIT', 'HOSPITAL', 'FUNDING', 'UNIVERSITY',
    'MEDICAL', 'CONDOMINIUM ASSOCIATION', 'LOTS', 'TEXAS STATE', 'VETERANS', 'SECRETARY', 'DEPARTMENT',
    'INDIVIDUAL', 'INDIVIDUALLY', 'FINANCE', 'CITIBANK', 'MERS', 'STATE TAX COMMISSION'
];
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i');


export default class CivilProducer extends AbstractProducer {
    urls = {
        generalInfoPage: 'https://wcnycc.co.wayne.ny.us/recorder/web/login.jsp'
    }

    xpaths = {
        isPageLoaded: '//input[@value="Login"]'
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
            const dateRange = await this.getDateRange('New York', 'Wayne');
            let fromDate = this.getFormattedDate(dateRange.from);
            let toDate = this.getFormattedDate(dateRange.to);

            try {
                const [docBtnHandle] = await page.$x('//input[@value="Login"]');
                await docBtnHandle.click();
                await page.waitForNavigation();
            } catch (error) {
                console.log(error);
                await AbstractProducer.sendMessage('Wayne', 'New York', countRecords, 'Civil & Lien');
                return false;
            }

            let docTypeSelects = ['D', 'DCOR', 'FTL', 'FOR', 'L', 'M', 'STL'];
            for (const docTypeSelect of docTypeSelects) {
                
                // setting doc type
                const [typeAllHandle] = await page.$x('//input[@id="allTypesCB"]');
                await typeAllHandle.click();
                await page.waitForXPath('//select[@name="__search_select"]');
                await page.select('select[name="__search_select"]', docTypeSelect);

                // setting date range
                await page.waitForXPath('//input[@id="RecDateIDStart"]');
                const fromDateHandle = await page.$x('//input[@id="RecDateIDStart"]');
                await fromDateHandle[0].click({clickCount: 3});
                await fromDateHandle[0].press('Backspace');
                await fromDateHandle[0].type(fromDate, {delay: 150});
                const toDateHandle = await page.$x('//input[@id="RecDateIDEnd"]');
                await toDateHandle[0].click({clickCount: 3});
                await toDateHandle[0].press('Backspace');
                await toDateHandle[0].type(toDate, {delay: 150});

                // click search button
                const searchHandle = await page.$x('//input[@value="Search"]');
                const result = await this.waitForSuccess(async () => {
                    await Promise.all([
                        searchHandle[0].click(),
                        page.waitForNavigation(),
                        page.waitForXPath('//strong[text()="You searched for:"]')
                    ])
                })

                if (!result) {
                    return false;
                }

                // getting data
                const results = await page.$x('//table[@id="searchResultsTable"]/tbody/tr');
                if (results.length > 0) {
                    let pageNum = 0;
                    let isLast = false;

                    while (!isLast) {
                        await this.randomSleepIn5Sec()
                        await page.waitForXPath('//table[@id="searchResultsTable"]/tbody/tr');
                        const rows = await page.$x('//table[@id="searchResultsTable"]/tbody/tr');
                        for (let i = 0; i < rows.length; i++) {
                            const dataHTML = await rows[i].evaluate(el => el.children[0].children[0].children[0].innerHTML);
                            const dateHTML = await rows[i].evaluate(el => el.children[1].children[0].innerHTML);
                            const nameHTML = await rows[i].evaluate(el => el.children[1].children[0].children[4].children[0].children[0].children[1].children[0].innerHTML);
                            const data = dataHTML.split('<br>');
                            const type = data[0];
                            const caseID = data[1].replace(/\n/g, '');
                            const date = dateHTML.split('<b>')[1].split('</b>')[1].split(' ')[0];
                            const name = nameHTML.split('</b>')[1]
                            
                            if (this.isEmptyOrSpaces(name!)) {
                                continue;
                            }
                            if (await this.getData(page, name, type, date, caseID)) {
                                countRecords++;
                            }
                        }

                        const nextButtonEL = await page.$x('//a[text()="Next"]');
                        if (nextButtonEL.length > 0) {
                            pageNum++;
                            const nextResult = await this.waitForSuccess(async () => {
                                await Promise.all([
                                    nextButtonEL[0].click(),
                                    page.waitForNavigation(),
                                    page.waitForXPath(`//strong[text()="${pageNum}"]`)
                                ])
                            })
                            if (!nextResult) {
                                return false;
                            }
                        } else {
                            isLast = true;
                        }
                    }
                } else {
                    console.log('No Data');
                }

                const newSearchHandle = await page.$x('//a[text()="New Search"]');
                const newSearchResult = await this.waitForSuccess(async () => {
                    await Promise.all([
                        newSearchHandle[0].click(),
                        page.waitForNavigation(),
                        page.waitForXPath('//input[@value="Search"]')
                    ]);
                });

                if (!newSearchResult) {
                    return false;
                }
            }

            await AbstractProducer.sendMessage('Wayne', 'New York', countRecords, 'Civil & Lien');
            await page.close();
            await this.browser?.close();
            return true;
        }
        catch (error) {
            console.log('Error: ', error);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Wayne', 'New York', countRecords, 'Civil & Lien', errorImage);
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

    async getData(page: puppeteer.Page, name: any, type: any, date: any, caseID: any): Promise<any> {
        if (removeRowRegex.test(name)) return false;
        const parseName: any = this.newParseName(name.trim())
        if (parseName?.type && parseName?.type == 'COMPANY') return false;

        let practiceType = this.getPracticeType(type)

        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({ name: productName }).exec();
        const data = {
            'caseUniqueId': caseID,
            'Property State': 'NY',
            'County': 'Wayne',
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
}