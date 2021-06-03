import db from '../../../../../models/db';
import AbstractProducer from '../../abstract_producer';
import axios from 'axios';

export default abstract class WisconsinSearchProducer extends AbstractProducer {

    abstract state: string;
    abstract countyId: number;
    abstract county: string;
    abstract stateFull: string;

    urls = {
        generalInfoPage: 'https://wcca.wicourts.gov/advanced.html'
    };

    caseTypesAbrev: any = {
        'CV': 'Civil',
        'CI': 'Commitment of an Inmate',
        'CX': 'Complex Forfeitures',
        'CO': 'Condominium Lien',
        'CL': 'Construction Lien',
        'FA': 'Family',
        'CF': 'Felony',
        'FJ': 'Foreign Judgments',
        'GF': 'Group File',
        'HT': 'Habitual Traffic Offender',
        'HL': 'Hospital Lien',
        'IP': 'Incarcerated Person',
        'IN': 'Informal Probate',
        'JD': 'John Doe',
        'JT': 'Joint tenancy',
        'ML': "Mechanic' Lien",
        'CM': 'Misdemeanor',
        'FO': 'Non-Traffic Ordinance Violation',
        'OL': 'Other Lien',
        'PA': 'Paternity',
        'PR': 'Probate',
        'SC': 'Small Claims',
        'TW': 'Tax Warrants',
        'TR': 'Traffic Forfeiture',
        'TJ': 'Transcript of Judgment',
        'TC': 'Tribal Court Orders',
        'UC': 'Unemployment Compensation',
        'WL': 'Wills',
        'WC': "Worker's Compensation (WC)",
    }

    //CT

    removeRowArray = [
        'CITY', 'DEPT', 'CTY', 'UNITED STATES', 'BANK', 'FIA CARD SERVICES NA',
        'FLORIDA PACE FUNDING AGENCY', 'COUNTY', 'CREDIT', 'HOSPITAL', 'FUNDING', 'UNIVERSITY',
        'MEDICAL', 'CONDOMINIUM ASSOCIATION', 'LOTS', 'TEXAS STATE', 'VETERANS', 'SECRETARY', 'DEPARTMENT', 'TITLE',
        '{Defendant}'
    ]
    removeRowRegex = new RegExp(`\\b(?:${this.removeRowArray.join('|')})\\b`, 'i')

    // constructor(publicRecordProducer: IPublicRecordProducer) {
    //     // @ts-ignore
    //     super();
    //     this.publicRecordProducer = publicRecordProducer;
    //     this.stateToCrawl = this.publicRecordProducer?.state || '';
    // }

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
            await this.browserPages.generalInfoPage?.waitForXPath('//*[@class="row main-content"]');
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    async saveRecord(fillingDate: string, parseName: any, prod: any, docType: string) {
        const data = {
            'Property State': this.state,
            'County': this.county,
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
        let count = 0;
        for (let row of dataTable) {
            try {
                const docTypeMatch = /\d+(?<caseType>\w\w)/.exec(row.caseNo);
                if (!docTypeMatch?.groups?.caseType || docTypeMatch?.groups?.caseType == 'CT' || docTypeMatch?.groups?.caseType == 'CF') continue;

                let docType: string = this.caseTypesAbrev[docTypeMatch?.groups?.caseType];
                let practiceType = this.getPracticeType(docType);
                const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                const prod = await db.models.Product.findOne({name: productName}).exec();
                let namesArray = row.caption.split('vs.')
                if (!namesArray[1]) continue;
                let name = namesArray[1].replace('et al', '').trim()
                if (this.removeRowRegex.test(name)) continue;
                const parseName: any = this.newParseNameFML(namesArray[1].trim());
                if (parseName.type && parseName.type == 'COMPANY') {
                    continue;
                }
                const saveRecord = await this.saveRecord(fillingDate, parseName, prod, docType);
                saveRecord && count++
            } catch (e) {
                console.log(e)
            }
        }
        return count
    }

    async requestTableData(date: string) {
        const data = {
            attyType: "partyAtty",
            filingDate: {
                end: date,
                start: date
            },
            includeMissingDob: false,
            includeMissingMiddleName: false,
            countyNo: this.countyId
        };
        return new Promise(async (resolve, reject) => {
            const rawResponse = await axios.post('https://wcca.wicourts.gov/jsonPost/advancedCaseSearch', data);
            if (rawResponse.status === 200) {
                return resolve(rawResponse.data.result.cases);
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
            let dateRange = await this.getDateRange(this.stateFull, this.county);
            let date = dateRange.from;
            let today = dateRange.to;
            let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24)) - 1;
            for (let i = days < 0 ? 1 : days; i >= 0; i--) {
                let dateSearch = new Date();
                dateSearch.setDate(dateSearch.getDate() - i);
                const dateReq = dateSearch.toLocaleDateString('en-US', {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit"
                }).replace('\\', '-').replace('\\', '-')
                console.log('Start search with date: ', dateSearch.toLocaleDateString('en-US'))

                const responseData: any = await this.requestTableData(dateReq)

                const count = await this.getData(responseData, dateSearch.toLocaleDateString('en-US'));
                countRecords += count;
                console.log(`${dateSearch.toLocaleDateString('en-US')} save ${count} records.`);

                await this.randomSleepIn5Sec()

            }
        } catch (e) {
            console.log(e)
            console.log('Error search');
            await AbstractProducer.sendMessage(this.county, this.stateFull, countRecords, 'Civil');
            return false
        }

        await AbstractProducer.sendMessage(this.county, this.stateFull, countRecords, 'Civil');
        return true;
    }
}