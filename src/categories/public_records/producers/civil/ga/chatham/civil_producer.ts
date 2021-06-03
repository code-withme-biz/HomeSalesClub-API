import puppeteer from 'puppeteer';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import db from '../../../../../../models/db';

const username = "webdev";
const password = "Webdev#123";

export default abstract class CivilProducerMD extends AbstractProducer {
    url: string = 'https://search.gsccca.org/Lien/namesearch.asp';
    county: string = 'Chatham';

    xpaths = {
        isPageLoaded: '//select[@name="txtInstrCode"]'
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
            await this.browserPages.generalInfoPage.setDefaultNavigationTimeout(60000);
            const pageLoadResult = await this.waitForSuccessPageLoad(this.browserPages.generalInfoPage);
            if (!pageLoadResult) {
                return false;
            }
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

    async getInstrumentTypes(page: puppeteer.Page) {
        let values = [];
        const options = await page.$x('//select[@name="txtInstrCode"]/option[position()>1]');
        for (const option of options) {
            const value = await page.evaluate(el => el.value, option);
            values.push(value);
        }
        return values;
    }

    async setSearchCriteria(page: puppeteer.Page, instrumentType: string, fromDate: string, toDate: string, name: string) {
        console.log(`== Searching For: ${fromDate} ~ ${toDate} : instrumentType: ${instrumentType} name: ${name}`)
        // select party type
        await page.select('select#txtPartyType', '1');
        // select instrument type
        await page.select('select[name="txtInstrCode"]', instrumentType);
        // select county
        const [countyoption] = await page.$x(`//select[@name="intCountyID"]/option[contains(text(), "${this.county.toUpperCase()}")]`);
        const countyvalue = await page.evaluate(el => el.value, countyoption);
        await page.select('select[name="intCountyID"]', countyvalue);
        // type name
        await page.type('input#txtSearchName', name);
        // type dates
        await page.type('input#txtFromDate', fromDate, {delay: 100});
        await page.type('input#txtToDate', toDate, {delay: 100});
    }

    async checkForLogin(page: puppeteer.Page) {
        const url = await page.url();
        if (url.match(/login/)) {
            await page.waitForXPath(`//input[@name="txtUserID"]`, {visible: true});
            let [startDateInput] = await page.$x(`//input[@name="txtUserID"]`);
            await startDateInput.click({clickCount: 3});
            await startDateInput.press('Backspace');
            await startDateInput.type(username, {delay: 100});

            let [passwordInput] = await page.$x(`//input[@name="txtPassword"]`);
            await passwordInput.click({clickCount: 3});
            await passwordInput.press('Backspace');
            await passwordInput.type(password, {delay: 100});

            await Promise.all([
                page.click('a[href="javascript:document.frmLogin.submit();"]'),
                page.waitForNavigation()
            ]);
            await this.sleep(1000);
            await page.waitForSelector('#foot', {visible: true});
        }
    }

    async getData(page: puppeteer.Page) {
        let countRecords = 0;
        const [notfound] = await page.$x('//*[contains(text(), "No records")]');
        if (notfound) {
            console.log('Not found');
            return 0;
        }
        while (true) {
            await page.waitForXPath('//table[@class="name_results"]/tbody/tr[position()>1]', {visible: true});
            const rows = await page.$x('//table[@class="name_results"]/tbody/tr[position()>1]');
            const rowcount = rows.length;
            for (let i = 0 ; i < rowcount ; i++) {
                await page.waitForXPath('//table[@class="name_results"]/tbody/tr[position()>1]', {visible: true});
                const [inputhandle] = await page.$x(`//table[@class="name_results"]/tbody/tr[position()=${i+2}]/td[1]/input`);
                await inputhandle.click();
                await Promise.all([
                    page.click('input[value="Display Details"]'),
                    page.waitForNavigation()
                ]);
                await this.sleep(3000);
                await this.checkForLogin(page);
                // get page detail
                if (await this.getDetail(page)) {
                    countRecords++;
                }
                // click back
                await Promise.all([
                    page.click('input[name="bBack"]'),
                    page.waitForNavigation()
                ]);
                await this.sleep(3000);
                await this.checkForLogin(page);
            }
            // handling next page
            const [nextpageenabled] = await page.$x('//a[contains(text(), "Next Page>")]');
            if (nextpageenabled) {
                await Promise.all([
                    nextpageenabled.click(),
                    page.waitForNavigation()
                ]);
                await this.sleep(3000);
                await this.checkForLogin(page);
            } else {
                break;
            }
        }
        return countRecords;
    }

    async getDetail(page: puppeteer.Page): Promise<boolean> {
        await page.waitForXPath('//*[text()="Name Selected:"]/following-sibling::td[1]/strong');
        let [name_handle] = await page.$x('//*[text()="Name Selected:"]/following-sibling::td[1]/strong');
        let name = await page.evaluate(el => el.textContent, name_handle);
        let [instrument_type_handle] = await page.$x('//*[text()="Instrument Type"]/ancestor::tbody[1]/tr[position()=2]/td[position()=3]/font');
        let casetype = await page.evaluate(el => el.textContent.trim(), instrument_type_handle);
        let [fillingdate_handle] = await page.$x('//*[text()="Instrument Type"]/ancestor::tbody[1]/tr[position()=2]/td[position()=4]/font');
        let fillingdate = await page.evaluate(el => el.textContent.trim(), fillingdate_handle);
        return await this.saveData(name, casetype, fillingdate);
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let countRecords = 0;

        try {
            await this.checkForLogin(page);
            let instrumentTypeValues = await this.getInstrumentTypes(page);
            let names = 'abcdefghijklmnopqrstuvwxyz';
            const dateRange = await this.getDateRange('Georgia', this.county, 60);
            let fromDate = this.getFormattedDate(dateRange.from);
            let toDate = this.getFormattedDate(dateRange.to);

            for (const instrumentType of instrumentTypeValues) {
                for (const name of names) {
                    try {
                        await this.waitForSuccessPageLoad(page);
                        await this.setSearchCriteria(page, instrumentType, fromDate, toDate, name);
                        await Promise.all([
                            page.click('input[onclick="javascript:fnSubmitForm();"]'),
                            page.waitForNavigation()
                        ]);
                        await this.sleep(3000);
                        await page.waitForSelector('#foot', {visible: true});
                        await this.checkForLogin(page);
                        countRecords += await this.getData(page);
                    } catch (error) {
                    }
                    await this.randomSleepInOneSec();
                }
            }
            
            await AbstractProducer.sendMessage(this.county, 'Georgia', countRecords, 'Civil & Lien');
            await page.close();
            await this.browser?.close();
            return true;
        }
        catch (error) {
            console.log('Error: ', error);
            await AbstractProducer.sendMessage(this.county, 'Georgia', countRecords, 'Civil & Lien');
        }

        return false;
    }

    async waitForSuccessPageLoad(page: puppeteer.Page): Promise<boolean> {
        let retry_count = 0;
        while (true){
            if (retry_count > 3){
                console.error('Connection/website error for 15 iteration.');
                return false;
            }
            try {
                await page.goto(this.url, {waitUntil: 'load'});
                break;
            }
            catch (error) {
                retry_count++;
                console.log(`retrying page loading -- ${retry_count}`);
                await this.sleep(3000);
            }
        } 
        return true;
    }

    async saveData(name: string, type: string, fillingdate: string): Promise<any> {
        const parseName: any = this.newParseName(name);
        if (parseName.type === 'COMPANY' || parseName.fullName === '') return false;
        
        let practiceType = this.getPracticeType(type);
        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({ name: productName }).exec();

        const data = {
            'Property State': 'GA',
            'County': this.county,
            'First Name': parseName.firstName,
            'Last Name': parseName.lastName,
            'Middle Name': parseName.middleName,
            'Name Suffix': parseName.suffix,
            'Full Name': parseName.fullName,
            "vacancyProcessed": false,
            fillingDate: fillingdate,
            productId: prod._id,
            originalDocType: type
        };

        return (await this.civilAndLienSaveToNewSchema(data));
    }
}