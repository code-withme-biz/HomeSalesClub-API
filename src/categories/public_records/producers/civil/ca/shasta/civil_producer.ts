import puppeteer from 'puppeteer';
import AbstractProducer from '../../../abstract_producer';
import db from '../../../../../../models/db';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

export default class CivilProducer extends AbstractProducer {
    urls = {
        generalInfoPage: 'http://caselookup.shastacourts.com:8080/cgi-bin/webcase04r'
    }

    xpaths = {
        isPageLoaded: '//input[@type="submit"]'
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
            const dateRange = await this.getDateRange('California', 'Shasta');
            let fromDate = dateRange.from;

            const day = ("00" + (fromDate.getDate())).slice(-2);
            const month = ("00" + (fromDate.getMonth() + 1)).slice(-2);
            const year = fromDate.getFullYear();
            await Promise.all([
                page.select('select[name="FileMMLO"]', month),
                page.select('select[name="FileDDLO"]', day),
                page.select('select[name="FileCCYYLO"]', year.toString()),
                page.$eval('input[type="submit"]', el => el.removeAttribute('disabled')),
                page.click('input[type="submit"]'),
                page.waitForNavigation()
            ]);

            const { caseTitles, caseNames, caseNums, caseDates, caseTypes } = await this.getCase('', page, [], [], [], [], []);
            let caseTypeCount = 0;
            if (caseNums.length > 0) {
                console.log(`Found ${caseNums.length}`);
                const length = caseNums.length;

                for (let i = 0; i < length; i++) {
                    let caseTitle = caseTitles[caseTypeCount];
                    let caseName = caseNames[caseTypeCount];
                    let caseNum = caseNums[caseTypeCount];
                    let caseDate = caseDates[caseTypeCount];
                    let caseType = caseTypes[caseTypeCount];
                    caseTypeCount++
                    if (await this.getData(page, caseTitle, caseName, caseNum, caseDate, caseType)) {
                        countRecords++;
                    }

                }
            } else {
                console.log('Not Found');
            }

            await AbstractProducer.sendMessage('Shasta', 'California', countRecords, 'Civil & Lien');
            await page.close();
            await this.browser?.close();
            return true;

        } catch (error) {
            console.warn('Error', error);
            await AbstractProducer.sendMessage('Shasta', 'California', countRecords, 'Civil & Lien');
            return false;
        }


    }

    async waitForSuccess(func: Function): Promise<boolean> {
        let retry_count = 0;
        while (true) {
            if (retry_count > 3) {
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

    async getCase(url: string, page: puppeteer.Page, caseTitles: any[], caseNames: any[], caseNums: any[], caseDates: any[], caseTypes: any[]): Promise<any> {
        if (url) {
            await page.goto(url, { waitUntil: 'load' });
        }
        const endHandles = await page.$x('//table/tbody/tr/td[contains(text(), "End of Search")]');

        let caseTitleArray = [];
        let caseNameArray = [];
        let caseNumArray = [];
        let caseDateArray = [];
        let caseTypeArray = [];

        const titleHandles = await page.$x('//table/tbody/tr/td[1]');
        const nameHandles = await page.$x('//table/tbody/tr/td[2]');
        const numHandles = await page.$x('//table/tbody/tr/td[3]/a');
        const dateHandles = await page.$x('//table/tbody/tr/td[4]');
        const typeHandles = await page.$x('//table/tbody/tr/td[5]');

        if (endHandles.length > 0) {
            for (let i = 0; i < typeHandles.length; i++) {
                const title = await titleHandles[i].evaluate(el => el.textContent?.trim());
                const name = await nameHandles[i].evaluate(el => el.textContent?.trim());
                const num = await numHandles[i].evaluate(el => el.textContent?.trim());
                const date = await dateHandles[i].evaluate(el => el.textContent?.trim());
                const caseTypeString = await typeHandles[i].evaluate(el => el.textContent?.trim());
                caseTitleArray.push(title);
                caseNameArray.push(name);
                caseNumArray.push(num);
                caseDateArray.push(date);
                caseTypeArray.push(caseTypeString);
            }

            caseTitles = [...caseTitles, ...caseTitleArray];
            caseNames = [...caseNames, ...caseNameArray];
            caseNums = [...caseNums, ...caseNumArray];
            caseDates = [...caseDates, ...caseDateArray];
            caseTypes = [...caseTypes, ...caseTypeArray];

            return { caseTitles, caseNames, caseNums, caseDates, caseTypes };
        } else {
            const nextHandles = await page.$x('//h3/a');
            const nextLink = await nextHandles[0].evaluate(el => el.getAttribute('href'));
            const url = 'http://caselookup.shastacourts.com:8080/' + nextLink;

            for (let i = 0; i < typeHandles.length; i++) {
                const title = await titleHandles[i].evaluate(el => el.textContent?.trim());
                const name = await nameHandles[i].evaluate(el => el.textContent?.trim());
                const num = await numHandles[i].evaluate(el => el.textContent?.trim());
                const date = await dateHandles[i].evaluate(el => el.textContent?.trim());
                const caseTypeString = await typeHandles[i].evaluate(el => el.textContent?.trim());
                caseTitleArray.push(title);
                caseNameArray.push(name);
                caseNumArray.push(num);
                caseDateArray.push(date);
                caseTypeArray.push(caseTypeString);
            }

            caseTitles = [...caseTitles, ...caseTitleArray];
            caseNames = [...caseNames, ...caseNameArray];
            caseNums = [...caseNums, ...caseNumArray];
            caseDates = [...caseDates, ...caseDateArray];
            caseTypes = [...caseTypes, ...caseTypeArray];
            return this.getCase(url, page, caseTitles, caseNames, caseNums, caseDates, caseTypes);
        }
    }

    async getData(page: puppeteer.Page, caseTitle: any, caseName: any, caseNum: any, caseDate: any, caseType: any): Promise<any> {
        const parseName: any = this.newParseName(caseName!.trim());
        if (parseName.type && parseName.type == 'COMPANY') {
            return false;
        }
        let practiceType = this.getPracticeType(caseType);

        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({ name: productName }).exec();
        const data = {
            'caseUniqueId': caseNum,
            'Property State': 'CA',
            'County': 'Shasta',
            'First Name': parseName.firstName,
            'Last Name': parseName.lastName,
            'Middle Name': parseName.middleName,
            'Name Suffix': parseName.suffix,
            'Full Name': parseName.fullName,
            "vacancyProcessed": false,
            practiceType: practiceType,
            fillingDate: caseDate,
            "productId": prod._id,
            originalDocType: caseType
        };
        if (await this.civilAndLienSaveToNewSchema(data)) {
            return true
        } else {
            return false
        }
    }
    /**
     * parse name
     * @param name: string
     */
    /**
     * check if element exists
     * @param page 
     * @param selector 
     */
    async checkExistElement(page: puppeteer.Page, selector: string): Promise<Boolean> {
        const exist = await page.$(selector).then(res => res !== null);
        return exist;
    }

    /**
     * get textcontent from specified element
     * @param page 
     * @param root 
     * @param selector 
     */
    async getElementTextContent(page: puppeteer.Page, selector: string): Promise<string> {
        try {
            const existSel = await this.checkExistElement(page, selector);
            if (!existSel) return '';
            let content = await page.$eval(selector, el => el.textContent)
            return content ? content.trim() : '';
        } catch (error) {
            console.log(error)
            return '';
        }
    }

    getDateString(date: Date): string {
        return ("00" + (date.getMonth() + 1)).slice(-2) + "/" + ("00" + date.getDate()).slice(-2) + "/" + date.getFullYear();
    }
}