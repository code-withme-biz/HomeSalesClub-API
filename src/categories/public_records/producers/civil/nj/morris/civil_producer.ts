import db from '../../../../../../models/db';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import axios from 'axios';
import _ from "lodash";

const docTypes: any = {
    "ABSLD": "ABSOLUTE ASSIGN OF LEASE DEED",
    "ABSLM": "ABSOLUTE ASSIGN OF LEASE MORTGAGE",
    "ABSD": "ABSTRACT OF JUDGEMENT DEED",
    "AGR": "AGREEMENT",
    "AGMD": "AGREEMENT OF MERGER",
    "AIR": "AIRCRAFT LIEN",
    "ADCLUA": "AMENDED CLAIM OF LIEN FOR UNPAID ASSESS",
    "ACONL": "AMENDED CONDO LIEN",
    "AMNC": "AMENDED LIEN CLAIM",
    "AMLISP": "AMENDED LIS PENDENS",
    "ACONSL": "AMENDED NOTICE OF CONSTRUCTION LIEN",
    "ADEED": "AMENDMENT TO MASTER DEED",
    "AMND": "AMENDMENT TO MASTER DEED",
    "AMTG": "AMENDMENT TO MORTGAGE",
    "ASGN": "ASSGN MTG",
    "ASRD": "ASSIGN/RENT DEED",
    "ASRM": "ASSIGN/RENT MORT",
    "ASGD": "ASSIGNMENT & ASSUMPTION AGRMT",
    "AALPRO": "ASSIGNMENT ASSUMPTION PROPRIETARY",
    "ASM": "ASSIGNMENT MORTGAGE",
    "ASGND": "ASSIGNMENT OF DEED",
    "BAR": "BARGAIN & SALE DEED",
    "CAN": "CANCEL MORTGAGE",
    "CEMD": "CEMETERY DEED",
    "CRTRL": "CERTIFICATE OF RELEASE OF LIEN",
    "CLUA": "CLAIM OF LIEN FOR UNPAID ASSESSMENTS",
    "COLDEED": "COLLATERAL ASSIGNMENT DEED",
    "COLMTG": "COLLATERAL ASSIGNMENT MTG",
    "CDL": "CONDOMINIUM LIEN",
    "CONSL": "CONSTRUCTION LIEN",
    "CONSD": "CONSTRUCTION LIEN DISCHARGE",
    "CAGNM": "CORRECTIVE ASSGN MTG",
    "CDEED": "CORRECTIVE DEED",
    "COMTG": "COURT ORDER -MORTGAGE",
    "CTOD": "COURT ORDER DEED",
    "CTOJ": "COURT ORDER JUDGEMENT",
    "DEEDD": "DEED DEDICATION",
    "DEEDFLCR": "DEED IN LIEU OF FORECLOSURE",
    "DEEDN": "DEED NOTICE",
    "DEEDCR": "DEED OF CONSERVATION RESTRICTION",
    "DNOSN": "DIS OF NOTICE OF SETTLEMENT 3 NAMES",
    "DSARM": "DISCHARGE ASSIGNMENT RENT MORTGAGE",
    "DSARD": "DISCHARGE ASSIGNMENTS RENT DEED",
    "DISCLUA": "DISCHARGE CLAIM OF LIEN FOR UNPAID ASSMT",
    "DISCL": "DISCHARGE CONSTRUCTION LIEN",
    "DISL": "DISCHARGE OF  LIEN",
    "DAGRC": "DISCHARGE OF AGREEMENT NOT TO ENCUMBER",
    "DAIRL": "DISCHARGE OF AIR CRAFT LIEN",
    "DACTL": "DISCHARGE OF AMENDMENT CONSTR LIEN",
    "DISBLCON": "DISCHARGE OF BUILDING CONTRACT",
    "DCNL": "DISCHARGE OF CONDO LIEN",
    "DLP": "DISCHARGE OF LIS PENDENS",
    "DSMELIEN": "DISCHARGE OF MECHANIC'S LIENS",
    "DIS": "DISCHARGE OF MORTGAGE",
    "DMMTG": "DISCHARGE OF MUNICIPALITY MORTGAGE",
    "DPHYLIEN": "DISCHARGE OF PHYSICANS'S LIEN",
    "DSTL": "DISCHARGE OF PROPERTY FEDERAL LIEN",
    "FTL": "FEDERAL LIEN",
    "HSPL": "HOSPITAL LIEN",
    "JUDGD": "JUDGEMENT DEED",
    "JUDGM": "JUDGEMENT MORTGAGE",
    "LPFILED": "LIS PENDENS FILED",
    "LPR": "LIS PENDENS RECORDED",
    "LPF": "LIS PENDENS/FORECLOSURE",
    "MTRDEED": "MASTER DEED",
    "MDM": "MUNICIPAL DISCHARGE MORTGAGE",
    "MGIL": "MUNICIPAL GRANT IMPOSITION OF LIEN",
    "MUNL": "MUNICIPAL LIEN",
    "MUNORD": "MUNICIPAL ORDINANCE DEED",
    "MRGL": "MUNICIPAL RELEASE OF GRANT OF LIEN",
    "MUNSUB": "MUNICIPAL SUBORDINATION OF MORTGAGE",
    "MUND": "MUNICIPALITY DEED",
    "MLPF": "MUNICIPALITY LIS PENDENS",
    "MNM": "MUNICIPALITY MORTGAGE",
    "ESTFTL": "NOTICE  FEDERAL ESTATE TAX LIEN",
    "LIENCLAIM": "NOTICE OF LIEN CLAIM ASSESSMENT",
    "NOLD": "NOTICE OF LIEN DEED",
    "NOTLF": "NOTICE OF LIEN FOR FINE",
    "NOTUGT": "NOTICE OF LIEN UNDERGROUND STORAGE TANK",
    "LPFD": "NOTICE OF LIS PENDENS-DEED",
    "ORDD": "ORDINANCE IN DEED BOOK",
    "PDCLC": "PARTIAL DIS OF CONSTRUCTION LIEN CLAIM",
    "PCDL": "PARTIAL DISCHARGE OF CONDO LIEN",
    "PHYL": "PHYSICIAN LIEN",
    "POLD": "POSTPONEMENT LIEN DEED",
    "POML": "POSTPONEMENT OF LIEN",
    "POM": "POSTPONEMENT OF MORTGAGE",
    "RERDM": "RE-RECORD DISCHARGE MORTGAGE",
    "RERM": "RE-RECORD MORTGAGE",
    "RMDEED": "RE-RECORD MUNICIPAL DEED",
    "RGL": "RELEASE OF GRANT & LIEN",
    "REJL": "RELEASE OF JUDGEMENT LIEN FEDTAX",
    "RELI": "RELEASE OF LIEN",
    "REL": "RELEASE OF MORTGAGE",
    "REFL": "RELEASE/FEDERAL LIEN",
    "RESD": "RESOLUTION DEED",
    "RESM": "RESOLUTION MORTGAGE",
    "RVFT": "REVOCATION OF RELEASE OF FED TAX LIEN",
    "SHER": "SHERIFFS DEED",
    "SBNAD": "SUB NON-DISTURBANCE&ATTORNMENT AGR DEED",
    "SUBDEED": "SUBDIVISION DEED",
    "SUBM": "SUBORDINATE MORTGAGE",
    "SUB": "SUBORDINATION AGREE",
    "SUBJ": "SUBORDINATION OF JUDGEMENT",
    "SUBL": "SUBORDINATION OF LIEN",
    "SUMTG": "SUBORDINATION OF MORTGAGE",
    "WOL": "WAIVER OF LIEN",
    "WARLC": "WARRANT TO ENTER SATISFACTION LIEN CLAIM",
    "WFTLR": "WITHDRAWAL OF FEDERAL TAX LIEN"

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
        generalInfoPage: 'http://mcclerksng.co.morris.nj.us/publicsearch/'
    };

    documentTypes = [
        "ABSLD,ABSLM,ABSD,AGR,AGMD,AIR,ADCLUA,ACONL,AMNC,AMLISP,ACONSL,ADEED,AMND,AMTG,ASGN,ASRD,ASRM,ASGD,AALPRO,ASM,ASGND,BAR,CAN,CEMD,CRTRL,CLUA,COLDEED,COLMTG,CDL,CONSL,CONSD,CAGNM,CDEED,COMTG,CTOD,CTOJ,DEEDD,DEEDFLCR,DEEDN,DEEDCR,DNOSN,DSARM,DSARD,DISCLUA,DISCL,DISL,DAGRC,DAIRL,DACTL,DISBLCON,DCNL,DLP,DSMELIEN,DIS,DMMTG,DPHYLIEN,DSTL,FTL,HSPL,JUDGD,JUDGM,LPFILED,LPR,LPF,MTRDEED,MDM,MGIL,MUNL,MUNORD,MRGL,MUNSUB,MUND,MLPF,MNM,ESTFTL,LIENCLAIM,NOLD,NOTLF,NOTUGT,LPFD,ORDD,PDCLC,PCDL,PHYL,POLD,POML,POM,RERDM,RERM,RMDEED,RGL,REJL,RELI,REL,REFL,RESD,RESM,RVFT,SHER,SBNAD,SUBDEED,SUBM,SUB,SUBJ,SUBL,SUMTG,WOL,WARLC,WFTL"
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
            'County': 'Morris',
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
                const rawResponse = await axios.post('http://mcclerksng.co.morris.nj.us/publicsearch/api/document', { ID: ` ${docId}` });
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
                const rawResponse = await axios.post('http://mcclerksng.co.morris.nj.us/publicsearch/api/search', data);
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
            let dateRange = await this.getDateRange('New Jersey', 'Morris');
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
            await AbstractProducer.sendMessage('Morris', 'New Jersey', countRecords, 'Civil & Lien', errorImage);
            return false;
        }
        await AbstractProducer.sendMessage('Morris', 'New Jersey', countRecords, 'Civil & Lien');
        return true;
    }
}