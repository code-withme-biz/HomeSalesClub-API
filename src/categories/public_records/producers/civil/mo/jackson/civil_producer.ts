import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';


const removeRowArray = [
    'CITY', 'DEPT', 'CTY', 'UNITED STATES', 'BANK', 'FIA CARD SERVICES NA',
    'FLORIDA PACE FUNDING AGENCY', 'COUNTY', 'CREDIT', 'HOSPITAL', 'FUNDING', 'UNIVERSITY',
    'MEDICAL', 'CONDOMINIUM ASSOCIATION', 'LOTS', 'TEXAS STATE', 'VETERANS', 'SECRETARY', 'DEPARTMENT',
    'INDIVIDUAL', 'INDIVIDUALLY', 'FINANCE', 'CITIBANK', 'MERS'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')

export default class CivilProducer extends AbstractProducer {

    urls = {
        generalInfoPage: 'http://aumentumweb.jacksongov.org/RealEstate/SearchEntry.aspx'
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
            await this.browserPages.generalInfoPage.setDefaultTimeout(60000);
            await this.browserPages.generalInfoPage.goto(this.urls.generalInfoPage, {waitUntil: 'load'});
            return true;
        } catch (err) {
            console.warn(err);
            return false;
        }
    }

    async read(): Promise<boolean> {
        try {
            await this.browserPages.generalInfoPage?.waitForXPath('//*[@id="cphNoMargin_f_ddcDateFiledFrom"]');
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    async saveRecord(fillingDate: string, parseName: any, prod: any,originalDocType: string) {

        const data = {
            'Property State': 'MO',
            'County': 'Jackson',
            'First Name': parseName.firstName,
            'Last Name': parseName.lastName,
            'Middle Name': parseName.middleName,
            'Name Suffix': parseName.suffix,
            'Full Name': parseName.fullName,
            "vacancyProcessed": false,
            fillingDate: fillingDate,
            productId: prod._id,
            originalDocType: originalDocType
        };
 
        return await this.civilAndLienSaveToNewSchema(data);
    }

    async getData(page: puppeteer.Page) {
        let count = 0;
        let nextPageFlag;
        try {
            do {
                await page.waitForXPath('//*[@mkr="dataTbl.hdn"]');
                nextPageFlag = false;
                const rows = await page.$x('//*[@mkr="dataTbl.hdn"]/tbody/tr[not(@mkr="sizeRow")]');
                for (let i = 0; i < rows.length; i++) {
                    await page.waitForXPath('//*[@mkr="dataTbl.hdn"]');
                    const [dateElement] = await page.$x(`//*[@mkr="dataTbl.hdn"]/tbody/tr[${i + 2}]/td[8]`);
                    const [docTypeElement] = await page.$x(`//*[@mkr="dataTbl.hdn"]/tbody/tr[${i + 2}]/td[10]`);
                    const fillingDate = (await page.evaluate(e => e.innerText, dateElement)).trim();
                    const docType = (await page.evaluate(e => e.innerText, docTypeElement)).trim();
                    const [clickElement] = await page.$x(`//*[@mkr="dataTbl.hdn"]/tbody/tr[${i + 2}]/td[4]`);
                    await clickElement.click();
                    await page.waitForSelector('#Table1');
                    await new Promise(resolve => setTimeout(resolve, 1000));;
                    const nameRows = await page.$x('//*[@id="Table1"]/tbody/tr[6]/td/table/tbody/tr');
                    let practiceType = this.getPracticeType(docType!)
                    const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                    const prod = await db.models.Product.findOne({name: productName}).exec();
                    for (let j = 0; j < nameRows.length; j++) {
                        const [checkNomineeElement] = await page.$x(`//*[@id="Table1"]/tbody/tr[6]/td/table/tbody/tr[${j + 1}]/td[4]`);
                        const checkNominee = (await page.evaluate(e => e.textContent, checkNomineeElement)).trim();
                        if (checkNominee == 'NOMINEE') continue;
                        const [nameElement] = await page.$x(`//*[@id="Table1"]/tbody/tr[6]/td/table/tbody/tr[${j + 1}]/td[3]`);
                        const name = (await page.evaluate(e => e.textContent, nameElement)).trim();
                        if (removeRowRegex.test(name)) continue;
                        const nameArray = name.split('\n');
                        let fullName;
                        if (!!nameArray[2]) {
                            nameArray[2] = nameArray[2].replace(/\t+/, '');
                            fullName = `${nameArray[0].trim()}, ${nameArray[2].trim()}`;
                        } else {
                            fullName = nameArray[0];
                        }
                        const parseName:any = this.newParseName(fullName);
                        if (parseName?.type && parseName?.type == 'COMPANY') continue;
                        const saveRecord = await this.saveRecord(fillingDate, parseName, prod,docType);
                        saveRecord && count++;
                    }
                    await page.goBack();
                }
                const [nextPage] = await page.$x('//*[@id="OptionsBar1_imgNext" and not(@disabled)]');
                if (!!nextPage) {
                    await nextPage.click();
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    nextPageFlag = true;
                }
            } while (nextPageFlag)
        } catch (e) {
            console.log(e)
        }
        return count;
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let countRecords = 0;
        try {
            let dateRange = await this.getDateRange('Missouri', 'Jackson');
            let date = dateRange.from;
            let today = dateRange.to;
            let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24)) - 1;
            for (let i = days < 0 ? 1 : days; i >= 0; i--) {
                try {
                    await page.goto('http://aumentumweb.jacksongov.org/RealEstate/SearchEntry.aspx', {waitUntil: 'load'});
                    let dateSearch = new Date();
                    dateSearch.setDate(dateSearch.getDate() - i);
                    console.log('Start search with date: ', dateSearch.toLocaleDateString('en-US'));
                    await page.waitForXPath('//*[contains(@id, "cphNoMargin_f_ddcDateFiledFrom")]');
                    const [dateFromElement] = await page.$x('//*[@id="cphNoMargin_f_ddcDateFiledFrom"]');
                    await dateFromElement.click();
                    await page.keyboard.type(dateSearch.toLocaleDateString('en-US',{
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit"
                    }), {delay: 100});
                    const [dateToElement] = await page.$x('//*[@id="cphNoMargin_f_ddcDateFiledTo"]');
                    await dateToElement.click();
                    await page.keyboard.type(dateSearch.toLocaleDateString('en-US',{
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit"
                    }), {delay: 100});
                    const [clickSearch] = await page.$x('//*[contains(@id, "SearchButtons2_btnSearch")]');
                    await clickSearch.click();
                    const count = await this.getData(page);
                    countRecords += count;
                    console.log(`${dateSearch.toLocaleDateString('en-US')} save ${count} records.`);
                } catch (e) {
                }
            }
        } catch (e) {
            console.log(e);
            console.log('Error search');
            await AbstractProducer.sendMessage('Jackson', 'Missouri', countRecords, 'Civil & Lien');
            return false;
        }
        await AbstractProducer.sendMessage('Jackson', 'Missouri', countRecords, 'Civil & Lien');
        return true;
    }
}