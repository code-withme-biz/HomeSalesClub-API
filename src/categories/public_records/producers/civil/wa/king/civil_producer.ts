import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';


const removeRowArray = [
    'CITY', 'DEPT', 'CTY', 'UNITED STATES', 'BANK', 'FIA CARD SERVICES NA',
    'FLORIDA PACE FUNDING AGENCY', 'COUNTY', 'CREDIT', 'HOSPITAL', 'FUNDING', 'UNIVERSITY',
    'MEDICAL', 'CONDOMINIUM ASSOCIATION', 'LOTS', 'TEXAS STATE', 'VETERANS', 'SECRETARY', 'DEPARTMENT', 'TITLE'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')


export default class CivilProducer extends AbstractProducer {

    urls = {
        generalInfoPage: 'https://recordsearch.kingcounty.gov/LandmarkWeb/search/index?theme=.blue&section=searchCriteriaRecordDate&quickSearchSelection='
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
            await this.browserPages.generalInfoPage?.waitForXPath('//*[@id="beginDate-RecordDate"]');
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    async saveRecord(fillingDate: string, parseName: any, prod: any, docType: any) {

        const data = {
            'Property State': 'WA',
            'County': 'King',
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
        return await this.civilAndLienSaveToNewSchema(data);
    }

    async getData(page: puppeteer.Page, fillingDate: string) {
        let count = 0;
        try {
            await page.waitForSelector('#resultsTable');
            let nextPageFlag;
            do {
                await page.waitForXPath('//*[@id="resultsTable"]/tbody/tr[1]')
                const rows = await page.$x('//*[@id="resultsTable"]/tbody/tr');
                nextPageFlag = false;
                for (let i = 0; i < rows.length; i++) {
                    let docType = (await rows[i].$eval('td:nth-child(9)', elem => elem.textContent))!.trim();
                    if (/death/i.test(docType) || /birth/i.test(docType)) continue;
                    let names = (await rows[i].$eval('td:nth-child(7)', elem => elem.innerHTML))!.trim();
                    names = names.replace('<div class="nameSeperator"></div>', '\n')
                    names = names.replace('<div class="nameSeperator"></div>...', '')
                    const nameArray = names.split('\n')
                    let practiceType = this.getPracticeType(docType.trim())
                    const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                    const prod = await db.models.Product.findOne({ name: productName }).exec();
                    for (let j = 0; j < nameArray.length; j++) {
                        let name = nameArray[j].replace('&amp;', '&')
                        if (removeRowRegex.test(name)) continue;
                        const parseName: any = this.newParseName(name.trim());
                        if (parseName.type && parseName.type == 'COMPANY') {
                            continue
                        }
                        const saveRecord = await this.saveRecord(fillingDate, parseName, prod, docType.trim());
                        saveRecord && count++
                    }

                }
                const [nextPage] = await page.$x('//a[@id="resultsTable_next" and not(contains(@class, "disabled"))]');
                if (!!nextPage) {
                    await nextPage.click();
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    nextPageFlag = true;
                }
            } while (nextPageFlag)
        } catch (e) {
        }
        return count
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let countRecords = 0;
        try {
            let dateRange = await this.getDateRange('Washington', 'King');
            let date = dateRange.from;
            let today = dateRange.to;
            let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24)) - 1;
            for (let i = days < 0 ? 1 : days; i >= 0; i--) {
                try {
                    let dateSearch = new Date();
                    dateSearch.setDate(dateSearch.getDate() - i);
                    console.log('Start search with date: ', dateSearch.toLocaleDateString('en-US'))
                    await page.goto('https://recordsearch.kingcounty.gov/LandmarkWeb/search/index?theme=.blue&section=searchCriteriaRecordDate&quickSearchSelection=');
                    await page.waitForSelector('#beginDate-RecordDate');
                    await page.evaluate(() => {
                        // @ts-ignore
                        document.querySelector('#beginDate-RecordDate').value = '';
                        // @ts-ignore
                        document.querySelector('#endDate-RecordDate').value = '';
                    })
                    await page.type('#beginDate-RecordDate', dateSearch.toLocaleDateString('en-US'), { delay: 100 });
                    await page.type('#endDate-RecordDate', dateSearch.toLocaleDateString('en-US'), { delay: 100 });
                    await page.click('#excludeDocType_RecordDate');
                    await page.click('#submit-RecordDate')
                    const count = await this.getData(page, dateSearch.toLocaleDateString('en-US'));
                    countRecords += count;
                    console.log(`${dateSearch.toLocaleDateString('en-US')} found ${count} records.`);
                } catch (e) {
                }
            }
        } catch (e) {
            console.log(e)
            console.log('Error search');
            await AbstractProducer.sendMessage('King', 'Washington', countRecords, 'Civil & Lien');
            return false
        }

        await AbstractProducer.sendMessage('King', 'Washington', countRecords, 'Civil & Lien');

        return true;
    }
}