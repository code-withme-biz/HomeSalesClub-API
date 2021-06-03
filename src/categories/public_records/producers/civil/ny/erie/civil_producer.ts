import db from '../../../../../../models/db';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import axios from 'axios';
import _ from "lodash";

const docTypes: any = {
    "703": "AFFIDAVIT",
    "M80": "AGR ADDTNL ADVANCE FOR MORTGAGE TAX",
    "352": "AMD LIS PENDENS",
    "314": "ASSN MECH/VESSEL LIEN",
    "8": "CEMETERY DEED",
    "MTX": "COLLECT MTG TAX",
    "636": "COMMISSIONER OF DEEDS",
    "707": "CONSENSUAL LIEN",
    "769": "CONSENT TO ASSUME/MODIFY MORTGAGE-768",
    "DEED": "DEED",
    "D1B": "DEED",
    "D1BU": "DEED < 500",
    "D99": "DEED CONVERSION",
    "719": "DEED OF GUARDIANSHIP",
    "DOM": "DEED OTHER<1000000",
    "DO1": "DEED OTHER<175000",
    "DO2": "DEED OTHER<250000",
    "DO3": "DEED OTHER<350000",
    "DOU": "DEED OTHER<500",
    "DO5": "DEED OTHER<500000",
    "DO+": "DEED OTHER&gt;1000000",
    "D1C": "DEED PRE-1983",
    "D1CU": "DEED PRE-1983<500",
    "DCO": "DEED PRE-83W250",
    "DCOU": "DEED PRE-83W250<500",
    "DRM": "DEED RES<1000000",
    "DR1": "DEED RES<175000",
    "DR2": "DEED RES<250000",
    "DR3": "DEED RES<350000",
    "DRU": "DEED RES<500",
    "DR5": "DEED RES<500000",
    "DR+": "DEED RES&gt;1000000",
    "D1VU": "DEED VACANT LAND<500",
    "DBO": "DEED-$250 EQUIL",
    "DBOU": "DEED-$250 EQUIL<500",
    "D1F": "DEED-$4 PD ALBY",
    "D1FU": "DEED-$4 PD ALBY<500",
    "DFO": "DEED-$4ALBY-250",
    "DFOU": "DEED-$4ALBY-250<500",
    "D1D": "DEED-EXEMPT",
    "D1DU": "DEED-EXEMPT<500",
    "DDO": "DEED-EXMPT/$250",
    "D1M": "DEED-MANSION",
    "D1A": "DEED-SR EXEMPT",
    "D1V": "DEED-VACANT LND",
    "DVO": "DEED-VACANT$250",
    "DVOU": "DEED-VACANT$250<500",
    "317": "EXT MECH LIEN",
    "M7E": "EXT MTG-USE M7",
    "817": "FEDERAL TX LIEN",
    "312": "MECHANIC LIEN",
    "MTG": "MORTGAGE",
    "2RM": "MORTGAGE RIDER",
    "M21": "MTG 1-2 BANK",
    "M22": "MTG 1-2 PRIVATE",
    "M23": "MTG 3-6 BANK",
    "M24": "MTG 3-6 PRIVATE",
    "3OR": "MTG DISCH-COURT ORDER",
    "3E": "MTG DISCH-ERROR",
    "3F": "MTG DISCH-FULL",
    "3C": "MTG DISCH-INQRY",
    "3M": "MTG DISCH-MERS-RPL 321(2)(B)",
    "3P": "MTG DISCH-PARTIAL",
    "3": "MTG DISCHRG-NV",
    "M2A": "MTG PVT NO AFF",
    "M2B": "MTG PVT NO AFF3",
    "081": "MTG TAX EXEMPT SERVICE 943",
    "MTC": "MTG TAX OTHER COUNTY",
    "M27": "MTG-COMM/RES PR",
    "M26": "MTG-COMM/RES-BK",
    "M25": "MTG-COMMERCIAL",
    "M29": "MTG-CONDO",
    "M99": "MTG-CONVERSION",
    "M28": "MTG-TAX EXEMPT",
    "327": "PRSNL PROP LIEN",
    "743": "REDEEM TAX LIEN",
    "110": "STATE TAX LIEN",
    "549": "TORRNS MTG"
}

const removeRowArray = [
    'CITY', 'DEPT', 'CTY', 'UNITED STATES', 'BANK', 'FIA CARD SERVICES NA',
    'FLORIDA PACE FUNDING AGENCY', 'COUNTY', 'CREDIT', 'HOSPITAL', 'FUNDING', 'UNIVERSITY',
    'MEDICAL', 'CONDOMINIUM ASSOCIATION', 'LOTS', 'TEXAS STATE', 'VETERANS', 'SECRETARY', 'DEPARTMENT',
    'INDIVIDUAL', 'INDIVIDUALLY', 'FINANCE', 'CITIBANK', 'MERS'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')

export default class CivilProducer extends AbstractProducer {

    urls = {
        generalInfoPage: 'http://ecclerk.erie.gov/BrowserView/default.aspx'
    };

    documentTypes = ["703,M80,352,314,8,MTX,636,707,769,DEED,D1B,D1BU,D99,719,DOM,DO1,DO2,DO3,DOU,DO5,DO+,D1C,D1CU,DCO,DCOU,DRM,DR1,DR2,DR3,DRU,DR5,DR+,D1VU,DBO,DBOU,D1F,D1FU,DFO,DFOU,D1D,D1DU,DDO,D1M,D1A,D1V,DVO,DVOU,317,M7E,817,312,MTG,2RM,M21,M22,M23,M24,3OR,3E,3F,3C,3M,3P,3,M2A,M2B,081,MTC,M27,M26,M25,M29,M99,M28,327,743,110,549"
    ];

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
            await this.browserPages.generalInfoPage.goto(this.urls.generalInfoPage, { waitUntil: 'load' });
            return true;
        } catch (err) {
            console.warn(err);
            return false;
        }
    }

    async read(): Promise<boolean> {
        try {
            await this.browserPages.generalInfoPage?.waitForXPath('//*[@heading="Document Type" and @active="searchTabs[1]"]');
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    async saveRecord(fillingDate: string, parseName: any, prod: any, originalDocType: string) {

        const data = {
            'Property State': 'NY',
            'County': 'Erie',
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

    async getData(dataTable: any, fillingDate: string) {
        let count = 0;
        for (let row of dataTable) {
            try {
                const docData: any = await this.requestDocIdData(row.doc_id)
                const docType = docTypes[docData.type]
                let practiceType = this.getPracticeType(docType);
                if (practiceType == 'debt') {
                    if (docType.match(/mtg/i)) {
                        practiceType = 'mortgage-lien';
                    }
                }
                const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                const prod = await db.models.Product.findOne({ name: productName }).exec();
                for (let i = 0; i < docData.reverse_parties.length; i++) {
                    let name = docData.reverse_parties[i]
                    if (removeRowRegex.test(name)) continue;
                    const parseName: any = this.newParseName(name.trim());
                    if (parseName.type && parseName.type == 'COMPANY') {
                        continue;
                    }
                    const saveRecord = await this.saveRecord(fillingDate, parseName, prod, docType);
                    saveRecord && count++
                }
                await this.sleep(1000);
                console.log("Sleeping with", 1000, "ms...");
            } catch (e) {
            }
        }
        return count
    }

    async requestDocIdData(docId: number) {
        try {
            return new Promise(async (resolve, reject) => {
                const rawResponse = await axios.post('http://ecclerk.erie.gov/BrowserView/api/document', { ID: ` ${docId}` });
                if (rawResponse.status === 200) {
                    return resolve(rawResponse.data);
                }
                console.log('Error get doc data')
                return reject();
            })
        } catch (err) {
            console.log('Error get doc data')
            return new Promise(async (resolve, reject) => {
                return reject();
            })
        }
    }

    async requestTableData(docTypes: string, date: string) {
        try {
            const data = {
                "DocTypes": docTypes,
                "FromDate": date,
                "MaxRows": 0,
                "RowsPerPage": 0,
                "StartRow": 0,
                "ToDate": date
            };
            return new Promise(async (resolve, reject) => {
                const rawResponse = await axios.post('http://ecclerk.erie.gov/BrowserView/api/search', data);
                if (rawResponse.status === 200) {
                    return resolve(rawResponse.data);
                }
                console.log('Error get table data')
                return reject();
            })
        } catch (err) {
            console.log('Error get table data')
            return new Promise(async (resolve, reject) => {
                return reject();
            })
        }

    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let countRecords = 0;
        try {
            let dateRange = await this.getDateRange('New York', 'Erie');
            let date = dateRange.from;
            let today = dateRange.to;
            let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24)) - 1;
            for (let i = days < 0 ? 1 : days; i >= 0; i--) {
                let dateSearch = new Date();
                dateSearch.setDate(dateSearch.getDate() - i);
                const dateArray = dateSearch.toLocaleDateString('en-US', {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit"
                }).split('/');
                const dateReq = dateArray[2] + dateArray[0] + dateArray[1]
                console.log('Start search with date: ', dateSearch.toLocaleDateString('en-US'))
                for (let j = 0; j < this.documentTypes.length; j++) {
                    try {
                        const resp: any = await this.requestTableData(this.documentTypes[j], dateReq)
                        const uniqTableData = _.uniqBy(resp, 'doc_id');
                        const count = await this.getData(uniqTableData, dateSearch.toLocaleDateString('en-US'));
                        countRecords += count;
                        console.log(`${dateSearch.toLocaleDateString('en-US')} save ${count} records. (Step ${j + 1}/${this.documentTypes.length})`);
                        await this.randomSleepIn5Sec();
                    } catch (e) {
                    }
                }
                await this.randomSleepIn5Sec();
            }
        } catch (e) {
            console.log(e);
            console.log('Error search');
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Erie', 'New York', countRecords, 'Civil & Lien', errorImage);
            return false;
        }
        await AbstractProducer.sendMessage('Erie', 'New York', countRecords, 'Civil & Lien');
        return true;
    }
}