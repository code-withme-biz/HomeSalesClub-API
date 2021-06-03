import db from '../../../../../../models/db';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import axios from 'axios';
import _ from "lodash";

const docTypes: any = {
    "AIR": "AIRCRAFT LIEN",
    "LPRA": "AMENDED LIS PENDENS",
    "CNLA": "AMENDMENT CONDO LIEN",
    "DMDA": "AMENDMENT MASTER DEED",
    "AOLD": "ASGMT OF LEASE DISCHARGE",
    "AOL": "ASSIGNMENT OF LEASE",
    "MTGA": "ASSIGNMENT OF MORTGAGE",
    "MANC": "ASSIGNMENT OF MORTGAGE NO CHARGE",
    "AORD": "ASSIGNMENT OF RENT DISCHARGE",
    "CAN": "CANCELLED MORTGAGE",
    "CANC": "CANCELLED MORTGAGE NO CHARGE",
    "CAN2": "CANCELLED MORTGAGE RERECORDED",
    "CNL": "CONDOMINIUM LIEN",
    "MTGC": "CONSOLIDATION OF MORTGAGE",
    "CLC": "CONSTRUCTION LIEN",
    "CLCD": "CONSTRUCTION LIEN DISCHARGE",
    "ORDD": "COURT ORDER/DEED",
    "ORDM": "COURT ORDER/MORTGAGE",
    "DEED": "DEED",
    "DEEDBK": "DEED BOOK SCANNED",
    "DMAP": "DEED MAP",
    "DNC": "DEED NO CHARGE",
    "DN": "DEED NOTICE",
    "DEMM": "DEMOLITION LIEN/MUNICIPALITY",
    "CNLD": "DISCHARGE CONDO LIEN",
    "MDNC": "DISCHARGE MORTGAGE NO CHARGE",
    "AIRD": "DISCHARGE OF AIRCRAFT LIEN",
    "LPD": "DISCHARGE OF LIS PENDENS",
    "MLCD": "DISCHARGE OF MECHANIC'S LIENS",
    "MTGD": "DISCHARGE OF MORTGAGE",
    "NOSD": "DISCHARGE OF NOTICE OF SETTLEMENT",
    "DNA": "DNA STATE LIEN",
    "FTL": "FEDERAL TAX LIEN",
    "FJR": "FINAL JUDGEMENT IN REM",
    "HL": "HOSPITAL LIEN DOCKET",
    "ILV": "INSTITUTION LIEN VIEWABLE",
    "ILD": "INSTITUTIONAL LIEN DISCHARGE",
    "LPR": "LIS PENDENS /RECORDED",
    "LPF": "LIS PENDENS FORECLOSURE",
    "LPFA": "LIS PENDENS FORECLOSURE AMENDMENT",
    "DMD": "MASTER DEED",
    "MECH LN": "MECHANICS LIEN",
    "MEDL": "MEDICAID LIEN",
    "MEDLD": "MEDICAID LIEN DISCHARGE",
    "MTGM": "MODIFICATION OF MORTGAGE",
    "MTG": "MORTGAGE",
    "MAFF": "MORTGAGE AFFIDAVIT",
    "MA": "MORTGAGE AMENDMENT",
    "MTGBK": "MORTGAGE BOOK - SCANNED",
    "MEA": "MORTGAGE EXTENSION",
    "MM": "MORTGAGE MEMORANDUM",
    "MNC": "MORTGAGE NO CHARGE",
    "DMUN": "MUNICIPAL DEED",
    "MULC": "MUNICIPAL MECHANICS LIEN",
    "MUNM": "MUNICIPAL MORTGAGE",
    "MURE": "MUNICIPAL REDEMPTION TSC",
    "AGND": "NON DEED AGREEMENT",
    "NOL": "NOTICE OF LIEN",
    "PHL": "PHYSICIAN/HOSPITAL LIEN",
    "MTGP": "POSTPONEMENT OF MORTGAGE",
    "FTLR": "RELEASE FEDERAL TAX LIEN",
    "MTGR": "RELEASE OF MORTGAGE",
    "SHFD": "SHERIFF DEED",
    "MLS": "STIP MTG PRIOR MECH LIEN",
    "MTGS": "SUBORDINATION OF MORTGAGE",
    "VL": "VENDEE LIEN",
    "FTLW": "WITHDRAWAL OF FED TAX LIEN"

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
        generalInfoPage: 'http://24.246.110.8/or_web1/'
    };

    documentTypes = [
        "AIR,LPRA,CNLA,DMDA,AOLD,AOL,MTGA,MANC,AORD,CAN,CANC,CAN2,CNL,MTGC,CLC,CLCD,ORDD,ORDM,DEED,DEEDBK,DMAP,DNC,DN,DEMM,CNLD,MDNC,AIRD,LPD,MLCD,MTGD,NOSD,DNA,FTL,FJR,HL,ILV,ILD,LPR,LPF,LPFA,DMD,MECH LN,MEDL,MEDLD,MTGM,MTG,MAFF,MA,MTGBK,MEA,MM,MNC,DMUN,MULC,MUNM,MURE,AGND,NOL,PHL,MTGP,FTLR,MTGR,SHFD,MLS,MTGS,VL,FTLW"
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
            'Property State': 'NJ',
            'County': 'Atlantic',
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
                const rawResponse = await axios.post('http://24.246.110.8/or_web1/api/document', { ID: ` ${docId}` });
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
                const rawResponse = await axios.post('http://24.246.110.8/or_web1/api/search', data);
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
            let dateRange = await this.getDateRange('New Jersey', 'Atlantic');
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
            await AbstractProducer.sendMessage('Atlantic', 'New Jersey', countRecords, 'Civil & Lien', errorImage);
            return false;
        }
        await AbstractProducer.sendMessage('Atlantic', 'New Jersey', countRecords, 'Civil & Lien');
        return true;
    }
}