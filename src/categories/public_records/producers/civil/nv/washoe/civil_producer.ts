import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import Papa from "papaparse";

const removeRowArray = [
    'CITY', 'DEPT', 'CTY', 'UNITED STATES', 'BANK', 'FIA CARD SERVICES NA',
    'FLORIDA PACE FUNDING AGENCY', 'COUNTY', 'CREDIT', 'HOSPITAL', 'FUNDING', 'UNIVERSITY',
    'MEDICAL', 'CONDOMINIUM ASSOCIATION', 'LOTS', 'TEXAS STATE', 'VETERANS', 'SECRETARY', 'DEPARTMENT',
    'INDIVIDUAL', 'INDIVIDUALLY', 'FINANCE', 'CITIBANK', 'MERS','NO GIVEN NAME'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')


export default class CivilProducer extends AbstractProducer {
    browser: puppeteer.Browser | undefined;
    browserPages = {
        generalInfoPage: undefined as undefined | puppeteer.Page
    };
    urls = {
        generalInfoPage: 'https://icris.washoecounty.us/ssrecorder/user/disclaimer'
    }

    xpaths = {
        isPAloaded: '//button[contains(., "I Accept")]'
    }

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
            await this.browserPages.generalInfoPage?.waitForXPath(this.xpaths.isPAloaded);
            return true;
        } catch (err) {
            console.warn('Problem loading civil producer page.');
            return false;
        }
    }

    async saveRecord(fillingDate: string, parseName: any, prod: any,originalDocType: string,caseUniqueId:string) {
        const data = {
            'Property State': 'NV',
            'County': 'Washoe',
            'First Name': parseName.firstName,
            'Last Name': parseName.lastName,
            'Middle Name': parseName.middleName,
            'Name Suffix': parseName.suffix,
            'Full Name': parseName.fullName,
            "vacancyProcessed": false,
            'caseUniqueId': caseUniqueId,
            fillingDate: fillingDate,
            productId: prod._id,
            originalDocType: originalDocType
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }
    
    async getData(jsonResData: any, civilDataFillingDate: string) {
        let count = 0;
        try {
            for (let row of jsonResData) {
                const docType = row['Type']
                let practiceType = this.getPracticeType(docType!)
                const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                const caseUniqueId =row['Document Number'];
                const prod = await db.models.Product.findOne({name: productName}).exec();
                const nameArray = row['Grantee'].split(',')
                for (let i = 0; i < nameArray.length; i++) {
                    if (!nameArray[i]) continue;
                    if (removeRowRegex.test(nameArray[i])) continue;
                    if (/^PUBLIC$/i.test(nameArray[i])) continue;
                    const parseName:any = this.newParseName(nameArray[i].trim());
                    if (parseName?.type && parseName?.type == 'COMPANY') continue;
                    const saveRecord = await this.saveRecord(civilDataFillingDate, parseName, prod, docType,caseUniqueId);
                    saveRecord && count++
                }
            }
        } catch (e) {
        }
        return count;
    }


    async parseAndSave(): Promise<boolean> {
        const civilUrl: string = 'https://icris.washoecounty.us/ssrecorder/user/disclaimer';
        let page = this.browserPages.generalInfoPage!;
        let countRecords = 0;
        try{
            let dateRange = await this.getDateRange('Nevada', 'Washoe');
            let fromDate = dateRange.from;
            let toDate = dateRange.to;

            while (fromDate <= toDate) {
                let dateStringDay = this.getFormattedDate(fromDate);
                await page.goto(civilUrl, { timeout: 600000 });
                await page.waitForXPath('//button[@id="submitDisclaimerAccept"]', { visible: true });
                let isAccepted = await page.$x('//button[@id="submitDisclaimerAccept"]');
                await isAccepted[0].click();

                await page.waitForXPath('//a[@class="ss-action ss-action-form ss-utility-box ss-action-page-search ui-link"][1]', { visible: true });
                let SearchByOfficial = await page.$x('//a[@class="ss-action ss-action-form ss-utility-box ss-action-page-search ui-link"][2]');
                await SearchByOfficial[0].click();

                await page.waitForXPath('//a[@id="searchButton"]', { visible: true });
                let SearchButton = await page.$x('//a[@id="searchButton"]');
                await page.type('input#field_RecDateID_DOT_StartDate', dateStringDay);
                await page.type('input#field_RecDateID_DOT_EndDate', dateStringDay);
                let documentTypes = ['Deed', 'Lien', 'Mortgage', 'Marriage', 'Pendens', 'Judgment', 'Judgement', 'Probate'];
                await page.waitForXPath('//input[@id="field_selfservice_documentTypes"]', { visible: true });
                let inputText = await page.$x('//input[@id="field_selfservice_documentTypes"]');
                inputText[0].click();
                await page.waitForXPath('//ul[@id="field_selfservice_documentTypes-aclist"]//li[contains(text(),"Deed")]', { visible: true });
                for (let i = 0; i < documentTypes.length; i++) {
                    let text = await page.$x('//ul[@id="field_selfservice_documentTypes-aclist"]//li[contains(text(),"' + documentTypes[i] + '")]')

                    for (let j = 0; j < text.length; j++) {
                        let textDocument = await text[j].evaluate(el => el.textContent);
                        // console.log(textDocument);
                        let arrStr = textDocument?.split(' ');

                        fast:
                        for (let k = 0; k < arrStr!.length; k++) {
                            if (arrStr![k].trim() == documentTypes[i]) {
                                await text[j].click();
                                break fast;
                            }

                        }

                    }
                    await this.sleep(500);
                }
                await SearchButton[0].click();
                try {
                    await page.waitForXPath('//ul[@class="selfServiceSearchResultList ui-listview ui-listview-inset ui-corner-all ui-shadow"]', { visible: true, timeout: 50000 });
                } catch (err) {
                    fromDate.setDate(fromDate.getDate() + 1);
                    continue;
                }

                let jsonRes = await page.evaluate(() => {
                    return fetch('https://icris.washoecounty.us/ssrecorder/viewSearchResultsReport/DOCSEARCH1174S1/CSV', {
                        method: 'GET',
                        credentials: 'include'
                    }).then(r => r.text());
                });
                jsonRes = jsonRes.substring(jsonRes.indexOf("\n") + 1)
                const parseCsv = Papa.parse(jsonRes, {header: true, skipEmptyLines: true})
                if (jsonRes) {
                    const result = await this.getData(parseCsv.data, dateStringDay); // Parse the json and save to the DB
                    if (!result) {
                    } else {
                        countRecords += result;
                        console.log(`${dateStringDay} found ${result} records.`);
                    }
                }
                fromDate.setDate(fromDate.getDate() + 1);
            }

            await AbstractProducer.sendMessage('Washoe', 'Nevada', countRecords, 'Civil & Lien');
            return true;
        } catch(e){
            console.log(e);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Washoe', 'Nevada', countRecords, 'Civil & Lien', errorImage);
            return false;
        }
    }
}