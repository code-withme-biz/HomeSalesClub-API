import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';

export default class CivilProducer extends AbstractProducer {
    browser: puppeteer.Browser | undefined;
    browserPages = {
        generalInfoPage: undefined as undefined | puppeteer.Page
    };
    urls = {
        generalInfoPage: 'https://oh3laredo.fidlar.com/OHWarren/AvaWeb/#!/search'
    }

    xpaths = {
        isPAloaded: '//button[@type="submit"]'
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
                type: 'company',
                firstName: '',
                lastName: '',
                middleName: '',
                fullName: name.trim(),
                suffix: ''
            };
            return result;
        }
        const suffix = name.match(suffixNamesRegex);
        name = name.replace(suffixNamesRegex, '');
        name = name.replace(/\s+/g, ' ');
        if (name.indexOf(',') > -1) {
            let fullName = name.trim();
            let lastName = name.slice(0, name.indexOf(',')).trim();
            let names = name.slice(name.indexOf(',')+1).trim().split(' ');
            let firstName = names[0];
            let middleName = names.length > 1 ? names.slice(1).join(' ').trim() : '';
            if (middleName !== '' && firstName === '') {
                firstName = middleName;
                middleName = '';
            }
            result = {
                type: 'person',
                firstName,
                lastName,
                middleName,
                fullName,
                suffix: suffix ? suffix[0] : ''
            }
        }
        else {
            let ownersNameSplited: any = name.split(' ');
            ownersNameSplited = ownersNameSplited.filter((val: any) => val !== '');
            const defaultLastName = ownersNameSplited[ownersNameSplited.length - 1].trim();
            ownersNameSplited.pop();
            try {
                const firstName = ownersNameSplited[0].trim();
                ownersNameSplited.shift();
                const middleName = ownersNameSplited.join(' ');
                const fullName = `${defaultLastName}, ${firstName} ${middleName} ${suffix ? suffix[0] : ''}`;
                result = {
                    type: 'person',
                    firstName,
                    lastName: defaultLastName,
                    middleName,
                    fullName: fullName.trim(),
                    suffix: suffix ? suffix[0] : ''
                }
            } catch (e) {
            }
        }
        if (!result) {
            result = {
                type: 'none',
                firstName: '',
                lastName: '',
                middleName: '',
                fullName: name.trim(),
                suffix: ''
            };
        }
        return result;
    }

    async getTextContentByXpathFromPage(page: puppeteer.Page, xPath: string) {
        const [elm] = await page.$x(xPath);
        if (elm == null) {
            return '';
        }
        let text = await page.evaluate(j => j.textContent, elm);
        return text.replace(/\n/g, ' ');
    }
    
    // This is main function
    async parseAndSave(): Promise<boolean> {
        const civilUrl: string = this.urls.generalInfoPage;
        let page = this.browserPages.generalInfoPage!;


        // get date range
        let dateRange = await this.getDateRange('Ohio', 'Warren');
        let fromDate = dateRange.from;
        let toDate = dateRange.to;
        let countRecords = 0;
        
        let days = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 3600 * 24)) - 1;
        for (let i = days < 1 ? 1 : days ; i >= 0 ; i--) {
            let dateSearch = new Date();
            dateSearch.setDate(dateSearch.getDate() - i);
            let dateSearchTo = new Date();
            dateSearchTo.setDate(dateSearchTo.getDate() - i)
            let fromDateString = this.getFormattedDate(dateSearch);
            let toDateString = this.getFormattedDate(dateSearchTo);            
            await page.waitFor(3000);

            // input date range
            await page.waitForSelector('input#StartDate');
            await page.type('input#StartDate', fromDateString, {delay: 100});
            await page.type('input[ng-model $= "endDate"]', toDateString, {delay: 100});
            try {
                await page.click('button[type="submit"]');
            } catch (error) {
                await page.click('button[type="submit"]');
            }

            try {
                await page.waitForXPath('//div[@id="resultsContainer"]/ul/li/div/div/div[1]');
            } catch (error) {
                const [no_results] = await page.$x('//*[contains(text(), "No results found")]');
                if (no_results) {
                    console.log('No results Found');
                    const [ok_button] = await page.$x('//*[contains(text(), "No results found")]/parent::div[1]/div/button');
                    await ok_button.click();
                    await page.waitFor(3000);
                    continue;
                }
                console.log(error);
                return false;    
            };
            await page.waitFor(3000);
            
            let resultRows = await page.$x('//div[@id="resultsContainer"]/ul/li/div/div/div[1]');
            for (const row of resultRows) {
                let names: string[] = [];
                const party1 = await page.evaluate(el => el.children[4].textContent.trim(), row);
                const party2 = await page.evaluate(el => el.children[5].textContent.trim(), row);
                if (this.parseName(party1).type !== 'company')
                    names = [party1];
                else if (this.parseName(party2).type !== 'company')
                    names = [party2];
                let recordDate = await page.evaluate(el => el.children[2].textContent.trim(), row);
                let caseType = await page.evaluate(el => el.children[1].textContent.trim(), row);
                let practiceType = this.getPracticeType(caseType);

                for (const name of names) {
                    if (this.isEmptyOrSpaces(name!)) {
                        continue;
                    }
                    // console.log(name);
                    const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                    console.log(productName, caseType)
                    const prod = await db.models.Product.findOne({ name: productName }).exec();
                    const parseName = this.newParseName(name!.trim());

                    const data = {
                        'Property State': 'OH',
                        'County': 'Warren',
                        'First Name': parseName.firstName,
                        'Last Name': parseName.lastName,
                        'Middle Name': parseName.middleName,
                        'Name Suffix': parseName.suffix,
                        'Full Name': parseName.fullName,
                        "vacancyProcessed": false,
                        fillingDate: recordDate,
                        "productId": prod._id,
                        originalDocType: caseType
                    };

                    if (await this.civilAndLienSaveToNewSchema(data))
                        countRecords += 1;
                }
            }
            const [back_button] = await page.$x('//*[contains(text(), "Back")]');
            await back_button.click();
            await page.waitFor(3000);
        }
        
        console.log(countRecords);
        await AbstractProducer.sendMessage('Warren', 'Ohio', countRecords, 'Civil & Lien');
        return true;
    }
}