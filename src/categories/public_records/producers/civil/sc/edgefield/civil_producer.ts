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
        generalInfoPage: 'https://www.sclandrecords.com/sclr/'
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
            await this.browserPages.generalInfoPage?.waitForXPath('//select[@name="countycode"]');
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    async saveRecord(fillingDate: string, parseName: any, prod: any, originalDocType: string) {
        const data = {
            'Property State': 'SC',
            'County': 'edgefield',
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
        let linkArray = [];
        try {
            await this.sleep(2000);
            const [noFound] = await page.$x('//a[contains(text(), "Click here to go back")]')
            if (!!noFound) {
                await noFound.click();
                return count;
            }
            do {
                await page.waitForXPath('//*[@id="searchResults"]', {timeout: 30000});
                nextPageFlag = false;
                const rows = await page.$x('//table[@id="top"]/following-sibling::table[1]/tbody/tr')
                for (let i = 1; i < rows.length; i++) {
                    const linkRecord = await rows[i].$eval('td:nth-child(2) > a', elem => elem.getAttribute('href'))
                    if (linkRecord) {
                        linkArray.push(linkRecord);
                    }
                }
                const [nextPageElement] = await page.$x('//a[contains(text(), "Next")]');
                if (!!nextPageElement) {
                    await Promise.all([
                        nextPageElement.click(),
                        page.waitForNavigation()
                    ])
                    nextPageFlag = true
                }
            } while (nextPageFlag)
            for (let i = 0; i < linkArray.length; i++) {
                try {
                    await page.goto('https://www.sclandrecords.com' + linkArray[i], {waitUntil: "load"})
                    await page.waitForSelector('#searchResults')
                    const [docTypeElement] = await page.$x('//*[@id="searchResults"]/form/table/tbody/tr[3]//*[contains(text(),"Type")]/parent::tr[1]/following-sibling::tr[1]/td[1]/font');
                    let docType = (await page.evaluate((e: any) => e.innerText, docTypeElement)).replace('(', '').replace(')', '').trim();
                    const names = await page.$x('//*[@id="searchResults"]/form/table/tbody/tr[3]//*[contains(text(),"Grantee")]/parent::td[1]/following-sibling::td[1]/font/a')
                    for (let j = 0; j < names.length; j++) {
                        let name = (await names[j].$eval('font', elem => elem.textContent))!.trim()
                        name = name.replace('AT AL', '').trim()
                        if (removeRowRegex.test(name) || !name) continue;
                        const parseName: any = this.newParseName(name.trim());
                        if (parseName.type && parseName.type == 'COMPANY') {
                            continue;
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
        }
        return count;
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let countRecords = 0;
        try {
            await page.select('select[name="countycode"]', 'sc037')
            let dateRange = await this.getDateRange('South Carolina', 'Edgefield');
            let date = dateRange.from;
            let today = dateRange.to;
            let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24)) - 1;

            for (let i = days < 0 ? 1 : days; i >= 0; i--) {
                let countFromDate = 0;
                let dateSearch = new Date();
                dateSearch.setDate(dateSearch.getDate() - i);
                console.log('Start search with date: ', dateSearch.toLocaleDateString('en-US'));
                try {
                    await page.waitForSelector('#searchType')
                    await page.select('#searchType', 'searchByDateType')
                    await this.sleep(1000)

                    const [beginningDateElement] = await page.$x('//input[@name="fromdate"]')
                    await beginningDateElement.click({clickCount: 3})
                    await beginningDateElement.press('Backspace');
                    await beginningDateElement.type(dateSearch.toLocaleDateString('en-US', {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit"
                    }), {delay: 100})

                    const [endingDateElement] = await page.$x('//input[@name="todate"]')
                    await endingDateElement.click({clickCount: 3})
                    await endingDateElement.press('Backspace');
                    await endingDateElement.type(dateSearch.toLocaleDateString('en-US', {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit"
                    }), {delay: 100})
                    await page.select('select[name="rowincrement"]', '100')

                    const [buttonSearch] = await page.$x('//*[@id="inputbutton"]');
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
            await AbstractProducer.sendMessage('Edgefield', 'South Carolina', countRecords, 'Civil');
            return false;
        }
        await AbstractProducer.sendMessage('Edgefield', 'South Carolina', countRecords, 'Civil');
        return true;
    }
}