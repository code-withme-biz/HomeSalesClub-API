import AbstractProducer from "../../../abstract_producer";
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import puppeteer from "puppeteer";
import db from "../../../../../../models/db";

const removeRowArray = [
    'CITY', 'DEPT', 'CTY', 'UNITED STATES', 'BANK', 'FIA CARD SERVICES NA',
    'FLORIDA PACE FUNDING AGENCY', 'COUNTY', 'CREDIT', 'HOSPITAL', 'FUNDING', 'UNIVERSITY',
    'MEDICAL', 'CONDOMINIUM ASSOCIATION', 'LOTS', 'TEXAS STATE', 'VETERANS', 'SECRETARY', 'DEPARTMENT',
    'INDIVIDUAL', 'INDIVIDUALLY', 'FINANCE', 'CITIBANK', 'MERS', 'STATE TAX COMMISSION'
];
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i');

export default class CivilProducer extends AbstractProducer {
    urls = {
        generalInfoPage: "https://recorder.maricopa.gov/recdocdata/"
    };

    xpaths = {
        isPageLoaded: '//*[@id="ctl00_ContentPlaceHolder1_btnSearchPanel1"]'
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
            await this.browserPages.generalInfoPage.setDefaultTimeout(60000);
            await this.browserPages.generalInfoPage.goto(this.urls.generalInfoPage, {
                waitUntil: "load"
            });
            return true;
        } catch (err) {
            console.log("error loading page")
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


    async getData(page: puppeteer.Page, date: any, name: any, docType: any): Promise<any> {
        if (removeRowRegex.test(name)) return false;
        const parseName: any = this.newParseName(name.trim())
        if (parseName?.type && parseName?.type == 'COMPANY') return false;
        let practiceType = this.getPracticeType(docType)
        console.log(`this.publicRecordProducer: ${this.publicRecordProducer}`);

        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        console.log(productName);
        const prod = await db.models.Product.findOne({name: productName}).exec();
        const data = {
            'Property State': 'AZ',
            'County': 'maricopa',
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
        let countRecords = 0;

        // console.log(page, 'this is page')
        if (page === undefined) return false;
        await page.setDefaultTimeout(60000);
        try {
            let dateRange = await this.getDateRange('Arizona', 'Maricopa');
            let date = dateRange.from;
            let today = dateRange.to;
            await page.waitForXPath('//span[contains(@id, "_lblMaxNameDate")]')
            let [maxNameDateHandle] = await page.$x('//span[contains(@id, "_lblMaxNameDate")]');
            let maxNameDate = await page.evaluate(el => el.textContent.trim(), maxNameDateHandle);
            console.log(`max name date: ${maxNameDate}`);
            today = new Date(maxNameDate);

            await page.waitForSelector('#ctl00_ContentPlaceHolder1_datepicker');
            console.log('page waited for 5 sec')
            const dateFieldStartSelector =
                "input#ctl00_ContentPlaceHolder1_datepicker";
            const dateFieldStartHandle = await page.$(dateFieldStartSelector);
            await dateFieldStartHandle?.click({clickCount: 3});
            await dateFieldStartHandle?.press("Backspace");
            await dateFieldStartHandle?.type(date.toLocaleDateString('en-US', {
                year: "numeric",
                month: "2-digit",
                day: "2-digit"
            }), {delay: 100});
            console.log("date field start clicked!!");
            const dateFieldEndSelector = "input#ctl00_ContentPlaceHolder1_datepickerEnd";
            const dateFieldEndHandle = await page.$(dateFieldEndSelector);
            await dateFieldEndHandle?.click({clickCount: 3});
            await dateFieldEndHandle?.press("Backspace");
            await dateFieldEndHandle?.type(today.toLocaleDateString('en-US', {
                year: "numeric",
                month: "2-digit",
                day: "2-digit"
            }), {delay: 100});
            console.log("date field end clicked!!");
            await this.sleep(1000);
            await page.click('#ctl00_ContentPlaceHolder1_btnSearchPanel1', {clickCount: 3});
            console.log('search button clicked!!')
            await page.waitForXPath('//*[contains(@id, "tblRecSearch")]')
            let isLast = false;
            let countPage = 1;
            let pageDownExist = true;

            while (!isLast) {
                //   // get all results
                await this.randomSleepIn5Sec()
                await page.waitForSelector('#ctl00_ContentPlaceHolder1_tblRecSearch')
                let last_page: any = await page.$("input#ctl00_ContentPlaceHolder1_btnPageDown");

                if (last_page) {
                    pageDownExist = true;

                } else {
                    pageDownExist = false;

                }

                for (let i = 1; i < 21; i++) {

                    let nextName: any = await page.$x(
                        `//*[@id="ctl00_ContentPlaceHolder1_tblRecSearch"]/tbody/tr[${i + 1}]/td[1]`
                    );
                    if (nextName[0]) {
                        let name: any = await page.$x(
                            `//*[@id="ctl00_ContentPlaceHolder1_tblRecSearch"]/tbody/tr[${i + 1}]/td[1]`
                        );
                        name = await page.evaluate(
                            el => el.textContent,
                            name[0]
                        );
                        let date = await page.$x(
                            `//*[@id="ctl00_ContentPlaceHolder1_tblRecSearch"]/tbody/tr[${i + 1}]/td[3]`
                        );
                        date = await page.evaluate(
                            el => el.textContent,
                            date[0]
                        );
                        let docType = await page.$x(
                            `//*[@id="ctl00_ContentPlaceHolder1_tblRecSearch"]/tbody/tr[${i + 1}]/td[4]`
                        );
                        docType = await page.evaluate(
                            el => el.textContent,
                            docType[0]
                        );
                        const saveRecord = await this.getData(page, date, name, docType);
                        saveRecord && countRecords++;
                    }
                }
                await this.randomSleepIn5Sec()
                if (pageDownExist) {
                    await Promise.all([
                        page.click(`input#ctl00_ContentPlaceHolder1_btnPageDown`),
                        page?.waitForNavigation()
                    ])
                    isLast = false
                } else {

                    isLast = true;
                }
                console.log(countPage);
            }
            await AbstractProducer.sendMessage('maricopa', 'Arizona', countRecords, 'Civil');
            await page.close();
            await this.browser?.close();


            return true;
        } catch (error) {
            console.log(error);
            // return '';
            await AbstractProducer.sendMessage('maricopa', 'Arizona', countRecords, 'Civil');
            return false;
        }
    }


}
