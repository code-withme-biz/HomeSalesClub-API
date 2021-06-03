import db from '../../../../../../models/db';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import axios from 'axios';
import _ from "lodash";

const docTypes: any = {
    "ABSLD": "ABSOLUTE ASSIGN OF LEASE DEED",
    "ABSLM": "ABSOLUTE ASSIGN OF LEASE MORTGAGE",
    "ABSD": "ABSTRACT OF JUDGEMENT DEED",
    "AIR": "AIRCRAFT LIEN",
    "ADCLUA": "AMENDED CLAIM OF LIEN FOR UNPAID ASSESS",
    "ACONL": "AMENDED CONDO LIEN",
    "AMNC": "AMENDED LIEN CLAIM",
    "AMLISP": "AMENDED LIS PENDENS",
    "ACONSL": "AMENDED NOTICE OF CONSTRUCTION LIEN",
    "AMND": "AMENDMENT TO MASTER DEED",
    "ADEED": "AMENDMENT TO MASTER DEED",
    "AMTG": "AMENDMENT TO MORTGAGE",
    "ASGN": "ASSGN MTG",
    "ASRD": "ASSIGN/RENT DEED",
    "ASGND": "ASSIGNMENT OF DEED",
    "21": "ASSIGNMENT OF MORTGAGE",
    "ASSUM": "ASSUMPTION OF MORTGAGE",
    "6": "CANCELLED MORTGAGE",
    "CEMD": "CEMETERY DEED",
    "CRTRL": "CERTIFICATE OF RELEASE OF LIEN",
    "V-2": "CERTIFIED COPY - LIENS",
    "BS1": "CHATTEL MORTGAGES 1947 TO 1960",
    "CLUA": "CLAIM OF LIEN FOR UNPAID ASSESSMENTS",
    "COLDEED": "COLLATERAL ASSIGNMENT DEED",
    "COLMTG": "COLLATERAL ASSIGNMENT MTG",
    "33": "COLLECT - CANCELLED MORTGAGES",
    "31": "COLLECT - DEEDS",
    "33A": "COLLECT - DISCHARGE OF MORTGAGE",
    "32": "COLLECT - MORTGAGES",
    "CDL": "CONDOMINIUM LIEN",
    "L7": "CONSTRUCTION LIEN",
    "CONSL": "CONSTRUCTION LIEN",
    "CONLAD": "CONSTRUCTION LIEN AMENDMENT",
    "CONSD": "CONSTRUCTION LIEN DISCHARGE",
    "CAGNM": "CORRECTIVE ASSGN MTG",
    "CDEED": "CORRECTIVE DEED",
    "COMTG": "COURT ORDER -MORTGAGE",
    "CTOD": "COURT ORDER DEED",
    "BS2": "CROP MORTGAGES 1934 TO 1962",
    "DECTR": "DECLARATION OF TRUST",
    "DOR": "DECLARATION/ RESTRICTIONS",
    "2": "DEED",
    "2A": "DEED",
    "2B": "DEED",
    "2C": "DEED",
    "2D": "DEED",
    "2E": "DEED",
    "2N": "DEED",
    "2S": "DEED",
    "DEED": "DEED  AND REALTY TAX FEES",
    "DEEDB1MIL": "DEED - BLIND / DISABLED < 1,000,000",
    "DEEDB350": "DEED - BLIND / DISABLED < 350,000",
    "DEEDE1MIL": "DEED - EXEMPT &gt; 1,000,000",
    "DEEDL1MIL": "DEED - LOW/MODERATE INCOME &gt; 1,000,000",
    "DEEDL350": "DEED - LOW/MODERATE INCOME &gt; 350,000",
    "DEEDN1MIL": "DEED - NEW CONSTRUCTION &gt; 1,000,000",
    "DEEDN350": "DEED - NEW CONSTRUCTION &gt; 350,000",
    "DEEDS1MIL": "DEED - SENIOR CITIZEN &gt; 1,000,000",
    "DEEDS350": "DEED - SENIOR CITIZEN &gt; 350,000",
    "DEED1MIL": "DEED < 1,000,000",
    "DEED350": "DEED < 350,000",
    "DEEDAJ": "DEED AMENDED JUDGEMENT",
    "DEEDD": "DEED DEDICATION",
    "DEEDFLCR": "DEED IN LIEU OF FORECLOSURE",
    "DREM": "DEED IN REM",
    "DEEDN": "DEED NOTICE",
    "DEEDCR": "DEED OF CONSERVATION RESTRICTION",
    "DSARD": "DISCHARGE ASSIGNMENTS RENT DEED",
    "DISCLUA": "DISCHARGE CLAIM OF LIEN FOR UNPAID ASSMT",
    "L11": "DISCHARGE CONST LIENS",
    "DISCL": "DISCHARGE CONSTRUCTION LIEN",
    "DISCLB": "DISCHARGE CONSTRUCTION LIEN BY BOND",
    "L12": "DISCHARGE INSTITUTE LIEN",
    "L13": "DISCHARGE NOTICE OF INTEN",
    "DISL": "DISCHARGE OF  LIEN",
    "DAIRL": "DISCHARGE OF AIR CRAFT LIEN",
    "DACTL": "DISCHARGE OF AMENDMENT CONSTR LIEN",
    "DCNL": "DISCHARGE OF CONDO LIEN",
    "DSDN": "DISCHARGE OF DEED NOTICE",
    "DSMELIEN": "DISCHARGE OF MECHANIC'S LIENS",
    "DMMTG": "DISCHARGE OF MUNICIPALITY MORTGAGE",
    "DPHYLIEN": "DISCHARGE OF PHYSICANS'S LIEN",
    "L14": "DISCHARGE OF PROPERTY - FEDERAL TAX LIEN",
    "DSTL": "DISCHARGE OF PROPERTY FEDERAL LIEN",
    "L15": "DISCHARGE PHYSICIAN LIEN",
    "L18": "FEDERAL ESTATE TAX LIEN",
    "FTL": "FEDERAL LIEN",
    "L19": "FEDERAL TAX LIEN",
    "L20": "FEDERAL TAX LIEN AMENDMENT",
    "GRANT": "GRANT IMPOSITION OF LIEN n/c",
    "JUDGD": "JUDGEMENT DEED",
    "JUDGM": "JUDGEMENT MORTGAGE",
    "17": "LIS PENDENS AMENDED FORECLOSURE",
    "17A": "LIS PENDENS AMENDED RECORDED",
    "16": "LIS PENDENS FORECLOSURE",
    "15": "LIS PENDENS RECORDED",
    "MTRDEED": "MASTER DEED",
    "IA6": "MECHANICS LIEN",
    "3": "MORTGAGE",
    "MTGMOD": "MORTGAGE MODIFICATION",
    "MTGOC": "MORTGAGE ORDER BY COURT",
    "SS14": "MORTGAGEE CORPORATION INDEX 1960 TO 1969",
    "SS15": "MORTGAGEE INDIVIDUAL INDEX 1937 TO 1969",
    "NOLD": "NOTICE OF LIEN DEED",
    "NOTLF": "NOTICE OF LIEN FOR FINE",
    "NOTUGT": "NOTICE OF LIEN UNDERGROUND STORAGE TANK",
    "LPFD": "NOTICE OF LIS PENDENS-DEED",
    "18": "SATISFACTION OF LIS PENDENS FORECLOSURE",
    "18A": "SATISFACTION OF LIS PENDENS RECORDED",
    "20": "SATISFACTION OF MORTGAGE",
    "XSEFR": "SCHOOL ELECTION FINANCIAL REPORT",
    "SHER": "SHERIFFS DEED",
    "SUBDEED": "SUBDIVISION DEED",
    "SUBM": "SUBORDINATE MORTGAGE",
    "SUB": "SUBORDINATION AGREE",
    "L35": "SUBORDINATION OF FED TAX",
    "SUBJ": "SUBORDINATION OF JUDGEMENT",
    "SUBL": "SUBORDINATION OF LIEN",
    "SUMTG": "SUBORDINATION OF MORTGAGE",
    "38": "SUBORDINATION OF MORTGAGE",
    "L39": "WITHDRAWAL FED TAX LIEN",
    "WFTLR": "WITHDRAWAL OF FEDERAL TAX LIEN",
    "FEDTAXRLWD": "WITHDRAWAL OF FILED NOT OF FED TAX LIEN"
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
        generalInfoPage: 'http://168.229.187.15/publicsearch64/'
    };

    documentTypes = ["ABSLD,ABSLM,ABSD,AIR,ADCLUA,ACONL,AMNC,AMLISP,ACONSL,AMND,ADEED,AMTG,ASGN,ASRD,ASGND,21,ASSUM,6,CEMD,CRTRL,V-2,BS1,CLUA,COLDEED,COLMTG,33,31,33A,32,CDL,L7,CONSL,CONLAD,CONSD,CAGNM,CDEED,COMTG,CTOD,BS2 ,DECTR,DOR,2,2A,2B,2C,2D,2E,2N,2S,DEED,DEEDB1MIL,DEEDB350,DEEDE1MIL,DEEDL1MIL,DEEDL350,DEEDN1MIL,DEEDN350,DEEDS1MIL,DEEDS350,DEED1MIL,DEED350,DEEDAJ,DEEDD,DEEDFLCR,DREM,DEEDN,DEEDCR,DSARD,DISCLUA,L11,DISCL,DISCLB,L12,L13,DISL,DAIRL,DACTL,DCNL,DSDN,DSMELIEN,DMMTG,DPHYLIEN,L14,DSTL,L15,L18,FTL,L19,L20,GRANT,JUDGD,JUDGM,17,17A,16,15,MTRDEED,IA6,3,MTGMOD,MTGOC,SS14,SS15,NOLDI,NOTLF,NOTUGT,LPFD,18,18A,20,XSEFR,SHER,SUBDEED,SUBM,SUB,L35,SUBJ,SUBL,SUMTG,38,L39,WFTLR,FEDTAXRLWD"];

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
            'County': 'Bergen',
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
            } catch (e) {
            }
        }
        return count
    }

    async requestDocIdData(docId: number) {
        return new Promise(async (resolve, reject) => {
            const rawResponse = await axios.post('http://168.229.187.15/publicsearch64/api/document', { ID: ` ${docId}` });
            if (rawResponse.status === 200) {
                return resolve(rawResponse.data);
            }
            console.log('Error get doc data')
            return reject();
        })
    }

    async requestTableData(docTypes: string, date: string) {
        const data = {
            "DocTypes": docTypes,
            "FromDate": date,
            "MaxRows": 0,
            "RowsPerPage": 0,
            "StartRow": 0,
            "ToDate": date
        };
        return new Promise(async (resolve, reject) => {
            const rawResponse = await axios.post('http://168.229.187.15/publicsearch64/api/search', data);
            if (rawResponse.status === 200) {
                return resolve(rawResponse.data);
            }
            console.log('Error get table data')
            return reject();
        })

    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let countRecords = 0;
        try {
            let dateRange = await this.getDateRange('New Jersey', 'Bergen');
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
            await AbstractProducer.sendMessage('Bergen', 'New Jersey', countRecords, 'Civil & Lien', errorImage);
            return false;
        }
        await AbstractProducer.sendMessage('Bergen', 'New Jersey', countRecords, 'Civil & Lien');
        return true;
    }
}