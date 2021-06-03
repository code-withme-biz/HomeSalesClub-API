import AbstractProducer from "../../../abstract_producer";
import {IPublicRecordProducer} from '../../../../../../models/public_record_producer';
import puppeteer from "puppeteer";
import db from "../../../../../../models/db";
import SnsService from "../../../../../../services/sns_service";
import {assignWith} from "lodash";

const removeRowArray = [
    'CITY', 'DEPT', 'CTY', 'UNITED STATES', 'BANK', 'FIA CARD SERVICES NA',
    'FLORIDA PACE FUNDING AGENCY', 'COUNTY', 'CREDIT', 'HOSPITAL', 'FUNDING', 'UNIVERSITY',
    'MEDICAL', 'CONDOMINIUM ASSOCIATION', 'LOTS', 'TEXAS STATE', 'VETERANS', 'SECRETARY', 'DEPARTMENT',
    'INDIVIDUAL', 'INDIVIDUALLY', 'FINANCE', 'CITIBANK', 'MERS', 'STATE TAX COMMISSION'
];
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i');

export default class CivilProducer extends AbstractProducer {
    urls = {
        generalInfoPage:
            "https://yavapaicountyaz-web.tylerhost.net/web/user/disclaimer"
    };

    xpaths = {
        isPageLoaded: '//*[@id="submitDisclaimerAccept"]'
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
            await this.browserPages.generalInfoPage.goto(this.urls.generalInfoPage, {
                waitUntil: "load"
            });
            return true;
        } catch (err) {
            console.warn(err);
            return false;
        }
    }

    async read(): Promise<boolean> {
        try {
            await this.browserPages.generalInfoPage?.setDefaultTimeout(60000);
            await this.browserPages.generalInfoPage?.waitForXPath(this.xpaths.isPageLoaded);
            console.warn("Page Loaded");
            return true;
        } catch (err) {
            console.warn("Problem loading property appraiser page.");
            return false;
        }
    }


    async saveRecord(fillingDate: string, parseName: any, prod: any, docType: any) {
        const data = {
            'Property State': 'AZ',
            'County': 'Yavapai',
            'First Name': parseName.firstName,
            'Last Name': parseName.lastName,
            'Middle Name': parseName.middleName,
            'Name Suffix': parseName.suffix,
            'Full Name': parseName.fullName,
            "vacancyProcessed": false,
            fillingDate: fillingDate,
            productId: prod._id,
            originalDocType: docType
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }

    async getData(page: puppeteer.Page, fillingDate: string) {
        let count = 0;
        try {
            await page.waitForXPath('//*[contains(@id, "searchResult")]/li[1]')
            const [linkElement] = await page.$x('//*[contains(@id, "searchResult")]')
            const linkToDoc = await linkElement.$eval('li:nth-child(1)', elem => elem.getAttribute('data-href'))
            await page.goto(`https://yavapaicountyaz-web.tylerhost.net${linkToDoc}`)

            let nextPageFlag;
            do {
                await this.sleep(1000)
                await page.waitForXPath('//*[@id="documentIndexingInformation"]/ul/li[2]');
                nextPageFlag = false;
                let [docTypeHandle] = await page.$x('//*[@id="documentIndexingInformation"]/ul/li[2]');
                let docType = await docTypeHandle.evaluate(el => el.textContent?.trim());
                const namesRow = await page.$x('//*[@id="documentIndexingInformation"]/div[1]/div/div/div[2]//tbody/tr[2]/td/div[2]/ul/li')
                let practiceType = this.getPracticeType(docType!.trim());
                const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                const prod = await db.models.Product.findOne({name: productName}).exec();
                for (let i = 0; i < namesRow.length; i++) {
                    if (docType == 'Land Survey') continue;
                    let name = await namesRow[i].evaluate(el => el.textContent?.trim())
                    if (!name || removeRowRegex.test(name)) continue;
                    const parseName: any = this.newParseName(name.trim());
                    if (parseName.type && parseName.type == 'COMPANY') {
                        continue
                    }
                    const saveRecord = await this.saveRecord(fillingDate, parseName, prod, docType!.trim());
                    saveRecord && count++
                }

                const [nextPage] = await page.$x('//a[text()="Next Result" and not(contains(@class,"ui-disabled"))]');
                if (!!nextPage) {
                    await nextPage.click()
                    try {
                        await page.waitForResponse((response) => response.url().includes('/web/document/') && response.status() === 200)
                        await this.sleep(1000)
                        await page.waitForXPath('//*[@id="documentIndexingInformation"]/ul/li[2]', {timeout: 30000})
                    } catch (e) {
                    }
                    let repeatCount = 0;
                    let url, flagRepeat;
                    do {
                        flagRepeat = false
                        url = await page.evaluate(() => document.location.href);
                        if (/disclaimer/i.test(url)) {
                            await page.evaluate(() => {
                                document.getElementById('submitDisclaimerAccept')?.removeAttribute('disabled');
                            })
                            await Promise.all([
                                page.click('#submitDisclaimerAccept'),
                                page.waitForNavigation()
                            ]);
                        }
                        try {
                            await page.waitForXPath('//*[@id="documentIndexingInformation"]/ul/li[2]', {timeout: 30000})
                        } catch (e) {
                            flagRepeat = true
                        }
                        repeatCount++
                    } while (/disclaimer/i.test(url) || repeatCount > 5)
                    nextPageFlag = true
                }
            } while (nextPageFlag)
        } catch (e) {
        }
        await page.goto('https://yavapaicountyaz-web.tylerhost.net/web/search/DOCSEARCH464S1', {waitUntil: 'load'})
        return count
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let countRecords = 0;
        try {
            await page.evaluate(() => {
                document.getElementById('submitDisclaimerAccept')?.removeAttribute('disabled');
            })
            await page.click('#submitDisclaimerAccept');
            await page.waitForXPath('//*[contains(@id, "menuItems")]/a[1]')
            const [docSearch] = await page.$x('//*[contains(@id, "menuItems")]/a[1]')
            await docSearch.click()
            let dateRange = await this.getDateRange('Arizona', 'Yavapai');
            let date = dateRange.from;
            let today = dateRange.to;
            let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24)) - 1;
            for (let i = days < 0 ? 1 : days; i >= 0; i--) {
                try {
                    let repeatCount = 0;
                    let url, flagRepeat;
                    do {
                        flagRepeat = false
                        url = await page.evaluate(() => document.location.href);
                        if (/disclaimer/i.test(url)) {
                            await page.evaluate(() => {
                                document.getElementById('submitDisclaimerAccept')?.removeAttribute('disabled');
                            })
                            await Promise.all([
                                page.click('#submitDisclaimerAccept'),
                                page.waitForNavigation()
                            ]);
                        }
                        try {
                            await page.waitForSelector('#field_RecordingDateID_DOT_StartDate', {timeout: 30000});
                        } catch (e) {
                            flagRepeat = true
                        }
                        repeatCount++
                    } while (/disclaimer/i.test(url) || repeatCount > 5)

                    let dateSearch = new Date();
                    dateSearch.setDate(dateSearch.getDate() - i);
                    console.log('Start search with date: ', dateSearch.toLocaleDateString('en-US'))
                    await page.waitForSelector('#field_RecordingDateID_DOT_StartDate');
                    await page.evaluate(() => {
                        // @ts-ignore
                        document.querySelector('#field_RecordingDateID_DOT_StartDate').value = '';
                        // @ts-ignore
                        document.querySelector('#field_RecordingDateID_DOT_EndDate').value = '';
                    })
                    await page.type('#field_RecordingDateID_DOT_StartDate', dateSearch.toLocaleDateString('en-US', {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit"
                    }), {delay: 100});
                    await page.type('#field_RecordingDateID_DOT_EndDate', dateSearch.toLocaleDateString('en-US', {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit"
                    }), {delay: 100});
                    await page.click('#searchButton');
                    const count = await this.getData(page, dateSearch.toLocaleDateString('en-US'));
                    countRecords += count;
                    console.log(`${dateSearch.toLocaleDateString('en-US')} found ${count} records.`);
                } catch (e) {
                }
            }
        } catch (e) {
            console.log(e)
            console.log('Error search');
            await AbstractProducer.sendMessage('Yavapai', 'Arizona', countRecords, 'Civil & Lien');
            return false
        }
        await AbstractProducer.sendMessage('Yavapai', 'Arizona', countRecords, 'Civil & Lien');
        return true;
    }
}
