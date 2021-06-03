// Created by Pamela<pamela.prasc@gmail.com>

import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

const removeRowArray = [
    'CITY', 'DEPT', 'CTY', 'UNITED STATES', 'BANK', 'FIA CARD SERVICES NA',
    'FLORIDA PACE FUNDING AGENCY', 'COUNTY', 'CREDIT', 'HOSPITAL', 'FUNDING', 'UNIVERSITY',
    'MEDICAL', 'CONDOMINIUM ASSOCIATION', 'Does', 'In Official Capacity', 'Judge', 'All persons unknown',
    'as Trustees', 'Medical', 'School', 'Management', 'The People', 'US Currency', 'as Trustee', 'Services Foundation',
    'Department', 'SAN DIEGO', 'CALIFORNIA', 'LLC'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')

export default class CivilProducer extends AbstractProducer {


    urls = {
        generalInfoPage: 'https://arcc-acclaim.sdcounty.ca.gov/search/SearchTypeDocType'
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

    getDateString(date: Date): string {
        return (date.getMonth() + 1) + "/" + date.getDate() + "/" + date.getFullYear();
    }

    async read(): Promise<boolean> {
        try {
            await this.browserPages.generalInfoPage?.waitForXPath('//*[@id="footer"]');
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    async getProductId(docType: string) {
        // Need to update case for product_id
        switch (docType) {
            case 'NOTICE OF PENDING ACTION':
                return await db.models.Product.findOne({ name: '/california/san-diego/other-civil' }).exec();
            default:
                return await db.models.Product.findOne({ name: '/california/san-diego/other-civil' }).exec();
        }
    }

    async getData(page: puppeteer.Page, name: any, type: any, date: any, caseUniqueId: any): Promise<any> {
        const full_name = name.replace(/\n/g, '')
        const parseName: any = this.newParseName(full_name);
        if (parseName.type && parseName.type == 'COMPANY') {
            return false
        }
        let practiceType = this.getPracticeType(type);

        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({ name: productName }).exec();
        const data = {
            'caseUniqueId': caseUniqueId,
            'Property State': 'CA',
            'County': 'San Diego',
            'First Name': parseName.firstName,
            'Last Name': parseName.lastName,
            'Middle Name': parseName.middleName,
            'Name Suffix': parseName.suffix,
            'Full Name': parseName.fullName,
            "vacancyProcessed": false,
            practiceType: practiceType,
            fillingDate: date,
            productId: prod._id,
            originalDocType: type
        };
        if (await this.civilAndLienSaveToNewSchema(data)) {
            return true
        } else {
            return false
        }
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;

        if (page === undefined) return false;
        let countRecords = 0;
        try {
            const civilUrl: string = 'https://arcc-acclaim.sdcounty.ca.gov/search/SearchTypeDocType';

            let dateRange = await this.getDateRange('California', 'San Diego');
            let fromDate = dateRange.from;
            let toDate = dateRange.to;
            let page = this.browserPages.generalInfoPage!;

            while (fromDate <= toDate) {
                let dateStringDay = this.getDateString(new Date(fromDate));
                await page.goto(civilUrl, { timeout: 600000 });
                let acceptBtn = await page.$('#btnButton');
                if (acceptBtn != null) {
                    await Promise.all([
                        acceptBtn.click(),
                        page.waitForNavigation({ waitUntil: 'load', timeout: 60000 })
                    ]);
                }

                await page.click('#RecordDateFrom', { clickCount: 3 });
                await page.type('#RecordDateFrom', dateStringDay);
                await page.click('#RecordDateTo', { clickCount: 3 });
                await page.type('#RecordDateTo', dateStringDay);

                // Need to update Document Type List that should be selected.
                await page.click('#DocTypesDisplay-input');
                await this.sleep(300);
                const showXpath = `//button[contains(text(), '...')]`;
                const typesXpath = '//div[@id="DocTypesWin"]';
                const listXpath = `//*[@id="DocTypelist"]/div/ul/li[2]`;

                const [showElement] = await page.$x(showXpath);
                await showElement.click();
                await page.waitForXPath(typesXpath);
                await (await page.$x(listXpath))[0].click();

                await page.waitForXPath('//div[@id="DocumentTypesList-2"]/div[1]');

                const docTypeSelects = ['DEED', 'LIEN', 'FORECLOSURE', 'MARRIAGE', 'MORTGAGE', 'EASEMENT'];
                const items = await page.$x('//div[@id="DocumentTypesList-2"]/div[1]/input');

                for (let i = 0; i < items.length; i++) {
                    const type = await items[i].evaluate(el => el.getAttribute('title'));
                    if (type?.includes(docTypeSelects[0]) || type?.includes(docTypeSelects[1]) || type?.includes(docTypeSelects[2]) || type?.includes(docTypeSelects[3]) || type?.includes(docTypeSelects[4])) {
                        const [inputHandle] = await page.$x(`//div[@id="DocumentTypesList-2"]/div[1]/input[@title="${type}"]`);
                        await inputHandle.click();
                        await this.sleep(500)
                    }
                }

                await (await page.$x(`//input[contains(@onclick, 'GetDocTypeString()')]`))[0].click();
                await this.sleep(3000);

                const fromDateHandle = await page.$('input#RecordDateFrom');
                const toDateHandle = await page.$('input#RecordDateTo');

                await fromDateHandle?.click({ clickCount: 3 });
                await fromDateHandle?.press('Backspace');
                await fromDateHandle?.type(dateStringDay, { delay: 150 });

                await toDateHandle?.click({ clickCount: 3 });
                await toDateHandle?.press('Backspace');
                await toDateHandle?.type(dateStringDay, { delay: 150 });

                try {
                    await Promise.all([
                        page.$eval('input#btnSearch', el => el.removeAttribute('disable')),
                        page.click('input#btnSearch'),
                    ])
                } catch (error) {
                    console.error(error);
                    return false;
                }


                let pageNum = 0;
                let countPage = 1;

                while (pageNum >= 0) {
                    const tableXpath = '//div[@class="t-grid-content"]/table/tbody';
                    await page.waitForXPath(tableXpath);
                    if (pageNum == 0) {
                        await this.sleep(10000);
                    } else {
                        await this.sleep(3000);
                    }
                    const results = await page.$x(`${tableXpath}/tr`);

                    for (let i = 0; i < results.length; i++) {
                        try {
                            const [nameHandle] = await page.$x(`${tableXpath}/tr[${i + 1}]/td[4]`);
                            const [dateHandle] = await page.$x(`${tableXpath}/tr[${i + 1}]/td[7]`);
                            const [caseUniqueIdHandle] = await page.$x(`${tableXpath}/tr[${i + 1}]/td[6]`);
                            const [typeHandle] = await page.$x(`${tableXpath}/tr[${i + 1}]/td[8]`);
                            const name = await nameHandle.evaluate(el => el.textContent?.trim());
                            const date = await dateHandle.evaluate(el => el.textContent?.trim());
                            const type = await typeHandle.evaluate(el => el.textContent?.trim());
                            const caseUniqueId = await caseUniqueIdHandle.evaluate(el => el.textContent?.trim());
                            let civilSeed = await this.getData(page, name, type, date, caseUniqueId);
                            if (civilSeed)
                                countRecords++;
                        } catch (err) {
                            continue;
                        }

                    }
                    pageNum++;
                    const nextButtonXpath = '//div[@id="RsltsGrid"]/div[2]/div[2]/a[3]';
                    const [nextButtonEL] = await page.$x(nextButtonXpath);
                    const nextButtonDisabled = await page.evaluate(el => el.getAttribute('class'), nextButtonEL);
                    if (nextButtonDisabled === 't-link t-state-disabled') {
                        break;
                    } else {
                        countPage++;
                        await nextButtonEL.click();
                    }
                }


                fromDate.setDate(fromDate.getDate() + 1);
            }
            await AbstractProducer.sendMessage('San Diego', 'California', countRecords, 'Civil & Lien');
            await page.close();
            await this.browser?.close();
            return true;

            // console.log(count);
        } catch (e) {
            console.log(e)
            console.log('Error search: maybe website is unavailable');
            await AbstractProducer.sendMessage('San Diego', 'California', countRecords, 'Civil & Lien');
            return false
        }
    }
}
