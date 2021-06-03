import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';

const removeRowArray = [
    'CITY', 'DEPT', 'CTY', 'UNITED STATES', 'BANK', 'FIA CARD SERVICES NA',
    'FLORIDA PACE FUNDING AGENCY', 'COUNTY', 'CREDIT', 'HOSPITAL', 'FUNDING', 'UNIVERSITY',
    'MEDICAL', 'CONDOMINIUM ASSOCIATION', 'LOTS', 'TEXAS STATE', 'VETERANS', 'SECRETARY', 'DEPARTMENT',
    'INDIVIDUAL', 'INDIVIDUALLY', 'FINANCE', 'CITIBANK', 'MERS', 'STATE TAX COMMISSION'
];
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i');


export default class CivilProducer extends AbstractProducer {
    browserPages = {
        generalInfoPage: undefined as undefined | puppeteer.Page
    };
    urls = {
        generalInfoPage: 'https://courtcasesearch.stlucieclerk.com/BenchmarkWebExternal/Home.aspx/Search'
    }

    xpaths = {
        isPAloaded: '//*[@id="openedFrom"]'
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
            await this.browserPages.generalInfoPage.goto(this.urls.generalInfoPage, {waitUntil: 'load'});
            return true;
        } catch (err) {
            console.warn(err);
            return false;
        }
    }

    async read(): Promise<boolean> {
        try {
            await this.browserPages.generalInfoPage?.waitForXPath(this.xpaths.isPAloaded);
            return true;
        } catch (err) {
            console.warn('Problem loading civil producer page.');
            return false;
        }
    }

    async saveRecord(fillingDate: string, parseName: any, prod: any, caseType: string) {

        const data = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'First Name': parseName.firstName,
            'Last Name': parseName.lastName,
            'Middle Name': parseName.middleName,
            'Name Suffix': parseName.suffix,
            'Full Name': parseName.fullName,
            "vacancyProcessed": false,
            fillingDate: fillingDate,
            productId: prod._id,
            originalDocType: caseType
        };

        return await this.civilAndLienSaveToNewSchema(data);
    }

    async getData(page: puppeteer.Page, fillingDate: string) {
        let count = 0;
        let nextPageFlag;
        try {
            do {
                nextPageFlag = false;
                await page.waitForSelector('#gridSearchResults');
                const rows = await page.$x('//*[@id="gridSearchResults"]/tbody/tr');
                for (let i = 0; i < rows.length; i++) {
                    try {

                        const partyType = (await rows[i].$eval('td:nth-child(3)', elem => elem.textContent))!.trim();
                        if (/PLAINTIFF/i.test(partyType)) continue;
                        let name = (await rows[i].$eval('td:nth-child(2) > a', elem => elem.textContent))!.trim();
                        if (!name) continue;
                        if (removeRowRegex.test(name)) continue;
                        const parseName: any = this.newParseName(name);
                        if (parseName.type === 'COMPANY' || parseName.fullName === '') continue;
                        // @ts-ignore
                        const caseId = await rows[i].$eval('td:nth-child(1) > input:nth-child(1)', elem => elem.value);
                        let [openButton] = await page.$x(`//*[@id="a_imgExpand_${caseId}"]`)
                        await openButton.click()
                        await page.waitForXPath(`//*[@id="detail_${caseId}"]//*[contains(text(),"Case Type:")]/following-sibling::td[1]`);
                        const [caseTypeElement] = await page.$x(`//*[@id="detail_${caseId}"]//*[contains(text(),"Case Type:")]/following-sibling::td[1]`);
                        let caseType = await page.evaluate(e => e.textContent, caseTypeElement);
                        [openButton] = await page.$x(`//*[@id="a_imgExpand_${caseId}"]`)
                        await openButton.click()
                        if (/criminal/i.test(caseType)) continue;

                        let practiceType = this.getPracticeType(caseType);
                        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                        const prod = await db.models.Product.findOne({name: productName}).exec();

                        const saveRecord = await this.saveRecord(fillingDate, parseName, prod, caseType);
                        saveRecord && count++
                    } catch (e) {
                        console.log(e)
                    }
                }
                const [nextPage] = await page.$x('//*[@id="img_next" and not(contains(@src, "disabled"))]')
                if (!!nextPage) {
                    await Promise.all([
                        nextPage.click(),
                        page.waitForNavigation()
                    ]);
                    nextPageFlag = true;
                }
            } while (nextPageFlag)
        } catch (e) {
        }
        return count
    }

    // This is main function
    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let countRecords = 0;
        try {
            await page.waitForSelector('#openedFrom')
            await this.randomSleepIn5Sec()
            let dateRange = await this.getDateRange('st-lucie', 'Florida');
            let date = dateRange.from;
            let today = dateRange.to;
            let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24)) - 1;
            for (let i = days < 0 ? 1 : days; i >= 0; i--) {
                await this.randomSleepIn5Sec()
                await page.waitForSelector('#openedFrom')
                let dateSearch = new Date();
                dateSearch.setDate(dateSearch.getDate() - i);
                console.log('Start search with date: ', dateSearch.toLocaleDateString('en-US'));
                let pageCaptcha = await this.browser!.newPage()
                await pageCaptcha.setDefaultNavigationTimeout(0);
                await pageCaptcha.goto('https://courtcasesearch.stlucieclerk.com/BenchmarkWebExternal//CourtCase.aspx/CaptchaQuestion');
                let reg = await pageCaptcha.$eval('body', e1 => e1.innerHTML);
                let eqt = reg.split("=");
                let calc = eval(eqt[0])
                let value = String(calc)
                await pageCaptcha.close();
                await this.sleep(1000)
                const [inputCapcha] = await page.$x('//input[@name="captcha"]');
                await inputCapcha.type(value, {delay: 100})
                await this.sleep(1000)
                const [fromElement] = await page.$x('//*[@id="openedFrom"]');
                await fromElement.click({clickCount: 3});
                await this.sleep(5000)
                await fromElement.press('Backspace');
                await fromElement.type(dateSearch.toLocaleDateString('en-US', {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit"
                }).replace('/', '').replace('/', ''), {delay: 150});

                const [toElement] = await page.$x('//*[@id="openedTo"]');
                await toElement.click({clickCount: 3});
                await this.sleep(5000)
                await toElement.press('Backspace');
                await toElement.type(dateSearch.toLocaleDateString('en-US', {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit"
                }).replace('/', '').replace('/', ''), {delay: 150});
                await Promise.all([
                    page.click('#searchButton'),
                    page.waitForNavigation()
                ])
                const count = await this.getData(page, dateSearch.toLocaleDateString('en-US'));
                countRecords += count;
                console.log(`${dateSearch.toLocaleDateString('en-US')} found ${count} records.`);

                await page.goto(this.urls.generalInfoPage, {waitUntil: 'load'})
            }
        } catch (e) {
            console.log(e);
            console.log('Error search');
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('St. Lucie', 'Florida', countRecords, 'Civil & Lien', errorImage);
            return false;
        }
        await AbstractProducer.sendMessage('St. Lucie', 'Florida', countRecords, 'Civil & Lien');
        return true;
    }
}
