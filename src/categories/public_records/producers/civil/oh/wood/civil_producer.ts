import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import { sleep } from '../../../../../../core/sleepable';
import axios from 'axios';
import { resolveRecaptcha2 } from '../../../../../../services/general_service';

export default class CivilProducer extends AbstractProducer {
    browser: puppeteer.Browser | undefined;
    browserPages = {
        generalInfoPage: undefined as undefined | puppeteer.Page
    };
    urls = {
        generalInfoPage: 'https://pub.clerkofcourt.co.wood.oh.us/eservices/home.page.2'
    }

    xpaths = {
        isPAloaded: '//a[*[contains(text(), "Click Here")]]'
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
        let countRecords = 0;

        try{
            await page.waitForXPath('//a[*[contains(text(), "Click Here")]]', {visible: true}); // Recaptcha page
            console.log("Resolving captcha...");
            let recaptchaSitekeyHandle = await page.$x('//*[@class="g-recaptcha"]');
            let siteKey = await recaptchaSitekeyHandle[0].evaluate((elem) => elem.getAttribute('data-sitekey'));
            let pageUrl = await page.url();
            const captchaSolution:any = await resolveRecaptcha2(siteKey, pageUrl);
            let recaptchaHandle = await page.$x('//*[@id="g-recaptcha-response"]');
            await recaptchaHandle[0].evaluate((elem:any, captchaSolution:any) => elem.innerHTML = captchaSolution, captchaSolution);
            console.log("Done.");
            await page.waitFor(3000);
            let submit_recaptcha = await page.$x('//a[*[contains(text(), "Click Here")]]');
            await submit_recaptcha[0].click();

            const casetype_handle = await page.waitForXPath('//a[*[contains(text(), "Case Type")]]');
            if (casetype_handle) {
                await Promise.all([
                    casetype_handle.click(),
                    page.waitForNavigation()
                ]);
            } else {
                return false;
            }

            // get date range
            let dateRange = await this.getDateRange('Ohio', 'Wood');
            let fromDate = dateRange.from;
            let toDate = dateRange.to;
    
            let fromDateString = this.getFormattedDate(fromDate);
            let toDateString = this.getFormattedDate(toDate);            


            // input date range
            await page.waitForSelector('input[name="fileDateRange:dateInputBegin"]');
            await page.type('input[name="fileDateRange:dateInputBegin"]', fromDateString, {delay: 100});
            await page.type('input[name="fileDateRange:dateInputEnd"]', toDateString, {delay: 100});
            await page.select('select[name="caseCd"]', 'CV        ', 'DR        ', 'EL        ', 'FJ        ', 'JL        ', 'LF        ', 'MH        ', 'TL        ');
            await page.waitFor(100);
            await page.select('select[name="statCd"]', 'Open');
            await page.waitFor(100);
            await page.select('select[name="ptyCd"]', 'Defendant');
            await page.waitFor(100);
            try {
                await page.click('input[type="submit"]');
            } catch (error) {
                await page.click('input[type="submit"]');
            }
            
            let nextPage = true;
            while (nextPage) {
                try {
                    await page.waitForXPath('//table[@id="grid"]/tbody/tr');
                } catch (error) {
                
                    console.log(error);
                    return false;    
                };
                let resultRows = await page.$x('//table[@id="grid"]/tbody/tr');
                for (const row of resultRows) {
                    let names: string[] = [];
                    const party = await page.evaluate(el => el.children[5].textContent.trim(), row);
                    names = [party];
                    let recordDate = await page.evaluate(el => el.children[3].textContent.trim(), row);
                    let caseType = await page.evaluate(el => el.children[4].textContent.trim(), row);
                    let practiceType = this.getPracticeType(caseType);

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
                            'County': 'Wood',
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
                }
                const [next_page_enabled] = await page.$x('//a[@title="Go to next page"]');
                if (next_page_enabled) {
                    await Promise.all([
                        next_page_enabled.click(),
                        page.waitForNavigation()
                    ]);
                    await page.waitFor(this.getRandomInt(3000, 5000));
                }
                else {
                    nextPage = false;
                }
            }
            
            console.log(countRecords);
            await AbstractProducer.sendMessage('Wood', 'Ohio', countRecords, 'Civil & Lien');
            return true;
        } catch(e){
            console.log(e);
            await AbstractProducer.sendMessage('Wood', 'Ohio', countRecords, 'Civil & Lien');
            return true;
        }
    }
}