import puppeteer from 'puppeteer';
import axios from 'axios';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import { sleep } from '../../../../../../core/sleepable';
import db from '../../../../../../models/db';
import { resolveRecaptcha2 } from '../../../../../../services/general_service';

export default class CivilProducer extends AbstractProducer {

    urls = {
        generalInfoPage: 'https://myeclerk.myorangeclerk.com/Cases/Search?caseType=CV&caseTypeDesc=Civil%20Case%20Records'
    }

    xpaths = {
        isPageLoaded: '//button[@id="caseSearch"]'
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
            await this.browserPages.generalInfoPage.goto(this.urls.generalInfoPage, { waitUntil: 'load' });
            return true;
        } catch (err) {
            console.warn(err);
            return false;
        }
    }

    async read(): Promise<boolean> {
        try {
            await this.browserPages.generalInfoPage?.waitForXPath(this.xpaths.isPageLoaded);
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let countRecords = 0;
        try {
            // input fillingdate
            let dateRange = await this.getDateRange('Florida', 'Orange');
            let fromDate = this.getFormattedDate(dateRange.from);
            let toDate = this.getFormattedDate(dateRange.to);

            const beginDateSelector = 'input#DateFrom';
            const endDateSelector = 'input#DateTo';
            const beginDateHandle = await page.$(beginDateSelector);
            const endDateHandle = await page.$(endDateSelector);
            await beginDateHandle?.type(fromDate, { delay: 150 });
            await endDateHandle?.type(toDate, { delay: 150 });

            // captcha
            try {
                console.log("Resolving captcha...");
                const captchaSolution: any = await resolveRecaptcha2('6LdtOBETAAAAABvi0Md4UUqb7GKfkRiUR6AsrFX-', await page.url());
                let recaptchaHandle = await page.$x('//*[@id="g-recaptcha-response"]');
                await recaptchaHandle[0].evaluate((elem: any, captchaSolution: any) => elem.innerHTML = captchaSolution, captchaSolution);
                console.log("Done.");
                await page.waitFor(3000);
                await Promise.all([
                    page.$eval('button#caseSearch', el => el.removeAttribute('disabled')),
                    page.click('button#caseSearch'),
                    page.waitForNavigation()
                ]);
            } catch (error) {
                console.log('Error during resolving captcha: ', error);
                return false;
            }

            await page.select('select[name="caseList_length"]', '-1');

            // get all links
            const case_number_handles = await page.$$('table#caseList > tbody > tr > td.colCaseNumber > a');
            let caseTypeArray = [];
            const caseTypeHandles = await page.$x('//table[@id="caseList"]/tbody//tr/td[4]');
            for (const caseTypeHandle of caseTypeHandles) {
                const caseTypeString = await caseTypeHandle.evaluate(el => el.textContent?.trim());
                caseTypeArray.push(caseTypeString);
            }
            let caseTypeCount = 0;
            // check cause nos.
            if (case_number_handles.length > 0) {
                console.log(`Found ${case_number_handles.length}`);
                const length = case_number_handles.length;
                for (let i = 1; i < length + 1; i++) {
                    const result = await this.waitForSuccess(async () => {
                        await Promise.all([
                            page.click(`table#caseList > tbody > tr:nth-child(${i}) > td.colCaseNumber > a`),
                            page.waitForNavigation()
                        ]);
                    });
                    if (!result) return false;
                    let caseType = caseTypeArray[caseTypeCount];
                    let saveDoc = await this.getData(page, caseType);
                    caseTypeCount++;
                    if (saveDoc) {
                        countRecords++;
                    }
                    await Promise.all([
                        page.goBack(),
                        page.waitForNavigation()
                    ]);
                    await page.select('select[name="caseList_length"]', '25');
                    await page.select('select[name="caseList_length"]', '-1');
                }
            }
            else {
                console.log("Not found");
            }
            
            await AbstractProducer.sendMessage('Orange', 'Florida', countRecords, 'Civil & Lien');
            return true;
        }
        catch (error) {
            console.log('Error: ', error);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Orange', 'Florida', countRecords, 'Civil & Lien', errorImage);
            return false;
        }
    }

    async waitForSuccess(func: Function): Promise<boolean> {
        let retry_count = 0;
        while (true) {
            if (retry_count > 3) {
                console.error('Connection/website error for 15 iteration.');
                return false;
            }
            try {
                await func();
                break;
            }
            catch (error) {
                retry_count++;
            }
        }
        return true;
    }

    async getData(page: puppeteer.Page, caseType: any): Promise<any> {
        const fillingDateSelector = 'div#caseDetails > div:nth-child(2) > div:first-child > div:first-child > div:first-child > div:nth-child(2) > div:first-child > div:nth-child(2) > div:nth-child(2)';
        const fillingDate = await this.getElementTextContent(page, fillingDateSelector);

        const full_name_selector = 'table[summary="case parties"] > tbody > tr:nth-child(2) > td:first-child';
        const full_name = (await this.getElementTextContent(page, full_name_selector)).replace(/\n|\s+/g, ' ');
        const parseName: any = this.newParseNameFML(full_name);
        if(parseName.type && parseName.type == 'COMPANY'){
            return false;
        }
        let practiceType = this.getPracticeType(caseType);

        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({ name: productName }).exec();
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
            "productId": prod._id,
            originalDocType: caseType
        };

        return await this.civilAndLienSaveToNewSchema(data);
    }
    /**
     * check if element exists
     * @param page 
     * @param selector 
     */
    async checkExistElement(page: puppeteer.Page, selector: string): Promise<Boolean> {
        const exist = await page.$(selector).then(res => res !== null);
        return exist;
    }

    /**
     * get textcontent from specified element
     * @param page 
     * @param root 
     * @param selector 
     */
    async getElementTextContent(page: puppeteer.Page, selector: string): Promise<string> {
        try {
            const existSel = await this.checkExistElement(page, selector);
            if (!existSel) return '';
            let content = await page.$eval(selector, el => el.textContent)
            return content ? content.trim() : '';
        } catch (error) {
            console.log(error)
            return '';
        }
    }
}