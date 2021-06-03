import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../../abstract_producer';
import {IPublicRecordProducer} from '../../../../../../models/public_record_producer';
import Papa from 'papaparse';

const removeRowArray = [
    'CITY', 'DEPT', 'CTY', 'UNITED STATES', 'BANK', 'FIA CARD SERVICES NA',
    'FLORIDA PACE FUNDING AGENCY', 'COUNTY', 'CREDIT', 'HOSPITAL', 'FUNDING', 'UNIVERSITY',
    'MEDICAL', 'CONDOMINIUM ASSOCIATION', 'LOTS', 'TEXAS STATE', 'VETERANS', 'SECRETARY', 'DEPARTMENT',
    'INDIVIDUAL', 'INDIVIDUALLY', 'FINANCE', 'CITIBANK', 'MERS', '-----'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')

export default class CivilProducer extends AbstractProducer {

    urls = {
        generalInfoPage: 'https://probate.tuscco.com/ProbateRecords/home'
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
            await this.browserPages.generalInfoPage?.waitForXPath('//a[text()="Search Records"]');
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    async saveRecord(fillingDate: string, parseName: any, prod: any, originalDocType: string) {

        const data = {
            'Property State': 'AL',
            'County': 'Tuscaloosa',
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

    async getData(jsonResData:any, fillingDate: string) {
        let count = 0;
        try {
            for (let row of jsonResData) {
                const docType = row['Instrument']
                if (docType == 'Marriage License') continue;
                let practiceType = this.getPracticeType(docType);
                const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                const prod = await db.models.Product.findOne({name: productName}).exec();
                let name
                if (row['Class'] == 'Mortgagor') {
                    name = row['Name']
                } else {
                    name = row['Other Names']
                }
                const nameArray = name.split('|');
                for (let i = 0; i < nameArray.length; i++) {
                    if (!nameArray[i]) continue;
                    if (removeRowRegex.test(nameArray[i])) continue;
                    const nameParse: any = this.newParseName(nameArray[i].trim());
                    if (nameParse.type === 'COMPANY' || nameParse.fullName === '') continue;
                    const saveRecord = await this.saveRecord(fillingDate, nameParse, prod, docType);
                    saveRecord && count++
                }
            }
        } catch (e) {
        }
        return count;
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let countRecords = 0;
        try {
            let dateRange = await this.getDateRange('Alabama', 'Tuscaloosa');
            let date = dateRange.from;
            let today = dateRange.to;
            let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24)) - 1;
            for (let i = days < 0 ? 1 : days; i >= 0; i--) {
                try {
                    let dateSearch = new Date();
                    dateSearch.setDate(dateSearch.getDate() - i);
                    const dateArray = dateSearch.toLocaleDateString('en-US', {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit"
                    }).split('/');
                    let url = `https://probate.tuscco.com/ProbateApi/ServerAPI/DownloadResultsFree?query=startDate%3D${dateArray[0]}%2F${dateArray[1]}%2F${dateArray[2]}%3AendDate%3D${dateArray[0]}%2F${dateArray[1]}%2F${dateArray[2]}%3AsearchType%3Dall_books&format=csv&memo=All%20Books%20Results&access_token=`
                    let jsonRes = await page.evaluate((url) => {
                        return fetch(url, {
                            method: 'GET',
                            credentials: 'include'
                        }).then(r => r.text());
                    },url);

                   const parseCsv:any = Papa.parse(jsonRes, {header: true, skipEmptyLines: true})
                    if (jsonRes) {
                        const result = await this.getData(parseCsv.data, dateSearch.toLocaleDateString('en-US'));
                        if (!result) {
                        } else {
                            countRecords += result;
                            console.log(`${dateSearch.toLocaleDateString('en-US')} found ${result} records.`);
                        }
                    }
                    await this.randomSleepIn5Sec();
                } catch (e) {
                }
            }
        } catch (e) {
            console.log(e);
            console.log('Error search');
            await AbstractProducer.sendMessage('Tuscaloosa', 'Alabama', countRecords, 'Civil');
            return false;
        }
        await AbstractProducer.sendMessage('Tuscaloosa', 'Alabama', countRecords, 'Civil');
        return true;
    }
}