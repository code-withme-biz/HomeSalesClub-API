import AbstractProducer from "../../../abstract_producer";
import puppeteer from "puppeteer";
import db from "../../../../../../models/db";
import SnsService from "../../../../../../services/sns_service";
import {assignWith} from "lodash";
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

const removeRowArray = [
    'CITY', 'DEPT', 'CTY', 'UNITED STATES', 'BANK', 'FIA CARD SERVICES NA',
    'FLORIDA PACE FUNDING AGENCY', 'COUNTY', 'CREDIT', 'HOSPITAL', 'FUNDING', 'UNIVERSITY',
    'MEDICAL', 'CONDOMINIUM ASSOCIATION', 'LOTS', 'TEXAS STATE', 'VETERANS', 'SECRETARY', 'DEPARTMENT',
    'INDIVIDUAL', 'INDIVIDUALLY', 'FINANCE', 'CITIBANK', 'MERS', 'STATE TAX COMMISSION'
];
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i');

export default class CivilProducer extends AbstractProducer {
    urls = {
        generalInfoPage: "https://www.recorder.pima.gov/PublicServices/PublicSearch"
    };

    xpaths = {
        isPageLoaded: '/html/body'
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

        let retries = 0;
        while (true) {
            try {
              await this.browserPages.generalInfoPage.goto(this.urls.generalInfoPage, { waitUntil: 'load' });
              break;
            } catch (err) {
                retries++;
                if (retries > 3) {
                    console.log('******** website loading failed');
                    return false;
                }
                this.randomSleepIn5Sec();
                console.log(`******** website loading failed, retring... [${retries}]`);
            }        
        }
        return true;
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

    async getData(page: puppeteer.Page, date: any, firstName: any, lastName: any, docType: any): Promise<any> {
        const name = `${lastName} ${firstName}`
        if (removeRowRegex.test(name)) return false;
        const parseName: any = this.newParseName(name.trim())
        if (parseName?.type && parseName?.type == 'COMPANY') return false;

        let practiceType = this.getPracticeType(docType)

        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({name: productName}).exec();
        const data = {
            'Property State': 'AZ',
            'County': 'pima',
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
        await page?.setDefaultNavigationTimeout(60000);
        
        if (page === undefined) return false;
        let countRecords = 0;

        try {
            const dateRange = await this.getDateRange('AZ', 'pima');
            const fromDate = dateRange.from;
            const toDate = dateRange.to;
            let days = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 3600 * 24)) - 1;
            for (let i = days < 0 ? 1 : days; i >= 0; i--) {
                let retries = 0;
                while (true) {
                    try {
                        await page.goto(this.urls.generalInfoPage, {waitUntil: 'networkidle0'});
                    break;
                    } catch (err) {
                        retries++;
                        if (retries > 3) {
                            console.log('******** website loading failed');
                            return false;
                        }
                        this.randomSleepIn5Sec();
                        console.log(`******** website loading failed, retring... [${retries}]`);
                    }        
                }
                let dateSearch = new Date();
                dateSearch.setDate(dateSearch.getDate() - i);
                console.log('//////////// CHECKING FOR ', this.getFormattedDate(dateSearch));
                const grantorSelector = 'input#ContentPlaceHolder1_rblSearchType_1';
                const grantorHanlde = await page.$(grantorSelector);
                await page.waitFor(5000);
                await grantorHanlde?.click();
                await page.waitFor(5000);

                const dateFieldStartSelector =
                    "input#ContentPlaceHolder1_txtStartDate";
                const dateFieldStartHandle = await page.$(dateFieldStartSelector);
                await dateFieldStartHandle?.click({clickCount: 15});
                await dateFieldStartHandle?.press("Backspace");
                await dateFieldStartHandle?.type(this.getFormattedDate(dateSearch), {delay: 100});
                const dateFieldEndSelector = "input#ContentPlaceHolder1_txtEndDate";
                const dateFieldEndHandle = await page.$(dateFieldEndSelector);
                await dateFieldEndHandle?.click({clickCount: 15});
                await dateFieldEndHandle?.press("Backspace");
                await dateFieldEndHandle?.type(this.getFormattedDate(dateSearch), {delay: 100});
                await this.randomSleepIn5Sec();
                const searchButtonSelector = 'input#ContentPlaceHolder1_btnDocumentSearch';
                const searchHanlde = await page.$(searchButtonSelector);
                await searchHanlde?.click();
                await page.waitFor(15000);
                const acceptSelector = 'button.btn.btn-outline-primary.ui-button.ui-corner-all.ui-widget';
                if (acceptSelector) {
                    const acceptHandle = await page.$(acceptSelector);
                    await acceptHandle?.click();
                    await page.waitFor(3000);
                }
                let isLast = false;
                let countPage = 1;
                while (!isLast) {

                    for (let i = 0; i < 20; i++) {
                        let nextName: any = await page.$x(
                            `//*[@id="ContentPlaceHolder1_gvDocumentsGrantorGrantees"]/tbody/tr[${i + 1}]/td[2]`
                        );


                        if (nextName[0]) {

                            let lastName: any = await page.$x(
                                `//*[@id="ContentPlaceHolder1_gvDocumentsGrantorGrantees"]/tbody/tr[${i + 1}]/td[2]`
                            );
                            lastName = await page.evaluate(
                                el => el.textContent,
                                lastName[0]
                            );
                            let firstName = await page.$x(
                                `//*[@id="ContentPlaceHolder1_gvDocumentsGrantorGrantees"]/tbody/tr[${i + 1}]/td[3]`
                            );
                            if (firstName) {
                                firstName = await page.evaluate(
                                    el => el.textContent,
                                    firstName[0]
                                );
                            } else {
                                lastName = '';
                            }

                            let date = await page.$x(
                                `//*[@id="ContentPlaceHolder1_gvDocumentsGrantorGrantees"]/tbody/tr[${i + 1}]/td[10]`
                            );
                            date = await page.evaluate(
                                el => el.textContent,
                                date[0]
                            );
                            let docType = await page.$x(
                                `//*[@id="ContentPlaceHolder1_gvDocumentsGrantorGrantees"]/tbody/tr[${i + 1}]/td[5]`
                            );
                            docType = await page.evaluate(
                                el => el.textContent,
                                docType[0]
                            );
                            console.log(firstName, "firstName")
                            console.log(lastName, "lastName")
                            console.log(docType, "docType")
                            console.log(date, "date")


                            //   // const num = await numbers[i].evaluate(el => el.childNodes[1]?.childNodes[1]?.firstChild?.childNodes[3]?.childNodes[3]?.textContent?.trim());
                            const saveRecord = await this.getData(page, date, firstName, lastName, docType);
                            saveRecord && countRecords++;
                        }
                    }

                    
                    const [nextpage_handle] = await page.$x(`//*[@id="ContentPlaceHolder1_gvDocumentsGrantorGrantees"]/tbody/tr[22]/td/table/tbody/tr/td/a[contains(@href, "Page$${countPage+1}")]`);
                    if (nextpage_handle) {
                        await Promise.all([
                            nextpage_handle.click(),
                            page.waitForNavigation()
                        ]);
                        await this.randomSleepIn5Sec();
                        countPage++;
                        console.log(countPage);
                    }
                    else {
                        isLast = true;
                    }
                }
            }
            await AbstractProducer.sendMessage('pima', 'Arizona', countRecords, 'Civil');
            await page.close();
            await this.browser?.close();

            return true;
        } catch (error) {
            console.log(error);
            await AbstractProducer.sendMessage('pima', 'Arizona', countRecords, 'Civil');
            // return '';
            return false;
        }
    }


}
