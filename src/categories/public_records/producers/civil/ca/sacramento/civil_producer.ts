import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import { IProduct } from '../../../../../../models/product';

const typeSearch = ['Civil', 'Family', 'Probate']

const removeRowArray = [
    'CITY', 'DEPT', 'CTY', 'UNITED STATES', 'BANK', 'FIA CARD SERVICES NA',
    'FLORIDA PACE FUNDING AGENCY', 'COUNTY', 'CREDIT', 'HOSPITAL', 'FUNDING', 'UNIVERSITY',
    'MEDICAL', 'CONDOMINIUM ASSOCIATION', 'Does', 'In Official Capacity', 'Judge', 'All persons unknown',
    'as Trustees', 'Medical', 'School', 'Management', 'The People', 'US Currency', 'as Trustee', 'Services Foundation',
    'Department', 'U.S. Currency'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')

export default class CivilProducer extends AbstractProducer {

    urls = {
        generalInfoPage: 'https://services.saccourt.ca.gov/PublicCaseAccess/Civil/SearchByFilingDate'
    };

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
            await this.browserPages.generalInfoPage?.waitForXPath('//input[@id="FilingDateBegin"]');
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    async getProductId(docType: string) {
        
        switch (docType) {
            case 'Harassment':
                return await db.models.Product.findOne({ name: `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/personal-injury` }).exec();
            case 'PI/PD/WD - Other':
                return await db.models.Product.findOne({ name: `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/personal-injury` }).exec();
            case 'PI/PD/WD - Auto':
                return await db.models.Product.findOne({ name: `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/personal-injury` }).exec();
            case 'Rule 3.740 Collections':
                return await db.models.Product.findOne({ name: `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/debt` }).exec();
            default:
                return await db.models.Product.findOne({ name: `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/other-civil` }).exec();
        }
    }

    async getData(page: puppeteer.Page, typeSearch: string) {
        let count = 0;
        try {
            await page.waitForNavigation({ waitUntil: 'networkidle0' })
            const [noResult] = await page.$x('//*[contains(text(),"No Records Found.")]')
            if (!!noResult) return count;
            await page.waitForXPath('//h2[contains(text(),"Search Results")]/following-sibling::table/tbody/tr[1]')
            const countRow = (await page.$x('//h2[contains(text(),"Search Results")]/following-sibling::table/tbody/tr')).length
            for (let i = 0; i < countRow; i++) {
                await page.waitForXPath('//h2[contains(text(),"Search Results")]/following-sibling::table/tbody/tr[1]')
                const [fillingDateElem] = await page.$x(`//h2[contains(text(),"Search Results")]/following-sibling::table/tbody/tr[${i + 1}]/td[4]`);
                const fillingDate = await page.evaluate(element => element.textContent, fillingDateElem)
                const [caseTypeElem] = await page.$x(`//h2[contains(text(),"Search Results")]/following-sibling::table/tbody/tr[${i + 1}]/td[5]`);
                const caseType = await page.evaluate(element => element.textContent, caseTypeElem)
                const [openDetails] = await page.$x(`//h2[contains(text(),"Search Results")]/following-sibling::table/tbody/tr[${i + 1}]/td[1]/form/button`)
                await openDetails.click();
                await page.waitForSelector('#participant-accordion');
                const respondents = await page.$x('//*[@id="participant-accordion"]//table/tbody/tr/td[not(contains(text(),"Petitioner")) and not(contains(text(),"Decedent"))]/preceding-sibling::td[1]')
                if (respondents && respondents.length != 0) {
                    for (let j = 0; j < respondents.length; j++) {
                        let name = await page.evaluate(element => element.textContent, respondents[j])
                        if (removeRowRegex.test(name)) continue;
                        name = name.replace(/,\s+a\s+.*/i, '');
                        name = name.replace(/\(.*$/)
                        name = name.replace(/14k/i, '')
                        const parseName: any = this.newParseName(name!.trim());
                        if (parseName.type && parseName.type == 'COMPANY') {
                            continue
                        }

                        const product: IProduct = await this.getProductId(caseType);
                        let practiceType = await this.getPracticeType(caseType);
                        const data = {
                            'Property State': 'CA',
                            'County': 'Sacramento',
                            'First Name': parseName.firstName,
                            'Last Name': parseName.lastName,
                            'Middle Name': parseName.middleName,
                            'Name Suffix': parseName.suffix,
                            'Full Name': parseName.fullName,
                            "vacancyProcessed": false,
                            practiceType: typeSearch == 'Probate' ? 'probate' : practiceType,
                            fillingDate: fillingDate,
                            productId: product._id,
                            originalDocType: caseType
                        };
                        if (await this.civilAndLienSaveToNewSchema(data))
                            count++
                    }
                    await page.goBack();
                } else {
                    await page.goBack();
                }
            }
        } catch (e) {
        }
        return count
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let countRecords = 0
        try {
            let dateRange = await this.getDateRange('California', 'Sacramento');
            let date = dateRange.from;
            let today = dateRange.to;
            let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24)) - 1;
            for (let i = days < 0 ? 1 : days; i >= 0; i--) {
                for (let j = 0; j < typeSearch.length; j++) {
                    await page.goto(`https://services.saccourt.ca.gov/PublicCaseAccess/${typeSearch[j]}/SearchByFilingDate?FilingDateBegin=&FilingDateEnd=`)
                    try {
                        let dateSearch = new Date();
                        dateSearch.setDate(dateSearch.getDate() - i);
                        console.log('Start search with date: ', dateSearch.toLocaleDateString('en-US'), '. Type', typeSearch[j])
                        await page.evaluate(_ => {
                            window.scroll(0, 0);
                        });
                        await page.waitForSelector('#FilingDateBegin')
                        await page.type('#FilingDateBegin', dateSearch.toLocaleDateString('en-US'), { delay: 100 });
                        await page.evaluate(_ => {
                            window.scroll(0, 0);
                        });
                        await page.type('#FilingDateEnd', dateSearch.toLocaleDateString('en-US'), { delay: 100 });
                        await page.evaluate(_ => {
                            window.scroll(0, 0);
                        });
                        const [searchClick] = await page.$x('//*[@name="SearchButton" and @type="submit"]')
                        await searchClick.click();
                        const count = await this.getData(page, typeSearch[j]);
                        countRecords += count;
                        console.log(`${dateSearch.toLocaleDateString('en-US')} found ${count} records.(${typeSearch[j]})`);
                    } catch (e) {
                    }
                }
            }
        } catch (e) {
            console.log(e)
            console.log('Error search');
            await AbstractProducer.sendMessage('Sacramento', 'California', countRecords, 'Civil');
            return false
        }

        await AbstractProducer.sendMessage('Sacramento', 'California', countRecords, 'Civil');

        return true;
    }
}
