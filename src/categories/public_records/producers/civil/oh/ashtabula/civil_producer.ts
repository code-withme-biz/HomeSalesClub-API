import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import { sleep } from '../../../../../../core/sleepable';
import axios from 'axios';
import { resolveRecaptchaNormal, getTextByXpathFromPage } from '../../../../../../services/general_service';
import { result } from 'lodash';

export default class CivilProducer extends AbstractProducer {
    browser: puppeteer.Browser | undefined;
    browserPages = {
        generalInfoPage: undefined as undefined | puppeteer.Page
    };
    urls = {
        generalInfoPage: 'http://courts.co.ashtabula.oh.us/eservices/home.page.2'
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
        try {
            await page.waitForSelector('img.captchaImg', {timeout: 10000, visible: true});
            await this.sleep(3000);
            let captchaEl = await page.$('img.captchaImg');
            let base64String = await captchaEl?.screenshot({encoding: "base64"});
            console.log(base64String)
            console.log("Resolving captcha...");
            const captchaSolution: any = await resolveRecaptchaNormal(base64String);
            let captchaHandle = await page.$('input.captchaTxt');
            await captchaHandle?.type(captchaSolution, {delay: 150});
            await Promise.all([
                page.click('a[name="linkFrag:beginButton"]')
            ]);
        } catch (e) {
            await page.reload();
            await page.waitForSelector('img.captchaImg', {timeout: 10000, visible: true});
            await this.sleep(3000);
            let captchaEl = await page.$('img.captchaImg');
            let base64String = await captchaEl?.screenshot({encoding: "base64"});
            console.log(base64String)
            console.log("Resolving captcha...");
            const captchaSolution: any = await resolveRecaptchaNormal(base64String);
            let captchaHandle = await page.$('input.captchaTxt');
            await captchaHandle?.type(captchaSolution, {delay: 150});
            await Promise.all([
                page.click('a[name="linkFrag:beginButton"]')
            ]);
        }

        const casetype_handle = await page.waitForXPath('//a[*[contains(text(), "Case Type")]]');
        if (casetype_handle) {
            await Promise.all([
                casetype_handle.click(),
                page.waitForNavigation()
            ]);
        } else {
            await AbstractProducer.sendMessage('Ashtabula', 'Ohio', countRecords, 'Civil & Lien');
            return false;
        }

        // get date range
        let dateRange = await this.getDateRange('Ohio', 'Ashtabula');
        let fromDate = dateRange.from;
        let toDate = dateRange.to;
 
        let fromDateString = this.getFormattedDate(fromDate);
        let toDateString = this.getFormattedDate(toDate);            


        // input date range
        await page.waitForSelector('input[name="fileDateRange:dateInputBegin"]');
        await page.type('input[name="fileDateRange:dateInputBegin"]', fromDateString, {delay: 100});
        await page.type('input[name="fileDateRange:dateInputEnd"]', toDateString, {delay: 100});
        await page.select(
            'select[name="caseCd"]', 
            'BK        ', 'CV        ', 'CVE       ',
            'CVW       ', 'DR        ', 'JD        ',
            'MIW       ', 'ESW       ', 'TL        '
        );
        await page.waitFor(100);
        await page.select('select[name="statCd"]', 'O         ');
        await page.waitFor(100);
        await page.select('select[name="ptyCd"]', 'DFNDT     ');
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
                await this.sleep(3000);
			} catch (error) {
                console.log(error);
                await AbstractProducer.sendMessage('Ashtabula', 'Ohio', countRecords, 'Civil & Lien');
				return false;    
			};
			let resultRows = await page.$x('//table[@id="grid"]/tbody/tr[contains(., "Defendant")]/td[2]/span/a');
            console.log('length:', resultRows.length);
            let temp: any = '';
            for (let rowPointer = 0; resultRows.length; rowPointer++) {
                try{
                    console.log(rowPointer);
                    const row = resultRows[rowPointer];
                    let caseNumber = await row.evaluate(el => el.children[1].textContent?.trim());
                    if(caseNumber == temp){
                        continue;
                    }
                    temp = caseNumber;
                    await Promise.all([
                        row.click(),
                        page.waitForNavigation()
                    ]);
                    let results = await page.$x('//div[contains(@class, "row") and contains(., "Defendant")]');
                    let docType = await getTextByXpathFromPage(page, '//li[text()="Action:"]/parent::ul/li[2]');
                    let filingDate = await getTextByXpathFromPage(page, '//li[text()="File Date:"]/parent::ul/li[2]');
                    for(const result of results){
                        try{
                            let name = await result.evaluate(el => el.children[0].children[0].children[0].textContent?.trim());
                            let address = await result.evaluate(el => el.children[2].children[0].children[0].children[0].children[1].children[0].textContent?.trim());
                            let city = await result.evaluate(el => el.children[2].children[0].children[0].children[0].children[1].children[3].textContent?.trim());
                            let zip = await result.evaluate(el => el.children[2].children[0].children[0].children[0].children[1].children[6].textContent?.trim());
                            if(address && (!address.match(/\d+\s+/g) || address.match(/UNKNOWN/g))){
                                continue;
                            }
                            if (this.isEmptyOrSpaces(name!) || name!.match(/\s+AND\s+|\s+ASSIGNS\s+|\s+OF\s+/g)) {
                                continue;
                            }
                            const parseName: any = this.newParseName(name!);
                            if (parseName.type === 'COMPANY' || parseName.fullName === '') continue;
                            let practiceType = this.getPracticeType(docType);
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
                                'Property Address': address,
                                'Property City': city,
                                'Property Zip': zip,
                                "vacancyProcessed": false,
                                fillingDate: filingDate,
                                "productId": prod._id,
                                originalDocType: docType
                            };
                            console.log(data);
                            if (await this.civilAndLienSaveToNewSchema(data)){
                                countRecords += 1;
                            }
                        } catch(e){
                            //
                        }
                    }
                    let resultClick = await page.$x('//a[text()="Results"]');
                    await Promise.all([
                        resultClick[0].click(),
                        page.waitForNavigation()
                    ])
                    await page.waitForXPath('//table[@id="grid"]/tbody/tr[contains(., "Defendant")]/td[2]/span/a');
                    resultRows = await page.$x('//table[@id="grid"]/tbody/tr[contains(., "Defendant")]/td[2]/span/a');
                } catch(e){
                    // console.log(e);
                    break;
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
        await AbstractProducer.sendMessage('Ashtabula', 'Ohio', countRecords, 'Civil & Lien');
        return true;
    }
}