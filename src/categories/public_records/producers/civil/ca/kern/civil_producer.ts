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
    'Department', 'KERN', 'CALIFORNIA', 'LLC'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')

export default class CivilProducer extends AbstractProducer {


    urls = {
        generalInfoPage: 'http://recorderonline.co.kern.ca.us/cgi-bin/Osearchc.mbr/input'
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

    getDateString(date: Date): string {
        return (date.getMonth() + 1) + "/" + date.getDate() + "/" + date.getFullYear();
    }

    async read(): Promise<boolean> {
        try {
            await this.browserPages.generalInfoPage?.waitForXPath('/html/body/form/h3');
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    async getData(page: puppeteer.Page) {
        let count = 0;
        try {
            let hasNext = true;

            do {
                await page.waitForXPath('/html/body/form/p/table');

                const rows = await page.$x('/html/body/form/p/table/tbody/tr[@valign="top"]')
                for (let i = 0; i < rows.length; i++) {
                    const bothName = await rows[i].$eval('td:nth-child(5)', elem => elem.textContent);
                    let grantorName = bothName?.split('(R)')[0] as string;
                    let fillingDate: any = await rows[i].$eval('td:nth-child(2)', elem => elem.textContent);
                    let docDesc: any = await rows[i].$eval('td:nth-child(4)', elem => elem.textContent);
                    fillingDate = fillingDate?.replace(/\s+|\n/gm, ' ').trim();
                    docDesc = docDesc?.replace(/\s+|\n/gm, ' ').trim();
                    if (removeRowRegex.test(grantorName)) continue;

                    grantorName = grantorName.replace(/,\s+a\s+.*/i, '');
                    console.log(grantorName);

                    const parseName: any = this.newParseName(grantorName.trim());
                    if (parseName.type === 'COMPANY') {
                        console.log('company======='+parseName.type);
                         continue;
                    }
                    console.log(parseName.fullName)
                    const practiceType = this.getPracticeType(docDesc || '');
                    const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                    const product = await db.models.Product.findOne({ name: productName }).exec();

                    const data = {
                        'Property State': 'CA',
                        'County': 'Kern',
                        'First Name': parseName.firstName,
                        'Last Name': parseName.lastName,
                        'Middle Name': parseName.middleName,
                        'Name Suffix': parseName.suffix,
                        'Full Name': parseName.fullName,
                        "vacancyProcessed": false,
                        fillingDate: fillingDate,
                        productId: product._id,
                        originalDocType: docDesc
                    };
                    console.log('~~~~~~~~~~~~~~~~~~')
                    if (await this.civilAndLienSaveToNewSchema(data))
                        count++
                }

                const nextLink = await page.$x('//a[contains(text(), "NEXT ")]');
                if (nextLink.length > 0) {
                    hasNext = true;
                    const link_urls = await page.evaluate((...links) => { return links.map(e => e.href); }, ...nextLink);
                    await page.goto(link_urls[0], { waitUntil: 'domcontentloaded' });
                } else {
                    hasNext = false;
                }

            } while (hasNext);
        } catch (e) {
            console.log(e);
        }
        return count
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        let total_counts = 0;

        if (page === undefined) return false;
        try {
            // UPDATE THIS DOC CLASS TO FIND ANOTHERS
            const docTypes = [
                'Deed',
                'Lien',
                'Lis Pendens',
                'Mortgage',
                'Marriage',
                'Mtg'
            ];
            const values = [];
            for (const docType of docTypes) {
                const options = await page.$x(`//option[contains(text(), "${docType}")]`);
                for (const option of options) {
                    const value = await page.evaluate(el => el.value.trim(), option);
                    if (values.indexOf(value) === -1) values.push(value);
                }
            }
            for (const value of values) {
                await page.goto(this.urls.generalInfoPage, {waitUntil: 'load'});
                await page.waitForXPath('//input[@name="B1"]');

                await page.select('select[name="Class"]', value);
                
                await Promise.all([
                    page.waitForNavigation({ waitUntil: 'load', timeout: 60000 }),
                    page.click('input[name="B1"]')
                ]);
                
                let dateRange = await this.getDateRange('Califonia', 'Kern');
                let fromDate = dateRange.from;
                let toDate = dateRange.to;
                let fromDateString = this.getDateString(fromDate);
                let toDateString = this.getDateString(toDate);
                let fromDatePieces = fromDateString.split('/');
                let toDatePieces = toDateString.split('/');
                console.log(fromDateString);
                console.log(toDateString);
                
                await page.type('input[name="F_Month"]', fromDatePieces[0]);
                await page.type('input[name="F_Day"]', fromDatePieces[1]);
                await page.type('input[name="F_Year"]', fromDatePieces[2]);
                
                await page.type('input[name="T_Month"]', toDatePieces[0]);
                await page.type('input[name="T_Day"]', toDatePieces[1]);
                await page.type('input[name="T_Year"]', toDatePieces[2]);
                
                await Promise.all([
                    page.waitForNavigation({ waitUntil: 'load', timeout: 60000 }),
                    page.click('input[name="B1"]')
                ]);
                
                const count = await this.getData(page);
                total_counts += count;
            }
        } catch (e) {
            console.log(e)
            console.log('Error search');
            await AbstractProducer.sendMessage('Kern', 'California', total_counts, 'Civil');
            return false
        }
        await AbstractProducer.sendMessage('Kern', 'California', total_counts, 'Civil');
        console.log(total_counts);
        
        return true;
    }
}
