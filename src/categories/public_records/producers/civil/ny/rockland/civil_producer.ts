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
        generalInfoPage: 'https://cotthosting.com/NYRocklandExternal/User/Login.aspx?'
    }

    xpaths = {
        isPageLoaded: '//input[@id="ctl00_cphMain_blkLogin_btnGuestLogin"]'
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
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let countRecords = 0;
        try {
            const dateRange = await this.getDateRange('New York', 'Rockland');
            let fromDate = this.getFormattedDate(dateRange.from);
            let toDate = this.getFormattedDate(dateRange.to);

            // guest login

            try {
                const [docBtnHandle] = await page.$x('//input[@id="ctl00_cphMain_blkLogin_btnGuestLogin"]');
                await docBtnHandle.click();
                await page.waitForNavigation();
            } catch (error) {
                console.log(error);
                await AbstractProducer.sendMessage('Rockland', 'New York', countRecords, 'Civil & Lien');
                return false;
            }

            // search with date range
            let result1 = await this.waitForSuccess(async ()=> {
                await Promise.all([
                    page.click('input#ctl00_NavMenuIdxRec_btnNav_IdxRec_Date'),
                    page.waitForNavigation()
                ])
            })

            if (!result1) {
                await AbstractProducer.sendMessage('Rockland', 'New York', countRecords, 'Civil & Lien');
                return false;
            }

            let docTypes = ['BANKRUPTCY', 'DEED', 'LIEN', 'PROBATE', 'LIS PENDENS', 'FORECLOSURE', 'TAX LIEN', 'MORTGAGE'];
            
            // setting date range
            const from = fromDate.replace(/\//g, '');
            const to = toDate.replace(/\//g, '');
            await page.waitForSelector('input#ctl00_cphMain_SrchDates1_txtFiledFrom');
            await page.waitFor(1000)
            const fromDateHandle = await page.$('input#ctl00_cphMain_SrchDates1_txtFiledFrom');
            await fromDateHandle?.focus();
            await fromDateHandle?.click({clickCount: 3});
            await fromDateHandle?.press('Backspace');
            await fromDateHandle?.type(from, {delay: 100});
            await page.waitForSelector('input#ctl00_cphMain_SrchDates1_txtFiledThru');
            const toDateHandle = await page.$('input#ctl00_cphMain_SrchDates1_txtFiledThru');
            await toDateHandle?.focus();
            await toDateHandle?.click({clickCount: 3});
            await toDateHandle?.press('Backspace');
            await toDateHandle?.type(to, {delay: 100});

            // click search button
            let result2 = await this.waitForSuccess(async () => {
                await Promise.all([
                    page.click('input#ctl00_cphMain_btnSearch'),
                    page.waitForNavigation()
                ]);
            });

            if (!result2) {
                await AbstractProducer.sendMessage('Rockland', 'New York', countRecords, 'Civil & Lien');
                return false;
            }

            // getting data
            const rowsXpath = '//table[@id="ctl00_cphMain_lrrgResults_cgvResults"]/tbody/tr';
            await page.waitForXPath(rowsXpath)
            let rows = await page.$x(rowsXpath);

            if (rows.length > 0) {
                let pageNum = 1;
                let isLast = false;
                while (!isLast) {
                    await this.randomSleepIn5Sec()
                    await page.waitForXPath(`//table[@id="ctl00_cphMain_lrrgResults_cgvResults"]/thead//tbody//span[text()="${pageNum}"]`);
                    if (pageNum > 1) {
                        await page.waitForXPath(rowsXpath);
                    }
                    rows = await page.$x(rowsXpath);
                    for (let i = 0; i < rows.length; i++) {
                        let type = await rows[i].evaluate(el => el.children[5].textContent?.trim());
                        if (!(type?.includes(docTypes[0]) || type?.includes(docTypes[1]) || type?.includes(docTypes[2]) || type?.includes(docTypes[3]) || type?.includes(docTypes[4]) || type?.includes(docTypes[5]) || type?.includes(docTypes[6]) || type?.includes(docTypes[7]))) {
                            continue;
                        }
                        let nameHandles = await page.$x(`${rowsXpath}[${i + 1}]/td[8]//tr/td`);
                        for (const nameHandle of nameHandles) {
                            const name = await nameHandle.evaluate(el => el.textContent?.trim());
                            if (name?.includes('-') || name?.includes('+') || this.isEmptyOrSpaces(name!)) {
                                continue;
                            }
                            let date = await rows[i].evaluate(el => el.children[3].innerHTML);
                            date = date?.split('<br>')[0].trim();
                            let caseID = await rows[i].evaluate(el => el.children[9].children[0].textContent?.trim());

                            if (await this.getData(page, name, type, date, caseID)) {
                                countRecords++
                            }  
                        }
                    }
                    
                    const nextEl = await page.$x(`//table[@id="ctl00_cphMain_lrrgResults_cgvResults"]/thead//tbody//a[contains(text(), "${pageNum + 1}")]`);
                    if (nextEl.length > 0) {
                        pageNum++
                        isLast = false;
                        const rst = await this.waitForSuccess(async () => {
                            nextEl[0].click(),
                            page.waitForXPath(`//table[@id="ctl00_cphMain_lrrgResults_cgvResults"]/thead//tbody//span[text()="${pageNum}"]`);
                        })
                        if (!rst) {
                            await AbstractProducer.sendMessage('Rockland', 'New York', countRecords, 'Civil & Lien');
                            return false;
                        }
                    } else {
                        isLast = true;
                    };
                }                
            } else {
                console.log('No Records matched')
            }

            await AbstractProducer.sendMessage('Rockland', 'New York', countRecords, 'Civil & Lien');
            await page.close();
            await this.browser?.close();
            return true;
        }
        catch (error) {
            console.log('Error: ', error);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Rockland', 'New York', countRecords, 'Civil & Lien', errorImage);
            return false;
        }
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
                console.log('retrying ...', retry_count)
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
            'County': 'Rockland',
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