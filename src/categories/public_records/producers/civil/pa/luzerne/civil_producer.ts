import puppeteer from 'puppeteer';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import db from '../../../../../../models/db';
import SnsService from '../../../../../../services/sns_service';

const removeRowArray = [
    'CITY', 'DEPT', 'CTY', 'UNITED STATES', 'BANK', 'FIA CARD SERVICES NA',
    'FLORIDA PACE FUNDING AGENCY', 'COUNTY', 'CREDIT', 'HOSPITAL', 'FUNDING', 'UNIVERSITY',
    'MEDICAL', 'CONDOMINIUM ASSOCIATION', 'LOTS', 'TEXAS STATE', 'VETERANS', 'SECRETARY', 'DEPARTMENT',
    'INDIVIDUAL', 'INDIVIDUALLY', 'FINANCE', 'CITIBANK', 'MERS', 'STATE TAX COMMISSION', 'BUSINESS',
	'CU', 'BK', 'UN', 'PA', 'DOLLAR', 'ASSN', 'REVOLUTION', 'COMMUNITY', 'PLACE', 'SPECTRUM'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')

export default class CivilProducer extends AbstractProducer {
    urls = {
        generalInfoPage: 'https://www.searchiqs.com/PALUZ/Login.aspx'
    }

    xpaths = {
        isPageLoaded: '//input[@id="btnGuestLogin"]'
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
            console.warn('Page Loaded')
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
            const dateRange = await this.getDateRange('Pennsylvania', 'Luzerne');
            let fromDate = this.getFormattedDate(dateRange.from);
            let toDate = this.getFormattedDate(dateRange.to);

            try {
                const [docBtnHandle] = await page.$x('//input[@id="btnGuestLogin"]');
                await docBtnHandle.click();
                await page.waitForNavigation();
            } catch (error) {
                console.log(error);
                return false;
            }

            // setting doc type
            await page.select('select[id="ContentPlaceHolder1_cboDocGroup"]', 'CIV');
            await page.waitForNavigation();

            // setting date range
            await page.waitFor(3000);
            await page.waitForXPath('//input[@id="ContentPlaceHolder1_txtFromDate"]');
            const fromDateHandle = await page.$x('//input[@id="ContentPlaceHolder1_txtFromDate"]');
            await fromDateHandle[0].click({clickCount: 3});
            await fromDateHandle[0].press('Backspace');
            await fromDateHandle[0].type(fromDate, {delay: 150});
            const toDateHandle = await page.$x('//input[@id="ContentPlaceHolder1_txtThruDate"]');
            await toDateHandle[0].click({clickCount: 3});
            await toDateHandle[0].press('Backspace');
            await toDateHandle[0].type(toDate, {delay: 150});

            // click search button
            const [searchHandle] = await page.$x('//input[@id="ContentPlaceHolder1_cmdSearch"]');
            searchHandle.click();
            await page.waitForNavigation();
            await page.waitForXPath('//span[@id="ContentPlaceHolder1_lblSearchCount"]');

            // getting data
            const results = await page.$x('//table[@id="ContentPlaceHolder1_grdResults"]/tbody/tr');
            if (results.length > 0) {
                let pageNum = 0;
                let isLast = false;

                while (!isLast) {
                    await page.waitForXPath('//table[@id="ContentPlaceHolder1_grdResults"]/tbody/tr');
                    const rows = await page.$x('//table[@id="ContentPlaceHolder1_grdResults"]/tbody/tr');
                    for (let i = 1; i < rows.length; i++) {
                        const namesHTML = await rows[i].evaluate(el => el.children[3].children[0].innerHTML);
                        const type = await rows[i].evaluate(el => el.children[4].textContent?.trim());
                        const caseID = await rows[i].evaluate(el => el.children[5].textContent?.trim());
                        const date = await rows[i].evaluate(el => el.children[6].textContent?.trim());
                        const names = namesHTML.split('<br>');
                        for (const name of names) {
                            if (this.isEmptyOrSpaces(name!) || removeRowRegex.test(name)) {
                                continue;
                            }
                            const parserName: any = this.newParseName(name);
                            if(parserName.type && parserName.type == 'COMPANY'){
                                continue;
                            }
                            if (await this.getData(page, name.trim(), type, date, caseID)) {
                                countRecords++
                            }    
                        }
                    }

                    await page.waitFor(1000);

                    const [nextButtonEL] = await page.$x('//a[@id="ContentPlaceHolder1_lbNext1"]');
                    const className = await nextButtonEL.evaluate(el => el.getAttribute('class'));
                    if (!className) {
                        pageNum++;
                        await nextButtonEL.click();
                        await page.waitForNavigation();
                        await page.waitFor(3000);
                    } else {
                        isLast = true;
                    }
                }
            } else {
                console.log('No Data');
            }

            await AbstractProducer.sendMessage('Luzerne', 'Pennsylvania', countRecords, 'Civil & Lien');
            await page.close();
            await this.browser?.close();
            return true;
        }
        catch (error) {
            console.log('Error: ', error);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Luzerne', 'Pennsylvania', countRecords, 'Civil & Lien', errorImage);
        }

        return false;
    }

    async waitForSuccess(func: Function): Promise<boolean> {
        let retry_count = 0;
        while (true){
            if (retry_count > 3){
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

    async getData(page: puppeteer.Page, name: any, type: any, date: any, caseID: any): Promise<any> {
        const { firstName, lastName, middleName, fullName, suffix } = this.newParseName(name!);
        let practiceType = this.getPracticeType(type);
        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({ name: productName }).exec();

        const data = {
            'caseUniqueId': caseID,
            'Property State': 'PA',
            'County': 'Luzerne',
            'First Name': firstName,
            'Last Name': lastName,
            'Middle Name': middleName,
            'Name Suffix': suffix,
            'Full Name': fullName,
            "vacancyProcessed": false,
            fillingDate: date,
            'productId': prod._id,
            originalDocType: type
        };

        return (await this.civilAndLienSaveToNewSchema(data));
    }
     // To check empty or space
    isEmptyOrSpaces(str: string) {
        return str === null || str.match(/^\s*$/) !== null;
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

    sleep(ms: number) {
        return new Promise((resolve) => {
          setTimeout(resolve, ms);
        });
    }

}