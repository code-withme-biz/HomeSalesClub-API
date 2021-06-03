import AbstractProducer from "../../../abstract_producer";
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
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
        generalInfoPage: "https://acclaim.pinalcountyaz.gov/AcclaimWeb/search/SearchTypeRecordDate"
    };

    xpaths = {
        isPageLoaded: '//*[@id="mainForm"]'
    }

    constructor(publicRecordProducer: IPublicRecordProducer) {
        // @ts-ignore
        super();
        this.publicRecordProducer = publicRecordProducer;
        this.stateToCrawl = this.publicRecordProducer?.state || '';
    }

    async init(): Promise<boolean> {
        console.log("running init")
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
            await this.browserPages.generalInfoPage?.waitForXPath(this.xpaths.isPageLoaded);
            console.warn('Page Loaded')
            return true;
        } catch (err) {
            console.warn("Problem loading property appraiser page.");
            return false;
        }
    }

    async getData(page: puppeteer.Page, date: any, rowNum: any, name: any, docLegal: any, docType: any): Promise<any> {
        if (removeRowRegex.test(name)) return false;
        const parseName: any = this.newParseName(name.trim())
        if (parseName?.type && parseName?.type == 'COMPANY') return false;
        let practiceType = this.getPracticeType(docType)
        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({name: productName}).exec();
        const data = {
            'caseUniguqId': rowNum,
            'Property State': 'AZ',
            'County': 'pinal',
            'First Name': parseName.firstName,
            'Last Name': parseName.lastName,
            'Middle Name': parseName.middleName,
            'Name Suffix': parseName.suffix,
            'Full Name': parseName.fullName,
            "vacancyProcessed": false,
            fillingDate: date,
            productId: prod._id,
            originalDocType: docType
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }

    async parseAndSave(): Promise<boolean> {
        console.log('entered in methode')
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let countRecords = 0;

        try {

            const dateRange = await this.getDateRange('Arizona', 'Pinal');
            const fromDate = this.getSeparateDate(dateRange.from);
            await this.sleep(5000);
            const acceptConditionButtonSelector = 'input#btnButton';
            const acceptConditionHanlde = await page.$(acceptConditionButtonSelector);
            await this.sleep(5000);
            await acceptConditionHanlde?.click();
            console.log('accept button clicked!!')
            await this.sleep(5000);
            console.log('page waited for 5 sec')
            const dateFieldSelector = 'input#RecordDate';
            const dateFieldHandle = await page.$(dateFieldSelector);
            await dateFieldHandle?.click({clickCount: 3});
            await dateFieldHandle?.press('Backspace');
            await dateFieldHandle?.type(`${fromDate.month}/${fromDate.day}/${fromDate.year}`);
            console.log('date field clicked!!')
            await this.sleep(5000);
            console.log('page waited for 5 sec')
            const searchButtonSelector = 'input#btnSearch';
            const searchHanlde = await page.$(searchButtonSelector);
            await searchHanlde?.click();
            console.log('search button clicked!!')
            await this.sleep(10000);
            let isLast = false;
            let countPage = 1;

            let countResults: any = await page.$x('//*[@id="RsltsGrid"]/div[2]/div[3]');
            if (countResults[0] === undefined) {
                console.log('No Results Found');
                await AbstractProducer.sendMessage('Arizona', 'Pinal', countRecords, 'Civil');
                return false;
            }
            countResults = await page.evaluate(el => el.textContent, countResults[0]);
            countResults = countResults.replace("Displaying items 1 - 11 of ", "");
            countResults = parseInt(countResults);
            console.log(`${countResults} Results Found`);

            while (!isLast) {
                // get all results
                let last_page: any = await page.$x(
                    '//*[@id="RsltsGrid"]/div[2]/div[2]/div[3]'
                );
                last_page = await page.evaluate(el => el.textContent, last_page[0]);
                last_page = last_page.replace("Page  of ", "");
                last_page = parseInt(last_page);
                console.log(last_page, "total pages");


                for (let i = 0; i < 11; i++) {
                    console.log(i, "nextName");
                    let nextName: any = await page.$x(
                        `//*[@id="RsltsGrid"]/div[4]/table/tbody/tr[${i + 1}]/td[1]`
                    );


                    if (nextName[0]) {
                        let rowNum = await page.$x(
                            `//*[@id="RsltsGrid"]/div[4]/table/tbody/tr[${i + 1}]/td[1]`
                        );
                        rowNum = await page.evaluate(
                            el => el.textContent,
                            rowNum[0]
                        );
                        let firstName = await page.$x(
                            `//*[@id="RsltsGrid"]/div[4]/table/tbody/tr[${i + 1}]/td[2]`
                        );
                        firstName = await page.evaluate(
                            el => el.textContent,
                            firstName[0]
                        );
                        let docLegal = await page.$x(
                            `//*[@id="RsltsGrid"]/div[4]/table/tbody/tr[${i + 1}]/td[3]`
                        );
                        docLegal = await page.evaluate(
                            el => el.textContent,
                            docLegal[0]
                        );
                        let date = await page.$x(
                            `//*[@id="RsltsGrid"]/div[4]/table/tbody/tr[${i + 1}]/td[4]`
                        );
                        date = await page.evaluate(
                            el => el.textContent,
                            date[0]
                        );
                        let docType = await page.$x(
                            `//*[@id="RsltsGrid"]/div[4]/table/tbody/tr[${i + 1}]/td[5]`
                        );
                        docType = await page.evaluate(
                            el => el.textContent,
                            docType[0]
                        );


                        await this.getData(page, date, rowNum, firstName, docLegal, docType);
                        countRecords++;
                    }
                }
                if (countPage != last_page) {
                    countPage++;
                    await Promise.all([
                        page.click(`span.t-icon.t-arrow-next`),
                        this.sleep(5000)
                    ])
                    isLast = false;
                } else {
                    isLast = true;
                }
                console.log(countPage);
            }
            console.log('ALLLLLL', countRecords)
            await AbstractProducer.sendMessage('Arizona', 'Pinal', countRecords, 'Civil');
            await page.close();
            await this.browser?.close();




            return true;
        } catch (error) {
            console.log(error);
            await AbstractProducer.sendMessage('Arizona', 'Pinal', countRecords, 'Civil');
            return false;
        }
    }


}
