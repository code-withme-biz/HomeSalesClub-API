import puppeteer from 'puppeteer';
import axios from 'axios';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { sleep } from '../../../../../../core/sleepable';
import db from '../../../../../../models/db';
import { IProduct } from '../../../../../../models/product';
import { resolveRecaptcha2 } from '../../../../../../services/general_service';

export default class CivilProducer extends AbstractProducer {

    urls = {
        generalInfoPage: 'https://applications.mypalmbeachclerk.com/eCaseView/landingpage.aspx'
    }

    xpaths = {
        isPageLoaded: '//input[@id="cphBody_ibGuest"]'
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

        // click guest button
        try {
            await Promise.all([
                page.click('input#cphBody_ibGuest'),
                page.waitForNavigation()
            ]);
        } catch {
            console.log("Site is not working, please check.");
            await AbstractProducer.sendMessage('Palm-Beach', 'Florida', countRecords, 'Civil & Lien');
            return false;
        }

        try {
            // captcha
            await this.checkForRecaptcha(page);

            // select circuit civil
            await Promise.all([
                page.select('select[name="ctl00$cphBody$gvSearch$ctl11$cmbParameterPostBack"]', '101'),
                page.waitFor(3000)
            ]);
            // input fillingdate
            let dateRange = await this.getDateRange('Florida', 'Palm Beach');
            let fromDate = dateRange.from;
            let toDate = dateRange.to;
            await page.waitForSelector('input[name="ctl00$cphBody$gvSearch$ctl09$txtParameter"]', { visible: true });
            const fillBeginDateHandle = await page.$('input[name="ctl00$cphBody$gvSearch$ctl09$txtParameter"]');
            const fillEndDateHandle = await page.$('input[name="ctl00$cphBody$gvSearch$ctl10$txtParameter"]');
            await fillBeginDateHandle?.type(this.getFormattedDate(fromDate), { delay: 150 });
            await fillEndDateHandle?.type(this.getFormattedDate(toDate), { delay: 150 });
            await Promise.all([
                page.click('input[name="ctl00$cphBody$cmdSearch"]'),
                page.waitForSelector('div#cphBody_pnlSearchSuccess')
            ]);
            try {
                await page.waitForSelector('table#cphBody_gvResults');
            } catch {
                console.log("Not found");
                await AbstractProducer.sendMessage('Palm-Beach', 'Florida', countRecords, 'Civil & Lien');
                return true;
            }
            // select 'all' for page size.
            await page.select('select[name="ctl00$cphBody$cmbPageSize"]', 'All');
            await page.waitForNavigation();
            await page.waitForSelector('table#cphBody_gvResults > tbody > tr > td:first-child > a', { visible: true });
            // check case numbers
            const caseNumHandles = await page.$$('table#cphBody_gvResults > tbody > tr > td:first-child > a');
            let caseTypeHandles = await page.$x('//table[@id="cphBody_gvResults"]//tr/td[3]');
            // caseTypeArr = caseTypeArr.slice(1, caseTypeArr.length);
            // console.log("casenum: "+caseNumHandles.length);
            // console.log("casetype: "+caseTypeArr.length);
            if (caseNumHandles.length > 0) {
                const ids = [];
                const caseTypeArray = [];
                for (const caseNumHandle of caseNumHandles) {
                    const caseNumber = await caseNumHandle.evaluate(el => el.id.trim());
                    ids.push(caseNumber);
                }
                for (const caseTypeHandle of caseTypeHandles) {
                    const caseTypeString = await caseTypeHandle.evaluate(el => el.textContent?.trim());
                    caseTypeArray.push(caseTypeString);
                }
                console.log(`Founds: ${ids.length}`);
                let caseTypeCount = 0;

                for (let id of ids) {
                    await this.checkForRecaptcha(page);

                    await page.waitForSelector('select[name="ctl00$cphBody$cmbPageSize"]');
                    await page.select('select[name="ctl00$cphBody$cmbPageSize"]', 'All');
                    await page.waitForNavigation();

                    await page.waitForSelector(`a#${id}`);
                    const caseNumHandle = await page.$(`a#${id}`);
                    await Promise.all([
                        caseNumHandle?.click(),
                        page.waitForNavigation()
                    ]);
                    await this.checkForRecaptcha(page);
                    let caseType: any = caseTypeArray[caseTypeCount];
                    let saveDoc = await this.getData(page, caseType);
                    if (saveDoc) {
                        countRecords++;
                    }
                    caseTypeCount++;

                    await page.waitForSelector('a#cphBody_lbResults', { visible: true });
                    await Promise.all([
                        page.click('a#cphBody_lbResults'),
                        page.waitForNavigation()
                    ]);
                }
                console.log('done!');
            }
            else {
                console.log("Not found");
            }
            
            await AbstractProducer.sendMessage('Palm-Beach', 'Florida', countRecords, 'Civil & Lien');
            return true;
        }
        catch (error) {
            console.log('Error: ', error);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Palm-Beach', 'Florida', countRecords, 'Civil & Lien', errorImage);
            return false;
        }
    }

    async getData(page: puppeteer.Page, caseType: string): Promise<any> {
        try {
            await page.waitForSelector('a#cphBody_lbParties', { visible: true, timeout: 60000 });
        } catch {
            return false;
        }

        const fillingDateSelector = 'table#cphBody_dvCaseInfo > tbody > tr:nth-child(2) > td:nth-child(2)';
        const fillingDate = await this.getElementTextContent(page, fillingDateSelector);

        await Promise.all([
            page.click('a#cphBody_lbParties'),
            page.waitForNavigation()
        ]);
        await this.checkForRecaptcha(page);

        let first_name = '';
        let last_name = '';
        let middle_name = '';
        let suffix = '';
        let full_name = '';
        let practiceType = this.getPracticeType(caseType);
        const rowSelector = 'table#cphBody_gvParty > tbody > tr';
        try {
            await page.waitForSelector(rowSelector, { visible: true, timeout: 60000 });
        } catch {
            return false;
        }
        const rows = await page.$$(rowSelector);
        for (let row of rows) {
            const partyType = (await row.evaluate(el => el.children[4].textContent))!.trim();
            if (partyType && partyType.indexOf('DEFENDANT') > -1) {
                first_name = (await row.evaluate(el => el.children[0].textContent))!.trim();
                middle_name = (await row.evaluate(el => el.children[1].textContent))!.trim();
                last_name = (await row.evaluate(el => el.children[2].textContent))!.trim();
                suffix = (await row.evaluate(el => el.children[3].textContent))!.trim();
                full_name = `${first_name} ${middle_name} ${last_name} ${suffix}`;
                break;
            }
        }
        full_name = full_name.replace(/\s+/g,' ');
        let parseName: any = this.newParseName(full_name);
        if(parseName.type && parseName.type == 'COMPANY'){
            return false
        }

        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({ name: productName }).exec();
        const data = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'First Name': first_name,
            'Last Name': last_name,
            'Middle Name': middle_name,
            'Name Suffix': suffix,
            'Full Name': full_name.trim(),
            "vacancyProcessed": false,
            fillingDate: fillingDate,
            "productId": prod._id,
            originalDocType: caseType
        };

        return (await this.civilAndLienSaveToNewSchema(data));
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

    async checkForRecaptcha(page: puppeteer.Page) {
        const isRecaptcha = await this.checkExistElement(page, 'div#cphBody_pnlGoogle');
        if (isRecaptcha) {
            // captcha
            console.log("Resolving captcha...");
            const captchaSolution: any = await resolveRecaptcha2('6Lc9yBsUAAAAAL-kDRIczjkDHgSbDLAWtl2zewcx', await page.url());
            let recaptchaHandle = await page.$x('//*[@id="g-recaptcha-response"]');
            await recaptchaHandle[0].evaluate((elem: any, captchaSolution: any) => elem.innerHTML = captchaSolution, captchaSolution);
            console.log("Done.");
            await page.waitFor(3000);
            let submit_recaptcha = await page.$x('//input[@id="cphBody_cmdContinue"]');
            await Promise.all([
                submit_recaptcha[0].click(),
                page.waitForNavigation()
            ]);
        }
        return;
    }
}