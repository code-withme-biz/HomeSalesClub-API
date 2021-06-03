import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';


const removeRowArray = [
    'CITY', 'DEPT', 'CTY', 'UNITED STATES', 'BANK', 'FIA CARD SERVICES NA',
    'FLORIDA PACE FUNDING AGENCY', 'COUNTY', 'CREDIT', 'HOSPITAL', 'FUNDING', 'UNIVERSITY',
    'MEDICAL', 'CONDOMINIUM ASSOCIATION', 'LOTS', 'TEXAS STATE', 'VETERANS', 'SECRETARY', 'DEPARTMENT',
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')

export default class CivilProducer extends AbstractProducer {

    urls = {
        generalInfoPage: 'https://txburnetodyprod.tylerhost.net/PublicAccess/Search.aspx?ID=200'
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
            await this.browserPages.generalInfoPage.goto(this.urls.generalInfoPage, {waitUntil: 'load'});
            return true;
        } catch (err) {
            console.warn(err);
            return false;
        }
    }

    async read(): Promise<boolean> {
        try {
            await this.browserPages.generalInfoPage?.waitForXPath('//*[@id="UserName"]');
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    async saveRecord(fillingDate: string, parseName: any, prod: any, caseType: string) {
        const data = {
            'Property State': 'TX',
            'County': 'Burnet',
            'First Name': parseName.firstName,
            'Last Name': parseName.lastName,
            'Middle Name': parseName.middleName,
            'Name Suffix': parseName.suffix,
            'Full Name': parseName.fullName,
            "vacancyProcessed": false,
            fillingDate: fillingDate,
            productId: prod._id,
            originalDocType: caseType
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }


    async getData(page: puppeteer.Page, fillingDate: string) {
        let count = 0;
        let linkAndTypeArray = [];
        try {
            await page.waitForXPath('//table[last()]/tbody/tr[3]/td[1]/a', {timeout: 10000});
            const rows = await page.$x('//table[last()]/tbody/tr/td[1]/a');
            for (let i = 0; i < rows.length; i++) {
                try {
                    const [linkElement] = await page.$x(`//table[last()]/tbody/tr[${i + 1}]/td[1]/a`);
                    const [caseTypeElement] = await page.$x(`//table[last()]/tbody/tr[${i + 1}]/td[4]/div[1]`);
                    const link = (await page.evaluate(e => e.getAttribute('href'), linkElement))!.trim();
                    const caseType = (await page.evaluate(e => e.textContent, caseTypeElement))!.trim();
                    linkAndTypeArray.push({link,caseType});
                } catch (e) {
                }
            }
            for (let i = 0; i < linkAndTypeArray.length; i++) {
                await page.goto(`https://txburnetodyprod.tylerhost.net/PublicAccess/${linkAndTypeArray[i].link}`, {waitUntil: 'load'});
                await page.waitForSelector('#MainContent');
                const caseType = linkAndTypeArray[i].caseType;
                let practiceType = this.getPracticeType(caseType);
                const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                const prod = await db.models.Product.findOne({name: productName}).exec();
                const [decedentElement] = await page.$x('//th[contains(text(), "Decedent") or contains(text(), "Incapacitated Person")]');
                if (!!decedentElement) {
                    const namesArray = await page.$x('//*[text()="Applicant" or text()="Distributee"]/following-sibling::th[1]');
                    for (let j = 0; j < namesArray.length; j++) {
                        let name = await page.evaluate(el => el.textContent, namesArray[j]);
                        if (removeRowRegex.test(name)) continue;
                        name = name.replace(/\w+\s+Known As.*$/i,'');
                        const parseName: any = this.newParseName(name.trim());
                        if (parseName.type === 'COMPANY' || parseName.fullName === '') continue;
                        const saveRecord = await this.saveRecord(fillingDate, parseName, prod, caseType);
                        saveRecord && count++
                    }
                } else {
                    const namesArray = await page.$x('//*[text()="Defendant"]/following-sibling::th[1]');
                    for (let j = 0; j < namesArray.length; j++) {
                        let name = await page.evaluate(el => el.textContent, namesArray[j]);
                        if (removeRowRegex.test(name)) continue;
                        name = name.replace(/\w+\s+Known As.*$/i,'');
                        const parseName: any = this.newParseName(name.trim());
                        if (parseName.type === 'COMPANY' || parseName.fullName === '') continue;
                        const saveRecord = await this.saveRecord(fillingDate, parseName, prod, caseType);
                        saveRecord && count++
                    }
                }
            }
        } catch (e) {
        }
        return count
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let countRecords = 0;
        try {
            await page.waitForSelector('#UserName');
            await page.type('#UserName','visitor')
            await page.type('#Password','visitor')
            await page.click('input[type="Submit"][name="SignOn"][value="Sign On"]')
            await page.waitForXPath('//a[contains(text(), "Civil, Family & Probate Case Records")]');
            const [clickCivilSearch] = await page.$x('//a[contains(text(), "Civil, Family & Probate Case Records")]');
            await clickCivilSearch.click();
            await page.waitForSelector('#DateFiledOnAfter');
            let dateRange = await this.getDateRange('Texas', 'Burnet');
            let date = dateRange.from;
            let today = dateRange.to;
            let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24)) - 1;
            for (let i = days < 0 ? 1 : days; i >= 0; i--) {
                try {
                    let dateSearch = new Date();
                    dateSearch.setDate(dateSearch.getDate() - i);
                    console.log('Start search with date: ', dateSearch.toLocaleDateString('en-US'));
                    await page.goto('https://txburnetodyprod.tylerhost.net/PublicAccess/Search.aspx?ID=200');
                    await page.waitForSelector('#DateFiledOnAfter');
                    await page.evaluate(() => {
                        // @ts-ignore
                        document.querySelector('#DateFiledOnAfter').value = '';
                        // @ts-ignore
                        document.querySelector('#DateFiledOnBefore').value = '';
                    });
                    await page.click('#DateFiled');
                    await page.type('#DateFiledOnAfter', dateSearch.toLocaleDateString('en-US'), {delay: 100});
                    await page.type('#DateFiledOnBefore', dateSearch.toLocaleDateString('en-US'), {delay: 100});
                    await page.click('#SearchSubmit');
                    const count = await this.getData(page, dateSearch.toLocaleDateString('en-US'));
                    countRecords += count;
                    console.log(`${dateSearch.toLocaleDateString('en-US')} found ${count} records.`);
                } catch (e) {
                }
            }
        } catch (e) {
            console.log(e);
            console.log('Error search');
            await AbstractProducer.sendMessage('Burnet', 'Texas', countRecords, 'Civil,Family & Probate');
            return false;
        }
        await AbstractProducer.sendMessage('Burnet', 'Texas', countRecords, 'Civil,Family & Probate');
        return true;
    }
}

