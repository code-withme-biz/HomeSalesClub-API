import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import axios from "axios";
import {sleep} from "../../../../../../core/sleepable";
import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import { resolveRecaptcha2 } from '../../../../../../services/general_service';

export default class CivilProducer extends AbstractProducer {
    browser: puppeteer.Browser | undefined;
    browserPages = {
        generalInfoPage: undefined as undefined | puppeteer.Page
    };
    urls = {
        generalInfoPage: 'https://www.pikecountycourt.org/recordSearch.php?k=searchForm6610'
    }

    xpaths = {
        isPAloaded: '//a[contains(text(), "Continue")]'
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
            await this.browserPages.generalInfoPage?.waitForXPath(this.xpaths.isPAloaded);
            return true;
        } catch (err) {
            console.warn('Problem loading civil producer page.');
            return false;
        }
    }

    // To check empty or space
    isEmptyOrSpaces(str: string) {
        return str === null || str.match(/^\s*$/) !== null;
    }

    // This is main function
    async parseAndSave(): Promise<boolean> {
        const civilUrl: string = this.urls.generalInfoPage;
        let page = this.browserPages.generalInfoPage!;

        // get date range
        let dateRange = await this.getDateRange('Ohio', 'Pike');
        let fromDate = dateRange.from;
        let toDate = dateRange.to;
        let fromDateString = this.getFormattedDate(fromDate);
        let toDateString = this.getFormattedDate(toDate);
        let countRecords = 0;

        try {
            await page.waitForXPath('//a[contains(text(), "Continue")]');
            const [continuebtn] = await page.$x('//a[contains(text(), "Continue")]');
            await Promise.all([
                continuebtn.click(),
                page.waitForNavigation()
            ]);
            await page.waitForSelector('a#docketSearchTab');
            await Promise.all([
                page.click('a#docketSearchTab'),
                page.waitForNavigation()
            ]);

            const month = fromDate.getMonth()+1;
            const day = fromDate.getDate();
            const year = fromDate.getFullYear();
            await page.select('select#searchBMonth', month.toString());
            await page.waitFor(this.getRandomInt(100, 200));
            await page.select('select#searchBDay', day.toString());
            await page.waitFor(this.getRandomInt(100, 200));
            await page.select('select#searchBYear', year.toString());
            await page.waitFor(this.getRandomInt(100, 200));
            
            await page.click('input#checkCaseType-TR');
            await page.waitFor(this.getRandomInt(100, 200));
            await page.click('input#checkCaseType-CR');
            await page.waitFor(this.getRandomInt(100, 200));
            await page.click('input#checkCaseType-SM');
            await page.waitFor(this.getRandomInt(100, 200));
            await page.click('input#checkCaseType-PR');
            await page.waitFor(this.getRandomInt(100, 200));

            console.log("Resolving captcha...");
            let recaptchaSitekeyHandle = await page.$x('//*[@class="g-recaptcha"]');
            let siteKey = await recaptchaSitekeyHandle[0].evaluate((elem) => elem.getAttribute('data-sitekey'));
            let pageUrl = await page.url();
            const captchaSolution:any = await resolveRecaptcha2(siteKey, pageUrl);
            let recaptchaHandle = await page.$x('//*[@id="g-recaptcha-response"]');
            await recaptchaHandle[0].evaluate((elem:any, captchaSolution:any) => elem.innerHTML = captchaSolution, captchaSolution);
            console.log("Done.");
            await page.waitFor(3000);
            let submit_recaptcha = await page.$x('//input[@id="buttonSubmit"]');
            
            await Promise.all([
                submit_recaptcha[0].click(),
                page.waitForNavigation()
            ]);
            await page.waitForSelector('#matchCount');
            let matchCount: any = await page.$('#matchCount');
            matchCount = await page.evaluate(el => el.textContent, matchCount);
            matchCount = parseInt(matchCount);
            if (matchCount === 0) {
                console.log('No record Found');
                return false;
            }
            console.log(`${matchCount} results found!`);
            let nextPage = true;
            let records: any[] = [];
            while (nextPage) {
                await page.waitForXPath('//*[@id="searchResults"]');
                let rows = await page.$x('//*[@id="searchResults"]/div');
                for (let i = 0 ; i < rows.length ; i++) {
                    let [linkhandle] = await page.$x(`//*[@id="searchResults"]/div[${i+1}]/div[2]/a[@class="caseLink icon"]`);
                    const link = await page.evaluate(el => el.href, linkhandle);
                    let [casetypehandle] = await page.$x(`//*[@id="searchResults"]/div[${i+1}]/div[2]/div[@class="caseField violation"]/text()`);
                    const casetype = await page.evaluate(el => el.textContent.trim(), casetypehandle);
                    records.push({link, casetype});
                }
                let nextPageEnabled = await page.$x('//a[text()=">>"]');
                if (nextPageEnabled.length === 0) {
                    nextPage = false;
                } else {
                    let nextPageButton = await page.$x('//a[text()=">>"]');
                    await Promise.all([
                        nextPageButton[0].click(),
                        page.waitForNavigation()
                    ]);
                    await this.sleep(this.getRandomInt(3000, 5000));
                }
            }
            for (const {link, casetype} of records) {
                await page.goto(link, {waitUntil: 'load'});
                let names = [];
                const namehandles = await page.$x('//div[@class="partyContainer"]//th[contains(text(), "Defendant")]/following-sibling::td[1]');
                for (const namehandle of namehandles) {
                    const name = await page.evaluate(el => el.textContent.trim(), namehandle);
                    names.push(name);
                }
                let [fillingDate] = await page.$x('//th[text()="Filing Date:"]/following-sibling::td');
                fillingDate = await page.evaluate(el => el.textContent.trim(), fillingDate);
                let practiceType = this.getPracticeType(casetype);
                console.log(names, fillingDate, casetype)
                for (let name of names) {
                    if (this.isEmptyOrSpaces(name!)) {
                        continue;
                    }
                    let parseName: any = this.newParseName(name!.trim());
                    if (parseName.type === 'COMPANY' || parseName.fullName === '') continue;

                    const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                    const prod = await db.models.Product.findOne({ name: productName }).exec();
                    const data = {
                        'Property State': 'OH',
                        'County': 'Pike',
                        'First Name': parseName.firstName,
                        'Last Name': parseName.lastName,
                        'Middle Name': parseName.middleName,
                        'Name Suffix': parseName.suffix,
                        'Full Name': parseName.fullName,
                        "vacancyProcessed": false,
                        fillingDate: fillingDate,
                        "productId": prod._id,
                        originalDocType: casetype
                    };
                    if (await this.civilAndLienSaveToNewSchema(data))
                        countRecords++;
                }
                await page.waitFor(this.getRandomInt(1000, 2000));
            }
            await this.sleep((5+Math.random()*5)*1000);
        } catch (error) {
            console.log(error);
        }
        
        console.log(countRecords);
        await AbstractProducer.sendMessage('Pike', 'Ohio', countRecords, 'Civil & Lien');
        return true;
    }

    async getData(page: puppeteer.Page, {link, caseType, recordDate}: any) {
        await page.goto(link, {waitUntil: 'load'});
        const nameHandles = await page.$x('//td[*[contains(text(), "Grantee")]]/following-sibling::td[1]');
        let names = [];
        for (const nameHandle of nameHandles) {
            let name = await page.evaluate(el => el.textContent, nameHandle);
            name = name.replace(/\s+|\n/gm, ' ').trim();
            names.push(name);
        }
        names = names.filter(name => name !== '');

        let practiceType = this.getPracticeType(caseType);
        let countRecords = 0;
        for (const name of names) {
            if (this.isEmptyOrSpaces(name!)) {
                continue;
            }
            // console.log(name);
            const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
            const prod = await db.models.Product.findOne({ name: productName }).exec();
            const parseName: any = this.newParseName(name!.trim());
            if (parseName.type === 'COMPANY' || parseName.fullName === '') continue;

            const data = {
                'Property State': 'OH',
                'County': 'Pike',
                'First Name': parseName.firstName,
                'Last Name': parseName.lastName,
                'Middle Name': parseName.middleName,
                'Name Suffix': parseName.suffix,
                'Full Name': parseName.fullName,
                "vacancyProcessed": false,
                fillingDate: recordDate,
                "productId": prod._id,
                originalDocType: caseType
            };

            if (await this.civilAndLienSaveToNewSchema(data))
                countRecords += 1;
        }
        return countRecords;
    }
}