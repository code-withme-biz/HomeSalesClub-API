import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../../abstract_producer';
import {IPublicRecordProducer} from '../../../../../../models/public_record_producer';

const removeRowArray = [
    'CITY', 'DEPT', 'CTY', 'UNITED STATES', 'BANK', 'FIA CARD SERVICES NA',
    'FLORIDA PACE FUNDING AGENCY', 'COUNTY', 'CREDIT', 'HOSPITAL', 'FUNDING', 'UNIVERSITY',
    'MEDICAL', 'CONDOMINIUM ASSOCIATION', 'LOTS', 'TEXAS STATE', 'VETERANS', 'SECRETARY', 'DEPARTMENT',
    'INDIVIDUAL', 'INDIVIDUALLY', 'FINANCE', 'CITIBANK', 'MERS', '-----'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')

export default class CivilProducer extends AbstractProducer {

    urls = {
        generalInfoPage: 'https://probaterecords.shelbyal.com/shelby/templates/disclaimer.html'
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
            await this.browserPages.generalInfoPage.setDefaultTimeout(60000);
            await this.browserPages.generalInfoPage.goto(this.urls.generalInfoPage, {waitUntil: 'load'});
            return true;
        } catch (err) {
            console.warn(err);
            return false;
        }
    }

    async read(): Promise<boolean> {
        try {
            await this.browserPages.generalInfoPage?.waitForXPath('//*[@id="iAgree"]');
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    async saveRecord(fillingDate: string, parseName: any, prod: any, originalDocType: string) {

        const data = {
            'Property State': 'AL',
            'County': 'Shelby',
            'First Name': parseName.firstName,
            'Last Name': parseName.lastName,
            'Middle Name': parseName.middleName,
            'Name Suffix': parseName.suffix,
            'Full Name': parseName.fullName,
            "vacancyProcessed": false,
            fillingDate: fillingDate,
            productId: prod._id,
            originalDocType: originalDocType
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }

    async getData(page: puppeteer.Page, fillingDate: string) {
        let count = 0;
        let nextPageFlag;
        try {
            await page.waitForXPath('//*[@id="doc"]')
            await page.waitForSelector('#resultspp')
            await Promise.all([
                page.select('#resultspp', '500'),
                page.waitForNavigation()
            ]);
            do {
                nextPageFlag = false;
                await this.sleep(1000)
                await page.waitForXPath('//*[@id="doc"]/tbody/tr[1]')
                const rows = await page.$x('//*[@id="doc"]/tbody/tr')
                for (let i = 0; i < rows.length; i++) {
                    try {
                        const partyRole = (await rows[i].$eval('td:nth-child(4)', elem => elem.textContent))!.trim();
                        if (partyRole != 'Grantee' && partyRole != 'Debtor' && partyRole != 'Party 2' && partyRole != 'Defendant') continue;
                        let docType = (await rows[i].$eval('td:nth-child(5)', elem => elem.textContent))!.trim();

                        const name = (await rows[i].$eval('td:nth-child(3)', elem => elem.textContent))!.trim();
                        if (removeRowRegex.test(name) || !name) continue;
                        const parseName: any = this.newParseName(name.trim());
                        if (parseName.type && parseName.type == 'COMPANY') {
                            continue
                        }
                        let practiceType = this.getPracticeType(docType!.trim());
                        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                        const prod = await db.models.Product.findOne({name: productName}).exec();
                        const saveRecord = await this.saveRecord(fillingDate, parseName, prod, docType!.trim());
                        saveRecord && count++


                    } catch (e) {
                    }
                }
                const [nextPage] = await page.$x('//a[text()="Next"]');
                if (!!nextPage) {
                    await Promise.all([
                        nextPage.click(),
                        page.waitForNavigation()
                    ]);
                    nextPageFlag = true;
                }
            } while (nextPageFlag)
        } catch (e) {
        }
        return count;
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let countRecords = 0;
        try {
            await page.click('#iAgree');
            await this.sleep(1000);
            await page.waitForSelector('#startSearch');
            await page.click('#startSearch');

            let dateRange = await this.getDateRange('Alabama', 'Shelby');
            let date = dateRange.from;
            let today = dateRange.to;
            let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24)) - 1;
            for (let i = days < 0 ? 1 : days; i >= 0; i--) {
                try {
                    await page.waitForSelector('#AdvSearch');
                    await page.click('#AdvSearch');


                    await page.waitForSelector('#frmRecDate')
                    let dateSearch = new Date();
                    dateSearch.setDate(dateSearch.getDate() - i);
                    console.log('Start search with date: ', dateSearch.toLocaleDateString('en-US'));
                    const date = dateSearch.toLocaleDateString('en-US', {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit"
                    });
                    await page.evaluate(() => {
                        // @ts-ignore
                        document.querySelector('#frmRecDate').value = '';
                        // @ts-ignore
                        document.querySelector('#toRecDate').value = '';
                    })

                    await page.type('#frmRecDate', date, {delay: 100});
                    await page.type('#toRecDate', date, {delay: 100});

                    const [clickSearch] = await page.$x('//button[@type="button" and @class="searchAdv"]');
                    await clickSearch.click();

                    const count = await this.getData(page, dateSearch.toLocaleDateString('en-US'));
                    countRecords += count;
                    console.log(`${dateSearch.toLocaleDateString('en-US')} save ${count} records.`);
                    await page.goto('https://probaterecords.shelbyal.com/shelby/search.do?indexName=opr', {waitUntil: 'load'});
                } catch (e) {
                }
            }
        } catch (e) {
            console.log(e);
            console.log('Error search');
            await AbstractProducer.sendMessage('Shelby', 'Alabama', countRecords, 'Civil');
            return false;
        }
        await AbstractProducer.sendMessage('Shelby', 'Alabama', countRecords, 'Civil');
        return true;
    }
}