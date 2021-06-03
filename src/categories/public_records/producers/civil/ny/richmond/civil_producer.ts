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
        generalInfoPage: 'https://www.richmondcountyclerk.com/Search/SearchIndex'
    }

    xpaths = {
        isPageLoaded: '//a[@href="/Search/DateRangeSearch"]'
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
            const dateRange = await this.getDateRange('New York', 'Richmond');
            let fromDate = this.getFormattedDate(dateRange.from);
            let toDate = this.getFormattedDate(dateRange.to);

            try {
                const [dateHandle] = await page.$x('//a[@href="/Search/DateRangeSearch"]');
                await dateHandle.click();
                await page.waitForNavigation();
            } catch (error) {
                console.log(error);
                return false;
            }

            // setting date range
            await page.waitForXPath('//input[@name="StartSearchDate"]');
            const fromDateHandle = await page.$x('//input[@name="StartSearchDate"]');
            await fromDateHandle[0].click({clickCount: 3});
            await fromDateHandle[0].press('Backspace');
            await fromDateHandle[0].type(fromDate, {delay: 150});
            const toDateHandle = await page.$x('//input[@name="EndSearchDate"]');
            await toDateHandle[0].click({clickCount: 3});
            await toDateHandle[0].press('Backspace');
            await toDateHandle[0].type(toDate, {delay: 150});

            // click search button
            const result = await this.waitForSuccess(async () => {
                await Promise.all([
                    page.click('button[value="searchButton"]'),
                    page.waitForNavigation()
                ]);
            });

            if (!result) {
                await AbstractProducer.sendMessage('Richmond', 'New York', countRecords, 'Civil & Lien');
                return false;
            }

            // getting data
            let rows = await page.$x('//table/tbody/tr');
            let url = 'https://www.richmondcountyclerk.com';
            if (rows.length > 0) {
                const links = await page.$x('//table/tbody/tr/td/a');
                for (let i = 0; i < rows.length; i++) {
                    const date = await rows[i].evaluate(el => el.children[2].textContent?.trim());
                    const type = await rows[i].evaluate(el => el.children[3].textContent?.trim());
                    const caseID = await rows[i].evaluate(el => el.children[4].children[0].textContent?.trim());
                    const link = await links[i].evaluate(el => el.getAttribute('href'));
                    const detailPage = await this.browser?.newPage();
                    if (!detailPage) {
                        return false;
                    }
                    await detailPage.goto(`${url}${link}`, {waitUntil: 'networkidle0'});
                    let userHandles = await detailPage.$x('//table[contains(@class, "table-bordered")]/tbody/tr')
                    let useTypes = ['Assignee', 'Party B', 'Mortgagee', 'Grantee']
                    for (const userHandle of userHandles) {
                        const userType = await userHandle.evaluate(el => el.children[2].textContent?.trim());
                        if (userType?.match(useTypes[0]) || userType?.match(useTypes[1]) || userType?.match(useTypes[2]) || userType?.match(useTypes[3])) {
                            let name = await userHandle.evaluate(el => el.children[0].innerHTML?.trim());
                            let name1 = name?.replace('&nbsp;', '');
                            if (name1?.length == 0) {
                                let company = await userHandle.evaluate(el => el.children[1].textContent?.trim());
                                if (await this.getData(page, null, company, type, date, caseID)) {
                                    countRecords++
                                }  
                            } else {
                                if (name?.includes('&nbsp;')) {
                                    let temp = name.split('&nbsp;');
                                    name = temp[0].trim() + ' ' + temp[1].trim();
                                    if (await this.getData(page, name, null, type, date, caseID)) {
                                        countRecords++
                                    }  
                                }
                            }
                        }
                    }
                    await detailPage.close();
                }
            } else {
                console.log('No Records')
            }

            await AbstractProducer.sendMessage('Richmond', 'New York', countRecords, 'Civil & Lien');
            await page.close();
            await this.browser?.close();
            return true;
        }
        catch (error) {
            console.log('Error: ', error);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Richmond', 'New York', countRecords, 'Civil & Lien', errorImage);
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

    async getData(page: puppeteer.Page, name: any, company: any, type: any, date: any, caseID: any): Promise<any> {
        if (removeRowRegex.test(name ? name : company)) return false;
        const parseName: any = this.newParseName(name ? name : company)
        if (parseName?.type && parseName?.type == 'COMPANY') return false;

        let practiceType = this.getPracticeType(type)

        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({ name: productName }).exec();
        const data = {
            'caseUniqueId': caseID,
            'Property State': 'NY',
            'County': 'Richmond',
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