import puppeteer from 'puppeteer';
import db from '../../../../../models/db';
import AbstractProducer from '../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../models/public_record_producer';
export default abstract class OklahomaSearchProducer extends AbstractProducer {

    abstract state: string;
    abstract fullState: string;
    abstract county: string;
    abstract productCounty: string;
    abstract selectCountyValue: string;

    url = 'https://www.oscn.net/dockets/search.aspx'

    caseTypeArray = [
        {value: '60', name: 'Anna McBride Act - Mental Health Court'},
        {value: '61', name: 'Civil Administrative'},
        {value: '62', name: 'Civil Administrative (Legacy)'},
        {value: '22', name: 'Civil Misc.'},
        {value: '52', name: 'Civil Misc. Conversion (Legacy)'},
        {value: '1', name: 'Civil relief less than $10,000'},
        {value: '2', name: 'Civil relief more than $10,000'},
        {value: '21', name: 'Closing out sale'},
        {value: '3', name: 'Family and Domestic'},
        {value: '68', name: 'Family and Domestic Miscellaneous Proceedings'},
        {value: '81', name: 'Filing of Wills'},
        {value: '42', name: 'Foreign Service Server (Legacy)'},
        {value: '6', name: 'Income Assignment'},
        {value: '74', name: 'Miscellaneous Receipts - Civil'},
        {value: '75', name: 'Miscellaneous Receipts - Family Domestic'},
        {value: '76', name: 'Miscellaneous Receipts - Probate'},
        {value: '41', name: 'Notary Public (Legacy)'},
        {value: '7', name: 'Probate'},
        {value: '78', name: 'Probate Miscellaneous Proceedings'},
        {value: '13', name: 'Probate, Misc. (Legacy)'},
        {value: '37', name: 'Statutory Bonds (Legacy)'},
        {value: '23', name: 'Surface Damage'},
        {value: '43', name: 'Tax Liens'},
        {value: '10', name: 'Trusts'}
    ]

    removeRowArray = [
        'CITY', 'DEPT', 'CTY', 'UNITED STATES', 'BANK', 'FIA CARD SERVICES NA',
        'FLORIDA PACE FUNDING AGENCY', 'COUNTY', 'CREDIT', 'HOSPITAL', 'FUNDING', 'UNIVERSITY',
        'MEDICAL', 'CONDOMINIUM ASSOCIATION', 'LOTS', 'TEXAS STATE', 'VETERANS', 'SECRETARY', 'DEPARTMENT',
        'IN RE', 'STATE OF OKLAHOMA','MUNICIPAL','Oklahoma State'
    ]
    removeRowRegex = new RegExp(`\\b(?:${this.removeRowArray.join('|')})\\b`, 'i')

    async init(): Promise<boolean> {
        this.browser = await this.launchBrowser();
        this.browserPages.generalInfoPage = await this.browser.newPage();
        await this.setParamsForPage(this.browserPages.generalInfoPage);
        try {
            await this.browserPages.generalInfoPage.goto('https://www.oscn.net/dockets/search.aspx', {waitUntil: 'load'});
            return true;
        } catch (err) {
            console.warn(err);
            return false;
        }
    }

    async read(): Promise<boolean> {
        try {
            await this.browserPages.generalInfoPage?.waitForXPath('//*[@id="dblist"]');
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    async saveRecord(fillingDate: string, parseName: any, prod: any, originalDocType: string) {

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
            originalDocType: originalDocType
        };

        return await this.civilAndLienSaveToNewSchema(data);

    }

    async getData(page: puppeteer.Page, fillingDate: string, caseType: string) {
        let count = 0;
        try {
            let practiceType = this.getPracticeType(caseType)
            const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
            const prod = await db.models.Product.findOne({name: productName}).exec();
            await page.waitForSelector('.caseCourtTable');
            const rows = await page.$x('//*[@class="caseCourtTable"]/tbody/tr');
            for (let i = 1; i < rows.length; i++) {
                try {
                    let name = (await rows[i].$eval('td:nth-child(4)', elem => elem.textContent))!.trim();
                    if (!name) continue;
                    if (!/defendant/i.test(name) && !/petitioner/i.test(name)) continue;
                    if (this.removeRowRegex.test(name)) continue;
                    name = name.replace(/\s+\(.*$/i, '')
                    const parseName: any = this.newParseName(name.trim())
                    if (parseName?.type && parseName?.type == 'COMPANY') continue;
                    const saveRecord = await this.saveRecord(fillingDate, parseName, prod, caseType);
                    saveRecord && count++
                } catch (e) {
                    console.log(e)
                }
            }

        } catch (e) {
            console.log(e)
        }
        return count
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let countRecords = 0;
        try {
            let dateRange = await this.getDateRange(this.fullState, this.county);
            let date = dateRange.from;
            let today = dateRange.to;
            let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24)) - 1;
            for (let i = days < 0 ? 1 : days; i >= 0; i--) {
                let countFromDate = 0;
                let dateSearch = new Date();
                dateSearch.setDate(dateSearch.getDate() - i);
                console.log('Start search with date: ', dateSearch.toLocaleDateString('en-US'));
                for (let caseType of this.caseTypeArray) {
                    try {
                        await page.goto(this.url);
                        await page.waitForSelector('#dblist');
                        await page.select('#dblist', this.selectCountyValue);
                        await page.select('#dcct', caseType.value);
                        await page.type('#fdl', dateSearch.toLocaleDateString('en-US'), {delay: 100});
                        await page.type('#fdh', dateSearch.toLocaleDateString('en-US'), {delay: 100});
                        const [buttonSearch] = await page.$x('//*[@id="oscn-content"]/div/form/div[3]//input[@class="submit" and @type="submit"]');
                        await Promise.all([
                            buttonSearch.click(),
                            page.waitForNavigation()
                        ]);
                        const count = await this.getData(page, dateSearch.toLocaleDateString('en-US'), caseType.name);
                        countFromDate += count;
                        console.log(`${dateSearch.toLocaleDateString('en-US')} docType ${caseType.name} save ${count} records.`);
                    } catch (e) {
                    }
                }
                countRecords += countFromDate;
                console.log(`${dateSearch.toLocaleDateString('en-US')} save ${countFromDate} records.`);
            }
        } catch (e) {
            console.log(e);
            console.log('Error search');
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage(this.county, this.fullState, countRecords, 'Civil, Probate & Family', errorImage);
            return false;
        }
        await AbstractProducer.sendMessage(this.county, this.fullState, countRecords, 'Civil, Probate & Family');
        return true;
    }
}