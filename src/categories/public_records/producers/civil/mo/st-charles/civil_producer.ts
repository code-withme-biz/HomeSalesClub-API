import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';


const removeRowArray = [
    'CITY', 'DEPT', 'CTY', 'UNITED STATES', 'BANK', 'FIA CARD SERVICES NA',
    'FLORIDA PACE FUNDING AGENCY', 'COUNTY', 'CREDIT', 'HOSPITAL', 'FUNDING', 'UNIVERSITY',
    'MEDICAL', 'CONDOMINIUM ASSOCIATION', 'LOTS', 'TEXAS STATE', 'VETERANS', 'SECRETARY', 'DEPARTMENT',
    'INDIVIDUAL', 'INDIVIDUALLY', 'FINANCE', 'CITIBANK', 'MERS'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')

export default class CivilProducer extends AbstractProducer {

    urls = {
        generalInfoPage: 'https://www.courts.mo.gov/casenet/cases/filingDateSearch.do'
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
            await this.browserPages.generalInfoPage?.waitForXPath('//*[@id="cphNoMargin_f_ddcDateFiledFrom"]');
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    async saveRecord(fillingDate: string, parseName: any, prod: any,originalDocType: string) {
        const data = {
            'Property State': 'MO',
            'County': 'St. Charles',
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

    async getData(page: puppeteer.Page) {
        let count = 0;
        try {
            let hasNext = true;
            while (hasNext) {
                const pagination_handles = await page.$x('//*[contains(@href, "javascript:goToThisPage")]');
                const paginations = ['1'];
                for (let i = 0 ; i < pagination_handles.length/2 ; i++) {
                    const text = await page.evaluate(el => el.textContent.trim(), pagination_handles[i]);
                    if (text.indexOf('Previous') > -1 || text.indexOf('Next') > -1) continue;
                    paginations.push(await page.evaluate(el => el.href.trim(), pagination_handles[i]));
                }
                for (let i = 0 ; i < paginations.length ; i++) {
                    if (i > 0) {
                        console.log(paginations[i]);
                        const [pagination_handler] = await page.$x(`//*[contains(@href, "${paginations[i]}")]`);
                        if (!pagination_handler) continue;
                        await Promise.all([
                            pagination_handler.click(),
                            page.waitForNavigation()
                        ]);
                        await page.waitForXPath('//td[contains(text(), "Filed")]/ancestor::table[1]');
                    }
                    const rows = await page.$x('//td[contains(text(), "Filed")]/ancestor::table[1]/tbody/tr[position()>1]');
                    for (const row of rows) {
                        let name = await page.evaluate(el => el.children[3].textContent, row);
                        if (name.indexOf(' VS ') > -1) {
                            name = name.slice(name.indexOf(' VS ')+4).trim();
                        } else {
                            name = name.slice(name.indexOf(' V ')+3).trim();
                        }
                        const fillingDate = await page.evaluate(el => el.children[1].textContent.trim(), row);
                        
                        const caseType = await page.evaluate(el => el.children[4].textContent, row);
                        let practiceType = this.getPracticeType(caseType)
                        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                        const prod = await db.models.Product.findOne({name: productName}).exec();
                        
                        if (removeRowRegex.test(name)) continue;
                        const parseName:any = this.newParseName(name);
                        if (parseName?.type && parseName?.type == 'COMPANY') continue;
                        const saveRecord = await this.saveRecord(fillingDate, parseName, prod, caseType);
                        saveRecord && count++;
                    }
                    await page.waitFor(this.getRandomInt(3000, 5000));
                }
                const [next_handle] = await page.$x('//a[contains(text(), "[Next")]');
                if (next_handle) {
                    hasNext = true;
                    await Promise.all([
                        next_handle.click(),
                        page.waitForNavigation()
                    ]);
                }
                else {
                    hasNext = false;
                }
            }
        } catch (e) {
            console.log(e)
        }
        return count;
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let countRecords = 0;
        try {
            let dateRange = await this.getDateRange('Missouri', 'St. Charles');
            let date = new Date('10/10/2020');// dateRange.from;
            let today = dateRange.to;
            let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24)) - 1;
            for (let i = days < 0 ? 1 : days; i >= 0; i-=7) {
                try {
                    await page.goto(this.urls.generalInfoPage, {waitUntil: 'load'});
                    let dateSearch = new Date();
                    dateSearch.setDate(dateSearch.getDate() - i);
                    console.log('Start search with date: ', dateSearch.toLocaleDateString('en-US'));
                    await page.waitForXPath('//select[@id="courtId"]');
                    await page.select('select#courtId', 'CT11');
                    await page.waitForNavigation();
                    await page.waitFor(1000);
                    await page.type('input[id$="startDate"]', this.getFormattedDate(dateSearch), {delay: 200});
                    await page.waitFor(1000);
                    await page.select('select#CountyId', 'SCH')
                    await page.waitForNavigation();
                    await page.waitFor(1000);
                    await Promise.all([
                        page.click('input#findButton'),
                        page.waitForNavigation()
                    ]);
                    const [no_match] = await page.$x('//*[contains(text(), "no matches")]');
                    console.log(no_match)
                    if (no_match) {
                        console.log('No results found!');
                        continue;
                    }
                    const count = await this.getData(page);
                    countRecords += count;
                    console.log(`${dateSearch.toLocaleDateString('en-US')} save ${count} records.`);
                } catch (e) {
                    console.log(e);
                }
            }
        } catch (e) {
            console.log(e);
            console.log('Error search');
            await AbstractProducer.sendMessage('St. Charles', 'Missouri', countRecords, 'Civil & Lien');
            return false;
        }
        await AbstractProducer.sendMessage('St. Charles', 'Missouri', countRecords, 'Civil & Lien');
        return true;
    }
}