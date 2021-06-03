import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import axios from "axios";
import {sleep} from "../../../../../../core/sleepable";

export default class CivilProducer extends AbstractProducer {
    browser: puppeteer.Browser | undefined;
    browserPages = {
        generalInfoPage: undefined as undefined | puppeteer.Page
    };
    urls = {
        generalInfoPage: 'http://courtpa.macombgov.org/eservices/home.page.2'
    }

    xpaths = {
        isPAloaded: '//a[*[contains(text(),"Click Here")]]'
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
    
    constructor(publicRecordProducer: IPublicRecordProducer) {
        // @ts-ignore
        super();
        this.publicRecordProducer = publicRecordProducer;
        this.stateToCrawl = this.publicRecordProducer?.state || '';
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
        let countRecords = 0;

        try{
            let page = this.browserPages.generalInfoPage!;

            await page.waitForXPath('//a[*[contains(text(),"Click Here")]]');
            const [clickhere] = await page.$x('//a[*[contains(text(),"Click Here")]]');
            await Promise.all([
                clickhere.click(),
                page.waitForNavigation()
            ]);
            await page.waitForXPath('//a/span[contains(text(),"Case Type")]');
            const [casetypetab] = await page.$x('//a/span[contains(text(),"Case Type")]');
            await Promise.all([
                casetypetab.click(),
                page.waitForNavigation()
            ]);
            await page.waitForSelector('input[name="fileDateRange:dateInputBegin"]');

            // get date range
            let dateRange = await this.getDateRange('Michigan', 'macomb');
            let fromDate = dateRange.from;
            let toDate = dateRange.to;
            
            let fromDateString = this.getFormattedDate(fromDate);
            let toDateString = this.getFormattedDate(toDate);
            
            // input date range
            await page.type('input[name="fileDateRange:dateInputBegin"]', fromDateString);
            await page.type('input[name="fileDateRange:dateInputEnd"]', toDateString);

            await page.waitForSelector('select[aria-controls="CaseTypeSearchFormPanelPartyType"]');
            await page.select('select[aria-controls="CaseTypeSearchFormPanelPartyType"]', 'AV        ', 'CZP       ', 'DM        ', 'DO        ', 'TM        ', 'TO        ');
            await page.waitFor(100);
            await page.select('select[name="statCd"]', 'O         ');
            await page.waitFor(100);
            await page.select('select[name="ptyCd"]', 'DFNDT     ');
            await page.waitFor(100);
            
            await Promise.all([
                page.click('input[type="submit"]'),
                page.waitForNavigation()
            ]);
            const result_handle = await Promise.race([
                page.waitForSelector('div#srchResultNoticeNomatch'),
                page.waitForSelector('div#srchResultNotice')
            ]);
            const result_text = await page.evaluate(el => el.textContent.trim(), result_handle);
            if (result_text === 'No Matches Found') {
                console.log('No Matches Found');
                await AbstractProducer.sendMessage('macomb', 'Michigan', countRecords, 'Civil & Lien');
                return false;
            }
            
            let nextPage = true;
            let nextPageNum = 1;
            while (nextPage) {
                await page.waitForXPath('//table[@id="grid"]/tbody/tr');
                let resultRows = await page.$x('//table[@id="grid"]/tbody/tr');
                for (const row of resultRows) {
                    let names = [];
                    names.push(await page.evaluate(el => el.children[5].textContent.trim(), row));
                    names = names.filter(name => name !== '');
                    let recordDate = await page.evaluate(el => el.children[3].textContent.trim(), row);
                    let caseType = await page.evaluate(el => el.children[2].textContent.trim(), row);

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
                            'Property State': 'MI',
                            'County': 'macomb',
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
                let nextPageEnabled = await page.$x('//a[@title="Go to next page"]');
                if (nextPageEnabled.length === 0) {
                    nextPage = false;
                } else {
                    let nextPageButton = await page.$x('//a[@title="Go to next page"]');
                    await Promise.all([
                        nextPageButton[0].click(),
                        page.waitForNavigation()
                    ]);
                    
                    await this.sleep(1000);
                    nextPageNum++;
                }
            }
            
            console.log(countRecords);
            await AbstractProducer.sendMessage('macomb', 'Michigan', countRecords, 'Civil & Lien');
            return true;
        } catch(e){
            console.log(e);
            await AbstractProducer.sendMessage('macomb', 'Michigan', countRecords, 'Civil & Lien');
            return false;
        }
    }
}