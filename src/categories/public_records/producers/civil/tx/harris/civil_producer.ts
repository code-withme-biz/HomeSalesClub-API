import puppeteer from 'puppeteer';
import axios from 'axios';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import { sleep } from '../../../../../../core/sleepable';
import db from '../../../../../../models/db';
const parser = require('parse-address');

export default class CivilProducer extends AbstractProducer {

    urls = {
        generalInfoPage: 'https://www.cclerk.hctx.net/Applications/WebSearch/RP_R.aspx'
    }

    xpaths = {
        isPageLoaded: '//input[contains(@name, "txtDateN")]'
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
            await this.browserPages.generalInfoPage?.waitForXPath(this.xpaths.isPageLoaded);
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    isEmptyOrSpaces(str: string) {
        return str === null || str.match(/^\s*$/) !== null;
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        await page?.setDefaultTimeout(60000);
        if (page === undefined) return false;

        let countRecords: number = 0;
        let success: boolean = false;
        try {
            // // input fillingdate
            const dateRange = await this.getDateRange('Texas', 'Harris');

            const [beginDateHandle] = await page.$x('//input[contains(@name, "txtDateN")]');
            const [endDateHandle] = await page.$x('//input[contains(@name, "txtDateTo")]');

            await beginDateHandle?.type(this.getFormattedDate(dateRange.from), { delay: 150 });
            await endDateHandle?.type(this.getFormattedDate(dateRange.to), { delay: 150 });
            await page.click('input[id $= "btnSearch"]');
            const text_handle = await Promise.race([
                page.waitForXPath('//span[contains(text(), "No Records Found.")]'),
                page.waitForXPath('//span[contains(text(), "Record(s) Found.  ")]')
            ]);
            const text = await page.evaluate(el => el.textContent, text_handle);
            if (text.indexOf('No Records Found.') > -1) {
                console.log('No results found!');
                await AbstractProducer.sendMessage('Harris', 'Texas', countRecords, 'Civil');
                return false;
            }

            while (true) {
                const rows = await page.$x('//table[@id="itemPlaceholderContainer"]/tbody[2]/tr');
                for (const row of  rows) {
                    let name = await page.evaluate(el => el.children[4].innerText.trim(), row);
                    let names = name.split('\n')
                        .filter((s: string) => s.trim() !== '' && s.indexOf('Grantee') > -1)
                        .map((s: string) => s.slice(8).trim());
                    console.log(names);
                    let recordDate = await page.evaluate(el => el.children[2].textContent.trim(), row);
                    let docType = await page.evaluate(el => el.children[3].children[0].textContent.trim(), row);
                    docType = docType.replace(/\n|\s+/gm, '');
                    // console.log(docType);
                    let practiceType = this.getPracticeType(docType!);
                    for (const name of names) {
                        if (this.isEmptyOrSpaces(name!)) {
                            continue;
                        }
                        const parseName: any = this.newParseName(name!.trim());
                        if(parseName.type == 'COMPANY' || parseName.fullName === ''){
                            continue;
                        }
                        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                        const prod = await db.models.Product.findOne({ name: productName }).exec();
                        const data = {
                            'Property State': 'TX',
                            'County': 'Harris',
                            'First Name': parseName.firstName,
                            'Last Name': parseName.lastName,
                            'Middle Name': parseName.middleName,
                            'Name Suffix': parseName.suffix,
                            'Full Name': parseName.fullName,
                            "vacancyProcessed": false,
                            fillingDate: recordDate,
                            "productId": prod._id,
                            originalDocType: docType
                        };
                        if(await this.civilAndLienSaveToNewSchema(data)){
                            countRecords += 1;
                        }
                    }
                }
                const [next_page_disabled] = await page.$x('//a[@disabled="disabled"][text()="Next"]');
                if (next_page_disabled) {
                    break;
                } else {
                    let [next_page_enabled] = await page.$x('//a[text()="Next"]');
                    await next_page_enabled.click();
                    await page.waitFor(100);
                    await page.waitForXPath('//div[contains(@id, "UpdateProgressMaster")]', {hidden: true});
                }
                await page.waitFor(this.getRandomInt(4000, 5000));
            }

            console.log(countRecords);
            success = true;
        }
        catch (error) {
            console.log('Error: ', error);
            console.log('Website maybe unavailable');
        }

        await AbstractProducer.sendMessage('Harris', 'Texas', countRecords, 'Civil');

        return success;
    }
}