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
        generalInfoPage: 'https://ava.fidlar.com/NHHillsborough/AvaWeb/#!/search'
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
            await this.browserPages.generalInfoPage?.waitForXPath('//*[@id="StartDate"]');
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    async saveRecord(fillingDate: string, parseName: any, prod: any, originalDocType: string) {

        const data = {
            'Property State': 'NH',
            'County': 'Hillsborough',
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
            await page.waitForXPath('//*[@id="resultsContainer"]')
            const rows = await page.$x('//*[@id="resultsContainer"]/ul/li/div/div/div')
            for (let i = 0; i < rows.length; i++) {
                try {
                    let docType = (await rows[i].$eval('label:nth-child(2)', elem => elem.textContent))!.trim();
                    const [clickElement] = await page.$x(`//*[@id="resultsContainer"]/ul/li[${i + 1}]`)
                    await clickElement.click();
                    const response: any = await (await page.waitForResponse('https://ava.fidlar.com/NHHillsborough/ScrapRelay.WebService.Ava/breeze/breeze/DocumentDetail')).json();
                    await clickElement.click();
                    const namesArray = response.DocumentDetail.Parties
                    for (let j = 0; j < namesArray.length; j++) {
                        if (namesArray[j].PartyTypeId == 1) continue;
                        let name = namesArray[j].Name;
                        if (namesArray[j].AdditionalName) {
                            name = `${name}, ${namesArray[j].AdditionalName}`
                        }
                        if (removeRowRegex.test(name) ||  !name) continue;
                        const parseName: any = this.newParseName(name.trim());
                        if (parseName.type && parseName.type == 'COMPANY') {
                            continue
                        }
                        let practiceType = this.getPracticeType(docType!.trim());
                        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                        const prod = await db.models.Product.findOne({name: productName}).exec();
                        const saveRecord = await this.saveRecord(fillingDate, parseName, prod, docType!.trim());
                        saveRecord && count++

                    }

                } catch (e) {
                }
            }
        } catch (e) {
            await this.sleep(2000);
            const [notFound] = await page.$x('//*[@class="btn btn-custom" and text()="OK"]');
            if (!!notFound) {
                await notFound.click();
            }
        }
        return count;
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let countRecords = 0;
        try {
            let dateRange = await this.getDateRange('South Carolina', 'New Hampshire');
            let date = dateRange.from;
            let today = dateRange.to;
            let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24)) - 1;
            for (let i = days < 0 ? 1 : days; i >= 0; i--) {
                try {
                    await page.goto('https://ava.fidlar.com/NHHillsborough/AvaWeb/#!/search', {waitUntil: 'load'});
                    await page.waitForSelector('#loginInfo')
                    await page.click('#loginInfo > a')
                    await this.sleep(1000)
                    await page.waitForSelector('#StartDate')
                    let dateSearch = new Date();
                    dateSearch.setDate(dateSearch.getDate() - i);
                    console.log('Start search with date: ', dateSearch.toLocaleDateString('en-US'));
                    const dateArray = dateSearch.toLocaleDateString('en-US', {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit"
                    }).split('/');
                    const dateReq =dateArray[1] + dateArray[0] + dateArray[2]

                    await page.type('#StartDate', dateReq, {delay: 100});

                    const [dateToElement] = await page.$x('//*[@ng-model="vm.searchCriteria.endDate"]')
                    await dateToElement.type(dateReq, {delay: 100});

                    const [clickSearch] = await page.$x('//button[@type="submit" and @ng-click="vm.searchClick()"]');
                    await clickSearch.click();
                    try {
                        await this.sleep(1000);
                        await clickSearch.click();
                    } catch (e) {
                    }
                    const count = await this.getData(page, dateSearch.toLocaleDateString('en-US'));
                    countRecords += count;
                    console.log(`${dateSearch.toLocaleDateString('en-US')} save ${count} records.`);
                } catch (e) {
                }
            }
        } catch (e) {
            console.log(e);
            console.log('Error search');
            await AbstractProducer.sendMessage('Hillsborough', 'New Hampshire', countRecords, 'Civil');
            return false;
        }
        await AbstractProducer.sendMessage('Hillsborough', 'New Hampshire', countRecords, 'Civil');
        return true;
    }
}