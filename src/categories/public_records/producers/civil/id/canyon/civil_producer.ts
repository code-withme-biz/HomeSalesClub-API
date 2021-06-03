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
        generalInfoPage: 'https://rec-search.canyonco.org/Recording/search.asp'
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
            await this.browserPages.generalInfoPage?.waitForXPath('//*[@id="dfRecordingFrom"]');
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    async saveRecord(fillingDate: string, parseName: any, prod: any, originalDocType: string) {

        const data = {
            'Property State': 'ID',
            'County': 'Canyon',
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
            await page.waitForXPath('//a[text()="Show All"]');
            const [showAllBtn] = await page.$x('//a[text()="Show All"]');
            await Promise.all([
                showAllBtn.click(),
                page.waitForNavigation()
            ]);
            await this.sleep(4000);
           // await page.waitForXPath('/font/div/table/tbody/tr/td/table/tbody/tr');
            const rows = await page.$x('//div/table/tbody/tr/td[2]/table/tbody/tr');
            console.log(rows.length)
            for (let i = 0; i < rows.length; i++) {
                try {
                    let docType = (await rows[i].$eval('td > table > tbody > tr:nth-child(1) > td > table > tbody > tr > td:nth-child(2) > table > tbody > tr:nth-child(1) > td > font:nth-child(2)', elem => elem.textContent))!.trim();
                    const namesElements = await page.$x(`//div/table/tbody/tr/td[2]/table/tbody/tr[${i+1}]/td/table/tbody/tr[2]/td/table/tbody/tr`);
                    let practiceType = this.getPracticeType(docType!.trim());
                    const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                    const prod = await db.models.Product.findOne({name: productName}).exec();
                    for (let j = 0; j < namesElements.length; j++) {
                        try {
                            const name =  (await namesElements[j].$eval('td:nth-child(1) > font:nth-child(2)', elem => elem.textContent))!.trim();
                            if (removeRowRegex.test(name) || !name) continue;
                            const parseName: any = this.newParseName(name.trim());
                            if (parseName.type && parseName.type == 'COMPANY') {
                                continue
                            }
                            const saveRecord = await this.saveRecord(fillingDate, parseName, prod, docType!.trim());
                            saveRecord && count++
                        } catch (e) {
                        }
                    }
                } catch (e) {
                }
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
            page.on('dialog', async dialog => {
                await dialog.accept();
            });

            let dateRange = await this.getDateRange('Idaho', 'Canyon');
            let date = dateRange.from;
            let today = dateRange.to;
            let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24)) - 1;
            for (let i = days < 0 ? 1 : days; i >= 0; i--) {
                try {
                    await page.waitForSelector('#dfRecordingFrom');

                    let dateSearch = new Date();
                    dateSearch.setDate(dateSearch.getDate() - i);
                    console.log('Start search with date: ', dateSearch.toLocaleDateString('en-US'));
                    const date = dateSearch.toLocaleDateString('en-US', {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit"
                    });
                    await page.evaluate(() => {
                        // @ts-ignore
                        document.querySelector('#dfRecordingFrom').value = '';
                        // @ts-ignore
                        document.querySelector('#dfRecordingTo').value = '';
                    })

                    await page.type('#dfRecordingFrom', date, {delay: 100});
                    await page.type('#dfRecordingTo', date, {delay: 100});

                    await page.click('#pbSearch')

                    const count = await this.getData(page, dateSearch.toLocaleDateString('en-US'));
                    countRecords += count;
                    console.log(`${dateSearch.toLocaleDateString('en-US')} save ${count} records.`);
                    await page.goto('https://rec-search.canyonco.org/Recording/search.asp', {waitUntil: 'load'});
                } catch (e) {
                }
            }
        } catch (e) {
            console.log(e);
            console.log('Error search');
            await AbstractProducer.sendMessage('Canyon', 'Idaho', countRecords, 'Civil');
            return false;
        }
        await AbstractProducer.sendMessage('Canyon', 'Idaho', countRecords, 'Civil');
        return true;
    }
}