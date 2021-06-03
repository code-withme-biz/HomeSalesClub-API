import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../../abstract_producer';
import {IPublicRecordProducer} from '../../../../../../models/public_record_producer';


const removeRowArray = [
    'CITY', 'DEPT', 'CTY', 'UNITED STATES', 'BANK', 'FIA CARD SERVICES NA',
    'FLORIDA PACE FUNDING AGENCY', 'COUNTY', 'CREDIT', 'HOSPITAL', 'FUNDING', 'UNIVERSITY',
    'MEDICAL', 'CONDOMINIUM ASSOCIATION', 'LOTS', 'TEXAS STATE', 'VETERANS', 'SECRETARY', 'DEPARTMENT',
    'INDIVIDUAL', 'INDIVIDUALLY', 'FINANCE', 'CITIBANK', 'MERS'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')

export default class CivilProducer extends AbstractProducer {

    urls = {
        generalInfoPage: 'http://services.wakegov.com/booksweb/genextsearch.aspx'
    };

    abbreviationType: any = {
        'ACKNOWLEDGMENT': 'Acknowledgement',
        'AFFDVT': 'Affidavit',
        'AGREE': 'Agreement',
        'AMEND': 'Amendment',
        'ASSGMT': 'Assignment',
        'BLANK': 'Blank',
        'ASMD NAME': 'Assumed Name',
        'CAN': 'Cancellations',
        'CERTIF': 'Certificate',
        'CERTIF OF SATISFN': 'Certificate of Satisfaction',
        'CONDO': 'Condominium',
        'CONSENT': 'Consent',
        'CORP': 'Corporation',
        'COVNTS': 'Covenants',
        'D - T & ASSGMT': 'D - T & Assignment',
        'DECLN': 'Declaration',
        'DEED': 'Deed',
        'D OF E': 'Deed of Easement',
        'D - T': 'Deed of Trust',
        'EASMT': 'Easement',
        'FORE NOTICE': 'Foreclosure / Fore Notice',
        'GRAVE REMOVAL': 'Grave Removal',
        'JUDGT': 'Judgment',
        'LEASE': 'Lease',
        'MAP': 'Map',
        'MAP-HIGHWAY': 'Map - Highway',
        'MEMO': 'Memorandum',
        'MODFN': 'Modification',
        'MTG': 'Mortgage',
        'NOTICE':'Notice',
        'ORD':'Ordinance',
        'ORDER':'Order',
        'PARTIAL RELEASE':'Partial Release',
        'PART':'Partnership',
        'P OF A': 'Power of Attorney',
        'QCD': 'Quit Claim Deed',
        'RELEASE': 'Release',
        'RENUNCTN & DISCLAIM':'Renunciation & Disclaimer',
        'REQUEST NOTICE': 'Request for Notice',
        'RESCIS':'Rescission',
        'RESIGN':'Resignation',
        'RESTRNS': 'Restrictions',
        'REVOC':'Revocation',
        'R - W':'Right of Way',
        'SATISFN': 'Satisfaction of Deed of Trust',
        'SATISFN RESCIS':'Satisfaction Rescission',
        'SEE INSTRUMENT':'See Instrument ',
        'SUBN': 'Subordination Deed',
        'S - TR': 'Substitute Trustee',
        'SUPL':'Supplemental',
        'TERMN':'Termination',
        'UCC':'Uniform Commercial Code ',
        'UCC CONT':'Uniform Commercial Code Continuation',
        'VARIANCE':'Variance',
        'WAIVER':'Waiver',
        'WITHDRAWAL':'Withdrawal'
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
            await this.browserPages.generalInfoPage?.waitForXPath('//*[contains(@id,"RadTextRecordedAfter")]');
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    async saveRecord(fillingDate: string, parseName: any, prod: any, originalDocType: string, caseUniqueId: string) {

        const data = {
            'Property State': 'NC',
            'County': 'Wake',
            'First Name': parseName.firstName,
            'Last Name': parseName.lastName,
            'Middle Name': parseName.middleName,
            'Name Suffix': parseName.suffix,
            'Full Name': parseName.fullName,
            "vacancyProcessed": false,
            'caseUniqueId': caseUniqueId,
            fillingDate: fillingDate,
            productId: prod._id,
            originalDocType: originalDocType
        };

        return await this.civilAndLienSaveToNewSchema(data);
    }

    async getData(page: puppeteer.Page, fillingDate: string) {
        let count = 0;
        let nextPageFlag;
        try {
            await page.waitForXPath('//*[contains(@id, "PageSizeComboBox")]');
            const [selectPerPage] = await page.$x('//*[contains(@id, "PageSizeComboBox")]')
            await selectPerPage.click()
            await this.sleep(1000)
            await page.waitForXPath('//*[contains(@id,"PageSizeComboBox_DropDown")]/parent::div', {visible: true})
            const [optionPerPage] = await page.$x('//*[contains(@id,"PageSizeComboBox_DropDown")]//li[text()="100"]')
            await optionPerPage.click()
            await this.sleep(1000)
            await page.waitForFunction(() => !document.querySelector('#ContentPlaceHolder1_LoadingPanelGridctl00_ContentPlaceHolder1_RadGridResults'));
            do {
                nextPageFlag = false;
                await page.waitForXPath('//*[contains(@id, "RadGridResults")]')
                const rows = await page.$x('//*[contains(@id, "RadGridResults")]/tbody/tr');
                for (let i = 0; i < rows.length; i++) {
                    let name = (await rows[i].$eval('td:nth-child(11) > a', elem => elem.textContent))!.trim();
                    if (removeRowRegex.test(name)) continue;
                    if (!name) continue;
                    name = name.replace('.', '');
                    name = name.replace('/', '')
                    const docTypeAbbr = (await rows[i].$eval('td:nth-child(13)', elem => elem.textContent))!.trim();
                    const docType = this.abbreviationType[docTypeAbbr];
                    if (!docType) continue;
                    let caseUniqueId = (await rows[i].$eval('td:nth-child(5) > a', elem => elem.textContent))!.trim();
                    let practiceType = this.getPracticeType(docType!)
                    const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                    const prod = await db.models.Product.findOne({name: productName}).exec();
                    const parseName: any = this.newParseName(name);
                    if (parseName.type === 'COMPANY' || parseName.fullName === '') continue;
                    const saveRecord = await this.saveRecord(fillingDate, parseName, prod, docType, caseUniqueId);
                    saveRecord && count++
                }
                const [nextPage] = await page.$x('//*[@title="Next Page" and not(contains(@onclick,"return false;"))]');
                if (!!nextPage) {
                    await nextPage.click();
                    await page.waitFor(() => document.querySelector('#ContentPlaceHolder1_LoadingPanelGridctl00_ContentPlaceHolder1_RadGridResults'));
                    await page.waitFor(() => !document.querySelector('#ContentPlaceHolder1_LoadingPanelGridctl00_ContentPlaceHolder1_RadGridResults'));
                    nextPageFlag = true;
                }
            } while (nextPageFlag)
        } catch (e) {
            console.log(e)
        }
        return count;
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let countRecords = 0;
        try {
            let dateRange = await this.getDateRange('North Carolina', 'Wake');
            let date = dateRange.from;
            let today = dateRange.to;
            let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24)) - 1;
            for (let i = days < 0 ? 1 : days; i >= 0; i--) {
                try {
                    await page.goto('http://services.wakegov.com/booksweb/genextsearch.aspx', {waitUntil: 'load'});
                    let dateSearch = new Date();
                    dateSearch.setDate(dateSearch.getDate() - i);
                    console.log('Start search with date: ', dateSearch.toLocaleDateString('en-US'));
                    await page.waitForXPath('//*[contains(@id, "RadTextRecordedAfter")]');
                    const [dateFromElement] = await page.$x('//*[contains(@id,"RadTextRecordedAfter_text")]');

                    await dateFromElement.type(dateSearch.toLocaleDateString('en-US', {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit"
                    }), {delay: 100});
                    const [dateToElement] = await page.$x('//*[contains(@id,"RadTextRecordedBefore_text")]');
                    await dateToElement.type(dateSearch.toLocaleDateString('en-US', {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit"
                    }), {delay: 100});
                    const [clickSearch] = await page.$x('//*[contains(@id, "btnExtSearch")]');

                    await Promise.all([
                        clickSearch.click(),
                        page.waitForNavigation()
                    ]);

                    const count = await this.getData(page, dateSearch.toLocaleDateString('en-US'));
                    countRecords += count;
                    console.log(`${dateSearch.toLocaleDateString('en-US')} save ${count} records.`);
                } catch (e) {
                    console.log(e)
                }
            }
        } catch (e) {
            console.log(e);
            console.log('Error search');
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Wake', 'North Carolina', countRecords, 'Civil & Lien', errorImage);
            return false;
        }
        await AbstractProducer.sendMessage('Wake', 'North Carolina', countRecords, 'Civil & Lien');
        return true;
    }
}