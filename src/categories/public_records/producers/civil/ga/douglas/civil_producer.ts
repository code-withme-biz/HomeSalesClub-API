import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../../abstract_producer';
import {IPublicRecordProducer} from '../../../../../../models/public_record_producer';

const removeRowArray = [
    'CITY', 'DEPT', 'CTY', 'UNITED STATES', 'BANK', 'FIA CARD SERVICES NA',
    'FLORIDA PACE FUNDING AGENCY', 'COUNTY', 'CREDIT', 'HOSPITAL', 'FUNDING', 'UNIVERSITY',
    'MEDICAL', 'CONDOMINIUM ASSOCIATION', 'LOTS', 'TEXAS STATE', 'VETERANS', 'SECRETARY', 'DEPARTMENT',
    'INDIVIDUAL', 'INDIVIDUALLY', 'FINANCE', 'CITIBANK', 'MERS', '-----'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')

export default class CivilProducer extends AbstractProducer {

    urls = {
        generalInfoPage: 'http://deeds.co.douglas.ga.us/External/LandRecords/protected/v4/SrchDate.aspx'
    };

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
            await this.browserPages.generalInfoPage?.waitForXPath('//*[contains(@id, "txtFiledFrom")]');
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    async saveRecord(fillingDate: string, parseName: any, prod: any, originalDocType: string) {

        const data = {
            'Property State': 'GA',
            'County': 'Douglas',
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

    async getData(page: puppeteer.Page, fillingDate: string) {
        let count = 0;
        let nextPageFlag = false;
        try {
            do {
                nextPageFlag = false;
                await page.waitForXPath('//*[contains(@id, "cpgvInstruments")]');
                await this.sleep(4000)
                const rows = await page.$x('//*[contains(@id, "cpgvInstruments")]/tbody/tr');
                for (let i = 1; i < rows.length; i++) {
                    let docType = (await rows[i].$eval('td:nth-child(4)', elem => elem.textContent))!.trim();
                    let namesElements = await page.$x(`//*[contains(@id, "cpgvInstruments")]/tbody/tr[${i + 1}]/td[6]//tr`);
                    let practiceType = this.getPracticeType(docType!.trim());
                    const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                    const prod = await db.models.Product.findOne({name: productName}).exec();
                    for (let j = 0; j < namesElements.length; j++) {
                        let name = (await namesElements[j].$eval('td', elem => elem.textContent))!.trim();
                        if (removeRowRegex.test(name) || name == "-----" || !name) continue;
                        const parseName: any = this.newParseName(name.trim());
                        if (parseName.type && parseName.type == 'COMPANY') {
                            continue
                        }
                        const saveRecord = await this.saveRecord(fillingDate, parseName, prod, docType!.trim());
                        saveRecord && count++
                    }
                }

                const [nextPage] = await page.$x(`//*[contains(@id, "ibResultsNextPage")]`);
                if (!!nextPage) {
                    await nextPage.click();
                    await this.sleep(5000);
                    await page.waitForXPath('//*[contains(@id, "cpgvInstruments")]')
                    nextPageFlag = true
                }

            } while (nextPageFlag)
        } catch (e) {
        }
        return count;
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let countRecords = 0;
        try {
            let dateRange = await this.getDateRange('Georgia', 'Douglas');
            let date = dateRange.from;
            let today = dateRange.to;
            let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24)) - 1;
            for (let i = days < 0 ? 1 : days; i >= 0; i--) {
                try {
                    await page.goto('http://deeds.co.douglas.ga.us/External/LandRecords/protected/v4/SrchDate.aspx', {waitUntil: 'load'});
                    await this.sleep(1000)
                    let dateSearch = new Date();
                    dateSearch.setDate(dateSearch.getDate() - i);
                    console.log('Start search with date: ', dateSearch.toLocaleDateString('en-US'));
                    const dateArray = dateSearch.toLocaleDateString('en-US', {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit"
                    }).split('/');
                    const dateReq = dateArray[0] + dateArray[1] + dateArray[2]

                    await page.waitForXPath('//*[contains(@id, "txtFiledFrom")]');
                    const [dateFromElement] = await page.$x('//*[contains(@id, "txtFiledFrom")]');
                    await dateFromElement.click();
                    await this.sleep(500)
                    await dateFromElement.press('Backspace');
                    await dateFromElement.press('Backspace');
                    await this.sleep(500)
                    await dateFromElement.press('Backspace');
                    await dateFromElement.press('Backspace');
                    await dateFromElement.press('Backspace');
                    await page.keyboard.type(dateReq, {delay: 100});

                    const [dateToElement] = await page.$x('//*[contains(@id, "txtFiledThru")]');
                    await dateToElement.click();
                    await this.sleep(500)
                    await dateToElement.press('Backspace');
                    await dateToElement.press('Backspace');
                    await this.sleep(500)
                    await dateToElement.press('Backspace');
                    await dateToElement.press('Backspace');
                    await dateToElement.press('Backspace');
                    await page.keyboard.type(dateReq, {delay: 100});

                    const [clickSearch] = await page.$x('//*[contains(@id, "btnSearch")]');
                    await clickSearch.click();
                    const count = await this.getData(page, dateSearch.toLocaleDateString('en-US'));
                    countRecords += count;
                    console.log(`${dateSearch.toLocaleDateString('en-US')} save ${count} records.`);
                } catch (e) {
                }
            }
        } catch (e) {
            console.log(e);
            console.log('Error search');
            await AbstractProducer.sendMessage('Douglas', 'Georgia', countRecords, 'Civil');
            return false;
        }
        await AbstractProducer.sendMessage('Douglas', 'Georgia', countRecords, 'Civil');
        return true;
    }
}