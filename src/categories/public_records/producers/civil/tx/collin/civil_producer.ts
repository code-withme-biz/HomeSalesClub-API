import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import SnsService from '../../../../../../services/sns_service';

export default class CivilProducer extends AbstractProducer {
    browser: puppeteer.Browser | undefined;
    browserPages = {
        generalInfoPage: undefined as undefined | puppeteer.Page
    };
    urls = {
        generalInfoPage: 'https://cijspub.co.collin.tx.us/default.aspx'
    }

    xpaths = {
        isPAloaded: '//*[contains(@class, "LaunchProductTitle")]'
    }

    constructor(publicRecordProducer: IPublicRecordProducer) {
        // @ts-ignore
        super();
        this.publicRecordProducer = publicRecordProducer;
        this.stateToCrawl = this.publicRecordProducer?.state || '';
    }
    
    normalizeNames = (namesArray: string[]) => {
        const ignoreNamesArray = ['states?', 'any\\s*and\\s*all', 'collin\\s*central\\s*appraisal', 'internal\\s*revenue\\s*service'];
        const removeFromNamesArray = ['\\s{2,}', 'and\\s*all\\s*other', 'doing\\s*business\\s*as', 'd/?b/?a', '(?:also|formerly)\\s*known\\s*as', 'a/?k/?a', 'f/?k/?a', 'n/?k/?a'];
        const companyIdentifiersArray = [ 'GENERAL', 'TRUSTEE', 'TRUSTEES', 'INC', 'ORGANIZATION', 'CORP\\.?', 'CORPORATION', 'L\\.?L\\.?C\\.?', 'MOTORS', 'BANK', 'UNITED', 'CO', 'COMPANY', 'FEDERAL', 'MUTUAL', 'ASSOC', 'AGENCY' , 'OF' , 'SECRETARY' , 'DEVELOPMENT' , 'INVESTMENTS', 'HOLDINGS', 'ESTATE', 'LLP', 'LP', 'TRUST', 'LOAN', 'CONDOMINIUM', 'CHURCH', 'CITY', 'CATHOLIC', 'D/B/A', 'COCA COLA', 'LTD', 'CLINIC', 'TODAY', 'PAY', 'CLEANING', 'COSMETIC', 'CLEANERS', 'FURNITURE', 'DECOR', 'FRIDAY HOMES', 'SAVINGS', 'PROPERTY', 'PROTECTION', 'ASSET', 'SERVICES', 'L L C', 'NATIONAL', 'ASSOCIATION', 'MANAGEMENT', 'PARAGON', 'MORTGAGE', 'CHOICE', 'PROPERTIES', 'J T C', 'RESIDENTIAL', 'OPPORTUNITIES', 'FUND', 'LEGACY', 'SERIES', 'HOMES', 'LOAN'];
        const suffixArray = ['ii\\.?', 'iii\\.?', 'iv\\.?', 'jr\\.?', 'sr\\.?', 'esq\\.?'];
    
        const ignoreNamesRegexString = `\\b(?:${ignoreNamesArray.join('|')})\\b`;
        const companyRegexString = `\\b(?:${companyIdentifiersArray.join('|')})\\b`;
        const removeFromNamesRegexString = `^(.*?)\\b(?:${removeFromNamesArray.join('|')})\\b.*?$`;
        const suffixRegexString = `\\b(?:${companyIdentifiersArray.join('|')})\\b`;
    
        const ignoreNamesRegex = new RegExp(ignoreNamesRegexString, 'i');
        const companyRegex = new RegExp(companyRegexString, 'i');
        const removeFromNamesRegex = new RegExp(removeFromNamesRegexString, 'i');
    
        let normalizedNamesArray = [];
        for (let initialName of namesArray) {
            if (ignoreNamesRegex.test(initialName)) {
                continue;
            }
    
            let fullName = initialName;
            let removeFromName = fullName.match(removeFromNamesRegex);
            if (removeFromName) fullName = removeFromName[1].trim();
    
            if (!fullName.trim()) {
                continue;
            }

            if (fullName.toLowerCase().includes('unknown') || fullName.toLowerCase().includes('occupant(s)')) {
                continue;
            }
    
            if (companyRegex.test(fullName)) {
                normalizedNamesArray.push({
                    'Full Name': fullName,
                });
            } else {
    
                let firstName = '';
                let lastName = '';
                let middleName = '';
                let nameSuffix = '';
    
                let normalizedName = fullName.match(/^(.*?),\s+([^\s]+?)(?:\s+(.+?)?(?:,\s+(.*?))?$|$)/i);
                if (normalizedName) {
                    lastName = normalizedName[1].replace(/\.|>/g, '').trim();
                    firstName = normalizedName[2].replace(/\.|>/g, '').trim();
                    if (normalizedName[3]) {
                        middleName = normalizedName[3].replace(/\.|>/g, '').trim();
                    }
                    if (normalizedName[4]) {
                        nameSuffix = normalizedName[4].replace(/\.|>/g, '').trim();
                    }
                }
    
                let nameObj: any = {};
                fullName = fullName.replace(/\.|>/g, '').trim();
                nameObj['Full Name'] = fullName;
                if (firstName) {
                    nameObj['First Name'] = firstName;
                }
                if (lastName) {
                    nameObj['Last Name'] = lastName;
                }
                if (middleName) {
                    nameObj['Middle Name'] = middleName;
                }
                if (nameSuffix) {
                    nameObj['Name Suffix'] = nameSuffix;
                }
    
                normalizedNamesArray.push(nameObj);
            }
        }
    
        return normalizedNamesArray;
    }
    
    getNamesInCase = async (page: puppeteer.Page, caseType: string) => {
        let xpath = '';
    
        if (/probate/i.test(caseType)) {
            //probate cases
            if (/guardianship/i.test(caseType)) {
                xpath = '//*[contains(@id, "PIr0")][contains(.//text(), "Guardian")]/following-sibling::*[contains(@id, "PIr1")]';
            } else {
                xpath = '//*[contains(@id, "PIr0")][contains(.//text(), "Applicant")]/following-sibling::*[contains(@id, "PIr1")]';
            }
        } else {
            //civil cases
            if (/(?:divorce|family)/i.test(caseType)) {
                xpath = '//*[contains(@id, "PIr0")][contains(.//text(), "Petitioner") or contains(.//text(), "Respondent")]/following-sibling::*[contains(@id, "PIr1")]';
            } else {
                xpath = '//*[contains(@id, "PIr0")][contains(.//text(), "Defendant")]/following-sibling::*[contains(@id, "PIr1")]';
            }
        }
    
        let allNames = [];
        let nameHandles = await page.$x(xpath);
        for (let nameHandle of nameHandles) {
            let name = await nameHandle.evaluate( (el: any) => el.innerText);
    
            if (name.trim()) {
                allNames.push(name);
            }
        }
    
        return allNames;
    }
        
    parseCivilPage = async (page: puppeteer.Page, type: string, dateStrings: any) => {
    
        let filingDateXpath = './td[4]/div[1]';
        let caseTypeXpath = './td[5]/div[1]'
        if (type == 'probate') {
            filingDateXpath = './td[3]/div[1]';
            caseTypeXpath = './td[4]/div[1]';
        }
    
        const browser = page.browser();
        let pageUrl = page.url();

        let newDocs = 0;
    
        let currDateSearch = new Date(dateStrings.from);
        while (currDateSearch <= new Date(dateStrings.to)) {
            const dateFiledHandle = await page.$x('//input[@type="radio"][@labelvalue="Date Filed"]');
            await dateFiledHandle[0].click();
            await page.waitFor(1500);
    
            let currDateSearchString = currDateSearch.toLocaleDateString('en-US');
    
            let fromDateHandle = await page.$x('//input[@id="DateFiledOnAfter"]');
            let dateToHandle = await page.$x('//input[@id="DateFiledOnBefore"]');
            let submitHandle = await page.$x('//*[@id="SearchSubmit"]')
    
            await fromDateHandle[0].click();
            await fromDateHandle[0].type(currDateSearchString);
            await dateToHandle[0].click();
            await dateToHandle[0].type(currDateSearchString);
    
            await Promise.all([
                submitHandle[0].click(),
                page.waitForNavigation({ waitUntil: 'load' })
            ]);
    
            let allResultHandles = await page.$x('//tr[contains(./td/a/@href, "CaseDetail.aspx")]');
            for (let resHandle of allResultHandles) {
    
                let caseUrlHandle = await resHandle.$x('./td/a[contains(@href, "CaseDetail.aspx")]');
                let caseUrl = await caseUrlHandle[0].evaluate((el: any) => el.href);
    
                let filingDate = await resHandle.$x(filingDateXpath);
                let caseType = await resHandle.$x(caseTypeXpath);

                let filingDateString = await filingDate[0].evaluate((el: any) => el.innerText)
    
                let caseTypeString = await caseType[0].evaluate((el: any) => el.innerText)
    
                // skip unwanted case types
                if (/probate/i.test(caseTypeString) && /other\s*cases/i.test(caseTypeString) ||
                    /(?:civil\s*transfer|worker's|tow\s*hearing|motor\s*vehicle|license|seizure|small\s*claims|habeas\s*corpus|name\s*change|parent\s*child|iv\-d|protective\s*order|NISI|paternity|CSRP)/i.test(caseTypeString)) {
                    continue;
                }
    
                let productName = this.getPracticeType(caseTypeString);
                if (!productName) {
                    continue;
                }
                productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/` + productName;
    
                let tryNo = 0;
                while (tryNo < 5) {
                    let casePage = await browser.newPage();
                    await this.setParamsForPage(casePage);

                    try {
                        await casePage.goto(caseUrl, { waitUntil: 'load' });
    
                        let names = await this.getNamesInCase(casePage, caseTypeString);
    
                        let normalizedNames = this.normalizeNames(names);
                        for (let normalizedName of normalizedNames) {

                            //add to db here

                            let prodId = await db.models.Product.findOne({name: productName});
                            if (prodId) {
                                normalizedName['County'] = 'Collin';
                                normalizedName['Property State'] = 'TX';
                                normalizedName['practiceType'] = productName;
                                normalizedName['productId'] = prodId._id;
                                normalizedName['fillingDate'] = filingDateString;
                                normalizedName['Property Address'] = '';
                                normalizedName['originalDocType'] = caseTypeString;

                                const docSaved = await this.civilAndLienSaveToNewSchema(normalizedName);
                                if (docSaved) {
                                    newDocs++;
                                }
                            } else {
                                console.warn('no product _id found for ' + productName);
                            }
                        }
                        await casePage.close();
                        break;
                    } catch (err) {
                        tryNo++;
                        await casePage.waitFor(1500 * tryNo);
    
                        if (tryNo < 4) {
                            await casePage.close();
                        }
                    }
                }
    
            }
    
            await page.waitFor(1500);
            currDateSearch = new Date(currDateSearch.setDate(currDateSearch.getDate() + 1));
    
            if (currDateSearch <= new Date(dateStrings.to)) {
                await page.goto(pageUrl, { waitUntil: 'load' });
            }
        }

        return newDocs;
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

    async parseAndSave(): Promise<boolean> {
        let totalCount = 0;
        try{
            const page = this.browserPages.generalInfoPage as puppeteer.Page;

            let dates = await this.getDateRange('Texas', 'Collin');

            const probatePageHandle = await page.$x('//a[contains(.//text(), "Probate")][contains(.//text(), "Records")]');
            if (probatePageHandle.length) {
                await Promise.all([
                    page.waitForNavigation({ waitUntil: 'load' }),
                    probatePageHandle[0].click()
                ]);
        
                totalCount += await this.parseCivilPage(page, 'probate', dates);
                await page.goto(this.urls.generalInfoPage, { waitUntil: 'load' });
            } else {
                console.warn('Probate handle not found, script likely needs updating');
            }
        
            const civilPageHandle = await page.$x('//a[contains(.//text(), "Civil")][contains(.//text(), "Records")]');
            if (civilPageHandle.length) {
                await Promise.all([
                    page.waitForNavigation({ waitUntil: 'load' }),
                    civilPageHandle[0].click()
                ]);
        
                totalCount += await this.parseCivilPage(page, 'civil', dates);
                await page.goto(this.urls.generalInfoPage, { waitUntil: 'load' });
            } else {
                console.warn('Civil handle not found, script likely needs updating');
            }
        
            await this.browser?.close();
        
            await AbstractProducer.sendMessage('Collin', 'Texas', totalCount, 'Civil');

            return true;
        } catch(e){
            console.log(e);
            await AbstractProducer.sendMessage('Collin', 'Texas', totalCount, 'Civil');
            return false;
        }
    }
}