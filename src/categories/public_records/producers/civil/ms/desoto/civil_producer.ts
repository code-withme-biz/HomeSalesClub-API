import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';

const docTypeDescription: any = {
    'B': 'BANKRUPTCY',
    'D': 'BOARD OF SUPERVISOR MINUTES',
    'C': 'CONSTRUCTION LIENS',
    'V': 'DISCHARGES - VETERANS',
    'F': 'FEDERAL TAX LIEN',
    'FN': 'FORECLOSURE NOTIFICATIONS',
    'G': 'GENERAL SUBSTITUTION',
    'H': 'HOMESTEAD',
    'I': 'INCORPORATION',
    'L': 'LIS PENDENS',
    'M': 'MISCELLANEOUS',
    'P': 'POWER OF ATTORNEY',
    'S': 'SUBDIVISION',
    'T': 'TRUST DEED',
    'U': 'U.S. CITIZENSHIP',
    'W': 'WARRANTY DEED',
    'WB': 'WILL BOOK'
}

export default class CivilProducer extends AbstractProducer {
    browser: puppeteer.Browser | undefined;
    browserPages = {
        generalInfoPage: undefined as undefined | puppeteer.Page
    };
    urls = {
        generalInfoPage: 'https://landrecords.desotocountyms.gov/AcclaimWeb/search/SearchTypeDocType'
    }

    xpaths = {
        isPAloaded: '//input[@id="RecordDateFrom"]'
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

    async getData(page: puppeteer.Page, date: any, name: any, docType: any): Promise<any> {
        const parseName: any = this.newParseName(name.trim())
        if (parseName?.type && parseName?.type == 'COMPANY') return false;
        let practiceType = this.getPracticeType(docType)
        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({name: productName}).exec();
        const data = {
            'Property State': 'MS',
            'County': 'desoto',
            'First Name': parseName.firstName,
            'Last Name': parseName.lastName,
            'Middle Name': parseName.middleName,
            'Name Suffix': parseName.suffix,
            'Full Name': parseName.fullName,
            "vacancyProcessed": false,
            fillingDate: date,
            productId: prod._id,
            originalDocType: docType
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }

    // This is main function
    async parseAndSave(): Promise<boolean> {
        const civilUrl: string = this.urls.generalInfoPage;

        let countRecords = 0;
        try{
            let dateRange = await this.getDateRange('Mississippi', 'Desoto');
            let fromDate = dateRange.from;
            let toDate = dateRange.to;
            let fromDateString = this.getFormattedDate(fromDate);
            let toDateString = this.getFormattedDate(toDate);
            let page = this.browserPages.generalInfoPage!;
            await page.type('#RecordDateFrom', fromDateString);
            await page.type('#RecordDateTo', toDateString);
            await page.click('#btnSearch');
            let resultRows;
            await page.waitForResponse((response: any) => response.url().includes('Search/GridResults') && response.status() === 200);
            await this.sleep(3000);
            resultRows = await page.$x('//div[@class="t-grid-content"]/table/tbody/tr');
            let nextPage = true;
            while (nextPage) {
                resultRows = await page.$x('//div[@class="t-grid-content"]/table/tbody/tr');
                let currentPageNumHandle = await page.$x('//div[@class="t-page-i-of-n"]/input');
                let currentPageNum: any = await (await currentPageNumHandle[0].getProperty('value')).jsonValue();
                currentPageNum = parseInt(currentPageNum);
                for (let i = 0; i < resultRows.length; i++) {
                    let names = [];
                    let indXpath = i + 1;
                    let directNameHandle = await page.$x('//div[@class="t-grid-content"]/table/tbody/tr[' + indXpath + ']/td[6]');
                    let directName = await directNameHandle[0].evaluate(el => el.textContent?.trim());
                    names.push(directName);
                    let indirectNameHandle = await page.$x('//div[@class="t-grid-content"]/table/tbody/tr[' + indXpath + ']/td[7]');
                    let indirectName = await indirectNameHandle[0].evaluate(el => el.textContent?.trim());
                    names.push(indirectName);
                    let docTypeHandle = await page.$x('//div[@class="t-grid-content"]/table/tbody/tr[' + indXpath + ']/td[4]');
                    let docTypeLetter = await docTypeHandle[0].evaluate(el => el.textContent?.trim());
                    let docType = docTypeDescription[docTypeLetter!];
                    let recordDateHandle = await page.$x('//div[@class="t-grid-content"]/table/tbody/tr[' + indXpath + ']/td[2]');
                    let recordDate = await recordDateHandle[0].evaluate(el => el.textContent?.trim());
                    // console.log(directName, indirectName);
                    for (const name of names) {
                        if (this.isEmptyOrSpaces(name!)) {
                            continue;
                        }
                        if(await this.getData(page, recordDate, name, docType)){
                            countRecords += 1;
                        }
                    }
                }
                let nextPageDisabled = await page.$x('//a[@class="t-link t-state-disabled"]/span[contains(text(), "next")]');
                if (nextPageDisabled.length > 0) {
                    nextPage = false;
                } else {
                    let nextPageNum = currentPageNum + 1;
                    let nextPageButton = await page.$x('//a[@class="t-link"]/span[contains(text(), "next")]');
                    await nextPageButton[0].click();
                    await page.waitForXPath('//div[@class="t-page-i-of-n"]/input[@value="' + nextPageNum + '"]', { visible: true });
                    await this.sleep(3000);
                }
            }
            
            console.log(countRecords);
            await AbstractProducer.sendMessage('Desoto', 'Mississippi', countRecords, 'Civil & Lien');
            return true;
        } catch(e){
            console.log(e);
            await AbstractProducer.sendMessage('Desoto', 'Mississippi', countRecords, 'Civil & Lien');
            return false;
        }
    }
}