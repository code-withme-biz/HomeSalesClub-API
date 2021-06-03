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
        generalInfoPage: 'https://jcmsweb.charlestoncounty.org/publicindex/?AspxAutoDetectCookieSupport=1'
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
            await this.browserPages.generalInfoPage?.waitForXPath('//*[contains(@id, "ButtonAccept")]');
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    async saveRecord(fillingDate: string, parseName: any, prod: any, originalDocType: string) {

        const data = {
            'Property State': 'SC',
            'County': 'charleston',
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
        try {
            await page.waitForXPath('//*[contains(@id, "SearchResults")]', {timeout: 30000});

            const rows = await page.$x('//*[contains(@id, "SearchResults")]/tbody/tr');
            for (let i = 1; i < rows.length; i++) {
                let docType = (await rows[i].$eval('td:nth-child(7)', elem => elem.textContent))!.trim() +' ' + (await rows[i].$eval('td:nth-child(8)', elem => elem.textContent))!.trim();
                if (/Criminal/i.test(docType)) continue;

                let name = (await rows[i].$eval('td:nth-child(1)', elem => elem.textContent))!.trim();
                let practiceType = this.getPracticeType(docType!.trim());
                const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                const prod = await db.models.Product.findOne({name: productName}).exec();

                if (removeRowRegex.test(name) || !name) continue;
                const parseName: any = this.newParseName(name.trim());
                if (parseName.type && parseName.type == 'COMPANY') {
                    continue
                }
                console.log({docType,name, parseName})
                const saveRecord = await this.saveRecord(fillingDate, parseName, prod, docType!.trim());
                saveRecord && count++

            }

        } catch (e) {
        }
        return count;
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let countRecords = 0;
        try {
            await page.waitForXPath('//*[contains(@id, "ButtonAccept")]');
            const [acceptDisclaimerElement] = await page.$x('//*[contains(@id, "ButtonAccept")]');
            console.log('found ButtonAccept')
            await acceptDisclaimerElement.click();

            let dateRange = await this.getDateRange('South Carolina', 'Charleston');
            let date = dateRange.from;
            let today = dateRange.to;
            let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24)) - 1;
            await page.waitForXPath('//*[contains(@id, "DropDownListParties")]')

            for (let i = days < 0 ? 1 : days; i >= 0; i--) {
                let countFromDate = 0;
                let dateSearch = new Date();
                dateSearch.setDate(dateSearch.getDate() - i);
                console.log('Start search with date: ', dateSearch.toLocaleDateString('en-US'));
                try {
                    await page.waitForXPath('//*[contains(@id, "DropDownListParties")]');
                    const [partyTypeSelectElement] = await page.$x('//*[contains(@id, "DropDownListParties")]');
                    await partyTypeSelectElement.select('D');

                    await page.waitForXPath('//*[contains(@id, "DropDownListDateFilter")]');
                    const [dateTypeSelectElement] = await page.$x('//*[contains(@id, "DropDownListDateFilter")]');
                    await dateTypeSelectElement.select('Filed');

                    const [beginningDateElement] = await page.$x('//*[contains(@id, "TextBoxDateFrom")]')
                    await beginningDateElement.click({clickCount: 3})
                    await beginningDateElement.press('Backspace');
                    await beginningDateElement.type(dateSearch.toLocaleDateString('en-US', {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit"
                    }), {delay: 100})

                    const [endingDateElement] = await page.$x('//*[contains(@id, "TextBoxDateTo")]')
                    await endingDateElement.click({clickCount: 3})
                    await endingDateElement.press('Backspace');
                    await endingDateElement.type(dateSearch.toLocaleDateString('en-US', {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit"
                    }), {delay: 100})

                    const [buttonSearch] = await page.$x('//*[contains(@id, "ButtonSearch")]');
                    await Promise.all([
                        buttonSearch.click(),
                        page.waitForNavigation()
                    ]);
                    const count = await this.getData(page, dateSearch.toLocaleDateString('en-US'));
                    countFromDate += count;
                    console.log(`${dateSearch.toLocaleDateString('en-US')} save ${count} records.`);
                } catch (e) {
                }

                countRecords += countFromDate;
            }
        } catch (e) {
            console.log(e);
            console.log('Error search');
            await AbstractProducer.sendMessage('Charleston', 'South Carolina', countRecords, 'Civil');
            return false;
        }
        await AbstractProducer.sendMessage('Charleston', 'South Carolina', countRecords, 'Civil');
        return true;
    }
}