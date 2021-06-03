import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import axios from 'axios';
import _ from 'lodash';

const docTypes: any = {
    '132': "56 INCH MAP",
    '226': "AGREEMENT REIME",
    'ACLN': "AIRCRAFT LIEN",
    'ASC': "ASN CONVERTED",
    'AS': "ASSIGNMENT",
    'BAN': "BANKRUPTCY",
    '002': "BOND SHERIFF",
    'CTS': "CANCEL TAXSALES",
    '044': "CANCELL TS INDV",
    'CA2': "CANCELLAITON FOR MUNICIPALITY",
    'CAN': "CANCELLATION",
    'CA3': "CANCELLATION FOR COUNTY",
    '195': "CO-OP EXCESS",
    '193': "CO-OP EXEMPT",
    '196': "CO-OP SENIOR",
    '194': "CO-OPS (DEED)",
    '102': "CONSTRUCTION LI",
    '113': "CONT BONDS",
    '221': "CORRECT CORP",
    '045': "COUNTY DEED",
    '046': "COUNTY MORTGAGE",
    '199': "COUNTY NOS",
    'CPN': "COUPON FOR TAX",
    'AS1': "CTY ASSIGNMENT",
    'DI3': "CTY DISCHARGE",
    '121': "CTY MAP W/DEED",
    'RE1': "CTY RELEASE",
    'DEED': "DEED",
    'DEC': "DEED CONVERTED",
    'DE3': "DEED EXEMPT",
    'EF3': "DEED NEW CONST",
    'RG3': "DEED NEW CONST",
    'DD3': "DEED NEW CONST",
    'DD2': "DEED SENIOR",
    'RG2': "DEED SENIOR",
    'EF2': "DEED SENIOR",
    'RG1': "DEED STANDARD",
    'EF1': "DEED STANDARD",
    'DD1': "DEED STANDARD",
    '206': "DEED W/O ABSTRA",
    '104': "DIS CONST BOND",
    '053': "DIS FORECLOSURE",
    '070': "DIS IN-REM LIS",
    'DI5': "DIS TAX SALE IN",
    'DIS': "DISCHARGE MTG",
    '200D': "DISCHARGE NOS",
    '200': "DISCHARGE NOS",
    '103': "DISCHARGE OF LI",
    '055': "DISCHARGE OF LP",
    '056': "DISCHARGE OF LP COUNTY",
    '215': "DISSOLUTION TN",
    '216': "DISSOLUTION TN",
    '015': "DOCKET JUDGEMEN",
    '020': "EXTENTION MORTG",
    '025': "FEDERAL TAX LIE",
    'FX': "FIX CASHIERS",
    '052': "FORCLOSURE LP",
    '065': "IN-REM LIS PEND",
    '220': "INCORPORATION",
    '060': "LIS PENDENS",
    '061': "LIS PENDENS CTY",
    '062': "LIS PENDENS MUN",
    '115': "MAJOR SUBDIVIS",
    '120': "MAP COPY",
    '130': "MAP POSTAGE",
    '131': "MAP REPARIAN",
    '114': "MAP WITH DEED",
    '116': "MINOR SUBDIVIS",
    '400': "mis.documents",
    '001': "MISCELLANEOUS",
    'MTC': "MORT CONVERTED",
    'MG': "MORTGAGE",
    'DI4': "MUN DIS TAX SAL",
    'DI2': "MUN DISCHARGE",
    '037': "MUN VACATION ST",
    '041': "MUNCIPAL DEED",
    '042': "MUNCIPAL MORTGA",
    '198': "MUNCIPAL NOS",
    '048': "MUNCIPALTAXSALE",
    '021': "MUNIC EXTEN MTG",
    '057': "MUNICIPAL DIS LP",
    '047': "MUNICIPAL ORDIN",
    'DD6': "NEW CONST EXCES",
    '101': "not. unpaid bal",
    '197': "NOTICE OF SETTL",
    '197D': "NOTICE OF SETTL CONTRACT & MTG",
    '100': "PART REL CONSTR",
    '030': "PARTNERSHIP",
    'PB': "PROPERTY BONDS",
    '205': "REC ANY INST",
    'REC': "REL CONVERTED",
    '016': "REL DOCKET JUDG",
    '026': "REL FEDERAL TAX",
    'RE': "RELEASE",
    'RE2': "RELEASE TOWNSHIP",
    '028': "REVOCATION FED",
    '036': "ROADS",
    'DD5': "SENIOR EXCESS",
    '225': "ST OF REIMBURSE",
    'DD4': "STANDARD EXCESS",
    'WET': "STATE WETLANDS",
    '035': "STREET/VACATION",
    '118': "TAX MAPS",
    '043': "TAX SALE INDIV",
    '010': "TAX WAIVER",
    '210': "TRADE NAME",
    '211': "TRADE NAME",
    '209': "TRADENAME SEARC",
    '085': "UCC 1 & CONT",
    '086': "UCC 3",
    '117': "UNFILED MAPS",
    'VER': "VERIFICATION LE",
    '051': "WETLANDS",
    '027': "WITHDRAWAL FEDE",
    '119': "ZONING MAP",
}

const removeRowArray = [
    'CITY', 'DEPT', 'CTY', 'UNITED STATES', 'BANK', 'FIA CARD SERVICES NA',
    'FLORIDA PACE FUNDING AGENCY', 'COUNTY', 'CREDIT', 'HOSPITAL', 'FUNDING', 'UNIVERSITY',
    'MEDICAL', 'CONDOMINIUM ASSOCIATION', 'LOTS', 'TEXAS STATE', 'VETERANS', 'SECRETARY', 'DEPARTMENT', 'TITLE'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')


export default class CivilProducer extends AbstractProducer {

    urls = {
        generalInfoPage: 'https://mcrecords.co.middlesex.nj.us/publicsearch1/'
    };

    searchTypeArray = [
        '132,226,119,027,051,117,VER,086,085,209,211,ACLN',
        'ASC,AS,BAN,002,CTS,044,CA2,CAN,CA3,193,195,196,194,102',
        '113,221,045,046,199,CPN,AS1,DI3,121,RE1,DEED,DEC,DE3',
        'EF3,RG3,DD3,DD2,RG2,EF2,RG1,DD1,EF1,206,104,053,070',
        'DI5,DIS,200D,200,103,055,056,215,216,015,020,025,FX',
        '052,065,220,060,061,062,115,120,130,131,114,116',
        'DI2,037,041,042,198,048,021,047,057,DD6,101,197',
        '197D,100,030,PB,205,REC,016,026,RE,RE2,028,036,225,DD5',
        'DD4,WET,035,118,043,010,210,FCC,400,001,MTC,MG,DI4'
    ]

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
            await this.browserPages.generalInfoPage?.waitForXPath('//a[text()="Document Type"]');
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    async saveRecord(fillingDate: string, parseName: any, prod: any, docType: string) {

        const data = {
            'Property State': 'NJ',
            'County': 'Middlesex',
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

    async getData(dataTable: any, fillingDate: string) {
        let count = 0
        for (let row of dataTable) {
            try {
                if (row.party_code != 'D') continue;
                const docType = docTypes[row.doc_type]
                let practiceType = this.getPracticeType(docType);
                if (practiceType == 'debt') {
                    if (docType.match(/mtg/i)) {
                        practiceType = 'mortgage-lien';
                    }
                }
                const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                const prod = await db.models.Product.findOne({name: productName}).exec();
                let name
                if (row.party_code != 'D'){
                    name = row.cross_party_name;
                } else {
                    name = row.party_name;
                }
                if (removeRowRegex.test(name)) continue;
                const parseName: any = this.newParseName(name.trim());
                if (parseName.type && parseName.type == 'COMPANY') {
                    continue;
                }
                const saveRecord = await this.saveRecord(fillingDate, parseName, prod, docType);
                saveRecord && count++
            } catch (e) {
            }
        }
        return count
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let countRecords = 0;
        try {
            page.on('dialog', async dialog => {
                await dialog.accept();
            });

            let dateRange = await this.getDateRange('Middlesex', 'New Jersey');
            let date = dateRange.from;
            let today = dateRange.to;
            let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24)) - 1;
            for (let i = days < 0 ? 1 : days; i >= 0; i--) {
                let dateSearch = new Date();
                dateSearch.setDate(dateSearch.getDate() - i);
                console.log('Start search with date: ', dateSearch.toLocaleDateString('en-US'));
                for (let j = 0; j < this.searchTypeArray.length; j++) {
                    try {
                        await page.reload({waitUntil: 'load'})
                        await this.sleep(2000)
                        await page.waitForXPath('//*[@heading="Document Type" and @active="searchTabs[1]"]')

                        const [documentSearchTabElement] = await page.$x('//*[@heading="Document Type" and @active="searchTabs[1]"]')
                        await documentSearchTabElement.click()
                        await page.waitForXPath('//div[@class="tab-content"]/div[position()=2 and contains(@class, "active")]//*[@type="reset" and @ng-click="clearCriteria()"]');
                        const [resetBtnElement] = await page.$x('//div[@class="tab-content"]/div[position()=2 and contains(@class, "active")]//*[@type="reset" and @ng-click="clearCriteria()"]')
                        await resetBtnElement.click()
                        await this.sleep(1000)

                        const [docTypeInput] = await page.$x('//div[@class="tab-content"]/div[position()=2 and contains(@class, "active")]//*[@ng-model="documentService.SearchCriteria.searchDocType"]');
                        await docTypeInput.type(this.searchTypeArray[j]);

                        const [fromDateElement] = await page.$x('//div[@class="tab-content"]/div[position()=2 and contains(@class, "active")]//*[@ng-model="documentService.SearchCriteria.fromDate"]')
                        await fromDateElement.type(dateSearch.toLocaleDateString('en-US', {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit"
                        }), {delay: 100})

                        const [toDateElement] = await page.$x('//div[@class="tab-content"]/div[position()=2 and contains(@class, "active")]//*[@ng-model="documentService.SearchCriteria.toDate"]')
                        await toDateElement.type(dateSearch.toLocaleDateString('en-US', {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit"
                        }), {delay: 100})

                        const [submitBtnElement] = await page.$x('//div[@class="tab-content"]/div[position()=2 and contains(@class, "active")]//*[@type="submit" and @ng-click="runSearch(true)"]')
                        const [response] = await Promise.all([
                            page.waitForResponse(response => response.url().includes('/publicsearch1/api/search')),
                            submitBtnElement.click(),
                        ]);
                        const dataResponse = await response.json()
                        const count = await this.getData(dataResponse, dateSearch.toLocaleDateString('en-US'));
                        countRecords += count;
                        console.log(`${dateSearch.toLocaleDateString('en-US')} save ${count} records. (Step ${j + 1}/${this.searchTypeArray.length})`);

                    } catch (e) {
                        console.log(e)
                    }
                }
                await this.randomSleepIn5Sec();
            }
        } catch (e) {
            console.log(e)
            console.log('Error search');
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Middlesex', 'New Jersey', countRecords, 'Civil', errorImage);
            return false
        }
        await AbstractProducer.sendMessage('Middlesex', 'New Jersey', countRecords, 'Civil');
        return true;
    }
}