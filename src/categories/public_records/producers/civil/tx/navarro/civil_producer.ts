import db from '../../../../../../models/db';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import Papa from 'papaparse';

const removeRowArray = [
    'CITY', 'DEPT', 'CTY', 'UNITED STATES', 'BANK', 'FIA CARD SERVICES NA',
    'FLORIDA PACE FUNDING AGENCY', 'COUNTY', 'CREDIT', 'HOSPITAL', 'FUNDING', 'UNIVERSITY',
    'MEDICAL', 'CONDOMINIUM ASSOCIATION', 'LOTS', 'TEXAS STATE', 'VETERANS', 'SECRETARY', 'DEPARTMENT',
    'INDIVIDUAL', 'INDIVIDUALLY', 'FINANCE', 'CITIBANK', 'MERS'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')

export default class CivilProducer extends AbstractProducer {

    urls = {
        generalInfoPage: 'https://navarrocountytx-web.tylerhost.net/web/search/DOCSEARCH144S1'
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
            await this.browserPages.generalInfoPage.goto(this.urls.generalInfoPage, {waitUntil: 'load'});
            return true;
        } catch (err) {
            console.warn(err);
            return false;
        }
    }

    async read(): Promise<boolean> {
        try {
            await this.browserPages.generalInfoPage?.waitForXPath('//*[@id="submitDisclaimerAccept"]');
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    async saveRecord(fillingDate: string, docType: string, parseName: any, prod: any, caseType: string) {
        const data = {
            'Property State': 'TX',
            'County': 'Navarro',
            'First Name': parseName.firstName,
            'Last Name': parseName.lastName,
            'Middle Name': parseName.middleName,
            'Name Suffix': parseName.suffix,
            'Full Name': parseName.fullName,
            "vacancyProcessed": false,
            fillingDate: fillingDate,
            productId: prod._id,
            originalDocType: caseType
        };
        if(await this.civilAndLienSaveToNewSchema(data)){
            return true;
        }
        return false
    }

    async getData(jsonResData: any, civilDataFillingDate: string) {
        let count = 0;
        try {
            for (let row of jsonResData) {
                const docType = row['Description']
                let practiceType = this.getPracticeType(docType);
                const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                const prod = await db.models.Product.findOne({name: productName}).exec();
                const nameArray = row['Grantee'].split(',');
                for (let i = 0; i < nameArray.length; i++) {
                    if (!nameArray[i]) continue;
                    if (removeRowRegex.test(nameArray[i])) continue;
                    if (/^PUBLIC$/i.test(nameArray[i])) continue;
                    const nameParse: any = this.newParseName(nameArray[i].trim());
                    if (nameParse.type === 'COMPANY' || nameParse.fullName === '') continue;
                    const saveRecord = await this.saveRecord(civilDataFillingDate, docType, nameParse, prod, docType);
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
            await page.waitForSelector('#submitDisclaimerAccept');
            let agreeButton = await page.$('#submitDisclaimerAccept');
            await page.evaluate(el => el.disabled = false, agreeButton);
            await agreeButton?.click();
            let dateRange = await this.getDateRange('Texas', 'Navarro');
            let date = dateRange.from;
            let today = dateRange.to;
            let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24)) - 1;
            for (let i = days < 0 ? 1 : days; i >= 0; i--) {
                let dateSearch = new Date();
                dateSearch.setDate(dateSearch.getDate() - i);
                console.log('Start search with date: ', dateSearch.toLocaleDateString('en-US'))
                try {
                    await page.goto('https://navarrocountytx-web.tylerhost.net/web/search/DOCSEARCH144S1', {waitUntil: 'load'});
                    await page.waitForXPath('//*[@id="field_RecordingDateID_DOT_StartDate"]', {timeout: 15000});
                    await page.evaluate(() => {
                        // @ts-ignore
                        document.querySelector('#field_RecordingDateID_DOT_StartDate').value = '';
                        // @ts-ignore
                        document.querySelector('#field_RecordingDateID_DOT_EndDate').value = '';
                    })
                    await page.type('#field_RecordingDateID_DOT_StartDate', dateSearch.toLocaleDateString('en-US'))
                    await page.type('#field_RecordingDateID_DOT_EndDate', dateSearch.toLocaleDateString('en-US'))
                    await page.click('#searchButton')
                    await page.waitForXPath('//ul[contains(@id, "searchResult")]',{timeout: 15000});
                    let jsonRes = await page.evaluate(() => {
                        return fetch('https://navarrocountytx-web.tylerhost.net/web/viewSearchResultsReport/DOCSEARCH144S1/CSV', {
                            method: 'GET',
                            credentials: 'include'
                        }).then(r => r.text());
                    });
                    jsonRes = jsonRes.substring(jsonRes.indexOf("\n") + 1)
                    const parseCsv = Papa.parse(jsonRes, {header: true, skipEmptyLines: true})
                    if (jsonRes) {
                        const result = await this.getData(parseCsv.data, dateSearch.toLocaleDateString('en-US')); // Parse the json and save to the DB
                        if (!result) {
                        } else {
                            countRecords += result;
                            console.log(`${dateSearch.toLocaleDateString('en-US')} found ${result} records.`);
                        }
                    }
                } catch (e) {
                    console.log(`${dateSearch.toLocaleDateString('en-US')} found 0 records.`);
                }
            }
        } catch (e) {
            console.log(e);
            console.log('Error search');
            await AbstractProducer.sendMessage('Navarro', 'Texas', countRecords, 'Civil & Lien');
            return false;
        }
        await AbstractProducer.sendMessage('Navarro', 'Texas', countRecords, 'Civil & Lien');
        return true;
    }
}