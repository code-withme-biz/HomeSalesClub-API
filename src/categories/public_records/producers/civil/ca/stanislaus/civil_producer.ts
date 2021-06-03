import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';


const removeRowArray = [
    'CITY', 'DEPT', 'CTY', 'UNITED STATES', 'BANK', 'FIA CARD SERVICES NA',
    'FLORIDA PACE FUNDING AGENCY', 'COUNTY', 'CREDIT', 'HOSPITAL', 'FUNDING', 'UNIVERSITY',
    'MEDICAL', 'CONDOMINIUM ASSOCIATION', 'LOTS', 'TEXAS STATE', 'VETERANS', 'SECRETARY', 'DEPARTMENT',
    'INDIVIDUAL', 'INDIVIDUALLY'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')


export default class CivilProducer extends AbstractProducer {

    urls = {
        generalInfoPage: 'http://www.criis.com/cgi-bin/doc_search.cgi?COUNTY=stanislaus&YEARSEGMENT=current&TAB=3#'
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
            await this.browserPages.generalInfoPage?.waitForXPath('//*[@id="dateboxA"]');
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    async getData(page: puppeteer.Page) {
        let count = 0;
        try {
            await page.waitForSelector('#report_table_1');
            await this.sleep(7000);
            const tableCount = await page.$x('//*[contains(@id, "report_table")]');
            console.log('Found', tableCount.length, 'tables.')
            for (let i = 1; i < tableCount.length + 1; i++) {
                const rows = await page.$x(`//*[@id="report_table_${i}"]/tbody/tr`);
                for (let j = 1; j < rows.length + 1; j++) {
                    const [roleElement] = await page.$x(`//*[@id="report_table_${i}"]/tbody/tr[${j}]//td[5]`);
                    if (!roleElement) continue;
                    const role = (await page.evaluate(e => e.innerText, roleElement)).trim();
                    if (role != 'R') continue;
                    const [nameElement] = await page.$x(`//*[@id="report_table_${i}"]/tbody/tr[${j}]//td[6]`);
                    const name = (await page.evaluate(e => e.innerText, nameElement)).trim();
                    if (removeRowRegex.test(name)) continue;
                    const [fillingDateElement] = await page.$x(`//*[@id="report_table_${i}"]/tbody/tr[${j}]//td[2]`);
                    const [docTypeElement] = await page.$x(`//*[@id="report_table_${i}"]/tbody/tr[${j}]//td[4]`);
                    const fillingDate = (await page.evaluate(e => e.innerText, fillingDateElement)).trim();
                    const docType = (await page.evaluate(e => e.innerText, docTypeElement)).trim();
                    if (/dead/i.test(docType)) continue;
                    if (/birth/i.test(docType)) continue;
                    const parseName: any = this.newParseName(name.trim());
                    if (parseName.type && parseName.type == 'COMPANY') {
                        continue
                    }
                    let practiceType = this.getPracticeType(docType);
                    const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                    const prod = await db.models.Product.findOne({ name: productName }).exec();
                    const data = {
                        'Property State': 'CA',
                        'County': 'Stanislaus',
                        'First Name': parseName.firstName,
                        'Last Name': parseName.lastName,
                        'Middle Name': parseName.middleName,
                        'Name Suffix': parseName.suffix,
                        'Full Name': parseName.fullName,
                        "vacancyProcessed": false,
                        fillingDate: fillingDate,
                        productId: prod._id,
                        originalDocType: docType
                    };
                    if (await this.civilAndLienSaveToNewSchema(data))
                        count++

                }
            }
        } catch (e) {
        }
        return count
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let countRecords = 0;
        try {
            let dateRange = await this.getDateRange('Califonia', 'Stanislaus');
            let date = dateRange.from;
            let today = dateRange.to;
            let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24)) - 1;
            for (let i = days < 0 ? 1 : days; i >= 0; i--) {
                try {
                    let dateSearch = new Date();
                    dateSearch.setDate(dateSearch.getDate() - i);
                    await page.goto('http://www.criis.com/cgi-bin/doc_search.cgi?COUNTY=stanislaus&YEARSEGMENT=current&TAB=3#');
                    await page.waitForSelector('#dateboxA');
                    await page.evaluate(() => {
                        // @ts-ignore
                        document.querySelector('#dateboxA').value = '';
                        // @ts-ignore
                        document.querySelector('#dateboxB').value = '';
                    })
                    console.log('Start search with date: ', dateSearch.toLocaleDateString('en-US'))
                    await page.type('#dateboxA', dateSearch.toLocaleDateString('en-US'), { delay: 100 });
                    await page.type('#dateboxB', dateSearch.toLocaleDateString('en-US'), { delay: 100 });
                    await page.click('input[type="submit"][value="Search"]');
                    const count = await this.getData(page);
                    countRecords += count;
                } catch (e) {
                }
            }
        } catch (e) {
            console.log(e);
            console.log('Error search');
            await AbstractProducer.sendMessage('Stanislaus', 'California', countRecords, 'Civil');
            return false;
        }

        await AbstractProducer.sendMessage('Stanislaus', 'California', countRecords, 'Civil');
        return true;
    }
}