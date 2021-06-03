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
    'CU', 'BK', 'UN', 'PA', 'DOLLAR', 'ASSN', 'REVOLUTION', 'COMMUNITY', 'PLACE', 'SPECTRUM',
    'BAR OF CALIFORNIA', 'COMPENSATION', 'STATE', 'TARGET', 'CAPISTRANO', 'UNIFIED', 'CENTER', 'WEST',
    'MASSAGE', 'INTERINSURANCE', 'PARTNERS', 'COLLECTIONS', 'N A', 'OFFICE', 'HUMAN', 'FAMILY',
    'INTERBANK', 'BBVA', 'HEIRS', 'EECU', 'BBVA', 'FIRSTBANK', 'GROUP', 'INTERBANK', 'GRANTEE', 'SCHOOL', 'DELETE', 'LIVING', 
    'LOANDEPOTCOM', 'JOINT', 'TEXASLENDINGCOM', 'FINANCIAL', 'PRIMELENDING', 'BOKF', 'USAA', 'IBERIABANK',
    'DBA', 'GOODMORTGAGECOM', 'BENEFICIARY', 'HOMEBUYERS', 'NEXBANK', 'ACCESSBANK', 'PROFIT', 'DATCU',
    'CFBANK', 'CORPORTION', 'LOANDEPOTCOM', 'CAPITAL', 'HOMEBANK', 'FSB', 'FELLOWSHIP', 'ASSOCIATES',
    'ACADEMY', 'VENTURE', 'REVOCABLE', 'CONSTRUCTION', 'HOMETOWN', 'ORANGE', 'CALIFORNIA', 'X',
    'NATIONALBK', 'MICHIGAN', 'FOUNDATION', 'GRAPHICS', 'UNITY', 'NORTHPARK', 'PLAZA', 'FOREST', 'REALTY', 
    'OUTDOORSOLUTIONS', 'NEWREZ', 'LOANPAL', 'MICROF', 'GRAPHICS', 'CARRINGTON', 'COLORADO', 'DISTRICT',
    'CLUB', 'GIVEN', 'NONE', 'INIMPENDENT', 'TRUS', 'AND', 'TRUST', 'CLINTON', 'WASHINGTON', 'NATIONWIDE',
    'INVESTMENT', 'INDIANA'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')

export default class CivilProducer extends AbstractProducer {
    urls = {
        generalInfoPage: 'https://acclaim.hcnj.us/AcclaimWeb/Search/Disclaimer?st=/AcclaimWeb/search/SearchTypeDocType'
    }

    xpaths = {
        isPageLoaded: '//input[@id="btnButton"]'
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
        if (page === undefined) return false;
        let countRecords = 0;
        try {       
            try {
                await Promise.all([
                    page.$eval('input#btnButton', el => el.removeAttribute('disable')),
                    page.click('input#btnButton'),
                    page.waitForNavigation()
                ])
            } catch (error) {
                console.error(error);

                return false;
            }

            await page.waitFor(3000);
            const dateRange = await this.getDateRange('New Jersey', 'Hudson');
            const fromDate = this.getFormattedDate(dateRange.from);
            const toDate = this.getFormattedDate(dateRange.to);
            const fromDateHandle = await page.$('input#RecordDateFrom');
            const toDateHandle = await page.$('input#RecordDateTo');

            await fromDateHandle?.click({clickCount: 3});
            await fromDateHandle?.press('Backspace');
            await fromDateHandle?.type(fromDate, {delay: 150});

            await toDateHandle?.click({clickCount: 3});
            await toDateHandle?.press('Backspace');
            await toDateHandle?.type(toDate, {delay: 150});

            try {
                await Promise.all([
                    page.$eval('input#btnSearch', el => el.removeAttribute('disable')),
                    page.click('input#btnSearch'),
                ])
            } catch (error) {
                console.error(error);
                await AbstractProducer.sendMessage('Hudson', 'New Jersey', countRecords, 'Civil & Lien');
                return false;
            }
            await page.waitFor(2000);
            const noResults = await page.$x('//span[text()="No Results to Display"]');
            if (noResults.length > 0) {
                return false;
            }

            await page.waitForXPath(`//div[contains(text(), "Displaying items 1 - ")]`)
            const tableXpath = '//div[@class="t-grid-content"]/table/tbody';
            let pageNum = 1;
            while (true) {
                await page.waitForXPath(`//div[contains(text(), "Displaying items ${(pageNum - 1) * 11 + 1} - ")]`);
                await page.waitForXPath(tableXpath);
                const results = await page.$x(`${tableXpath}/tr`);
                
                for (let i = 0; i < results.length; i++) {
                    const [nameHandle] = await page.$x(`${tableXpath}/tr[${i + 1}]/td[5]`);
                    const [dateHandle] = await page.$x(`${tableXpath}/tr[${i + 1}]/td[3]`);
                    const [typeHandle] = await page.$x(`${tableXpath}/tr[${i + 1}]/td[6]`);

                    const name = await nameHandle.evaluate(el => el.textContent?.trim());
                    const date = await dateHandle.evaluate(el => el.textContent?.trim());
                    const type = await typeHandle.evaluate(el => el.textContent?.trim());
                    if (removeRowRegex.test(name!)) {
                        continue;
                    }
                    if (await this.getData(page, name, type, date))
                        countRecords++;
                }
                pageNum++;
                const nextButtonXpath = '//div[@id="RsltsGrid"]/div[2]/div[2]/a[3]';
                const [nextButtonEL] = await page.$x(nextButtonXpath);
                const nextButtonDisabled = await page.evaluate(el => el.getAttribute('class'), nextButtonEL);
                if (nextButtonDisabled === 't-link t-state-disabled') {
                    break; 
                } else {
                    await nextButtonEL.click();
                }
            }
            await AbstractProducer.sendMessage('Hudson', 'New Jersey', countRecords, 'Civil & Lien');
            console.log(countRecords + ' saved');
            await page.close();
            await this.browser?.close();
            return true;
        }
        catch (error) {
            console.log('Error: ', error);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Hudson', 'New Jersey', countRecords, 'Civil & Lien', errorImage);
        }

        return false;
    }
    
    async getData(page: puppeteer.Page, name: any, type: any, date: any): Promise<any> {
        const full_name = name.replace(/\n/g, ' ').trim();
        const parsedName: any = this.newParseName(full_name);
        if (parsedName.type === 'COMPANY' || parsedName.fullName === '') return false;

        let practiceType = this.getPracticeType(type);
        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({ name: productName }).exec();
        const data = {
            'Property State': 'NJ',
            'County': 'Hudson',
            'First Name': parsedName.firstName,
            'Last Name': parsedName.lastName,
            'Middle Name': parsedName.middleName,
            'Name Suffix': parsedName.suffix,
            'Full Name': parsedName.fullName,
            "vacancyProcessed": false,
            fillingDate: date,
            productId: prod._id,
            originalDocType: type
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }
}