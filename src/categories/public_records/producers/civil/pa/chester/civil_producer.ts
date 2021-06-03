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
        generalInfoPage: 'https://chesterpa.countygovernmentrecords.com/ChesterRecorder/web/login.jsp'
    }

    xpaths = {
        isPageLoaded: '//input[@value="Public Login"]'
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
            const dateRange = await this.getDateRange('Pennsylvania', 'Chester');
            let fromDate = this.getFormattedDate(dateRange.from);
            let toDate = this.getFormattedDate(dateRange.to);

            try {
                const [docBtnHandle] = await page.$x('//input[@value="Public Login"]');
                await docBtnHandle.click();
                await page.waitForNavigation();
            } catch (error) {
                console.log(error);
                await AbstractProducer.sendMessage('Chester', 'Pennsylvania', countRecords, 'Civil & Lien');
                return false;
            }
                
            // setting date range
            await page.waitFor(3000);
            await page.waitForXPath('//input[@id="ModifiedDateIDStart"]');
            const fromDateHandle = await page.$x('//input[@id="ModifiedDateIDStart"]');
            await fromDateHandle[0].click({clickCount: 3});
            await fromDateHandle[0].press('Backspace');
            await fromDateHandle[0].type(fromDate, {delay: 150});
            const toDateHandle = await page.$x('//input[@id="ModifiedDateIDEnd"]');
            await toDateHandle[0].click({clickCount: 3});
            await toDateHandle[0].press('Backspace');
            await toDateHandle[0].type(toDate, {delay: 150});

            // click search button
            const searchHandle = await page.$x('//input[@value="Search"]');
            await searchHandle[0].click();
            await page.waitForNavigation();
            await page.waitForXPath('//strong[text()="You searched for:"]');

            // getting data
            const results = await page.$x('//table[@id="searchResultsTable"]/tbody/tr');
            if (results.length > 0) {
                let pageNum = 0;
                let isLast = false;
                const url = 'https://chesterpa.countygovernmentrecords.com/ChesterRecorder/';

                while (!isLast) {
                    await page.waitForXPath('//table[@id="searchResultsTable"]/tbody/tr');
                    const rows = await page.$x('//table[@id="searchResultsTable"]/tbody/tr');
                    for (let i = 0; i < rows.length; i++) {
                        const dataHTML = await rows[i].evaluate(el => el.children[0].children[0].children[0].innerHTML);
                        const dateHTML = await rows[i].evaluate(el => el.children[1].children[0].innerHTML);
                        const data = dataHTML.split('<br>');
                        const type = data[0];
                        const caseID = data[1].replace(/\n/g, '');
                        const date = dateHTML.split('<b>')[1].split('</b>')[1].split(' ')[0];
                        const linkHandle = await page.$x(`//table[@id="searchResultsTable"]/tbody/tr[${i + 1}]//strong/a`);
                        const link = await linkHandle[0].evaluate(el => el.getAttribute('href'));
                        const link1 = link?.replace('../', '');
                        const detailPage = await this.browser?.newPage();
                        if (!detailPage) {
                            return false;
                        }
                        await detailPage.goto(`${url}${link1}`, {waitUntil: 'networkidle0'});
                        const nameHandles = await detailPage.$x('//th[text()="Grantee"]/parent::tr/parent::tbody/tr//span');
                        for (const nameHandle of nameHandles) {
                            const name = await nameHandle.evaluate(el => el.textContent?.trim());
                            if (this.isEmptyOrSpaces(name!) || removeRowRegex.test(name!)) {
                                continue;
                            }
                            const parserName: any = this.newParseName(name!);
                            if(parserName.type && parserName.type == 'COMPANY'){
                                continue;
                            }
                            if (await this.getData(page, name!.trim(), type, date, caseID)) {
                                countRecords++
                            }  
                        }
                        await detailPage.close();
                        
                    }

                    await page.waitFor(1000);

                    const nextButtonEL = await page.$x('//a[text()="Next"]');
                    if (nextButtonEL.length > 0) {
                        pageNum++;
                        await nextButtonEL[0].click();
                        await page.waitForNavigation();
                        await page.waitFor(3000);
                    } else {
                        isLast = true;
                    }
                }
            } else {
                console.log('No Data');
            }

            await AbstractProducer.sendMessage('Chester', 'Pennsylvania', countRecords, 'Civil & Lien');
            await page.close();
            await this.browser?.close();
            return true;
        }
        catch (error) {
            console.log('Error: ', error);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Chester', 'Pennsylvania', countRecords, 'Civil & Lien', errorImage);
        }

        return false;
    }

    async getData(page: puppeteer.Page, name: any, type: any, date: any, caseID: any): Promise<any> {
        const { firstName, lastName, middleName, fullName, suffix } = this.newParseName(name!);
        let practiceType = this.getPracticeType(type);
        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({ name: productName }).exec();

        const data = {
            'caseUniqueId': caseID,
            'Property State': 'PA',
            'County': 'Chester',
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