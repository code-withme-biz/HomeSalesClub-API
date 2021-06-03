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
        generalInfoPage: 'http://public.co.comal.tx.us/Search.aspx?ID=700'
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
            await this.browserPages.generalInfoPage?.waitForXPath('//*[@id="MainContent"]');
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    async saveRecord(fillingDate: string, parseName: any, prod: any, caseType: string) {
        const data = {
            'Property State': 'TX',
            'County': 'Comal',
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
        if(await this.civilAndLienSaveToNewSchema(data)){
            return true;
        }
        return false
    }


    async getData(page: puppeteer.Page, fillingDate: string) {
        let count = 0;
        let linkArray = [];
        try {
            await page.waitForXPath('//table[last()]/tbody/tr[3]/td[1]/a', {timeout: 10000})
            const rows = await page.$x('//table[last()]/tbody/tr/td[1]/a');
            for (let i = 0; i < rows.length; i++) {
                try {
                    const [linkElement] = await page.$x(`//table[last()]/tbody/tr[${i + 1}]/td[1]/a`);
                    const link = (await page.evaluate(e => e.getAttribute('href'), linkElement))!.trim();
                    linkArray.push(link);
                } catch (e) {
                }
            }
            for (let i = 0; i < linkArray.length; i++) {
                await page.goto(`http://public.co.comal.tx.us/${linkArray[i]}`, {waitUntil: 'load'})
                await page.waitForSelector('#MainContent')
                const [caseTypeElement] = await page.$x('//*[contains(text(), "Case Type:")]/following-sibling::td[1]/b')
                const caseType = (await page.evaluate(e => e.textContent, caseTypeElement))!.trim();
                let practiceType = this.getPracticeType(caseType);
                const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                const prod = await db.models.Product.findOne({name: productName}).exec();
                const [decedentElement] = await page.$x('//th[contains(text(), "Decedent") or contains(text(), "Incapacitated Person")]');
                if (!!decedentElement) {
                    const namesArray = await page.$x('//*[text()="Applicant" or text()="Distributee"]/following-sibling::th[1]');
                    for (let j = 0; j < namesArray.length; j++) {
                        const name = await page.evaluate(el => el.textContent, namesArray[j]);
                        if (removeRowRegex.test(name)) continue;
                        const parseName: any = this.newParseName(name.trim());
                        if (parseName.type === 'COMPANY' || parseName.fullName === '') continue;
                        const saveRecord = await this.saveRecord(fillingDate, parseName, prod, caseType);
                        saveRecord && count++
                    }
                } else {
                    const namesArray = await page.$x('//*[text()="Defendant"]/following-sibling::th[1]');
                    for (let j = 0; j < namesArray.length; j++) {
                        const name = await page.evaluate(el => el.textContent, namesArray[j]);
                        if (removeRowRegex.test(name)) continue;
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
            const [clickCivilSearch] = await page.$x('//a[contains(text(), "Civil, Family Case Records")]');
            await clickCivilSearch.click();
            await page.waitForSelector('#DateFiledOnAfter');
            let dateRange = await this.getDateRange('Texas', 'Comal');
            let date = dateRange.from;
            let today = dateRange.to;
            let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24)) - 1;
            for (let i = days < 0 ? 1 : days; i >= 0; i--) {
                try {
                    let dateSearch = new Date();
                    dateSearch.setDate(dateSearch.getDate() - i);
                    console.log('Start search with date: ', dateSearch.toLocaleDateString('en-US'));
                    await page.goto('http://public.co.comal.tx.us/Search.aspx?ID=700');
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
            await AbstractProducer.sendMessage('Comal', 'Texas', countRecords, 'Civil');
            return false;
        }
        await AbstractProducer.sendMessage('Comal', 'Texas', countRecords, 'Civil');
        return true;
    }
}

