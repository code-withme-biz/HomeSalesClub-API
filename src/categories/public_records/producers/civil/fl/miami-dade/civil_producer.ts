import puppeteer from 'puppeteer';
import SnsService from '../../../../../../services/sns_service';
import db from '../../../../../../models/db';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import { IProduct } from '../../../../../../models/product';

const removeRowArray = [
    'CITY', 'DEPT', 'CTY', 'UNITED STATES', 'BANK', 'FIA CARD SERVICES NA',
    'FLORIDA PACE FUNDING AGENCY', 'COUNTY', 'CREDIT', 'HOSPITAL', 'FUNDING', 'UNIVERSITY',
    'MEDICAL', 'CONDOMINIUM ASSOCIATION'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')

const documentsTypeValue: any = {
    "AFD": "AGREEMENT FOR DEED - AFD",
    "AFF": "AFFIDAVIT - AFF",
    "AGR": "AGREEMENT - AGR",
    "AIN": "ARTICLES OF INCORPORATION - AIN",
    "AIT": "ASSIGNMENT OF INTEREST - AIT",
    "AJ": "AFFIDAVIT WITH JUDGMENT ATTACHED - AJ",
    "AMO": "ASSIGNMENT OF MORTGAGE - AMO",
    "APB": "APPEARANCE BOND - APB",
    "ASG": "ASSIGNMENT - ASG",
    "BAN": "BANKRUPTCY  - BAN",
    "BSA": "BILL OF SALE - BSA",
    "CCP": "CRIMINAL COURT PAPER - CCP",
    "CER": "CERTIFICATE - CER",
    "CLP": "CANCELLATION OF LIS PENDENS - CLP",
    "CMO": "CHATTEL MORTGAGE - CMO",
    "COC": "CO-OP CERTIFICATE - COC",
    "CON": "CONSENT  - CON",
    "COV": "COVENANT - COV",
    "CTI": "CERTIFICATE OF TITLE - CTI",
    "CVP": "CIVIL COURT  PAPER - CVP",
    "DAM": "DEED WITH ASSUMPTION OF MORTGAGE - DAM",
    "DCE": "DEATH CERTFICATE (EST OF) - DCE",
    "DCO": "DECLARATION OF CONDOMINIUM  - DCO",
    "DCP": "DADE COURT PAPER - DCP",
    "DEE": "DEED - DEE",
    "DIS": "DISMISSAL - DIS",
    "DM": "DEED WITH MORTGAGE - DM",
    "DOM": "DISSOLUTION OF MARRIAGE - DOM",
    "DOR": "DECLARATION OF RESIDENCE - DOR",
    "DRC": "DEPOSIT RECEIPT - DRC",
    "DSC": "DISCHARGE - DSC",
    "DSR": "DISCLAIMER - DSR",
    "DVP": "DOMESTIC VIOLENCE PAPER - DVP",
    "EAS": "EASEMENT - EAS",
    "FCN": "FICTITIOUS NAME  - FCN",
    "FCP": "FAMILY COURT PAPER - FCP",
    "FST": "FINANCING STATEMENT UCC - FST",
    "FTL": "FEDERAL TAX LIEN  - FTL",
    "JUD": "JUDGEMENT - JUD",
    "LEA": "LEASE - LEA",
    "LIE": "LIEN - LIE",
    "LIS": "LIS PENDENS - LIS",
    "MAP": "MAP - MAP",
    "MIS": "MISCELLANEOUS - MIS",
    "MOR": "MORTGAGE - MOR",
    "MOR_I": "MOR_I - MOR_I",
    "MOR_X": "MOR_X - MOR_X",
    "MRE": "MORTGAGE WITH RELEASE - MRE",
    "NCO": "NOTICE OF COMMENCEMENT - NCO",
    "NCT": "NOTICE OF CONTEST OF LIEN - NCT",
    "NOT": "NOTICE - NOT",
    "NTL": "NOTICE OF TAX LIEN - NTL",
    "NTY": "NOTARY - NTY",
    "ODE": "DEED (OLD DEEDS) - ODE",
    "OPT": "OPTION TO PURCHASE - OPT",
    "ORD": "ORDER - ORD",
    "PAD": "PROBATE & ADMINISTRATION - PAD",
    "PAY": "POWER OF ATTORNEY - PAY",
    "PCT": "PROFESSIONAL CERTIFICATE - PCT",
    "PLT": "PLAT - PLT",
    "PRE": "PARTIAL RELEASE - PRE",
    "PRM": "PARTIAL RELEASE OF MORTGAGE - PRM",
    "PRO": "PROBATE ORDER OF DISTRIBUTION - PRO",
    "QCD": "QUIT CLAIM DEED - QCD",
    "REL": "RELEASE - REL",
    "RES": "RESTRICTIONS - RES",
    "RRS": "RELEASE OF RESERVATIONS - RRS",
    "RSL": "RESOLUTION - RSL",
    "SJU": "SATISFACTION OF JUDGMENT - SJU",
    "SMO": "SATISFACTION OF MORTGAGE - SMO",
    "TAG": "TRUST AGREEMENT - TAG",
    "TCP": "TRAFFIC COURT PAPER - TCP",
    "TST": "TERMINATION STATEMENT - TST",
    "WAI": "WAIVER  - WAI",
    "~LNJUD": "~ANY LIEN JUDGMENT - ~LNJUD",
    "~PT": "~ANY PROPERTY TRANSFER - ~PT",
    "~PTMOR": "~ANY PROPERTY TRANSFER AND MORTGAGE - ~PTMOR",
}

export default class CivilProducer extends AbstractProducer {

    urls = {
        generalInfoPage: 'https://www2.miami-dadeclerk.com/PremierServices/login.aspx'
    };

    credentials = {
        login: 'texas-miami-west',
        pass: 'Restart98'
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
            await this.browserPages.generalInfoPage?.waitForXPath('//input[contains(@id, "txtUserName")]');
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    async getProductId(docType: string) {
        let practiceType = this.getPracticeType(documentsTypeValue[docType] || '');
        return await db.models.Product.findOne({ name: `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}` }).exec();
    }

    async getData(page: puppeteer.Page) {
        let count = 0;
        try {
            await page.waitForSelector('#lnkPrinterFriendly', { timeout: 5000 });
            const [notFound] = await page.$x('//*[contains(text(), "Your search did not return any results.")]');
            if (notFound) return count;
            const countPaginationPage = (await page.$x('//*[@class="pagination justify-content-center"]/li')).length || 1;
            let i = 1;
            while (i <= countPaginationPage) {
                await page.waitFor(2500);
                await page.waitForXPath('//*[@id="tableSearchResults"]/tbody/tr');
                const rowsTable = await page.$x('//*[@id="tableSearchResults"]/tbody/tr');
                for (let j = 0; j < rowsTable.length; j++) {
                    const row = rowsTable[j];
                    const name = (await row.evaluate(e => e.children[8].children[0].textContent))!.trim();
                    if (!/\(R\)/i.test(name)) continue;
                    if (removeRowRegex.test(name)) continue;
                    const docType = (await row.evaluate(e => e.children[1].textContent))!.trim();
                    const recDate = (await row.evaluate(e => e.children[2].textContent))!.trim();
                    const parseName: any = this.newParseName(name.replace(' (R)', '').trim());
                    if (parseName.type && parseName.type == 'COMPANY') {
                        continue;
                    }

                    const product: IProduct = await this.getProductId(docType);
                    const data = {
                        'Property State': this.publicRecordProducer.state,
                        'County': this.publicRecordProducer.county,
                        'First Name': parseName.firstName,
                        'Last Name': parseName.lastName,
                        'Middle Name': parseName.middleName,
                        'Name Suffix': parseName.suffix,
                        'Full Name': parseName.fullName,
                        "vacancyProcessed": false,
                        fillingDate: recDate,
                        productId: product._id,
                        originalDocType: documentsTypeValue[docType]
                    };

                    if (await this.civilAndLienSaveToNewSchema(data)) {
                        count++
                    }
                }
                i++;
                await this.randomSleepInOneSec();
                try {
                    const [clickNextPage] = await page.$x(`//*[@class="pagination justify-content-center"]/li[${i}]`);
                    await clickNextPage.click();
                } catch (e) {
                    break;
                }
            }
        } catch (e) {
        }
        return count
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let countRecords = 0
        try {
            const [inputUserName] = await page.$x('//input[contains(@id, "txtUserName")]');
            await inputUserName.focus();
            await page.keyboard.type(this.credentials.login);
            const [inputPass] = await page.$x('//input[contains(@id, "txtPassword")]');
            await inputPass.focus();
            await page.keyboard.type(this.credentials.pass);
            const [clickLogin] = await page.$x('//input[contains(@id, "btnLogin")]');
            await clickLogin.click();
            await page.waitForSelector('#content');
        } catch (e) {
            console.log('Error login');
            return false;
        }
        try {
            let dateRange = await this.getDateRange('Florida', 'Miami Dade');
            let date = dateRange.from;
            let today = dateRange.to;
            let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24)) - 1;
            for (let i = days < 0 ? 1 : days; i >= 0; i--) {
                try {
                    let dateSearch = new Date();
                    dateSearch.setDate(dateSearch.getDate() - i);
                    const typeKeys = Object.keys(documentsTypeValue);
                    for (let docType of typeKeys) {
                        console.log(`******* CHECKING FOR ${this.getFormattedDate(dateSearch)} - ${docType} *******`);
                        await page.goto('https://onlineservices.miami-dadeclerk.com/officialrecords/StandardSearch.aspx');
                        await page.waitForSelector('#pdoc_type');
                        await page.evaluate(_ => {
                            window.scroll(0, 0);
                        });
                        await page.type('#prec_date_from', dateSearch.toLocaleDateString('en-US'), { delay: 100 });
                        await page.evaluate(_ => {
                            window.scroll(0, 0);
                        });
                        await page.type('#prec_date_to', dateSearch.toLocaleDateString('en-US'), { delay: 100 });
                        await page.select("#pdoc_type", docType);
                        await page.focus('#pdoc_type')
                        await page.evaluate(_ => {
                            window.scroll(0, 0);
                        });
                        await page.click('#btnNameSearch');
                        const count = await this.getData(page);
                        countRecords += count;
                        await this.randomSleepIn5Sec();
                    }
                } catch (e) {
                }
            }
        } catch (e) {
            console.log(e)
            console.log('Error search');
            console.log(`Found: ${countRecords}`);
            await AbstractProducer.sendMessage('Miami-Dade', 'Florida', countRecords, 'Civil');
            return false
        }
        console.log(`Found: ${countRecords}`);
        await AbstractProducer.sendMessage('Miami-Dade', 'Florida', countRecords, 'Civil');
        return true;
    }
}
