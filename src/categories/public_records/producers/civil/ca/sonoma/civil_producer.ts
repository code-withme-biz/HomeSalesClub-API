import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
const parseAddress = require('parse-address');
const { parseFullName } = require('parse-full-name');
import { config as CONFIG } from '../../../../../../config';
import { IConfigEnv } from '../../../../../../iconfig';
import { load } from 'dotenv/types';
import SnsService from '../../../../../../services/sns_service';

const config: IConfigEnv = CONFIG[process.env.NODE_ENV || 'production'];

export default class CivilProducer extends AbstractProducer {
    browserPages = {
        generalInfoPage: undefined as undefined | puppeteer.Page
    };
    urls = {
        generalInfoPage: 'https://crarecords.sonomacounty.ca.gov/selfserviceweb/user/disclaimer'
    }

    xpaths = {
        isPAloaded: '//button[contains(., "I Accept")]'
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


    async launchBrowser(): Promise<puppeteer.Browser> {
        return await puppeteer.launch({
            headless: config.puppeteer_headless,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            ignoreDefaultArgs: ['--disable-extensions'],
            timeout: 60000,
            defaultViewport: null,

        });
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
















    ///////////////////////////////////////////////////////////////////////
    //name separation
    ///////////////////////////////////////////////////////////////////////


    discriminateAndRemove(name: any) {
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
            };
        }
        let cleanName = name.match(removeFromNamesRegex);
        if (cleanName) {
            name = cleanName[1];
        }
        return {
            type: 'person',
            name: name
        };
    }

    parseOwnerName(name_str: string): any[] {
        const result: any = {};

        // owner name
        let owner_full_name = name_str;
        let owner_first_name = '';
        let owner_last_name = '';
        let owner_middle_name = '';

        const owner_class_name = this.discriminateAndRemove(owner_full_name);
        if (owner_class_name.type === 'person') {
            const owner_temp_name = parseFullName(owner_class_name.name);
            owner_first_name = owner_temp_name.first ? owner_temp_name.first : '';
            owner_last_name = owner_temp_name.last ? owner_temp_name.last : '';
            owner_middle_name = owner_temp_name.middle ? owner_temp_name.middle : '';
        }

        result['full_name'] = owner_full_name;
        result['first_name'] = owner_first_name;
        result['last_name'] = owner_last_name;
        result['middle_name'] = owner_middle_name;
        result['suffix'] = this.getSuffix(owner_full_name);
        return result;
    }


    getSuffix(name: any) {
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


    ///////////////////////////////////////////////////////////////////////
    //format the date
    ///////////////////////////////////////////////////////////////////////
    getFormattedDate(date: Date) {
        let year = date.getFullYear();
        let month = (1 + date.getMonth()).toString().padStart(2, '0');
        let day = date.getDate().toString().padStart(2, '0');

        return month + '/' + day + '/' + year;
    }

    ///////////////////////////////////////////////////////////////////////
    // To Save record      
    ///////////////////////////////////////////////////////////////////////

    /////////////////////////////////////////////////////////////////////////////////////////////////////////
    //date helpers : 
    //addDays will add number of days to a date
    //getDatesBetween will return an array of the days between two dates
    /////////////////////////////////////////////////////////////////////////////////////////////////////////
    addDays(date: Date, days: number) {
        var result = new Date(date);
        result.setDate(result.getDate() + days);
        return result;
    }
    getDatesBetween(startDate: Date, stopDate: Date) {
        var dateArray = new Array();
        var currentDate = startDate;
        while (currentDate <= stopDate) {
            dateArray.push(currentDate)
            currentDate = this.addDays(currentDate, 1);

        }
        return dateArray;
    }

    // To check empty or space
    isEmptyOrSpaces(str: string) {
        return str === null || str.match(/^\s*$/) !== null;
    }

    ///////////////////////////////////////////////////////////////////////
    // parse And Save      
    ///////////////////////////////////////////////////////////////////////
    async parseAndSave(): Promise<boolean> {
        let countRecords = 0;
        try {
            const civilUrl: string = 'https://crarecords.sonomacounty.ca.gov/selfserviceweb/user/disclaimer';
            let dateRange = await this.getDateRange('California', 'Sonoma');
            let fromDate = dateRange.from;
            let toDate = dateRange.to;
            let page = this.browserPages.generalInfoPage!;

            while (fromDate <= toDate) {
                let dateStringDay = this.getFormattedDate(fromDate);
                await page.goto(civilUrl, { timeout: 600000 });
                await page.waitForXPath('//button[@id="submitDisclaimerAccept"]', { visible: true });
                let isAccepted = await page.$x('//button[@id="submitDisclaimerAccept"]');
                await isAccepted[0].click();

                await page.waitForXPath('//a[@class="ss-action ss-action-form ss-utility-box ss-action-page-search ui-link"][1]', { visible: true });
                let SearchByOfficial = await page.$x('//a[@class="ss-action ss-action-form ss-utility-box ss-action-page-search ui-link"][1]');
                await SearchByOfficial[0].click();
                await page.waitForXPath('//a[contains(.,"Search Official Public Records - Web")]', { visible: true });
                let SearchByDocument = await page.$x('//a[contains(.,"Search Official Public Records - Web")]');
                await SearchByDocument[0].click();

                await page.waitForXPath('//a[@id="searchButton"]', { visible: true });
                let SearchButton = await page.$x('//a[@id="searchButton"]');
                await page.type('input#field_RecordingDateID_DOT_StartDate', dateStringDay);
                await page.type('input#field_RecordingDateID_DOT_EndDate', dateStringDay);
                let documentTypes = ['DEED', 'LIEN', 'MORTGAGE', 'MARRIAGE', 'PENDENS', 'JUDGMENT', 'JUDGEMENT', 'PROBATE'];
                let inputText = await page.$x('//input[@id="field_selfservice_documentTypes"]');
                inputText[0].click();
                await page.waitForXPath('//ul[@id="field_selfservice_documentTypes-aclist"]//li[contains(text(),"DEED")]', { visible: true });
                for (let i = 0; i < documentTypes.length; i++) {
                    let text = await page.$x('//ul[@id="field_selfservice_documentTypes-aclist"]//li[contains(text(),"' + documentTypes[i] + '")]')
                    for (let j = 0; j < text.length; j++) {
                        let textDocument = await text[j].evaluate(el => el.textContent);
                        // console.log(textDocument);
                        let arrStr = textDocument?.split(' ');
                        fast:
                        for (let k = 0; k < arrStr!.length; k++) {
                            for (let l = 0; l < documentTypes!.length; l++) {
                                if (arrStr![k] == documentTypes[l]) {
                                    await text[j].click();
                                    break fast;
                                }

                            }
                        }

                    }
                    await this.sleep(500);
                }
                await SearchButton[0].click();
                try {
                    await page.waitForXPath('//ul[@class="selfServiceSearchResultList ui-listview ui-listview-inset ui-corner-all ui-shadow"]', { visible: true, timeout: 50000 });
                } catch (err) {
                    fromDate.setDate(fromDate.getDate() + 1);
                    continue;
                }
                let pageOf = await page.$x('//div[@class="selfServiceSearchResultHeaderLeft"][2]/text()');
                let noPage = await pageOf[0].evaluate(el => el.textContent?.trim().split(/\s+/));
                let pageFrom = parseInt(noPage![2]);
                let pageTo = parseInt(noPage![4]);
                for (let h = pageFrom; h <= pageTo; h++) {
                    await page.waitForXPath('//div[contains(.,"Showing page ' + h + '")]', { visible: true, timeout: 50000 });

                    let populateUniqueID = await page.$x('//div[@class="selfServiceSearchRowRight"]//h1//text()');
                    for (let i = 0; i < populateUniqueID.length; i++) {
                        let uniqueId = await populateUniqueID[i].evaluate(el => el.textContent?.trim().split(/\s+/));
                        let names = [];
                        let caseUniqueId = uniqueId![0];
                        let grantorNameShow = await page.$x('//ul[contains(@class,"selfServiceSearchResultList")]/li[' + (i + 1) + ']//li[@class="selfServiceSearchResultCollapsed"]/b');
                        let granteNameShow = await page.$x('//ul[contains(@class,"selfServiceSearchResultList")]/li[' + (i + 1) + ']//li[@class="selfServiceSearchResultCollapsed"]/b');
                        let dateRow = await grantorNameShow[0].evaluate(el => el.textContent);
                        let recordDate = dateRow!.split(' ')[0]
                        try {
                            let grantorName = await grantorNameShow[1].evaluate(el => el.textContent);
                            names.push(grantorName);
                        } catch (err) {

                        }
                        try {
                            let granteName = await granteNameShow[2].evaluate(el => el.textContent);
                            names.push(granteName);
                        } catch (err) {

                        }

                        let grantorAndGratorNameHide = await page.$x('//ul[contains(@class,"selfServiceSearchResultList")]/li[' + (i + 1) + ']//li[@class="selfServiceSearchFullResult"]/b');

                        if (grantorAndGratorNameHide.length > 0) {
                            for (let j = 0; j < grantorAndGratorNameHide.length; j++) {
                                let grantorOrGranteNameHide = await grantorAndGratorNameHide[j].evaluate(el => el.textContent);
                                names.push(grantorOrGranteNameHide);

                            }
                        }
                        let docType = '';
                        for (let j = 2; j < uniqueId!.length; j++) {
                            docType += j == uniqueId!.length - 1 ? uniqueId![j] + '' : uniqueId![j] + ' ';
                        }

                        let practiceType = this.getPracticeType(docType)

                        for (let name of names) {
                            name = name!.replace(/\(PERS REP\)/, '');
                            if (name == '...' || name == '' || name == 'N\A' || this.isEmptyOrSpaces(name)) {
                                continue;
                            }

                            const productName = `/ca/sonoma/${practiceType}`;
                            const prod = await db.models.Product.findOne({ name: productName }).exec();
                            const parseName: any = this.newParseName(name.trim());
                            if (parseName.type && parseName.type == 'COMPANY') {
                                continue
                            }
                            const data = {
                                'caseUniqueId': caseUniqueId,
                                'Property State': 'CA',
                                'County': 'Sonoma',
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

                    if (h != pageTo) {
                        let nextButton = await page.$x('//a[contains(.,"Next")]');
                        nextButton[0].click();
                    }
                }
                fromDate.setDate(fromDate.getDate() + 1);
            }

            await AbstractProducer.sendMessage('Sonoma', 'California', countRecords, 'Civil & Lien');
            return true;
        } catch (err) {
            console.log('Error!')
            await AbstractProducer.sendMessage('Sonoma', 'California', countRecords, 'Civil & Lien');
            return false
        }



    }





}