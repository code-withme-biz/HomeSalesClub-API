import db from '../../../../../../models/db';
import AbstractProducer from '../../../abstract_producer';
import {IPublicRecordProducer} from '../../../../../../models/public_record_producer';
import axios from 'axios';
import _ from "lodash";

const docTypes: any = {
    'ADJUST': 'ADJUSTMENT TO ACCOUNT',
    'AIRESMNT': 'AERIAL EASEMENT',
    'ARCLIEN': 'AIRCRAFT LIEN',
    'ASSGN': 'ASSIGNMENT',
    'ASSN MTG': 'ASSIGNMENT OF MORTGAGE',
    'BRTYLIEN': 'BANKRUPTCY LIEN',
    'BILLSALE': 'BILL OF SALE',
    'BOROS': 'BOROS',
    'BUILDCON': 'BUILDING CONTRACT',
    'CANMTGR2': 'CANCELED MORTGAGE',
    'CANMTGR3': 'CANCELED MORTGAGE',
    'CANMTGR4': 'CANCELED MORTGAGE',
    'CANMORT': 'CANCELLED MORTGAGE',
    'CANMORT2': 'CANCELLED MORTGAGE RECORDED 2 TIMES',
    'CANMORT3': 'CANCELLED MORTGAGE RECORDED 3 TIMES',
    'CANMORT4': 'CANCELLED MORTGAGE RECORDED 4 TIMES',
    'COLL ASSN': 'COLLATERAL ASSIGMENT',
    'CONLIEN': 'CONSTRUCTION LIEN CLAIM',
    'CONTSALE': 'CONTRACT OF SALE',
    'CORPNAME': 'CORPORATION - CHANGE OF NAME',
    'CNTYIDEN': 'COUNTY IDENTIFICATION CARD',
    'DEED': 'DEED',
    'DEEDNOT': 'DEED NOTICE',
    'DSCOLIEN': 'DISCHARGE CONSTRUCTION LIEN',
    'DISBLCON': 'DISCHARGE OF BUILDING CONTRACT',
    'DISCHCOL': 'DISCHARGE OF COLLATERAL ASSIGNMENT',
    'DISCONSA': 'DISCHARGE OF CONTRACT OF SALE',
    'DSJUDLIEN': 'DISCHARGE OF JUDGEMENT LIEN',
    'DISLEASE': 'DISCHARGE OF LEASE',
    'DISCHLIS': 'DISCHARGE OF LIS PENDENS',
    'DSMELIEN': 'DISCHARGE OF MECHANIC LIENS',
    'DMECHNOI': 'DISCHARGE OF MECHANICS NOTICE INTENSION',
    'DISCHMTG': 'DISCHARGE OF MORTGAGE',
    'DISNOTSETL': 'DISCHARGE OF NOTICE OF SETTLEMENT',
    'DPHYLIEN': 'DISCHARGE OF PHYSICIANS LIEN',
    'RESOL': 'DISCHARGE OF RECOGNIZANCE BOND',
    'DISREIMB': 'DISCHARGE OF REIMBURSEMENT AGREEMENTS',
    'DISSHRBD': 'DISCHARGE OF SHERRIFF BOND',
    'DISTSC': 'DISCHARGE OF TAX SALE CERTIFICATE',
    'DISTRDNM': 'DISCHARGE OF TRADE NAME',
    'DISWKCMP': 'DISCHARGE OF WORKMANS COMPENSATION',
    'DISRECOG': 'DISCHARGE RECOGNIZANCE',
    'DISCLAIM': 'DISCLAIMER',
    'EASEMENT': 'EASEMENTS',
    'ESCROW': 'ESCROW/CHARGE ACCOUNT PAYMENTS',
    'EXPUNGED': 'EXPUNGED INSTRUMENT',
    'EXP': 'EXPUNGEMENT',
    'FEDLIEN': 'FEDERAL LIEN',
    'FINJUDGE': 'FINAL JUDGEMENT',
    'FNDISCL': 'FINANCIAL DISCLOSURE STATEMENT',
    'FIREXMPT': 'FIREMANS EXEMPTION CERTIFICATE',
    'FIREXEMPT': 'FIREMANS EXEMPTION CERTIFICATE',
    'ERGEN': 'GENERAL ELECTION FINANCIAL REPORT',
    'GENMISC': 'GENERAL MISCELLANEOUS',
    'INSTLIEN': 'INSTUTIONAL LIENS',
    'LANDUSE': 'LAND USE PERMIT',
    'LEASE': 'LEASE',
    'LISPEN': 'LIS PENDENS',
    'LOGOS': 'LOGOS',
    'MECHNOI': 'MACH NOTICE OF INTENT',
    'MECHLIEN': 'MECHANICS LIEN',
    'MISCREV': 'MISC REVENUE',
    'MISC': 'MISCELLANEOUS',
    'MREV1': 'MISCELLANEOUS REVENUE CODE 1',
    'MTG': 'MORTGAGE',
    'MORT': 'MORTGAGE',
    'MTG MOD': 'MORTGAGE MODIFICATION',
    'INREM': 'MUNICIPAL TAX FORECLOSURE',
    'MTSC': 'MUNICIPAL TAX SALE CERTIFICATE',
    'NONBUSCORP': 'NONBUSINESS-CORPORATION-CHURCHES-ETC.',
    'NOTARYNF': 'NOTARY NO FEE',
    'NOTARY': 'NOTARY PUBLIC',
    'NOTLIS': 'NOTICE OF LIS PENDENS FILED',
    'NTCELIS': 'NOTICE OF LIS PENDING RECORDED',
    'NOTSETL': 'NOTICE OF SETTLEMENT',
    'NOTSETDT': 'NOTICE OF SETTLEMENT DOUBLE TRANSACTION',
    'EROTHER': 'OTHER ELECTION FINANCIAL REPORTS',
    'PARTSHIP': 'PARTNERSHIP',
    'PHYSLIS': 'PHYSICIANS LICENSE',
    'PHYSLIEN': 'PHYSICIANS LIEN',
    'PH': 'PLACE HOLDER',
    'POA': 'POWER OF ATTORNEY',
    'ERPRI': 'PRIMARY ELECTION FINANCIAL REPORT',
    'RECOG': 'RECOGNIZANCE BOND',
    'REIMBURS': 'REIMBURSEMENTS',
    'RELSTIP': 'RELEASE / STIPULATION',
    'RELASSN': 'RELEASE OF ASSIGNMENT OF MORTGAGE',
    'RELBONCN': 'RELEASE OF BOND CONSTR LIEN',
    'RLFESLEN': 'RELEASE OF FEDERAL TAX LIEN',
    'RELMORT': 'RELEASE OF MORTGAGE',
    'REPAY': 'REPAYMENT AGREEMENT',
    'REVPOA': 'REVOCATION OF POWER OF ATTORNEY',
    'ROADS': 'ROADS',
    'ERSCH': 'SCHOOL ELECTION FINANCIAL REPORT',
    'SHERBOND': 'SHERIFF BONDS',
    'STPERM': 'STATE PERMIT',
    'STOPNOT': 'STOP NOTICE',
    'SUBMAPS': 'SUBDIVISION MAPS',
    'SUBDIV': 'SUBDIVSION',
    'SUBMAP': 'SUBDIVSION',
    'TSC': 'TAX SALE CERTIFICATE',
    'TAXWAIVE': 'TAX WAIVER-INHERITANCE',
    'TRADAMD': 'TRADE NAME AMENDMENT',
    'TRADECRT': 'TRADE NAME CERTIFICATION',
    'TRUSTAGR': 'TRUST AGREEMENT',
    'UCCAMEND': 'UCC AMENDMENT',
    'UCCASSN': 'UCC ASSIGNMENT',
    'UCCCONT': 'UCC CONTINUATION',
    'UCCPPREL': 'UCC PARTIAL RELEASE',
    'UCCPRREL': 'UCC RELEASE PARTIAL',
    'UCCTERM': 'UCC TERMINATION',
    'UCC1': 'UCC-1',
    'UNGESMNT': 'UNDERGROUND EASEMENT',
    'VACATION': 'VACATIONS',
    'VOID': 'VOID',
    'WAGECLM': 'WAGE CLAIM',
    'WAREXEC': 'WARANT OF EXECUTION',
    'WARSATFN': 'WARRANT OF SATISFACTION',
    'WORKCOMP': 'WORKMENS COMPENSATION',
    'WRITEXEC': 'WRIT OF EXECUTION',
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
        generalInfoPage: 'http://sng.co.ocean.nj.us/publicsearch/'
    };

    searchTypeArray = ['ADJUST,AIRESMNT,ARCLIEN,ASSGN,ASSN MTG,BRTYLIEN,BILLSALE,BOROS,BUILDCON,CANMTGR2,CANMTGR3,CANMTGR4,CANMORT,CANMORT2',
        'CANMORT3,CANMORT4,COLL ASSN,CONLIEN,CONTSALE,CORPNAME,CNTYIDEN,DEED,DEEDNOT,DSCOLIEN,DISBLCON,DISCHCOL,DISCONSA,DSJUDLIEN,DISLEASE',
        'DISCHLIS,DSMELIEN,DMECHNOI,DISCHMTG,DISNOTSETL,DPHYLIEN,RESOL,DISREIMB,DISSHRBD,DISTSC,DISTRDNM,DISWKCMP,DISRECOG,DISCLAIM,EASEMENT',
        'ESCROW,EXPUNGED,EXP,FEDLIEN,FINJUDGE,FNDISCL,FIREXMPT,FIREXEMPT,ERGEN,GENMISC,INSTLIEN,LANDUSE,LEASE,LISPEN,LOGOS,MECHNOI,MECHLIEN,MISC',
        'MISCREV,MREV1,MTG,MORT,MTG MOD,INREM,MTSC,NONBUSCORP,NOTARY,NOTARYNF,NOTLIS,NTCELIS,NOTSETL,NOTSETDT,EROTHER,PHYSLIS,PARTSHIP,PHYSLIEN,PH',
        'ERPRI,POA,RECOG,REIMBURS,RELSTIP,RELASSN,RELBONCN,RLFESLEN,RELMORT,REPAY,ROADS,REVPOA,ERSCH,SHERBOND,STPERM,STOPNOT,SUBMAPS,SUBDIV,SUBMAP',
        'TSC,TAXWAIVE,TRADAMD,TRADECRT,TRUSTAGR,UCCAMEND,UCCASSN,UCCCONT,UCCPPREL,UCCPRREL,UCCTERM,UCC1,UNGESMNT,VACATION,VOID,WAGECLM,WAREXEC,WARSATFN,WORKCOMP,WRITEXEC'
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
            await this.browserPages.generalInfoPage.goto(this.urls.generalInfoPage, {waitUntil: 'load'});
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
            'County': 'ocean',
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
            let dateRange = await this.getDateRange('New Jersey', 'Ocean');
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
                            page.waitForResponse(response => response.url().includes('/publicsearch/api/search')),
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
            console.log(e);
            console.log('Error search');
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Ocean', 'New Jersey', countRecords, 'Civil & Lien', errorImage);
            return false;
        }
        await AbstractProducer.sendMessage('Ocean', 'New Jersey', countRecords, 'Civil & Lien');
        return true;
    }
}