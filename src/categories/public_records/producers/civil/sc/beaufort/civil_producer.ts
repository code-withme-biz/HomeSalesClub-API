import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../../abstract_producer';
import {IPublicRecordProducer} from '../../../../../../models/public_record_producer';

const docTypes: any = {
    'ABET': "ABET",
    'AFF': "AFFIDAVIT",
    'AFFSVC': "AFFIDAVIT OF SERVICE",
    'AGT': "AGREEMENT",
    'ANNEX': "ANNEXATION AGREEMENT",
    'AOC': "AOC",
    'AOO': "AOO",
    'ASIG': "ASIG",
    'ASIGO': "ASSIGNMENT OF OTHER DOCUMENT",
    'BNKRUPCY': "BANKRUPTCY DOCUMENT",
    'BASG': "BASG",
    'BASTG': "BASTG",
    'BTL': "BEAUFORT TREASURERS LIEN",
    'BTLS': "BEAUFORT TREASURERS LIEN SATISFACTION",
    'BTLW': "BEAUFORT TREASURERS LIEN WITHDRAWAL",
    'BOS': "BILL OF SALE",
    'BFT': "BOND FOR TITLE",
    'BSAT': "BSAT",
    'CERTNO': "CERTIFICATES/NOTICES",
    'CHART': "CHARTER",
    'CHARTER': "CHARTER",
    'DBA': "COMPANY NAME",
    'CONDEM': "CONDEMNATION NOTICE",
    'CONT': "CONTRACT OF SALE",
    'CORP': "CORPORATION - CHANGE OF NAME",
    'COURTM': "COURT-MISCELLANEOUS",
    'CAR': "COVENANTS & RESTRICTIONS",
    'DC': "DEATH CERTIFICATE",
    'DEED': "DEED",
    'RED': "DEED",
    'REDC': "DEED - CORRECTIVE",
    'REDH': "DEED - HILTON HEAD",
    'REDM': "DEED - MISC",
    'DRAIN': "DRAINAGE EASEMENT",
    'EASE': "EASE",
    'EASM': "EASEMENT",
    'EASMH': "EASEMENT- HILTON HEAD",
    'EASME': "EASME",
    'EXP': "EXPUNGMENT",
    'PLHPR': "HPR PLANS",
    'INDEX_BK': "INDEX",
    'LEASE': "LEASE",
    'LBB': "LIEN - BAIL BOND",
    'CHILD': "LIEN - CHILD SUPPORT",
    'MLMISC': "LIEN MISC",
    'LRBB': "LIEN RELEASE - BAIL BOND",
    'LRCS': "LIEN RELEASE - CHILD SUPPORT",
    'MAST': "MAST",
    'MASTA': "MASTA",
    'DEEDM': "MASTER DEVELOPMENT",
    'MIE': "MASTER IN EQUITY",
    'MCCOR': "MCCOR",
    'MECHP': "MECH LIEN - PERSONAL PROPERTY",
    'MLR': "MECH LIEN - RELEASE",
    'MLA': "MECH LIEN AMENDMENTS",
    'MLPAREL': "MECH LIEN PARTIAL RELEASE",
    'RELCB': "MECH LIEN RELEASE BY CASH BOND",
    'RELSB': "MECH LIEN RELEASE BY SURETY BOND",
    'MLSAT': "MECH LIEN SATISFACTION",
    'MFREL': "MFREL",
    'DD214': "MILITARY DISCHARGE - DD214",
    'MISC': "MISC",
    'AFFM': "MISC AFFIDAVIT",
    'MISCN': "MISCN",
    'MISCS': "MISCS",
    'MISCU': "MISCU",
    'MISRL': "MISRL",
    'MHL': "MOBILE HOME LIEN AFFIDAVIT",
    'MHNT': "MOBILE HOME NEW TITLE APP CERTIF",
    'MHS': "MOBILE HOME SEVERANCE AFFIDAVIT",
    'MHTR': "MOBILE HOME TITLE CERTIF RETIREMENT",
    'ASSIG': "MORT - ASSIGNMENT",
    'ASSAG': "MORT - ASSUMPTION AGREEMENT",
    'BASGT': "MORT - BLANKET ASSIGNMENT",
    'MCORR': "MORT - CORRECTIVE",
    'MMISC': "MORT - MISC",
    'MMOD': "MORT - MODIFICATION",
    'RELMORT': "MORT - RELEASE",
    'SATIS': "MORT - SATISFACTION",
    'SATLF': "MORT - SATISFACTION LOST FORM",
    'SUBAG': "MORT - SUBORDINATION AGREEMENT",
    'MORT': "MORTGAGE",
    'MSET': "MSET",
    'NCS': "NON CONVERSION STATEMENT",
    'MECH': "NOTICE OF MECH LIEN",
    'NPC': "NOTICE OF PROJECT COMMENCEMENT",
    'OPT': "OPTION",
    'OPTION': "OPTION TO PURCHASE",
    'PARED': "PARED",
    'PAREL': "PARTIAL RELEASE",
    'PARO': "PARTIAL RELEASE OF OTHER DOCUMENT",
    'PART': "PARTNERSHIP",
    'PLAT': "PLAT",
    'HPR': "PLAT - HORIZ PROPERTY REGIME PLANS",
    'PNS': "PLAT - MISC UNSURVEYED GRAPHIC",
    'PLL': "PLAT - SURVEY OVER 8.5 X 14",
    'PLS': "PLAT - SURVEY UP TO 8.5 X 14",
    'PO': "PO",
    'POA': "POWER OF ATTORNEY",
    'POAR': "POWER OF ATTORNEY REVOCATION",
    'POBOND': "PUBLIC OFFICIAL BOND",
    'PSD': "PUBLIC SERVICE DIST W&S ASSESSMENTS",
    'RELJ': "RELEASE FROM JUDGMENT",
    'RELSC': "RELSC",
    'ROW': "RIGHT OF WAY",
    'ROWH': "RIGHT OF WAY HH",
    'SATIF': "SATIF",
    'SAT': "SATISFACTION",
    'SATRES': "SATISFACTION RESCISSION",
    'SC': "SC TAX LIEN",
    'SCMISC': "SC TAX LIEN - MISC",
    'SCEX': "SC TAX LIEN EXPUNGED",
    'SCPAREL': "SC TAX LIEN PARTIAL RELEASE",
    'SCSAT': "SC TAX LIEN SATISFIED",
    'SCWD': "SC TAX LIEN WITHDRAWN",
    'SCPR': "SCPR",
    'TLMISC': "TAX LIEN - MISC OTHER",
    'SCWC': "TAX LIEN - SC WORKERS COMP UNINSURED",
    'SCWCS': "TAX LIEN SAT - SC WORKERS COMP UNINS",
    'TSD': "TIMESHARE DEED",
    'TSDHH': "TIMESHARE DEED - HILTON HEAD",
    'TSDC': "TIMESHARE DEED-CORRECTIVE",
    'TSLN': "TIMESHARE LIEN FORCLOSURE NOTICE",
    'TLFS': "TIMESHARE LIEN FORCLOSURE SALE CERTIF",
    'TSLNWD': "TIMESHARE NOTICE OF SALE WITHDRAWAL",
    'TRUST': "TRUST AGREEMENT",
    'UCC': "UCC",
    'UCNCON': "UCC CONTINUATION - NON STD FORM",
    'UCSCON': "UCC CONTINUATION - STANDARD FORM",
    'UCM': "UCC IN MORTGAGE BOOK",
    'UCMH': "UCC MOBILE HOME",
    'UCC1': "UCC1",
    'UC1N': "UCC1 - NON-STANDARD FORM",
    'UC1S': "UCC1 - STANDARD FORM",
    'UCTN': "UCC1 TERMINATION - NON-STD FORM",
    'UCTS': "UCC1 TERMINATION - STD FORM",
    'UC11': "UCC11",
    'UCC3': "UCC3",
    'UC3N': "UCC3 - NON-STANDARD FORM",
    'UC3S': "UCC3 - STANDARD FORM",
    'UC4N': "UCC4 - NON-STD FORM",
    'UC5S': "UCC5 - STANDARD FORM",
    'UHBN': "UNLICENSED HOME BUILDERS NOTICE",
    'USJL': "US JUDGEMENT LIEN",
    'USJEX': "US JUDGEMENT LIEN EXPUNGED",
    'USJPR': "US JUDGEMENT LIEN PARTIAL RELEASE",
    'USJSAT': "US JUDGEMENT LIEN SATISFIED",
    'USJWD': "US JUDGEMENT LIEN WITHDRAWN",
    'USAMEND': "US TAX AMENDMENT/REINSTATEMENT",
    'US': "US TAX LIEN",
    'USMISC': "US TAX LIEN - MISC",
    'USEX': "US TAX LIEN EXPUNGED",
    'USPAREL': "US TAX LIEN PARTIAL RELEASE",
    'USSAT': "US TAX LIEN SATISFIED",
    'USWD': "US TAX LIEN WITHDRAWN",
    'USJS': "USJ SAT",
    'USPR': "USPR",
    'VOID': "VOID",
    'WAIS': "WAIS",
    'WAIVC': "WAIVC",
    'WAIV': "WAIVER",
    'WAVI': "WAVI",
    'WIAV': "WIAV"
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
        generalInfoPage: 'http://rodweb.bcgov.net/BrowserViewDMP/'
    };

    documentTypes = [
        'ABET,AFF,AFFSVC,AGT,ANNEX ,AOC,AOO,ASIG,ASIGO,BNKRUPCY,BASG,BASTG,BTL,BTLS,BOS,BTLW,BFT,BSAT,CERTNO',
        'CONDEM,CONT,CORP,COURTM ,CAR,DC,DEED,RED,REDC,REDH,REDM,DRAIN,EASE,EASM,EASMH,EASME,EXP,PLHPR,INDEX_BK,LEASE,LBB',
        'LMISC,LRBB,LRCS,MAST,MASTA,DEEDM,MIE,MCCOR,MECHP',
        'MLR,MLA,MLPAREL,RELCB,RELSB,MLSAT,MFREL,DD214,MISC,AFFM,MISCN,MISCS',
        'MISCU,MISRL,MHL,MHNT,MHS,MHTR,ASSIG,ASSAG,BASGT,MCORR,MMISC,MMOD,RELMORT,MORT,MSET',
        'SATIS,SATLF,SUBAG,NCS,MECH,NPC,OPT',
        'OPTION,PARED,PAREL,PARO,PART,PLAT,HPR,PNS,PLL,PLS,PO,POA,POAR,POBOND,PSD,RELJ,RELSC,ROW,ROWH,SATIF',
        'SAT,SATRES,SC,SCMISC,SCEX,SCPAREL,SCSAT,SCWD,SCPR,TLMISC,SCWC,SCWCS,TSD,TSDHH,TSDC,TSLN,TSLNWD,TLFS,TRUST,UCC',
        'UCNCON,UCSCON,UCM,UCMH,UCC1,UC1N,UC1S,UCTN,UCTS,UC11,UCC3,UC3N,UC3S,UC4N,UC5S,UHBN,USJL,USJEX,USJPR,CHILD',
        'USJSAT,USJWD,USAMEND,US,USMISC,USEX,USPAREL,USSAT,USWD,USJS,USPR,VOID,WAIS,WAIVC,WAIV,WAVI,WIAV,CHART,CHARTER,DBA'
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
            'Property State': 'SC',
            'County': 'beaufort',
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

            let dateRange = await this.getDateRange('South Carolina', 'Beaufort');
            let date = dateRange.from;
            let today = dateRange.to;
            let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24)) - 1;
            for (let i = days < 0 ? 1 : days; i >= 0; i--) {
                let dateSearch = new Date();
                dateSearch.setDate(dateSearch.getDate() - i);
                console.log('Start search with date: ', dateSearch.toLocaleDateString('en-US'));
                for (let j = 0; j < this.documentTypes.length; j++) {
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
                        await docTypeInput.type(this.documentTypes[j]);

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
                            page.waitForResponse(response => response.url().includes('/BrowserViewDMP/api/search')),
                            submitBtnElement.click(),
                        ]);
                        const dataResponse = await response.json()
                        const count = await this.getData(dataResponse, dateSearch.toLocaleDateString('en-US'));
                        countRecords += count;
                        console.log(`${dateSearch.toLocaleDateString('en-US')} save ${count} records. (Step ${j + 1}/${this.documentTypes.length})`);

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
            await AbstractProducer.sendMessage('Beaufort', 'South Carolina', countRecords, 'Civil & Lien', errorImage);
            return false;
        }
        await AbstractProducer.sendMessage('Beaufort', 'South Carolina', countRecords, 'Civil & Lien');
        return true;
    }
}