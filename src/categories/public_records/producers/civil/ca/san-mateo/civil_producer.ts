import puppeteer from 'puppeteer';
import AbstractProducer from '../../../abstract_producer';
import db from '../../../../../../models/db';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

export default class CivilProducer extends AbstractProducer {
    urls = {
        generalInfoPage: 'https://apps.smcacre.org/recorderworks/'
    }

    xpaths = {
        isPageLoaded: '//td[@id="MainContent_Manager1_linkSearch"]'
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
        const civilUrl: string = 'https://apps.smcacre.org/recorderworks/';
        if (page === undefined) return false;
        let countRecords = 0, results = [], records = 0;
        try {
            let dateRange = await this.getDateRange('California', 'San Mateo');
            let fromDate = dateRange.from;
            let toDate = dateRange.to;

            while (fromDate <= toDate) {
                await page.goto(civilUrl, { timeout: 60000 });
                let dateStringDay = this.getDateString(new Date(fromDate));
                const searchSelector = 'td#MainContent_Manager1_linkSearch';
                const searchHandle = await page.$(searchSelector);
                await searchHandle?.click();

                const recordingSelector = 'a#MainContent_SearchParent1_StandartSearchMenu1_SearchByDocType';
                const recordingHandle = await page.$(recordingSelector);
                await recordingHandle?.click();

                const beginDateSelector = 'input#MainContent_SearchParent1_SearchByDocType1_StartEndDate1_fromDate';
                const endDateSelector = 'input#MainContent_SearchParent1_SearchByDocType1_StartEndDate1_toDate';
                const beginDateHandle = await page.$(beginDateSelector);
                const endDateHandle = await page.$(endDateSelector);
                await beginDateHandle?.click();
                await beginDateHandle?.type(dateStringDay, { delay: 150 });
                await endDateHandle?.click();
                await endDateHandle?.type(dateStringDay, { delay: 150 });

                await page.click('#MainContent_SearchParent1_SearchByDocType1_DocumentTypes1_CtrlWidget #chkTypes');

                const searchSelector1 = 'div#MainContent_SearchParent1_SearchByDocType1_btnSearch';
                const searchHandle1 = await page.$(searchSelector1);
                await searchHandle1?.click();
                await this.sleep(3000);
                await page.waitForSelector('div[id=MainContent_ResultsContainer1_CtrlWidget][style]');
                await this.sleep(3000);

                let isLast = false;
                let countPage = 1;

                let countResults: any = await page.$x('//span[@id="SearchResultsTitle1_resultCount"]');
                countResults = await page.evaluate(el => el.textContent, countResults[0]);
                countResults = parseInt(countResults);
                if (countResults === 0) {
                    console.log('No Results Found');
                    fromDate.setDate(fromDate.getDate() + 1);
                    continue
                }
                else {
                    console.log(`${countResults} Results Found`);
                }

                while (!isLast) {
                    // get all results
                    await page.waitForXPath('//div[@id="MainContent_ResultLoading_ContentBlocker" and contains(@style,"display: none;")]', { timeout: 60000 })
                    const [lastHandle] = await page.$x('//td[@id="SearchResultsTitle1_paging"]/table/tbody/tr/td[last()]');
                    const last_class = await lastHandle.evaluate(el => el.getAttribute('class'));
                    const documentHandles = await page.$x('//div[@id="MainContent_ResultsContainer1_CtrlWidget"]/div/div[7]/div');
                    const numbers = documentHandles.filter((doc, index) => index % 2 == 0);
                    const contents = documentHandles.filter((doc, index) => index % 2 == 1);

                    for (let i = 0; i < numbers.length; i++) {
                        const num = await numbers[i].evaluate(el => el.childNodes[1]?.childNodes[1]?.firstChild?.childNodes[3]?.childNodes[3]?.textContent?.trim());
                        const type = await contents[i].evaluate(el => el.firstElementChild?.firstElementChild?.firstElementChild?.childNodes[2]?.childNodes[1]?.childNodes[1]?.childNodes[1]?.childNodes[0]?.childNodes[1]?.childNodes[1]?.childNodes[1]?.childNodes[0]?.childNodes[2]?.textContent?.trim());
                        const date = await contents[i].evaluate(el => el.firstElementChild?.firstElementChild?.firstElementChild?.childNodes[2]?.childNodes[1]?.childNodes[1]?.childNodes[1]?.childNodes[0]?.childNodes[1]?.childNodes[1]?.childNodes[1]?.childNodes[1]?.childNodes[2]?.textContent?.trim());
                        const grantee_name = await contents[i].evaluate(el => el.firstElementChild?.firstElementChild?.firstElementChild?.childNodes[2]?.childNodes[1]?.childNodes[1]?.childNodes[1]?.childNodes[0]?.childNodes[1]?.childNodes[1]?.childNodes[1]?.childNodes[4]?.childNodes[2]?.textContent?.trim());
                        const parerName: any = this.newParseName(grantee_name!.trim());
                        if (parerName.type && parerName.type == 'COMPANY') {
                            continue;
                        }
                        let practiceType = this.getPracticeType(type!);                
                        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                        results.push({
                            parseName: parerName,
                            fillingDate: date,
                            docType: type,
                            productName
                        })
                    }
                    if (last_class == 'boldLinkColor') {
                        countPage++;
                        let nextButton = await page.$x('//td[@id="SearchResultsTitle1_paging"]/table/tbody/tr/td[contains(.,"Next")]');
                        await nextButton[0].click();
                        await page.waitForXPath('//div[@id="MainContent_ResultLoading_ContentBlocker" and contains(@style,"display: block;")]', { visible: true, timeout: 200000 });
                        isLast = false;
                    } else {
                        isLast = true;
                    }
                    console.log(countPage);
                };
                this.randomSleepIn5Sec();
                fromDate.setDate(fromDate.getDate() + 1);
            }
            console.log('****** ', results.length);
            records = await this.saveRecords(results, this.publicRecordProducer.state, this.publicRecordProducer.county);
            await AbstractProducer.sendMessage('San Mateo', 'California', countRecords, 'Civil & Lien');
            await page.close();
            await this.browser?.close();
            return true;
        }
        catch (error) {
            console.log('Error: ', error);
            await AbstractProducer.sendMessage('San Mateo', 'California', countRecords, 'Civil & Lien');
        }
        return false;
    }

    async getData(page: puppeteer.Page, number: any, type: any, date: any, grantee: any): Promise<any> {
        const grantee_name: any = this.newParseName(grantee!.trim());
        if (grantee_name.type && grantee_name.type == 'COMPANY') {
            return false;
        }
        let practiceType = this.getPracticeType(type);

        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({ name: productName }).exec();
        const data = {
            'caseUniguqId': number,
            'Property State': 'CA',
            'County': 'San Mateo',
            'First Name': grantee_name.firstName,
            'Last Name': grantee_name.lastName,
            'Middle Name': grantee_name.middleName,
            'Name Suffix': grantee_name.suffix,
            'Full Name': grantee_name.fullName,
            "vacancyProcessed": false,
            fillingDate: date,
            "productId": prod._id,
            originalDocType: type
        };
        if (await this.civilAndLienSaveToNewSchema(data)) {
            return true;
        } else {
            return false;
        }

    }
    getDateString(date: Date): string {
        return ("00" + (date.getMonth() + 1)).slice(-2) + "/" + ("00" + date.getDate()).slice(-2) + "/" + date.getFullYear();
    }
}