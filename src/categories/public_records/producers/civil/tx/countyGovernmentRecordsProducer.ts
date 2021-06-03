import puppeteer from 'puppeteer';
import db from '../../../../../models/db';
import AbstractProducer from '../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../models/public_record_producer';

export default abstract class CountyGovernmentRecordsProducer extends AbstractProducer {

    abstract url: string;
    abstract state: string;
    abstract fullState: string;
    abstract county: string;
    abstract login:string;
    abstract password:string;
    abstract productCounty:string;

    removeRowArray = [
        'CITY', 'DEPT', 'CTY', 'UNITED STATES', 'BANK', 'FIA CARD SERVICES NA',
        'FLORIDA PACE FUNDING AGENCY', 'COUNTY', 'CREDIT', 'HOSPITAL', 'FUNDING', 'UNIVERSITY',
        'MEDICAL', 'CONDOMINIUM ASSOCIATION', 'LOTS', 'TEXAS STATE', 'VETERANS', 'SECRETARY', 'DEPARTMENT',
    ]
    removeRowRegex = new RegExp(`\\b(?:${this.removeRowArray.join('|')})\\b`, 'i')

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
            await this.browserPages.generalInfoPage.goto('https://tx.countygovernmentrecords.com/texas/web/login.jsp?submit=Enter', {waitUntil: 'load'});
            return true;
        } catch (err) {
            console.warn(err);
            return false;
        }
    }

    async read(): Promise<boolean> {
        try {
            await this.browserPages.generalInfoPage?.waitForXPath('//*[@id="userId"]');
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    async saveRecord(fillingDate: string, parseName: any, prod: any, caseType: string) {
        const data = {
            'Property State': this.state,
            'County': this.county,
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
        if (await this.civilAndLienSaveToNewSchema(data)) {
            return true;
        }
        return false;
    }


    async getData(page: puppeteer.Page, fillingDate: string) {
        let count = 0;
        let nextPageFlag = true;
        try {
            while (nextPageFlag) {
                console.log('~~~~ checking page');
                await page.waitForSelector('#searchResultsTable');
                const rows = await page.$x('//*[@id="searchResultsTable"]/tbody/tr');
                for (let i = 0; i < rows.length; i++) {
                    try {
                        let caseType = (await rows[i].$eval('td:nth-child(1)', elem => elem.textContent))!.trim();
                        caseType = caseType.replace(/\n.*$/, '').trim();
                        let names = (await rows[i].$eval('td:nth-child(2) > a > table > tbody > tr:nth-child(2)', elem => elem.textContent))!.trim();
                        names = names.replace(/Grantee:\s*/, '').trim()
                        if (!names) continue;
                        const namesArray = names.split(',')
                        let practiceType = this.getPracticeType(caseType);
                        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                        const prod = await db.models.Product.findOne({name: productName}).exec();
                        for (let j = 0; j < namesArray.length; j++) {
                            const name = namesArray[j].trim()
                            if (this.removeRowRegex.test(name)) continue;
                            if (/^public$/i.test(name)) continue;
                            const parseName: any = this.newParseName(name);
                            if (parseName.type === 'COMPANY' || parseName.fullName === '') continue;
                            const saveRecord = await this.saveRecord(fillingDate, parseName, prod, caseType);
                            saveRecord && count++

                        }
                    } catch (e) {
                    }
                }
                const [nextPage] = await page.$x('//a[text()="Next"]')
                if (!!nextPage) {
                    await Promise.all([
                        nextPage.click(),
                        page.waitForNavigation()
                    ]);
                    nextPageFlag = true;
                } else {
                    nextPageFlag = false;
                }
                await this.sleep(this.getRandomInt(1000, 2000));
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
            await page.type('#userId', this.login);
            await page.type('input[type="password"][name="password"]', this.password);
            await Promise.all([
                page.click('input[type="submit"][name="submit"][value="Login"]'),
                page.waitForNavigation()
            ]);
            const [endSession] = await page.$x('//*[@value="End Session" and @type="submit"]')
            if (!!endSession) {
                await Promise.all([
                    endSession.click(),
                    page.waitForNavigation()
                ]);
            }
            await page.waitForSelector('#countySelect')
        } catch (e) {
            console.log("Error login.")
        }
        try {
            let dateRange = await this.getDateRange(this.fullState, this.county);
            let fromDate = dateRange.from;
            let toDate = dateRange.to;
            while (fromDate < toDate) {
                try {
                    let dateSearch = fromDate;
                    console.log('Start search with date: ', dateSearch.toLocaleDateString('en-US'));
                    await page.goto(this.url);
                    await page.waitForSelector('#RecDateIDStart');
                    await page.evaluate(() => {
                        // @ts-ignore
                        document.querySelector('#RecDateIDStart').value = '';
                        // @ts-ignore
                        document.querySelector('#RecDateIDEnd').value = '';
                    });
                    await page.type('#RecDateIDStart', dateSearch.toLocaleDateString('en-US'), {delay: 100});
                    await page.type('#RecDateIDEnd', dateSearch.toLocaleDateString('en-US'), {delay: 100});
                    await Promise.all([
                        page.click('input[type="submit"][value="Search"]'),
                        page.waitForNavigation()
                    ]);
                    const count = await this.getData(page, dateSearch.toLocaleDateString('en-US'));
                    countRecords += count;
                    console.log(`${dateSearch.toLocaleDateString('en-US')} found ${count} records.`);
                } catch (e) {
                    console.log(e)
                }
                fromDate.setDate(fromDate.getDate() + 1);
            }
        } catch (e) {
            console.log(e);
            console.log('Error search');
            await AbstractProducer.sendMessage(this.county, this.state, countRecords, 'Civil');
            return false;
        }
        await AbstractProducer.sendMessage(this.county, this.state, countRecords, 'Civil');
        return true;
    }
}