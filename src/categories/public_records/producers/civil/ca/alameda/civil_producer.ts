// Created by Pamela<pamela.prasc@gmail.com>

import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import { IProduct } from '../../../../../../models/product';
import { link } from 'fs';

const removeRowArray = [
    'CITY', 'DEPT', 'CTY', 'UNITED STATES', 'BANK', 'FIA CARD SERVICES NA',
    'FLORIDA PACE FUNDING AGENCY', 'COUNTY', 'CREDIT', 'HOSPITAL', 'FUNDING', 'UNIVERSITY',
    'MEDICAL', 'CONDOMINIUM ASSOCIATION', 'Does', 'In Official Capacity', 'Judge', 'All persons unknown',
    'as Trustees', 'Medical', 'School', 'Management', 'The People', 'US Currency', 'as Trustee', 'Services Foundation',
    'Department', 'ALAMEDA', 'CALIFORNIA'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')

export default class CivilProducer extends AbstractProducer {


    urls = {
        generalInfoPage: 'https://rechart1.acgov.org/RealEstate/SearchEntry.aspx'
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
            await this.browserPages.generalInfoPage.goto(this.urls.generalInfoPage, { waitUntil: 'load' });
            return true;
        } catch (err) {
            console.warn(err);
            return false;
        }
    }

    async read(): Promise<boolean> {
        try {
            await this.browserPages.generalInfoPage?.waitForXPath('//table[@id="tblFooter"]');
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    async getData(page: puppeteer.Page, fromDateString: string, toDateString: string) {
        let count = 0;
        try {
            const [totalRowsSpan] = await page.$x('//*[@id="cphNoMargin_cphNoMargin_SearchCriteriaTop_TotalRows"]');
            if (totalRowsSpan == undefined) {
                return 0;
            }

            let totalRows = parseInt(await page.evaluate(element => element.textContent, totalRowsSpan));

            console.log(totalRows);
            let procRows = 0;
            let pageIndex = 1;
            let infos: any[] = [];

            while(true) {
                const rows = await page.$x('//*[@id="cphNoMargin_cphNoMargin_TDSearchResults"]/div/div/table/tbody/tr[2]/td/table/tbody[2]/tr/td/div[2]/table/tbody/tr[position()>1]');
                for (const row of rows) {
                    let name1 = await page.evaluate(element => element.children[10].children[1].textContent, row);
                    let name2 = await page.evaluate(element => element.children[10].children[2].children[1].textContent, row);
                    name1 = name1.replace('(+)', '').trim();
                    name2 = name2.replace('(+)', '').trim();
                    name1 = name1.replace(/,\s+a\s+.*/i, '');
                    name2 = name2.replace(/,\s+a\s+.*/i, '');
                    console.log(name1, name2)
                    const names = [];
                    if (!removeRowRegex.test(name1)) names.push(name1);
                    if (!removeRowRegex.test(name2)) names.push(name2);
                    if (names.length === 0) continue;
                    
                    let fillingDate = await page.evaluate(element => element.children[7].textContent, row);
                    let docType = await page.evaluate(element => element.children[8].textContent.trim(), row);
                    fillingDate = fillingDate.replace(/\s+|\n/gm, ' ').trim();
                    docType = docType.replace(/\s+|\n/gm, ' ').trim();
                    
                    for (const name of names ){
                        const parseName: any = this.newParseName(name.trim());
                        if (parseName.type === 'COMPANY' || parseName.fullName === '') continue;
                        const practiceType = this.getPracticeType(docType);
                        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                        console.log(productName);
                        console.log(name, parseName, fillingDate, docType)
                        infos.push({
                            parseName,
                            fillingDate,
                            docType,
                            productName
                        });                        
                    }                    
                    procRows++;
                }

                pageIndex++;
                await page.waitForSelector('#OptionsBar1_imgNext');
                const [nextpagedisabled] = await page.$x('//*[@id="OptionsBar1_imgNext"][contains(@src,"disabled")]');
                if (nextpagedisabled) {
                    break;
                }
                else {
                    await Promise.all([
                        page.click('#OptionsBar1_imgNext'),
                        page.waitForNavigation()
                    ]);
                    const url = await page.url();
                    if (url.indexOf('logout') > -1) {
                        console.log('session timedout, researching...');
                        await this.loadAndSetCriteria(page, fromDateString, toDateString);
                        await page.goto(`https://rechart1.acgov.org/RealEstate/SearchResults.aspx?pg=${pageIndex}`);
                    }
                    await page.waitForXPath('//th[text()="Document Type"]/ancestor::table[1]', {visible: true, timeout: 60000});
                }
            }

            // save
            for (let info of infos) {
                const product = await db.models.Product.findOne({ name: info.productName }).exec();
                const data = {
                    'Property State': 'CA',
                    'County': 'Alameda',
                    'First Name': info.parseName.firstName,
                    'Last Name': info.parseName.lastName,
                    'Middle Name': info.parseName.middleName,
                    'Name Suffix': info.parseName.suffix,
                    'Full Name': info.parseName.fullName,
                    "vacancyProcessed": false,
                    fillingDate: info.fillingDate,
                    productId: product._id,
                    originalDocType: info.docType
                };
                if (await this.civilAndLienSaveToNewSchema(data))
                    count++;
            }

        } catch (e) {
            console.log(e);
        }
        return count
    }

    async loadAndSetCriteria(page: puppeteer.Page, fromDateString: string, toDateString: string) {
        const acceptLink = await page.$x('//*[@id="cph1_lnkAccept"]');
        if (acceptLink.length > 0) {
            await Promise.all([
                acceptLink[0].click(),
                page.waitForNavigation({ waitUntil: 'load', timeout: 60000 }),
            ]);
        }

        await page.goto(this.urls.generalInfoPage, { waitUntil: 'load' });

        const submitBtn = await page.$x('//*[@id="cphNoMargin_SearchButtons2_btnSearch__1"]');
        if (submitBtn.length == 0) {
            console.log("No find correct page");
            return false;
        }

        const [fromDateField] = await page.$x('//*[@id="cphNoMargin_f_ddcDateFiledFrom"]/tbody/tr/td[1]/input');
        const [toDateField] = await page.$x('//*[@id="cphNoMargin_f_ddcDateFiledTo"]/tbody/tr/td[1]/input');

        await fromDateField.click({clickCount: 3});
        await fromDateField.press('Backspace');
        await fromDateField.type(fromDateString, {delay: 150});
        await toDateField.click({clickCount: 3});
        await toDateField.press('Backspace');
        await toDateField.type(toDateString, {delay: 150});

        // Need to update Document Type List that should be selected.
        const checkboxes = await page.$x('//input[contains(@id, "_dclDocType_")]');
        for (const checkbox of checkboxes) {
            await checkbox.click();
            await this.sleep(50);
        }

        await Promise.all([
            submitBtn[0].click(),
            page.waitForXPath('//*[@id="cphNoMargin_cphNoMargin_TDSearchResults"]'),
        ]);
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        let count = 0;
        if (page === undefined) return false;
        try {
            let dateRange = await this.getDateRange('Califonia', 'Alameda');
            let fromDate = dateRange.from;
            let toDate = dateRange.to;
            let fromDateString = this.getFormattedDate(fromDate);
            let toDateString = this.getFormattedDate(toDate);

            await this.loadAndSetCriteria(page, fromDateString, toDateString);
            count = await this.getData(page, fromDateString, toDateString);
            await AbstractProducer.sendMessage('Alameda', 'California', count, 'Civil');
            console.log(count);
        } catch (e) {
            console.log(e)
            console.log('Error search');
            await AbstractProducer.sendMessage('Alameda', 'California', count, 'Civil');
            return false
        }
        
        return true;
    }
}
