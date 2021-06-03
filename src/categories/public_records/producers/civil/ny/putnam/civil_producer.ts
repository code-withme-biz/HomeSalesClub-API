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
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')

export default class CivilProducer extends AbstractProducer {
    urls = {
        generalInfoPage: 'https://www.searchiqs.com/NYPUT/Login.aspx'
    }

    xpaths = {
        isPageLoaded: '//input[@id="btnGuestLogin"]'
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
            const dateRange = await this.getDateRange('New York', 'Putnam');
            let fromDate = this.getFormattedDate(dateRange.from);
            let toDate = this.getFormattedDate(dateRange.to);

            try {
                const [docBtnHandle] = await page.$x('//input[@id="btnGuestLogin"]');
                await docBtnHandle.click();
                await page.waitForNavigation();
            } catch (error) {
                console.log(error);
                await AbstractProducer.sendMessage('Putnam', 'New York', countRecords, 'Civil & Lien');
                return false;
            }

            let docTypeSelects = ['CIV', 'D', 'DBA', 'D', 'FTL', 'J', 'L', 'LP','MF','MISC','M','S','W','U'];
            for (const docTypeSelect of docTypeSelects) {

                // setting date range
                await this.sleep(3000);
                await page.waitForXPath('//input[@id="ContentPlaceHolder1_txtFromDate"]');
                const fromDateHandle = await page.$x('//input[@id="ContentPlaceHolder1_txtFromDate"]');
                await fromDateHandle[0].click({clickCount: 3});
                await fromDateHandle[0].press('Backspace');
                await fromDateHandle[0].type(fromDate, {delay: 150});
                const toDateHandle = await page.$x('//input[@id="ContentPlaceHolder1_txtThruDate"]');
                await toDateHandle[0].click({clickCount: 3});
                await toDateHandle[0].press('Backspace');
                await toDateHandle[0].type(toDate, {delay: 150});
                
                // setting doc type
                page.select('select[id="ContentPlaceHolder1_cboDocGroup"]', docTypeSelect);
                await page.waitForNavigation();
                // click search button
                const [searchHandle] = await page.$x('//input[@id="ContentPlaceHolder1_cmdSearch"]');
                searchHandle.click();
                await page.waitForNavigation();
                await page.waitForXPath('//span[@id="ContentPlaceHolder1_lblSearchCount"]');

                // getting data
                const results = await page.$x('//table[@id="ContentPlaceHolder1_grdResults"]/tbody/tr');
                if (results.length > 0) {
                    let pageNum = 0;
                    let isLast = false;

                    while (!isLast) {
                        await page.waitForXPath('//table[@id="ContentPlaceHolder1_grdResults"]/tbody/tr');
                        const rows = await page.$x('//table[@id="ContentPlaceHolder1_grdResults"]/tbody/tr');
                        for (let i = 1; i < rows.length; i++) {
                            const namesHTML = await rows[i].evaluate(el => el.children[4].children[0].innerHTML);
                            const type = await rows[i].evaluate(el => el.children[6].textContent?.trim());
                            const caseID = await rows[i].evaluate(el => el.children[7].textContent?.trim());
                            const date = await rows[i].evaluate(el => el.children[9].textContent?.trim());
                            const names = namesHTML.split('<br>');
                            for (const name of names) {
                                if (this.isEmptyOrSpaces(name!)) {
                                    continue;
                                }
                                if (await this.getData(page, name, type, date, caseID)) {
                                    countRecords++;
                                }
                            }
                        }

                        await this.sleep(1000);

                        const [nextButtonEL] = await page.$x('//a[@id="ContentPlaceHolder1_lbNext1"]');
                        const className = await nextButtonEL.evaluate(el => el.getAttribute('class'));
                        if (!className) {
                            pageNum++;
                            await nextButtonEL.click();
                            await page.waitForNavigation();
                            await this.sleep(3000);
                        } else {
                            isLast = true;
                        }
                    }
                } else {
                    console.log('No Data');
                }

                const newSearchHandle = await page.$x('//li[@id="mnuSearch"]');
                await newSearchHandle[0].click();
                await page.waitForNavigation();
                await this.sleep(1000);
            }

            await AbstractProducer.sendMessage('Putnam', 'New York', countRecords, 'Civil & Lien');
            await page.close();
            await this.browser?.close();
            return true;
        }
        catch (error) {
            console.log('Error: ', error);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Putnam', 'New York', countRecords, 'Civil & Lien', errorImage);
        }

        return false;
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
            'County': 'Putnam',
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