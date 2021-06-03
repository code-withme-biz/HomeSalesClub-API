import puppeteer from 'puppeteer';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import db from '../../../../../../models/db';
import SnsService from '../../../../../../services/sns_service';

const removeRowArray = [
    'CITY', 'DEPT', 'CTY', 'UNITED STATES', 'BANK', 'FIA CARD SERVICES NA',
    'FLORIDA PACE FUNDING AGENCY', 'COUNTY', 'CREDIT', 'HOSPITAL', 'FUNDING', 'UNIVERSITY',
    'MEDICAL', 'CONDOMINIUM ASSOCIATION', 'LOTS', 'TEXAS STATE', 'VETERANS', 'SECRETARY', 'DEPARTMENT',
    'INDIVIDUAL', 'INDIVIDUALLY', 'FINANCE', 'CITIBANK', 'MERS', 'STATE TAX COMMISSION', 'BUSINESS',
	'CU', 'BK', 'UN', 'PA', 'DOLLAR', 'ASSN', 'REVOLUTION', 'COMMUNITY', 'PLACE', 'SPECTRUM'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')

export default class CivilProducer extends AbstractProducer {
    urls = {
        generalInfoPage: 'https://www2.co.butler.pa.us/PaxWorld/Default'
    }

    xpaths = {
        isPageLoaded: '//button[@id="disclaimerAgreement"]'
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
            await this.browserPages.generalInfoPage.setDefaultNavigationTimeout(60000);
            await this.browserPages.generalInfoPage.goto(this.urls.generalInfoPage, {waitUntil: 'load'});
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
        let countRecords = 0;
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;

        try {            
            const dateRange = await this.getDateRange('Pennsylvania', 'Beaver');
            let fromDate = this.getFormattedDate(dateRange.from);
            let toDate = this.getFormattedDate(dateRange.to);
            
            // select Butler county
            const disclaimerResult = await this.waitForSuccess(async () => {
                await Promise.all([
                    page.click('button#disclaimerAgreement'),
                    page.waitForNavigation()
                ])
            })
            if (!disclaimerResult) {
                await AbstractProducer.sendMessage('Butler', 'Pennsylvania', countRecords, 'Civil & Lien');
                return false;
            }

            // setting date range
            await page.waitForXPath('//input[@id="dtTo"]');
            const dtFromHandle = await page.$x('//input[@id="dtFrom"]');
            const dtToHandle = await page.$x('//input[@id="dtTo"]');
            await dtFromHandle[0].click();
            await dtFromHandle[0].type(fromDate, {delay: 100});
            await dtToHandle[0].click();
            await dtToHandle[0].type(toDate, {delay: 100});

            // click search button
            await page.click('input#txtFirstName1');
            await page.focus('button#btnDetailSearch');
            const searchResult = await this.waitForSuccess(async () => {
                await Promise.all([
                    page.click('button#btnDetailSearch'),
                    page.waitForXPath('//label[contains(text(), "Recorded Date is between ")]')
                ])
            })
            if (!searchResult) {
                await AbstractProducer.sendMessage('Butler', 'Pennsylvania', countRecords, 'Civil & Lien');
                return false;
            }
            const maxPageNumHandle = await page.$x('//div[@id="gridResultsDetailOnly_paginate"]/span[2]');
            let maxPageNum = await maxPageNumHandle[0].evaluate(el => el.textContent?.trim());
            let maxNum = parseInt(maxPageNum?.replace(/^\D+/g, '')!, 10);
            if (maxNum > 0) {
                let pageNum = 1;
                while (true) {
                    const results = await page.$x('//table[@id="gridResultsDetailOnly"]/tbody/tr//table[contains(@id, "detail")]/tbody');
                    for (let i = 0; i < results.length; i++) {
                        let caseID = await results[i].evaluate(el => el.children[0].children[0].children[0].textContent?.trim());
                        caseID = caseID?.replace(/^\D+/g, '').trim();
                        let date = await results[i].evaluate(el => el.children[1].children[0].children[0].textContent?.trim());
                        date = date?.split(' ')[1].trim();
                        let type = await results[i].evaluate(el => el.children[2].children[0].children[0].innerHTML);
                        type = type?.split('</b>')[1].trim();
                        let name = await results[i].evaluate(el => el.children[5].children[0].innerHTML);
                        let names = name?.split('</b>');
                        names = names[1]?.split('/');
                        for (let name of names) {
                            name = name.trim();
                            if (this.isEmptyOrSpaces(name!) || removeRowRegex.test(name)) {
                                continue;
                            }
                            const parserName: any = this.newParseName(name);
                            if(parserName.type && parserName.type == 'COMPANY'){
                                continue;
                            }
                            if (await this.getData(page, name.trim(), type, date, caseID)) {
                                countRecords++
                            }     
                        }
                    }
                    if (pageNum != maxNum) {
                        pageNum++
                        await page.select('div#gridResultsDetailOnly_paginate > select[style*="display: inline"]', pageNum.toString());
                        let startNum = (pageNum - 1) * 10 + 1;
                        let startNumStr = startNum.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
                        await page.waitForXPath(`//div[@id="gridResultsDetailOnly_info" and contains(text(), "Showing ${startNumStr} to")]`);
                        await this.sleep(3000);
                    } else {
                        break;
                    }
                }    
            } else {
                console.log('No Records')
            }
            
            await AbstractProducer.sendMessage('Butler', 'Pennsylvania', countRecords, 'Civil & Lien');
            await page.close();
            await this.browser?.close();
            return true;
        }
        catch (error) {
            console.log('Error: ', error);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Butler', 'Pennsylvania', countRecords, 'Civil & Lien', errorImage);
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
                console.log(`retrying search -- ${retry_count}`);
            }
        }
        return true;
    }

    async getData(page: puppeteer.Page, name: any, type: any, date: any, caseID: any): Promise<any> {
        const { firstName, lastName, middleName, fullName, suffix } = this.newParseName(name!);

        let practiceType = this.getPracticeType(type);
        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({ name: productName }).exec();
        
        const data = {
            'caseUniqueId': caseID,
            'Property State': 'PA',
            'County': 'Butler',
            'First Name': firstName,
            'Last Name': lastName,
            'Middle Name': middleName,
            'Name Suffix': suffix,
            'Full Name': fullName,
            "vacancyProcessed": false,
            fillingDate: date,
            'productId': prod._id,
            originalDocType: type
        };

        return (await this.civilAndLienSaveToNewSchema(data));
    }
     // To check empty or space
    isEmptyOrSpaces(str: string) {
        return str === null || str.match(/^\s*$/) !== null;
    }
}