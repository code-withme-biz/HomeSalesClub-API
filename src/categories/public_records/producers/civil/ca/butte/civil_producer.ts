// Created by Pamela<pamela.prasc@gmail.com>

import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import { IProduct } from '../../../../../../models/product';

const removeRowArray = [
    'CITY', 'DEPT', 'CTY', 'UNITED STATES', 'BANK', 'FIA CARD SERVICES NA',
    'FLORIDA PACE FUNDING AGENCY', 'COUNTY', 'CREDIT', 'HOSPITAL', 'FUNDING', 'UNIVERSITY',
    'MEDICAL', 'CONDOMINIUM ASSOCIATION', 'Does', 'In Official Capacity', 'Judge', 'All persons unknown',
    'as Trustees', 'Medical', 'School', 'Management', 'The People', 'US Currency', 'as Trustee', 'Services Foundation',
    'Department', 'BUTTE', 'CALIFORNIA'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')

export default class CivilProducer extends AbstractProducer {


    urls = {
        generalInfoPage: 'https://clerk-recorder.buttecounty.net/riimsweb/asp/ORInquiry.asp'
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
            await this.browserPages.generalInfoPage?.waitForXPath('//input[@name="txtDocumentTypeControl"]');
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    async getData(page: puppeteer.Page) {
        let count = 0;
        try {
            const recordsFound = await page.$x('//*[contains(text(), "Records Found:")]/../..');
            if (recordsFound.length == 0) return count;

            const recordsCount = parseInt((await page.evaluate(element => element.textContent, recordsFound[0])).replace('Records Found:', ''));

            const pageLinks = await page.$x('/html/body/font[1]/following-sibling::a');
            const link_urls = await page.evaluate((...links) => { return links.map(e => e.href); }, ...pageLinks);

            if (recordsCount == 0) return count;

            let linkIndex = 0;

            while (linkIndex <= pageLinks.length) {
                await page.waitForXPath('/html/body/table[3]/tbody/tr[1]')
                const countRow = (await page.$x('/html/body/table[3]/tbody/tr')).length

                for (let i = 1; i < countRow; i++) {
                    const [nameElem] = await page.$x(`/html/body/table[3]/tbody/tr[${i + 1}]/td[1]`);
                    let name = await page.evaluate(element => element.textContent, nameElem)

                    const [fillingDateElem] = await page.$x(`/html/body/table[3]/tbody/tr[${i + 1}]/td[6]`);
                    let fillingDate = await page.evaluate(element => element.textContent, fillingDateElem)

                    const [caseTypeElem] = await page.$x(`/html/body/table[3]/tbody/tr[${i + 1}]/td[5]`);
                    let caseType = await page.evaluate(element => element.textContent.trim(), caseTypeElem);
                    if (removeRowRegex.test(name)) continue;

                    name = name.replace(/,\s+a\s+.*/i, '');
                    // console.log(name);

                    const parseName: any = this.newParseName(name.trim());
                    if (parseName.type === 'COMPANY') continue;
                    const practiceType = this.getPracticeType(caseType);
                    const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                    const product = await db.models.Product.findOne({ name: productName }).exec();
                    const data = {
                        'Property State': 'CA',
                        'County': 'Butte',
                        'First Name': parseName.firstName,
                        'Last Name': parseName.lastName,
                        'Middle Name': parseName.middleName,
                        'Name Suffix': parseName.suffix,
                        'Full Name': parseName.fullName,
                        "vacancyProcessed": false,
                        fillingDate: fillingDate,
                        productId: product._id,
                        originalDocType: caseType
                    };
                    if (await this.civilAndLienSaveToNewSchema(data))
                        count++
                }

                if (linkIndex < pageLinks.length) {
                    const nextUrl = link_urls[linkIndex];

                    if (nextUrl != null) {
                        await page.goto((nextUrl as string), { waitUntil: 'domcontentloaded' });
                    }
                }
                linkIndex++;
            }
        } catch (e) {
            console.log(e);
        }
        return count
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        let total = 0;
        if (page === undefined) return false;
        try {
            let dateRange = await this.getDateRange('Califonia', 'Butte');
            let fromDate = dateRange.from;
            let toDate = dateRange.to;

            const caseList = ['judgment', 'mortgage', 'marriage', 'debt'];
              
            let fromDateString = this.getFormattedDate(fromDate);
            let toDateString = this.getFormattedDate(toDate);

            await page.type('input[name="txtBegDateControl"]', fromDateString);
            //await page.type('input[name="txtEndDateControl"]', toDateString);
            await Promise.all([
                page.click('form[name="frmName"] input[name="cmdSubmit"]'),
                page.waitForNavigation({ waitUntil: 'load', timeout: 60000 }),
            ]);

            const count = await this.getData(page);
            total += count;

            console.log(total);
            await AbstractProducer.sendMessage('Butte', 'California', total, 'Civil');
        } catch (e) {
            console.log(e)
            console.log('Error search');
            await AbstractProducer.sendMessage('Butte', 'California', total, 'Civil');
            return false
        }
        return true;
    }
}
