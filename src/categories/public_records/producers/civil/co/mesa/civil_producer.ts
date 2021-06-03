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
        generalInfoPage: 'https://recording.mesacounty.us/LandmarkWeb'
    }

    xpaths = {
        isPAloaded: '//span[contains(., "document")]'
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
                firstName,
                lastName: defaultLastName,
                middleName,
                fullName: fullName.trim(),
                suffix: suffix ? suffix[0] : ''
            }
        } catch (e) {
        }
        if (!result) {
            result = {
                firstName: '',
                lastName: '',
                middleName: '',
                fullName: name.trim(),
                suffix: ''
            };
        }
        return result;
    }

    // This is main function
    async parseAndSave(): Promise<boolean> {
        let countRecords = 0;
        try {
            const civilUrl: string = 'https://recording.mesacounty.us/LandmarkWeb';
            let dateRange = await this.getDateRange('Colorado', 'Mesa');
            let fromDate = dateRange.from;
            let toDate = dateRange.to;
            let page = this.browserPages.generalInfoPage!;

            await page.goto(civilUrl, { timeout: 60000 });
            await page.waitForXPath('//img[@data-title="Document Search"]', { visible: true });
            let searchByDocument = await page.$x('//img[@data-title="Document Search"]');
            await searchByDocument[0].click();
            await page.waitForSelector('a#idAcceptYes', { visible: true });
            await Promise.all([
                page.waitForNavigation(),
                page.click('a#idAcceptYes')
            ]);
            while (fromDate <= toDate) {
                let dateStringDay = this.getFormattedDate(fromDate);
                // console.log(dateStringDay);
                let documentTypes = ['Deeds', 'Liens/Judgements', 'Marriage Doc'];
                for (const docTypeSelect of documentTypes) {
                    // console.log(docTypeSelect);
                    let option = (await page.$x('//select[@id="documentCategory-DocumentType"]/option[contains(., "' + docTypeSelect + '")]'))[0];
                    let optionVal: any = await (await option.getProperty('value')).jsonValue();
                    await page.select('#documentCategory-DocumentType', optionVal);
                    await this.sleep(200);
                }
                await page.click('input#beginDate-DocumentType', { clickCount: 3 });
                await page.type('input#beginDate-DocumentType', dateStringDay);
                await page.click('input#endDate-DocumentType', { clickCount: 3 });
                await page.type('input#endDate-DocumentType', dateStringDay);
                await page.select('#numberOfRecords-DocumentType', '2000');
                await page.click('a#submit-DocumentType');
                await page.waitForXPath('//table[@id="resultsTable"]/tbody/tr', { visible: true, timeout: 200000 });
                await page.select('select[name="resultsTable_length"]', '-1');
                await page.waitForXPath('//a[contains(text(), "Next") and contains(@class, "disabled")]', { visible: true, timeout: 200000 });
                let docTypeHandles;
                while (true) {
                    docTypeHandles = await page.$x('//table[@id="resultsTable"]/tbody/tr/td[9]');
                    let totalRecordsString = await page.$x('//*[@id="resultsTable_info"]/b');
                    let textTotal = await totalRecordsString[0].evaluate(el => el.textContent);
                    let arrayRecords = await textTotal?.split(" ");
                    let totalRecords: any = arrayRecords?.[arrayRecords?.length - 1];
                    if (docTypeHandles.length == parseInt(totalRecords) || totalRecords == 'records') {
                        break;
                    }

                }


                let recordDateHandles = await page.$x('//table[@id="resultsTable"]/tbody/tr/td[8]');
                let uniqueIdHandles = await page.$x('//table[@id="resultsTable"]/tbody/tr/td[13]');
                for (let i = 0; i < docTypeHandles.length; i++) {
                    let indexName = i + 1;
                    let docType = await docTypeHandles[i].evaluate(el => el.textContent?.trim());
                    let recordDate = await recordDateHandles[i].evaluate(el => el.textContent?.trim());
                    let uniqueId = await uniqueIdHandles[i].evaluate(el => el.textContent?.trim());
                    let names = [];
                    let reverseNameHandles = await page.$x('//table[@id="resultsTable"]/tbody/tr[' + indexName + ']/td[7]/text()');
                    let directNameHandles = await page.$x('//table[@id="resultsTable"]/tbody/tr[' + indexName + ']/td[6]/text()');
                    if (docType?.match(/marriage/i) || docType?.match(/deed/i) || docType?.match(/family/i)) {
                        for (let reverseNameHandle of reverseNameHandles) {
                            let reverseName = await reverseNameHandle.evaluate(el => el.textContent?.trim());
                            names.push(reverseName);
                        }
                        for (let directNameHandle of directNameHandles) {
                            let directName = await directNameHandle.evaluate(el => el.textContent?.trim());
                            names.push(directName);
                        }
                    } else if (docType?.match(/mortgage/i) || docType?.match(/probate/i)) {
                        for (let directNameHandle of directNameHandles) {
                            let directName = await directNameHandle.evaluate(el => el.textContent?.trim());
                            names.push(directName);
                        }
                    } else {
                        for (let reverseNameHandle of reverseNameHandles) {
                            let reverseName = await reverseNameHandle.evaluate(el => el.textContent?.trim());
                            names.push(reverseName);
                        }
                    }

                    let practiceType = this.getPracticeType(docType!);
                    for (let name of names) {
                        name = name?.replace(/\(PERS REP\)/, '');
                        if (name == '...' || name == '' || name == ' ') {
                            continue
                        }
                        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                        const prod = await db.models.Product.findOne({ name: productName }).exec();
                        const parseName: any = this.newParseName(name!.trim());
                        if (parseName.type && parseName.type == 'COMPANY') {
                            continue
                        }
                        const data = {
                            'caseUniqueId': uniqueId,
                            'Property State': 'CO',
                            'County': 'Mesa',
                            'First Name': parseName.firstName,
                            'Last Name': parseName.lastName,
                            'Middle Name': parseName.middleName,
                            'Name Suffix': parseName.suffix,
                            'Full Name': parseName.fullName,
                            "vacancyProcessed": false,
                            fillingDate: recordDate,
                            "productId": prod._id,
                            originalDocType: docType
                        };
                        if (await this.civilAndLienSaveToNewSchema(data))
                            countRecords += 1;
                    }
                }
                fromDate.setDate(fromDate.getDate() + 1);
            }

            console.log(countRecords)
            await AbstractProducer.sendMessage('Mesa', 'Colorado', countRecords, 'Civil & Lien');
            return true;
        } catch (err) {
            console.log('Error!');
            await AbstractProducer.sendMessage('Mesa', 'Colorado', countRecords, 'Civil & Lien');
            return false
        }
    }
}