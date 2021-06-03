import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import _ from 'lodash'

const removeRowArray = [
    'CITY', 'DEPT', 'CTY', 'UNITED STATES', 'BANK', 'FIA CARD SERVICES NA',
    'FLORIDA PACE FUNDING AGENCY', 'COUNTY', 'CREDIT', 'HOSPITAL', 'FUNDING', 'UNIVERSITY',
    'MEDICAL', 'CONDOMINIUM ASSOCIATION', 'LOTS', 'TEXAS STATE', 'VETERANS', 'SECRETARY', 'DEPARTMENT',
    'INDIVIDUAL', 'INDIVIDUALLY', 'FINANCE', 'CITIBANK'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')


export default class CivilProducer extends AbstractProducer {

    urls = {
        generalInfoPage: 'http://recorderonline.solanocounty.com/Search/Pages/SearchSimple.aspx'
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
        await this.browserPages.generalInfoPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3419.0 Safari/537.36');
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
            await this.browserPages.generalInfoPage?.waitForXPath('//*[contains(@id, "btnAgree")]');
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    async getData(page: puppeteer.Page) {
        let count = 0;
        let nextPageFlag;
        try {
            await page.waitForSelector('#searchgrid');
            await this.sleep(3000)
            do {
                nextPageFlag = false;
                const rows = await page.$x('//*[@id="searchres_grid"]/tbody/tr');
                for (let i = 0; i < rows.length; i++) {
                    const [rowElement] = await page.$x(`//*[@id="searchres_grid"]/tbody/tr[${i + 1}]`);
                    await rowElement.click();
                    await page.waitForResponse(response => response.url() === 'http://recorderonline.solanocounty.com/Search/Pages/SearchResults.aspx?s=1' && response.status() === 200);
                    await this.sleep(4000)
                    await page.waitForXPath('//*[contains(@id,"divdocumentnames")]');
                    const [dateElement] = await page.$x('//*[contains(@id,"lblRecordedDt")]');
                    const [docTypeElement] = await page.$x('//*[contains(@id,"divdoctype1")]');
                    let docType = (await page.evaluate(e => e.innerText, docTypeElement)).trim();
                    docType = docType.replace('\n', ' ')
                    const fillingDate = (await page.evaluate(e => e.innerText, dateElement)).trim();
                    const rowsName = await page.$x('//*[contains(@id, "grdnames")]/tbody/tr')
                    let namesArray = [];
                    let granteeFlag = false
                    for (let j = 0; j < rowsName.length; j++) {
                        try {
                            const [granteeElement] = await page.$x(`//*[contains(@id, "grdnames")]/tbody/tr[${j + 1}]/td[1]`);
                            const granteeText = (await page.evaluate(e => e.innerText, granteeElement)).trim();
                            if (granteeText && granteeText == 'Grantee') {
                                granteeFlag = true
                                const [nameElement] = await page.$x(`//*[contains(@id, "grdnames")]/tbody/tr[${j + 1}]/td[2]`)
                                const name = (await page.evaluate(e => e.innerText, nameElement)).trim();
                                namesArray.push(name)
                                continue;
                            }
                            if (granteeFlag) {
                                const [nameElement] = await page.$x(`//*[contains(@id, "grdnames")]/tbody/tr[${j + 1}]/td[1]`)
                                const name = (await page.evaluate(e => e.innerText, nameElement)).trim();
                                namesArray.push(name)
                            }
                        } catch (e) {
                        }
                    }
                    let practiceType = this.getPracticeType(docType);
                    const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                    const prod = await db.models.Product.findOne({ name: productName }).exec();

                    for (let j = 0; j < namesArray.length; j++) {
                        if (removeRowRegex.test(namesArray[j])) continue;
                        const parseName: any = this.newParseName(namesArray[j]!.trim());
                        if (parseName.type && parseName.type == 'COMPANY') {
                            continue
                        }
                        const data = {
                            'Property State': 'CA',
                            'County': 'Solano',
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
                        if (await this.civilAndLienSaveToNewSchema(data))
                            count++
                    }
                }
                const [nextPage] = await page.$x('//*[@class="paging_panel"]//li[@class="next"]/a[contains(@id,"lnkbtnPaging")][not(@disabled)]');
                if (!!nextPage) {
                    await nextPage.click();
                    await page.waitForResponse(response => response.url() === 'http://recorderonline.solanocounty.com/Search/Pages/SearchResults.aspx?s=1' && response.status() === 200);
                    await this.sleep(3000);
                    nextPageFlag = true;
                }
            } while (nextPageFlag)
        } catch (e) {
        }
        return count
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let docTypes = [];
        let countRecords = 0;
        try {

            const [agreeBtn] = await page.$x('//*[contains(@id, "btnAgree")]')
            await agreeBtn.click();
            let dateRange = await this.getDateRange('Califonia', 'Solano');
            let date = dateRange.from;
            let today = dateRange.to;
            let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24)) - 1;
            for (let i = days < 0 ? 1 : days; i >= 0; i--) {
                try {
                    let dateSearch = new Date();
                    dateSearch.setDate(dateSearch.getDate() - i);
                    console.log('Start search with date: ', dateSearch.toLocaleDateString('en-US'));
                    await page.waitForXPath('//*[contains(@id, "txtDocumentDateFrom")]');
                    const [advancedButton] = await page.$x('//*[contains(@id, "btnShowAdvanced")]');
                    try {
                        await advancedButton.click();
                    } catch (e) {
                    }
                    await page.waitForXPath('//*[contains(@id, "txtDocumentDateFrom")]');
                    const [dateFromElement] = await page.$x('//*[contains(@id, "txtDocumentDateFrom")]');
                    const [dateToElement] = await page.$x('//*[contains(@id, "txtDocumentDateTo")]');
                    await page.evaluate((e, date) => {
                        e.value = date;
                    }, dateFromElement, dateSearch.toLocaleDateString('en-US'));
                    await page.evaluate((e, date) => {
                        e.value = date;
                    }, dateToElement, dateSearch.toLocaleDateString('en-US'));
                    const [clickSearch] = await page.$x('//*[contains(@id, "btnAdvancedSearch")]');
                    await clickSearch.click();
                    const count = await this.getData(page);
                    countRecords += count;
                    console.log(`${dateSearch.toLocaleDateString('en-US')} save ${count} records.`);
                    await page.goto('http://recorderonline.solanocounty.com/Search/Pages/SearchSimple.aspx');
                } catch (e) {
                    console.log(e);
                }
            }
        } catch (e) {
            console.log(e);
            console.log('Error search');
            await AbstractProducer.sendMessage('Solano', 'California', countRecords, 'Civil & Lien & Probate');
            return false;
        }
        await AbstractProducer.sendMessage('Solano', 'California', countRecords, 'Civil & Lien & Probate');
        return true;
    }
}