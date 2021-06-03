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
        generalInfoPage: 'https://wro.westchesterclerk.com/Login/Login.aspx?'
    }

    xpaths = {
        isPageLoaded: '//a[@id="lnkLand"]'
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

            try {
                const [docBtnHandle] = await page.$x('//a[@id="lnkLand"]');
                await docBtnHandle.click();
                await page.waitForNavigation();
            } catch (error) {
                console.log(error);
                await AbstractProducer.sendMessage('Westchester', 'New York', countRecords, 'Civil & Lien');
                return false;
            }

            const [dateSearch] = await page.$x('//a[@id="lnkShowDateRange"]')
            await dateSearch.click();
            await page.waitForXPath('//table[@title="Start date"]//input');

            const dateRange = await this.getDateRange('New York', 'Westchester');
            let fromDate = this.getFormattedDate(dateRange.from);
            let toDate = this.getFormattedDate(dateRange.to);
            
            let docTypesSelects = ['13', '251', '21'];
            let docTypes = ['Deed', 'Federal Tax Lien', 'Mortgage'];
            
            let start = dateRange.from;
            let end = dateRange.to;

            while (start < end) {                     
                const from = this.getFormattedDate(start);
                let newDate = start.setDate(start.getDate() + 1);
                start = new Date(newDate);
                const to = this.getFormattedDate(start);

                for (let i = 0; i < docTypesSelects.length; i++) {
                    // setting doc type
                    await page.select('select#tbSearchArea__ctl0_cphLandSearch_splLandMain_tmpl0_tbLandSearchType_tmpl0_selDocument', docTypesSelects[i]);
                    
                    // setting the date range
                    const [startDateHandle] = await page.$x('//table[@title="Start date"]//input');
                    const [endDateHandle] = await page.$x('//table[@title="End date"]//input');
                    await startDateHandle.click({clickCount: 3});
                    await startDateHandle.press('Backspace');
                    await startDateHandle.type(fromDate, {delay: 100});
                    await endDateHandle.click({clickCount: 3});
                    await endDateHandle.press('Backspace');
                    await endDateHandle.type(toDate, {delay: 100});

                    // click search button
                    const searchHandle = await page.$x('//a[@id="AdvanceSearch"]');
                    const clickResult = await this.waitForSuccess(async () => {
                        await Promise.all([
                            searchHandle[0].click(),
                            page.waitForXPath('//div[@id="divLandNameSearchResult"]')
                        ]);
                    });

                    if (!clickResult) {
                        await AbstractProducer.sendMessage('Westchester', 'New York', countRecords, 'Civil & Lien');
                        return false;
                    }

                    await page.waitFor(1000)

                    const noResult = await page.$x('//div[@id="divLandNameSearchResult"]/b');
                    console.log(noResult.length);
                    if (noResult.length > 0) {
                        console.log('No search results found');
                    } else {
                        try {
                            await page.waitForXPath('//div[@id="divLandNameSearchResult"]//tbody/tr');
                            const results = await page.$x('//div[@id="divLandNameSearchResult"]//tbody//td[3 and text()="1st"]/parent::tr');
                            for (const result of results) {
                                const name = await result.evaluate(el => el.children[1].textContent?.trim());
                                const date = await result.evaluate(el => el.children[4].textContent?.trim());
                                const caseID = await result.evaluate(el => el.children[7].textContent?.trim());
                                if (this.isEmptyOrSpaces(name!)) {
                                    continue;
                                }
                                if (await this.getData(page, name, docTypes[i], date, caseID)) {
                                    countRecords++;
                                }
                            }
                        } catch (e) {

                        }
                    }
                }
            }
            await AbstractProducer.sendMessage('Westchester', 'New York', countRecords, 'Civil & Lien');
            await page.close();
            await this.browser?.close();
            return true;
        }
        catch (error) {
            console.log('Error: ', error);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Westchester', 'New York', countRecords, 'Civil & Lien', errorImage);
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
            'County': 'Westchester',
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