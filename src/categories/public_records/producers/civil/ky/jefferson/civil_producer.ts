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
        generalInfoPage: 'https://search.jeffersondeeds.com/insttype.php'
    }

    xpaths = {
        isPAloaded: '//select[@name="itype1"]'
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

    discriminateAndRemove(name: string): any {
        const companyIdentifiersArray = ['GENERAL', 'TRUSTEE', 'TRUSTEES', 'INC', 'ORGANIZATION', 'CORP', 'CORPORATION', 'LLC', 'MOTORS', 'BANK', 'UNITED', 'CO', 'COMPANY', 'FEDERAL', 'MUTUAL', 'ASSOC', 'AGENCY', 'OF', 'SECRETARY', 'DEVELOPMENT', 'INVESTMENTS', 'HOLDINGS', 'ESTATE', 'LLP', 'LP', 'TRUST', 'LOAN', 'CONDOMINIUM', 'CHURCH', 'CITY', 'CATHOLIC', 'D/B/A', 'COCA COLA', 'LTD', 'CLINIC', 'TODAY', 'PAY', 'CLEANING', 'COSMETIC', 'CLEANERS', 'FURNITURE', 'DECOR', 'FRIDAY HOMES', 'SAVINGS', 'PROPERTY', 'PROTECTION', 'ASSET', 'SERVICES', 'L L C', 'NATIONAL', 'ASSOCIATION', 'MANAGEMENT', 'PARAGON', 'MORTGAGE', 'CHOICE', 'PROPERTIES', 'J T C', 'RESIDENTIAL', 'OPPORTUNITIES', 'FUND', 'LEGACY', 'SERIES', 'HOMES', 'LOAN'];
        const removeFromNamesArray = ['ET', 'AS', 'DECEASED', 'DCSD', 'CP\/RS', 'JT\/RS', 'esq', 'esquire', 'jr', 'jnr', 'sr', 'snr', '2', 'ii', 'iii', 'iv', 'md', 'phd', 'j.d.', 'll.m.', 'm.d.', 'd.o.', 'd.c.', 'p.c.', 'ph.d.', '&'];
        const companyRegexString = `\\b(?:${companyIdentifiersArray.join('|')})\\b`;
        const removeFromNameRegexString = `^(.*?)\\b(?:${removeFromNamesArray.join('|')})\\b.*?$`;
        const companyRegex = new RegExp(companyRegexString, 'i');
        const removeFromNamesRegex = new RegExp(removeFromNameRegexString, 'i');
        let isCompanyName = name.match(companyRegex);
        if (isCompanyName) {
            return {
                type: 'company',
                name: name
            }
        }

        let cleanName = name.match(removeFromNamesRegex);
        if (cleanName) {
            name = cleanName[1];
        }
        return {
            type: 'person',
            name: name
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

    getSuffix(name: string): any {
        const suffixList = ['esq', 'esquire', 'jr', 'jnr', 'sr', 'snr', '2', 'ii', 'iii', 'iv', 'md', 'phd', 'j.d.', 'll.m.', 'm.d.', 'd.o.', 'd.c.', 'p.c.', 'ph.d.'];
        name = name.toLowerCase();
        for (let suffix of suffixList) {
            let regex = new RegExp(' ' + suffix, 'gm');
            if (name.match(regex)) {
                return suffix;
            }
        }
        return '';
    }

    getDateString(date: Date): string {
        return ("00" + (date.getMonth() + 1)).slice(-2) + "/" + ("00" + date.getDate()).slice(-2) + "/" + date.getFullYear();
    }

    sleep(ms: number) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
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
        const civilUrl: string = 'https://search.jeffersondeeds.com/insttype.php';
        let countRecords = 0;
        try {
            let dateRange = await this.getDateRange('Kentucky', 'Jefferson');
            let fromDate = dateRange.from;
            let toDate = dateRange.to;
            let page = this.browserPages.generalInfoPage!;


            while (fromDate <= toDate) {
                let dateStringDay = this.getDateString(new Date(fromDate));
                await page.goto(civilUrl, { timeout: 60000 });
                await page.waitForXPath('//select[@name="itype1"]', { visible: true });
                // console.log(dateStringDay);
                await page.select('select[name="itype1"]', 'DED');
                await page.select('select[name="itype2"]', 'LR');
                await page.select('select[name="itype3"]', 'MTG');

                await page.click('input#datepickerbdate', { clickCount: 3 });
                await page.type('input#datepickerbdate', dateStringDay);
                await page.click('input#datepickeredate', { clickCount: 3 });
                await page.type('input#datepickeredate', dateStringDay);
                await page.click('input[type="submit"]');
                try {
                    await page.waitForXPath('//table[3]/tbody/tr', { visible: true, timeout: 30000 });
                } catch (err) {
                    fromDate.setDate(fromDate.getDate() + 1);
                    continue
                }
                await page.waitForXPath('//input[@id="home"]', { visible: true, timeout: 500000 });

                let recordRow = await page.$x('//table[3]/tbody/tr');
                for (let i = 0; i < recordRow.length; i++) {
                    let index = i + 1;
                    let grantorsXpath = await page.$x('//table[3]/tbody/tr[' + index + ']/td[3]/span/div');
                    let grantesXpath = await page.$x('//table[3]/tbody/tr[' + index + ']/td[4]/span/div');
                    let fillingDateXpath = await page.$x('//table[3]/tbody/tr[' + index + ']/td[6]/span');
                    let docTypeXpath = await page.$x('//table[3]/tbody/tr[' + index + ']/td[8]/span');
                    let caseUniqueIdXpath = await page.$x('//table[3]/tbody/tr[' + index + ']/td[7]/span');


                    let docType = await docTypeXpath[0].evaluate(el => el.textContent?.trim());
                    if (docType == '' || docType == null) {
                        continue
                    }
                    let fillingDate = await fillingDateXpath[0].evaluate(el => el.textContent?.trim());
                    let caseUniqueId = await caseUniqueIdXpath[0].evaluate(el => el.textContent?.trim());
                    let names = [];
                    try {
                        let grantorName = await grantorsXpath[0].evaluate(el => el.innerHTML?.trim());
                        let arrGrantor = grantorName?.split('<br>');
                        for (let j = 0; j < arrGrantor!.length; j++) {
                            names.push(arrGrantor![j]);
                        }
                    } catch (err) {

                    }
                    try {
                        let grantesName = await grantesXpath[0].evaluate(el => el.innerHTML?.trim());
                        let arrGrantes = grantesName?.split('<br>');
                        for (let j = 0; j < arrGrantes!.length; j++) {
                            names.push(arrGrantes![j]);
                        }
                    } catch (err) {

                    }

                    let practiceType = this.getPracticeType(docType!);
                    for (let name of names) {
                        name = name?.replace(/\(PERS REP\)/, '');
                        if (name == '...') {
                            continue
                        }
                        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                        const prod = await db.models.Product.findOne({ name: productName }).exec();
                        const parseName: any = this.newParseName(name!.trim());
                        if (parseName.type && parseName.type == 'COMPANY') {
                            continue;
                        }

                        const data = {
                            'caseUniqueId': caseUniqueId,
                            'Property State': 'KY',
                            'County': 'Jefferson',
                            'First Name': parseName.firstName,
                            'Last Name': parseName.lastName,
                            'Middle Name': parseName.middleName,
                            'Name Suffix': parseName.suffix,
                            'Full Name': parseName.fullName,
                            "vacancyProcessed": false,
                            fillingDate: fillingDate,
                            "productId": prod._id,
                            originalDocType: docType
                        };

                        if (await this.civilAndLienSaveToNewSchema(data)) {
                            countRecords += 1;
                        }
                    }
                }
                fromDate.setDate(fromDate.getDate() + 1);
                await this.randomSleepIn5Sec();
            }

            console.log(countRecords)
            await AbstractProducer.sendMessage('Jefferson', 'Kentucky', countRecords, 'Civil & Lien');
            return true;
        } catch (e) {
            console.log(e);
            await AbstractProducer.sendMessage('Jefferson', 'Kentucky', countRecords, 'Civil & Lien');
            return false;
        }
    }
}