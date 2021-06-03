import puppeteer from 'puppeteer';
import axios from 'axios';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import { sleep } from '../../../../../../core/sleepable';
import db from '../../../../../../models/db';
import { resolveRecaptcha2 } from '../../../../../../services/general_service';

export default class CivilProducer extends AbstractProducer {
    urls = {
        generalInfoPage1: 'https://efiling.tulare.courts.ca.gov/?q=node/353',
        generalInfoPage2: 'https://efiling.tulare.courts.ca.gov/?q=node/349'
    }

    xpaths = {
        isPageLoaded1: '//a[@href="?q=node/349"]',
        isPageLoaded2: '//button[@id="edit-submit"]'
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
            await this.browserPages.generalInfoPage.goto(this.urls.generalInfoPage1, { waitUntil: 'load' });
            return true;
        } catch (err) {
            console.warn(err);
            return false;
        }
    }

    async read(): Promise<boolean> {
        try {
            await this.browserPages.generalInfoPage?.waitForXPath(this.xpaths.isPageLoaded1);
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
        await this.sleep(3000)
        try {
            await Promise.all([
                page.$eval('a[href="?q=node/349"]', el => el.removeAttribute('disabled')),
                page.click('a[href="?q=node/349"]'),
                page.waitForNavigation()
            ]);
        } catch (error) {
            console.log(error);
            await AbstractProducer.sendMessage('Tulare', 'California', countRecords, 'Civil & Lien');
            return false;
        }

        const dateRange = await this.getDateRange('California', 'Tulare');
        let fromDate = dateRange.from;
        let toDate = dateRange.to;
        let startDate = this.getFormattedDate(fromDate);
        let endDate = this.getFormattedDate(toDate);
        const beginDateHandle = await page.$('input[name="data(108537)"]');
        const endDateHandle = await page.$('input[name="data(108537_right)"]');
        await beginDateHandle?.click();
        await beginDateHandle?.type(startDate, { delay: 50 });
        await endDateHandle?.click();
        await endDateHandle?.type(endDate, { delay: 50 });

        // captcha
        try {
            console.log("Resolving captcha...");
            const captchaSolution: any = await resolveRecaptcha2('6LeEN80UAAAAAMhKcioq2nUsbRSHsyhOHWJo08KN', await page.url());
            let recaptchaHandle = await page.$x('//*[@id="g-recaptcha-response"]');
            await recaptchaHandle[0].evaluate((elem: any, captchaSolution: any) => elem.innerHTML = captchaSolution, captchaSolution);
            console.log("Done.");
            await this.sleep(3000)
            await Promise.all([
                page.$eval('button#edit-submit', el => el.removeAttribute('disabled')),
                page.click('button#edit-submit'),
                page.waitForNavigation()
            ]);

            let pageNum = 1;
            let isLast = false;
            const element = await page.$x('//div[@id="edit-ecourtform"]/parent::div');
            const text = await element[0].evaluate(el => el.textContent?.trim());

            if (text?.includes('No Results Found')) {
                console.log('Not Found')
                return false;
            }

            while (!isLast) {
                if (pageNum > 1) {
                    await page.goto(`https://efiling.tulare.courts.ca.gov/?q=node/349/${pageNum}`, { waitUntil: 'load' });
                };

                const results = await page.$x('//table[contains(@class, "searchResultsPage")]/tbody/tr[contains(@id, "form_search_rowa")]');
                for (let i = 0; i < results.length; i++) {
                    const element = results[i];
                    const caseID = await element.evaluate(el => el.children[0].children[0].children[0].textContent?.trim());
                    const nameHTML = await element.evaluate(el => el.children[1].textContent?.trim());
                    let name = nameHTML?.split('vs. ')[1];
                    const date = await element.evaluate(el => el.children[2].textContent?.trim());
                    const type = await element.evaluate(el => el.children[3].textContent?.trim());
                    if (!name || this.isEmptyOrSpaces(name!)) {
                        continue;
                    }
                    name = name.replace(/s+/g, ' ');
                    if (await this.getData(page, name, type, date, caseID)) {
                        countRecords++
                    }
                }

                if (results.length < 20) {
                    isLast = true;
                } else {
                    pageNum++;
                    isLast = false;
                }
            }

            await AbstractProducer.sendMessage('Tulare', 'California', countRecords, 'Civil & Lien');
            await page.close();
            await this.browser?.close();
        } catch (error) {
            console.log('Error during resolving captcha: ', error);
            await AbstractProducer.sendMessage('Tulare', 'California', countRecords, 'Civil & Lien');
            return false;
        };
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

    async getData(page: puppeteer.Page, name: any, caseType: any, date: any, caseID: any): Promise<any> {
        console.log(name.trim());
        const parseName: any = this.newParseName(name.trim());
        if (parseName.type && parseName.type == 'COMPANY') {
            return false
        }
        let practiceType = this.getPracticeType(caseType);

        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({ name: productName }).exec();
        const data = {
            'caseUniqueId': caseID,
            'Property State': 'CA',
            'County': 'Tulare',
            'First Name': parseName.firstName,
            'Last Name': parseName.lastName,
            'Middle Name': parseName.middleName,
            'Name Suffix': parseName.suffix,
            'Full Name': parseName.fullName,
            "vacancyProcessed": false,
            fillingDate: date,
            "productId": prod._id,
            originalDocType: caseType
        };
        return (await this.civilAndLienSaveToNewSchema(data));
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

    // To check empty or space
    isEmptyOrSpaces(str: string) {
        return str === null || str.match(/^\s*$/) !== null;
    }
}