import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import axios from 'axios';
import { resolveRecaptcha2 } from '../../../../../../services/general_service';

export default class CivilProducer extends AbstractProducer {
    browser: puppeteer.Browser | undefined;
    browserPages = {
        generalInfoPage: undefined as undefined | puppeteer.Page
    };
    urls = {
        generalInfoPage: 'http://deeds.cherokeega.com/'
    }

    xpaths = {
        isPAloaded: '//a[@title="Document Search"]'
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

    async getData(page: puppeteer.Page, date: any, name: any, docType: any): Promise<any> {
        const parseName: any = this.newParseName(name.trim())
        if (parseName?.type && parseName?.type == 'COMPANY') return false;
        let practiceType = this.getPracticeType(docType)
        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({name: productName}).exec();
        const data = {
            'Property State': 'GA',
            'County': 'Cherokee',
            'First Name': parseName.firstName,
            'Last Name': parseName.lastName,
            'Middle Name': parseName.middleName,
            'Name Suffix': parseName.suffix,
            'Full Name': parseName.fullName,
            "vacancyProcessed": false,
            fillingDate: date,
            productId: prod._id,
            originalDocType: docType.trim()
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }

    async isVisible(page: any, selector: any) {
        return await page.evaluate((selector: any) => {
          var e = document.querySelector(selector);
          if (e) {
            var style = window.getComputedStyle(e);
      
            return style && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
          }
          else {
            return false;
          }
        }, selector);
    }

    async checkForRecaptcha(page: puppeteer.Page) {
        const isRecaptcha = await this.isVisible(page, 'div.recaptchasection-DocumentType');
        if (isRecaptcha) {
            // captcha
            console.log("Resolving captcha...");
            const captchaSolution: any = await resolveRecaptcha2('6LeeIu8UAAAAAGTGRIMdcImqM5zlXKQHUJXN595r', await page.url());
            let recaptchaHandle = await page.$x('//*[@id="g-recaptcha-response"]');
            await recaptchaHandle[0].evaluate((elem: any, captchaSolution: any) => elem.innerHTML = captchaSolution, captchaSolution);
            console.log("Done.");
        }
        return;
    }

    // This is main function
    async parseAndSave(): Promise<boolean> {
        let countRecords = 0;
        try{
            const civilUrl: string = 'http://deeds.cherokeega.com/search/index?theme=.blue&section=searchCriteriaDocuments&quickSearchSelection=';
            let dateRange = await this.getDateRange('Georgia', 'Cherokee');
            let fromDate = dateRange.from;
            let toDate = dateRange.to;
            let page = this.browserPages.generalInfoPage!;
            let docButton = await page.$x('//a[@title="Document Search"]');
            await docButton[0].click();
            await this.sleep(500);
            let tosSubmit = await page.$x('//a[@id="idAcceptYes"]');
            await Promise.all([tosSubmit[0].click(),
            page.waitForNavigation()
            ]);
            while (fromDate <= toDate) {
                let dateStringDay = this.getFormattedDate(fromDate);
                console.log("Processing: ",dateStringDay);
                await page.goto(civilUrl, { waitUntil: 'networkidle0' });
                let docButton = await page.$x('//a[@id="documentTypeSelection-DocumentType"]');
                await docButton[0].click();
                await this.sleep(500);
                // let option = (await page.$x('//select[@id="DocTypeGroupDropDown"]/option[contains(., "' + docTypeSelect + '")]'))[0];
                // let optionVal: any = await (await option.getProperty('value')).jsonValue();
                // await page.select('#DocTypeGroupDropDown', optionVal);
                await page.click('a.selectAllDocuments-DocumentType');
                let submitDoc = await page.$x('//a[@onclick="UpdateDocumentTypeListFromModal(\'DocumentType\');"]');
                await submitDoc[0].click();
                await this.sleep(500);
                await page.click('input#beginDate-DocumentType', { clickCount: 3 });
                await page.type('input#beginDate-DocumentType', dateStringDay);
                await page.click('input#endDate-DocumentType', { clickCount: 3 });
                await page.type('input#endDate-DocumentType', dateStringDay);
                // await this.sleep(500000);
                await this.checkForRecaptcha(page);
                await this.sleep(3000);
                await page.click('#submit-DocumentType');
                await page.waitForXPath('//table[@id="resultsTable"]/tbody/tr', { visible: true, timeout: 200000 });
                let docTypeHandles = await page.$x('//table[@id="resultsTable"]/tbody/tr/td[9]');
                let recordDateHandles = await page.$x('//table[@id="resultsTable"]/tbody/tr/td[8]');
                let uniqueIdHandles = await page.$x('//table[@id="resultsTable"]/tbody/tr/td[13]');
                for (let i = 0; i < docTypeHandles.length; i++) {
                    let indexName = i + 1;
                    let docType = await docTypeHandles[i].evaluate(el => el.textContent?.trim());
                    let recordDate = await recordDateHandles[i].evaluate(el => el.textContent?.trim());
                    let uniqueId = await uniqueIdHandles[i].evaluate(el => el.textContent?.trim());
                    let names = [];
                    let reverseNameHandles = await page.$x('//table[@id="resultsTable"]/tbody/tr[' + indexName + ']/td[7]/text()');
                    let directNameHandles = await page.$x('//table[@id="resultsTable"]/tbody/tr[' + indexName + ']/td[6]/text()');
                    let reverseName: any = '';
                    let directName: any = '';
                    if (docType?.match(/marriage/i) || docType?.match(/deed/i) || docType?.match(/family/i)) {
                        for (let reverseNameHandle of reverseNameHandles) {
                            reverseName = await reverseNameHandle.evaluate(el => el.textContent?.trim());
                            names.push(reverseName);
                        }
                        for (let directNameHandle of directNameHandles) {
                            directName = await directNameHandle.evaluate(el => el.textContent?.trim());
                            names.push(directName);
                        }
                    } else if (docType?.match(/mortgage/i) || docType?.match(/probate/i)) {
                        for (let directNameHandle of directNameHandles) {
                            directName = await directNameHandle.evaluate(el => el.textContent?.trim());
                            names.push(directName);
                        }
                    } else {
                        for (let reverseNameHandle of reverseNameHandles) {
                            reverseName = await reverseNameHandle.evaluate(el => el.textContent?.trim());
                            names.push(reverseName);
                        }
                    }
                    for (let name of names) {
                        name = name?.replace(/\(PERS REP\)/, '');
                        if(name == '...'){
                            continue;
                        }
                        if(await this.getData(page, recordDate, name, docType)){
                            countRecords += 1;
                        }
                    }
                }
                fromDate.setDate(fromDate.getDate() + 1);
                await this.randomSleepIn5Sec();
            }
            
            console.log(countRecords);
            await AbstractProducer.sendMessage('Cherokee', 'Georgia', countRecords, 'Civil & Lien');
            return true;
        } catch (error){
            console.log(error);
            await AbstractProducer.sendMessage('Cherokee', 'Georgia', countRecords, 'Civil & Lien');
            return false;
        }
    }
}