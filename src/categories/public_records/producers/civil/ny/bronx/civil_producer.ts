import puppeteer from 'puppeteer';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import db from '../../../../../../models/db';
import SnsService from '../../../../../../services/sns_service';

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
        generalInfoPage: 'https://a836-acris.nyc.gov/CP/'
    }

    xpaths = {
        isPageLoaded: '//font[text()="Search Property Records"]'
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
            await this.browserPages.generalInfoPage.setDefaultNavigationTimeout(60000);
            await this.browserPages.generalInfoPage.goto(this.urls.generalInfoPage, {waitUntil: 'load'});
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

    async getDateRangeString(date: any, today: any): Promise<any> {        
        const day = ("00" + (date.getDate())).slice(-2);
        const month = ("00" + (date.getMonth() + 1)).slice(-2);
        const year =  date.getFullYear();

        const day1 = ("00" + (today.getDate())).slice(-2);
        const month1 = ("00" + (today.getMonth() + 1)).slice(-2);
        const year1 =  today.getFullYear();

        return { from: {day: day, month: month, year: year}, to: {day: day1, month: month1, year: year1} };
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let countRecords = 0;
        try {

            try {
                const [searchRecordHandle] = await page.$x('//font[text()="Search Property Records"]/parent::font/parent::div/parent::td/parent::tr');
                await searchRecordHandle.click();
                await page.waitForNavigation();
            } catch (error) {
                console.log(error);
                await AbstractProducer.sendMessage('Bronx', 'New York', countRecords, 'Civil & Lien');
                return false;
            }

            try {
                const [docTypeHandle] = await page.$x('//td[contains(@onclick, "DocumentType")]/parent::tr');
                await docTypeHandle.click();
                await page.waitForNavigation();
            } catch (error) {
                console.log(error);
                await AbstractProducer.sendMessage('Bronx', 'New York', countRecords, 'Civil & Lien');
                return false;
            }

            const dateRange = await this.getDateRange('New York', 'Bronx');
            let dateRangeStr = await this.getDateRangeString(dateRange.from, dateRange.to);
            let docTypeSelects = [
                `AMTX`, `AGMT`, `AIRRIGHT`, `ADEC`, `AMFL`, `AMTL`, `APPRT`,
                `XXXX`, `AALR`, `ACON`, `ASSTO`, `AL&R`, `ATL`, `ASST`, `ASPM`,
                `BOND`, `RPTT&RET`, `CALR`, `NAFTL`, `CERT`, `CERR`, `WILL`, `CMTG`, `CODP`,
                `CDEC`, `CONDEED`, `CONS`, `CNFL`, `CNTR`, `DEED COR`, `CORR, LE`, `CORRD`, `CORR`,
                `CORRM`, `CTOR`, `DCTO`, `DECL`, `SCDEC`, `DECM`, `DEMM`, `DEED`,
                `DEED, RC`, `DEEDO`, `DEEDP`, `DEVR`, `DPFTL`, `DTL`, `EASE`, `ESRM`,
                `ESTL`, `FTL`, `FL`, `IDED`, `INIC`, `INIT`, `JUDG`, `LDMK`, `LEAS`,
                `LTPA`, `LIC`, `LOCC`, `DEED, LE`, `MAPS`, `MMTG`, `MCON`, `MLEA`,
                `MERG`, `MISC`, `MTGE`, `M&CON`, `SPRD`, `NTXL`, `NAPP`, `RPTT`,
                `RETT`, `PRFL`, `PREL`, `PRCFL`, `PSAT`, `PWFL`, `PAT`, `REIT`,
                `REL`, `RTXL`, `RFL`, `RFTL`, `RESO`, `RCRFL`, `RPAT`, `SAT`, `SI CORR`,
                `STP`, `SUBL`, `SUBM`, `SAGE`, `SMIS`, `SMTG`, `TLS`, `TOLCC`, `TERDECL`,
                `TERA`, `TL&R`, `TERL`, `TERT`, `DEED, TS`, `TORREN`, `CORP`,
                `UCC ADEN`, `AMND`, `ASGN`, `ASUM`, `BRUP`, `CONT`, `PSGN`, `RLSE`,
                `SUBO`, `TERM`, `UCC1`, `UCC3`, `ASTU`, `VAC`, `WFL`, `WSAT`, `ZONE`
            ];
            for (const docTypeSelect of docTypeSelects) {
                // setting doc type
                await page.waitForSelector('select[name="combox_doc_doctype"]', {visible: true});
                await page.select('select[name="combox_doc_doctype"]', docTypeSelect);
                
                // setting county
                await page.select('select[name="borough"]', '2');

                // setting date range
                await page.select('select[name="cmb_date"]', 'DR');
                const [fromm] = await page.$x('//input[@name="edt_fromm"]');
                await fromm.click({ clickCount: 3 });
                await fromm.press('Backspace');
                await fromm.type(dateRangeStr.from.month, { delay: 150 });
                const [fromd] = await page.$x('//input[@name="edt_fromd"]');
                await fromd.click({ clickCount: 3 });
                await fromd.press('Backspace');
                await fromd.type(dateRangeStr.from.day, { delay: 150 });
                const [fromy] = await page.$x('//input[@name="edt_fromy"]');
                await fromy.click({ clickCount: 3 });
                await fromy.press('Backspace');
                await fromy.type(dateRangeStr.from.year.toString(), { delay: 150 });
                const [tom] = await page.$x('//input[@name="edt_tom"]');
                await tom.click({clickCount: 3});
                await tom.press('Backspace');
                await tom.type(dateRangeStr.to.month, {delay: 150});
                const [tod] = await page.$x('//input[@name="edt_tod"]');
                await tod.click({clickCount: 3});
                await tod.press('Backspace');
                await tod.type(dateRangeStr.to.day, {delay: 150});
                const [toy] = await page.$x('//input[@name="edt_toy"]');
                await toy.click({clickCount: 3});
                await toy.press('Backspace');
                await toy.type(dateRangeStr.to.year.toString(), {delay: 150});

                // click search button
                const [searchBtnHandle] = await page.$x('//input[@name="Submit2"]');
                await searchBtnHandle.click();
                await page.waitForNavigation();

                // getting data
                await page.waitForXPath('//form[@name="DATA"]/table/tbody/tr[1]/td/font');
                const resultHandle = await page.$x('//form[@name="DATA"]/table/tbody/tr[1]/td/font');
                const resultText = await resultHandle[0].evaluate(el => el.textContent?.trim());
                if (resultText?.includes('No Records Found')) {
                    console.log('No Records Found')
                } else {
                    let pageNum = 1;
                    let isLast = false;

                    await page.waitForXPath('//b[contains(text(), "Current Search")]/parent::i/parent::font/parent::td');
                    const [typeHandle] = await page.$x('//b[contains(text(), "Current Search")]/parent::i/parent::font/parent::td/font[2]');
                    let type = await typeHandle.evaluate(el => el.innerHTML);
                    type = type?.split('<br>')[0].split('</b>')[1].replace(/(?:&nbsp;)/g, '').replace(':', '').trim();
                    console.log(type);
                    while (!isLast) {
                        const results = await page.$x('//form[@name="DATA"]/table/tbody/tr[2]/td/table/tbody/tr');
                        for (let i = 1; i < results.length; i++) {
                            const element = results[i];
                            let caseID = await element.evaluate(el => el.children[4].children[0].children[0].textContent?.trim());
                            let date = await element.evaluate(el => el.children[8].children[0].children[0].textContent?.trim());
                            date = date?.split(' ')[0].trim();
                            let name = await element.evaluate(el => el.children[10].children[0].children[0].textContent?.trim()); 

                            if (this.isEmptyOrSpaces(name!)) {
                                continue;
                            }
                            if (removeRowRegex.test(name!)) {
                                continue;
                            }
                            const parserName: any = this.newParseName(name!);
                            if(parserName.type && parserName.type == 'COMPANY'){
                                continue;
                            }
                            if (await this.getData(page, name!.trim(), type, date, caseID)) {
                                countRecords++
                            }  
                        }  
                        
                        await page.waitForXPath('//font[text()="next"]');
                        const nextButtonHandle = await page.$x('//font[text()="next"]/parent::a/parent::u');
                        if (nextButtonHandle.length > 0) {
                            pageNum++;
                            isLast = false;
                            await nextButtonHandle[0].click();
                            await page.waitForNavigation();
                        } else {
                            isLast = true;
                        }
                    }
                }

                const [newSearchHandle] = await page.$x('//input[@name="Submit2"]');
                await newSearchHandle.click();
                await page.waitForNavigation();
            }

            await AbstractProducer.sendMessage('Bronx', 'New York', countRecords, 'Civil & Lien');
            await page.close();
            await this.browser?.close();
            return true;
        }
        catch (error) {
            console.log('Error: ', error);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Bronx', 'New York', countRecords, 'Civil & Lien', errorImage);
        }

        return false;
    }

    async getData(page: puppeteer.Page, name: any, type: any, date: any, caseID: any): Promise<any> {
        const { firstName, lastName, middleName, fullName, suffix } = this.newParseName(name!);
        let practiceType = this.getPracticeType(type);
        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({ name: productName }).exec();

        const data = {
            'caseUniqueId': caseID,
            'Property State': 'NY',
            'County': 'Bronx',
            'First Name': firstName,
            'Last Name': lastName,
            'Middle Name': middleName,
            'Name Suffix': suffix,
            'Full Name': fullName,
            "vacancyProcessed": false,
            fillingDate: date,
            'productId': prod._id,
            originalDocType: type
        };

        return (await this.civilAndLienSaveToNewSchema(data));
    }
     // To check empty or space
    isEmptyOrSpaces(str: string) {
        return str === null || str.match(/^\s*$/) !== null;
    }
}