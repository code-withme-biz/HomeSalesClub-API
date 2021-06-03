import db from '../../../../../../models/db';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import axios from 'axios';
import _ from "lodash";

const docTypes: any = {
    "ASN": "ASSIGNMENT OF MORTGAGES",
    "CAN": "CANCEL MORTGAGE",
    "CLC": "CONSTRUCTION LIEN CLAIM",
    "DEED": "DEED",
    "DDM": "DEED MUNICIPAL",
    "DD9": "DEED-NEW CONSTRUC/OVER $350,000",
    "DD3": "DEED-NEW CONSTRUC/UNDER $350,000",
    "DD6": "DEED-NO CONSIDERATION",
    "DD7": "DEED-REGULAR/OVER $350,000",
    "DD1": "DEED-REGULAR/UNDER $350,000",
    "DD8": "DEED-SENIOR CITIZEN/OVER $350,000",
    "DD2": "DEED-SENIOR CITIZEN/UNDER $350,000",
    "DLC": "DISCHARGE & AMEND CONTRUC LIEN",
    "DLP": "DISCHARGE OF LIS PENDENS",
    "DMN": "DISCHARGE OF MECHANIC'S LIEN CLAIM",
    "DIS": "DISCHARGE OF MORTGAGE",
    "DSM": "DISCHARGE OF MTG MUNICIPAL",
    "DHY": "DISCHARGE PHYSICIAN'S LIEN",
    "DCB": "DISSOLUTION CONTRUC LIEN BOND",
    "FTX": "FEDERAL TAX LIEN",
    "HSP": "HOSPITAL LIEN",
    "MLC": "MECHANIC'S LIEN CLAIM",
    "MNI": "MECHANIC'S NOTICE OF INTENTION",
    "DD5": "MISC DEED",
    "MTG": "MORTGAGE",
    "MGM": "MORTGAGE - MUNICIPAL",
    "NLP": "NOTICE OF LIS PENDENS",
    "D01": "OLD DEEDS",
    "M01": "OLD MTG",
    "CD1": "OLD TAX TYPE DEEDS",
    "CD2": "OLD TAX TYPE DEEDS",
    "CD3": "OLD TAX TYPE DEEDS",
    "CD7": "OLD TAX TYPE DEEDS",
    "CD8": "OLD TAX TYPE DEEDS",
    "CD9": "OLD TAX TYPE DEEDS",
    "MOR": "OTHER MORTGAGES",
    "RSP": "RELEASE HOSPITAL LIEN",
    "RTX": "RELEASE OF FEDERAL TAX LIEN",
    "REL": "RELEASE OF MORTGAGE",
    "RSM": "RELEASE OF MTG - MUNICIPAL"

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
        generalInfoPage: 'https://records.mercercounty.org/publicsearch/'
    };

    documentTypes = [
        "ASN,CAN,CLC,DEED,DDM,DD9,DD3,DD6,DD7,DD1,DD8,DD2,DLC,DLP,DMN,DIS,DSM,DHY,DCB,FTX,HSP,MLC,MNI,DD5,MTG,MGM,NLP,D01,M01,CD1,CD2,CD3,CD7,CD8,CD9,MOR,RSP,RTX,REL,RSM"
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
            'County': 'Mercer',
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
                const rawResponse = await axios.post('https://records.mercercounty.org/publicsearch/api/document', { ID: ` ${docId}` });
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
                const rawResponse = await axios.post('https://records.mercercounty.org/publicsearch/api/search', data);
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
            let dateRange = await this.getDateRange('New Jersey', 'Mercer');
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
            await AbstractProducer.sendMessage('Mercer', 'New Jersey', countRecords, 'Civil & Lien', errorImage);
            return false;
        }
        await AbstractProducer.sendMessage('Mercer', 'New Jersey', countRecords, 'Civil & Lien');
        return true;
    }
}