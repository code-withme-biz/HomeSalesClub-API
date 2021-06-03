import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../../abstract_producer';
import {IPublicRecordProducer} from '../../../../../../models/public_record_producer';


const removeRowArray = [
    'CITY', 'DEPT', 'CTY', 'UNITED STATES', 'BANK', 'FIA CARD SERVICES NA',
    'FLORIDA PACE FUNDING AGENCY', 'COUNTY', 'CREDIT', 'HOSPITAL', 'FUNDING', 'UNIVERSITY',
    'MEDICAL', 'CONDOMINIUM ASSOCIATION', 'LOTS', 'TEXAS STATE', 'VETERANS', 'SECRETARY', 'DEPARTMENT', 'TITLE', 'THE PUBLIC'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')


export default class CivilProducer extends AbstractProducer {

    urls = {
        generalInfoPage: 'https://www.miottawa.org/Deeds/newSearch'
    };

    docTypeArray = ['Affidavit', 'Deed', 'Discharge', 'Easement', 'Foreclosure', 'Land Contract', 'Lease', 'Lien', 'Miscellaneous', 'Mortgage', 'Plat/Condo/Survey', 'UCC']

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
            await this.browserPages.generalInfoPage.goto(this.urls.generalInfoPage, {waitUntil: 'load'});
            return true;
        } catch (err) {
            console.warn(err);
            return false;
        }
    }

    async read(): Promise<boolean> {
        try {
            await this.browserPages.generalInfoPage?.waitForXPath('//*[@id="deedBean.dateRangeTo"]');
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }


    async saveRecord(fillingDate: string, parseName: any, prod: any, docType: any) {
        const data = {
            'Property State': 'MI',
            'County': 'Ottawa',
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
            await this.sleep(1000);
            const [noResults] = await page.$x('//*[@id="addToCart" and contains(text(), "Nothing found")]')
            if (!!noResults) return count;

            await page.waitForSelector('#deedsT');
            let nextPageFlag;
            do {
                await page.waitForXPath('//*[@id="deedsT"]/tbody/tr[1]');
                const rows = await page.$x('//*[@id="deedsT"]/tbody/tr');
                nextPageFlag = false;
                for (let i = 0; i < rows.length; i++) {
                    let docType = (await rows[i].$eval('td:nth-child(5)', elem => elem.innerHTML))!.trim();
                    if (/death/i.test(docType!) || /birth/i.test(docType!)) continue;
                    let names = (await rows[i].$eval('td:nth-child(3)', elem => elem.innerHTML))!.trim();
                    let practiceType = this.getPracticeType(docType!.trim());
                    const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                    const prod = await db.models.Product.findOne({name: productName}).exec();
                    const namesArray = this.splitName(names);
                    for (let j = 0; j < namesArray.length; j++) {
                        const name = namesArray[j]
                        if (removeRowRegex.test(name)) continue;
                        const parseName: any = this.newParseName(name.trim());
                        if (parseName.type && parseName.type == 'COMPANY') {
                            continue
                        }
                        const saveRecord = await this.saveRecord(fillingDate, parseName, prod, docType!.trim());
                        saveRecord && count++
                    }

                }
                const [nextPage] = await page.$x('//a[text()="Next" and not(contains(@class, "disabled"))]');
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
        return count
    }

    splitName(name: string) {
        let namesArray = [];
        let splitedName = name.split('&amp;');
        namesArray.push(splitedName[0]);
        if (splitedName[1]) {
            const lastName = splitedName[0].split(',')[0]
            namesArray.push(`${lastName}, ${splitedName[1]}`)
        }
        return namesArray
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let countRecords = 0;
        try {

            let dateRange = await this.getDateRange('Michigan', 'Ottawa');
            let date = dateRange.from;
            let today = dateRange.to;
            let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24)) - 1;
            for (let i = days < 0 ? 1 : days; i >= 0; i--) {
                try {
                    let dateSearch = new Date();
                    dateSearch.setDate(dateSearch.getDate() - i);
                    console.log('Start search with date: ', dateSearch.toLocaleDateString('en-US'))
                    for (let j = 0; j < this.docTypeArray.length; j++) {
                        await page.goto('https://www.miottawa.org/Deeds/newSearch', {waitUntil: 'load'});
                        await page.waitForXPath('//*[@id="deedBean.dateRangeFrom"]');

                        const [dateInputFrom] = await page.$x('//*[@id="deedBean.dateRangeFrom"]');
                        await dateInputFrom.type(dateSearch.toLocaleDateString('en-US', {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit"
                        }), {delay: 100});

                        const [dateInputTo] = await page.$x('//*[@id="deedBean.dateRangeTo"]');
                        await dateInputTo.type(dateSearch.toLocaleDateString('en-US', {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit"
                        }), {delay: 100});

                        const [blurFromInputsElement] = await page.$x('//*[text()="Recording Date Range:"]');
                        await blurFromInputsElement.click({clickCount: 3})

                        await page.select('#searchDeed_deedBean_documentType', this.docTypeArray[j])
                        await Promise.all([
                             page.click('#searchDeed_2'),
                             page?.waitForNavigation()
                        ])

                        const count = await this.getData(page, dateSearch.toLocaleDateString('en-US'));
                        countRecords += count;
                        console.log(`${dateSearch.toLocaleDateString('en-US')} docType ${this.docTypeArray[j]} save ${count} records.`);
                    }
                } catch (e) {
                }
            }
        } catch (e) {
            console.log(e)
            console.log('Error search');
            await AbstractProducer.sendMessage('Ottawa', 'Michigan', countRecords, 'Civil & Lien');
            return false
        }
        await AbstractProducer.sendMessage('Ottawa', 'Michigan', countRecords, 'Civil & Lien');
        return true;
    }
}