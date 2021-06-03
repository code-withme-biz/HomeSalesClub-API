import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';


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
        generalInfoPage: 'http://epay.phila-records.com/phillyepay/eagleweb/docSearch.jsp'
    };

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
            await this.browserPages.generalInfoPage.goto(this.urls.generalInfoPage, {waitUntil: 'load'});
            return true;
        } catch (err) {
            console.warn(err);
            return false;
        }
    }

    async read(): Promise<boolean> {
        try {
            await this.browserPages.generalInfoPage?.waitForXPath('//*[@id="middle_left"]');
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    async saveRecord(fillingDate: string, parseName: any, prod: any, caseType: any) {

        const data = {
            'Property State': 'PA',
            'County': 'Philadelphia',
            'First Name': parseName.firstName,
            'Last Name': parseName.lastName,
            'Middle Name': parseName.middleName,
            'Name Suffix': parseName.suffix,
            'Full Name': parseName.fullName,
            "vacancyProcessed": false,
            fillingDate: fillingDate,
            'productId': prod._id,
            originalDocType: caseType
        };

        return await this.civilAndLienSaveToNewSchema(data);
    }

    async getData(page: puppeteer.Page, fillingDate: string) {
        let count = 0;
        let nextPageFlag;
        try {
            do {
                nextPageFlag = false;
                await page.waitForSelector('#searchResultsTable');
                const rows = await page.$x('//*[@id="searchResultsTable"]/tbody/tr');
                for (let i = 0; i < rows.length; i++) {
                    try {
                        let caseType = (await rows[i].$eval('td:nth-child(1)', elem => elem.textContent))!.trim();
                        caseType = caseType.replace(/\n.*$/, '').trim();
                        let names = (await rows[i].$eval('td:nth-child(2) > a > table > tbody > tr:nth-child(1) > td:nth-child(2)', elem => elem.textContent))!.trim();
                        names = names.replace(/Grantee:\s*/, '').trim()
                        if (!names) continue;
                        const namesArray = names.split(',')
                        let practiceType = this.getPracticeType(caseType!);
                        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                        const prod = await db.models.Product.findOne({name: productName}).exec();
                        for (let j = 0; j < namesArray.length; j++) {
                            const name = namesArray[j].trim()
                            if (removeRowRegex.test(name)) continue;
                            if (/^public$/i.test(name)) continue;
                            const parserName: any = this.newParseName(name);
                            if(parserName.type && parserName.type == 'COMPANY'){
                                continue;
                            }
                            const saveRecord = await this.saveRecord(fillingDate, parserName, prod, caseType);
                            saveRecord && count++
                        }
                    } catch (e) {
                    }
                }
                const [nextPage] = await page.$x('//a[text()="Next"]')
                if (!!nextPage) {
                    await Promise.all([
                        nextPage.click(),
                        page.waitForNavigation()
                    ]);
                    nextPageFlag = true;
                }
            } while (nextPageFlag)
        } catch (e) {
        }
        return count
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let countRecords = 0;
        try {
            await page.waitForXPath('//input[contains(@value, "Free Public Search Login")]')
            await Promise.all([
                page.click('input[type="submit"][name="submit"][value="Free Public Search Login"]'),
                page.waitForNavigation()
            ]);
            await Promise.all([
                page.click('input[type="submit"][name="accept"][value="Accept"]'),
                page.waitForNavigation()
            ]);
            let dateRange = await this.getDateRange('Pennsylvania', 'Philadelphia');
            let date = dateRange.from;
            let today = dateRange.to;
            let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24)) - 1;
            for (let i = days < 0 ? 1 : days; i >= 0; i--) {
                try {
                    let dateSearch = new Date();
                    dateSearch.setDate(dateSearch.getDate() - i);
                    console.log('Start search with date: ', dateSearch.toLocaleDateString('en-US'));
                    await page.goto('http://epay.phila-records.com/phillyepay/eagleweb/docSearch.jsp');
                    await page.waitForSelector('#RecordingDateIDStart');
                    await page.evaluate(() => {
                        // @ts-ignore
                        document.querySelector('#RecordingDateIDStart').value = '';
                        // @ts-ignore
                        document.querySelector('#RecordingDateIDEnd').value = '';
                    });
                    await page.type('#RecordingDateIDStart', dateSearch.toLocaleDateString('en-US'), {delay: 100});
                    await page.type('#RecordingDateIDEnd', dateSearch.toLocaleDateString('en-US'), {delay: 100});
                    await Promise.all([
                        page.click('input[type="submit"][value="Search"]'),
                        page.waitForNavigation()
                    ]);
                    const count = await this.getData(page, dateSearch.toLocaleDateString('en-US'));
                    countRecords += count;
                    console.log(`${dateSearch.toLocaleDateString('en-US')} found ${count} records.`);
                } catch (e) {
                }
            }
        } catch (e) {
            console.log(e);
            console.log('Error search');
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Philadelphia', 'Pennsylvania', countRecords, 'Civil', errorImage);
            return false;
        }
        await AbstractProducer.sendMessage('Philadelphia', 'Pennsylvania', countRecords, 'Civil');
        return true;
    }
}

