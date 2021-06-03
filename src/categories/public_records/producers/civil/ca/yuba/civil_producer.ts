import puppeteer from 'puppeteer';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import db from '../../../../../../models/db';
import SnsService from '../../../../../../services/sns_service';
import { parse } from 'path';
export default class CivilProducer extends AbstractProducer {
    urls = {
        generalInfoPage: 'https://recorder.co.yuba.ca.us:8443/web/user/disclaimer'
    }

    xpaths = {
        isPageLoaded: '//button[@id="submitDisclaimerAccept"]'
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

    async sendMessage(county: string, state: string, countRecords: number, sourceType: string) {
        const snsService = new SnsService();
        let topicName = 'CIVIL_TOPIC_DEV';
        if (! await snsService.exists(topicName)) {
            await snsService.create(topicName);
        }

        if (! await snsService.subscribersReady(topicName, SnsService.CIVIL_UPDATE_SUBSCRIBERS)) {
            await snsService.subscribeList(topicName);
        }
        await snsService.publish(topicName, `${county} county, ${state} total ${sourceType} data saved: ${countRecords}`);
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let countRecords = 0;
        try {
            const dateRange = await this.getDateRange('California', 'Yuba');
            let fromDate = dateRange.from;
            let toDate = dateRange.to;
            let startDate = this.getDateString(fromDate);
            let endDate = this.getDateString(toDate);
            console.log(`from: ${dateRange.from}, to: ${dateRange.to}`);

            try {
                await Promise.all([
                    page.$eval('button#submitDisclaimerAccept', el => el.removeAttribute('disable')),
                    page.click('button#submitDisclaimerAccept'),
                    page.waitForNavigation()
                ]);
                await this.sleep(1000);
            } catch (error) {
                console.error(error);
                return false;
            }

            await page.waitForXPath('//div[@data-role="content"]/div/div[3]/div[2]//a[1]');
            const [recordHandle] = await page.$x('//div[@data-role="content"]/div/div[3]/div[2]//a[1]');
            await recordHandle.click();
            await page.waitForNavigation();
            await this.sleep(1000);

            await page.waitForXPath('//a[@href="/web/search/DOCSEARCH145S2"]');
            const [doctypeHandle] = await page.$x('//a[@href="/web/search/DOCSEARCH145S2"]');
            await doctypeHandle.click();
            await page.waitForNavigation();
            await this.sleep(1000);

            //setting date ragne
            const fromDateHandle = await page.$('input#field_RecordingDateID_DOT_StartDate');
            const toDateHandle = await page.$('input#field_RecordingDateID_DOT_EndDate');

            await fromDateHandle?.click({ clickCount: 3 });
            await fromDateHandle?.press('Backspace');
            await fromDateHandle?.type(startDate, { delay: 50 });

            await toDateHandle?.click({ clickCount: 3 });
            await toDateHandle?.press('Backspace');
            await toDateHandle?.type(endDate, { delay: 50 });

            const inputTypXpath = `//input[@id="field_selfservice_documentTypes"]`;
            const [inputHandle] = await page.$x(inputTypXpath);
            await inputHandle.focus();

            //setting doc type list
            const docTypeSelects = ['DEED', 'LIEN', 'LIS PENDENS', 'FORECLOSURE', 'MARRIAGE', 'MORTGAGE', 'TAX LIEN'];

            await page.waitForXPath('//*[@id="field_selfservice_documentTypes-aclist"]');
            await this.sleep(5000);
            const items = await page.$x('//*[@id="field_selfservice_documentTypes-aclist"]/li');
            let typeItems = [];

            for (let i = 0; i < items.length; i++) {
                const type = await items[i].evaluate(el => el.textContent?.trim());
                if (type?.startsWith(docTypeSelects[0]) || type?.startsWith(docTypeSelects[1]) || type?.startsWith(docTypeSelects[2]) || type?.startsWith(docTypeSelects[3]) || type?.startsWith(docTypeSelects[4])) {
                    typeItems.push(type);
                }
            }

            for (let i = 0; i < typeItems.length; i++) {
                const [inputHandle] = await page.$x('//input[@id="field_selfservice_documentTypes"]');
                await inputHandle.click({ clickCount: 3 });
                await inputHandle.press('Backspace');
                await inputHandle.type(`${typeItems[i]}`, { delay: 10 });
                await this.sleep(500);
                await (await page.$x(`//*[@id="field_selfservice_documentTypes-aclist"]/li[text()="${typeItems[i]}"]`))[0].click();
                await this.sleep(500);
            }

            //click search button
            const [searchHandle] = await page.$x('//*[@id="searchButton"]');
            await searchHandle.focus();
            await searchHandle.click();
            await this.sleep(3000);

            const tableXpath = '//div[contains(@id, "search-result")]';
            await page.waitForXPath(tableXpath);
            console.log('table loaded')
            await this.sleep(3000);
            const noresultHandle = await page.$x('//div[contains(@id, "search-result")]//h2[contains(text(), "No results found")]');
            if (noresultHandle.length > 0) {
                console.log('Not Found');
                return false;
            }

            let pageNum = 0;

            while (pageNum >= 0) {
                const totalXpath = '//div[contains(text(), "Showing page")]';
                const resultXpath = '//div[contains(@id, "search-result")]//li[3]/ul[contains(@id, "searchResult")]/li';
                const pageXpath = `//*[contains(text(), " Page ${pageNum + 1} of")]`;

                if (pageNum == 0) {
                    await page.waitForXPath(totalXpath);
                    console.log('total loaded');
                } else {
                    await page.waitForXPath(pageXpath);
                    console.log('new page loaded');
                }

                const results = await page.$x(resultXpath);
                console.log(`${pageNum + 1} - `, results.length);

                for (let i = 0; i < results.length; i++) {
                    const [typeHandle] = await page.$x(`//div[contains(@id, "search-result")]//li[3]/ul[contains(@id, "searchResult")]/li[${i + 1}]//h1`);
                    const dataHandle = await page.$x(`//div[contains(@id, "search-result")]//li[3]/ul[contains(@id, "searchResult")]/li[${i + 1}]//ul/li[2]/b`);
                    const type = await typeHandle.evaluate(el => el.textContent?.trim());
                    const date = await dataHandle[0].evaluate(el => el.textContent?.trim());
                    const name = await dataHandle[1].evaluate(el => el.textContent?.trim());
                    const docType = type?.toString().replace(/[^a-zA-Z ]/g, "");
                    const caseID = type?.toString().replace(/\D/g, '');
                    if (await this.getData(page, name, docType, date, caseID))
                        countRecords++;
                }
                const nextButtonXpath = '//div[contains(@id, "search-buttons")]//a[text()="Next"]';
                const [nextButtonEL] = await page.$x(nextButtonXpath);
                if (nextButtonEL) {
                    const nextButtonDisabled = await page.evaluate(el => el.getAttribute('class'), nextButtonEL);
                    if (nextButtonDisabled == 'ui-disabled ui-link ui-btn ui-btn-b ui-btn-inline ui-shadow ui-corner-all') {
                        break;
                    } else {
                        pageNum++;
                        await nextButtonEL.click();
                    }
                } else {
                    break;
                }
            }
            await this.sendMessage('Yuba', 'California', countRecords, 'Civil & Lien');
            await page.close();
            await this.browser?.close();
            return true;
        }
        catch (error) {
            console.log('Error: ', error);
            await this.sendMessage('Yuba', 'California', countRecords, 'Civil & Lien');
        }

        return false;
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

    async getData(page: puppeteer.Page, name: any, type: any, date: any, caseID: any): Promise<any> {
        const full_name = name.replace(/\n/g, '')
        const parseName: any = this.newParseName(full_name.trim());
        if (parseName.type && parseName.type == 'COMPANY') {
            return false;
        }

        let practiceType = this.getPracticeType(type.trim());

        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({ name: productName }).exec();
        const data = {
            'caseUniqueId': caseID,
            'Property State': 'CA',
            'County': 'Yuba',
            'First Name': parseName.firstName,
            'Last Name': parseName.lastName,
            'Middle Name': parseName.middleName,
            'Name Suffix': parseName.suffix,
            'Full Name': parseName.fullName,
            "vacancyProcessed": false,
            fillingDate: date,
            productId: prod._id,
            originalDocType: type.trim()
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
    parseName(name: string) {
        let result;
        const companyIdentifiersArray = [
            'GENERAL', 'TRUSTEE', 'TRUSTEES', 'INC', 'ORGANIZATION',
            'CORP', 'CORPORATION', 'LLC', 'MOTORS', 'BANK', 'UNITED',
            'CO', 'COMPANY', 'FEDERAL', 'MUTUAL', 'ASSOC', 'AGENCY',
            'PARTNERSHIP', 'CHURCH', 'CITY', 'TRUST', 'SECRETARY',
            'DEVELOPMENT', 'INVESTMENT', 'ESTATE', 'LLP', 'LP', 'HOLDINGS',
            'LOAN', 'CONDOMINIUM', 'CATHOLIC', 'INVESTMENTS', 'D/B/A', 'COCA COLA',
            'LTD', 'CLINIC', 'TODAY', 'PAY', 'CLEANING', 'COSMETIC', 'CLEANERS',
            'FURNITURE', 'DECOR', 'FRIDAY HOMES', 'MIDLAND', 'SAVINGS', 'PROPERTY',
            'ASSET', 'PROTECTION', 'SERVICES', 'TRS', 'ET AL', 'L L C', 'NATIONAL',
            'ASSOCIATION', 'MANAGMENT', 'PARAGON', 'MORTGAGE', 'CHOICE', 'PROPERTIES',
            'J T C', 'RESIDENTIAL', 'OPPORTUNITIES', 'FUND', 'LEGACY', 'SERIES',
            'HOMES', 'LOAN', 'FAM', 'PRAYER'
        ];
        const suffixNamesArray = ['I', 'II', 'III', 'IV', 'V', 'ESQ', 'JR', 'SR'];
        const suffixNamesRegex = new RegExp(`\\b(?:${suffixNamesArray.join('|')})\\b`, 'i');

        const companyRegexString = `\\b(?:${companyIdentifiersArray.join('|')})\\b`;
        const companyRegex = new RegExp(companyRegexString, 'i');

        if (name.match(companyRegex)) {
            result = {
                first_name: '',
                last_name: '',
                middle_name: '',
                full_name: name.trim(),
                suffix: ''
            };
            return result;
        }
        const suffix = name.match(suffixNamesRegex);
        name = name.replace(suffixNamesRegex, '');
        name = name.replace(/  +/g, ' ');
        let ownersNameSplited: any = name.split(' ');
        const defaultLastName = ownersNameSplited[0].trim();
        ownersNameSplited.shift();
        try {
            const first_name = ownersNameSplited[0].trim();
            ownersNameSplited.shift();
            const middle_name = ownersNameSplited.join(' ');
            const fullName = `${defaultLastName}, ${first_name} ${middle_name} ${suffix ? suffix[0] : ''}`;
            result = {
                first_name,
                last_name: defaultLastName,
                middle_name,
                full_name: fullName.trim(),
                suffix: suffix ? suffix[0] : ''
            }
        } catch (e) {
        }
        if (!result) {
            result = {
                first_name: '',
                last_name: '',
                middle_name: '',
                full_name: name.trim(),
                suffix: ''
            };
        }
        return result;
    }
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