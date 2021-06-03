import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';

export default class CivilProducer extends AbstractProducer {
    browser: puppeteer.Browser | undefined;
    browserPages = {
        generalInfoPage: undefined as undefined | puppeteer.Page
    };
    urls = {
        generalInfoPage: 'https://countyfusion5.kofiletech.us/index.jsp'
    }

    xpaths = {
        isPAloaded: '//a[contains(text(), "Franklin")]',
        logout: '//a[text()="Log Out"]'
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
            // get date range
            let dateRange = await this.getDateRange('Ohio', 'Franklin');
            let fromDate = dateRange.from;
            let toDate = dateRange.to;

            while (fromDate < toDate) {
                let dateSearch = this.getFormattedDate(fromDate);

                await page.goto(civilUrl, {waitUntil: 'load'});
                // choose county
                const [county_handle] = await page.$x('//a[contains(text(), "Franklin")]');
                await Promise.all([
                    county_handle.click(),
                    page.waitForNavigation()
                ]);
                await page.waitFor(1000);

                // click login as public
                const [login_as_public] = await page.$x('//input[contains(@value, "Login as Guest")]');
                await Promise.all([
                    login_as_public.click(),
                    page.waitForNavigation()
                ]);

                // check for notification dialog
                const [close_notification] = await page.$x('//a[contains(@onclick, "hideDialog")]');
                if (close_notification) {
                    await close_notification.click();
                }
                await page.waitFor(1000);
                
                // click Search Public Records
                await page.waitForXPath('//iframe[@name="bodyframe"]', {visible: true});
                let [body_frame]: any = await page.$x('//iframe[@name="bodyframe"]');
                body_frame = await body_frame.contentFrame();
                await page.waitFor(3000);

                await body_frame.waitForSelector('iframe[name="dynSearchFrame"]', {visible: true});
                let dynSearch_frame = await body_frame.$('iframe[name="dynSearchFrame"]');
                dynSearch_frame = await dynSearch_frame.contentFrame();

                await dynSearch_frame.waitForSelector('iframe[name="criteriaframe"]', {visible: true});
                let criteria_frame: any = await dynSearch_frame.$('iframe[name="criteriaframe"]');
                criteria_frame = await criteria_frame.contentFrame();
                
                // input date range
                await criteria_frame.waitForXPath('//span[contains(@class, "datebox")]/input[contains(@class, "textbox-text")]', {visible: true});
                const inputboxes = await criteria_frame.$x('//span[contains(@class, "datebox")]/input[contains(@class, "textbox-text")]');
                await page.waitFor(1000);
                await inputboxes[0].focus();
                await inputboxes[0].type(dateSearch, {delay: 100});
                await inputboxes[1].focus();
                await inputboxes[1].type(dateSearch, {delay: 100});
                let [search_button]: any = await dynSearch_frame.$x(`//a[contains(@onclick, "parent.executeSearchCommand ('search')")]`);
                await search_button.click();

                let nextPage = true;
                while (nextPage) {
                    await page.waitForXPath('//iframe[@name="bodyframe"]', {visible: true});
                    let [body_frame]: any = await page.$x('//iframe[@name="bodyframe"]');
                    body_frame = await body_frame.contentFrame();

                    try{
                        await body_frame.waitForXPath('//iframe[@name="progressFrame"]', {hidden: true});
                    } catch (error) {
                        await body_frame.waitForXPath('//iframe[@name="progressFrame"]', {hidden: true});
                    }

                    try {
                        await body_frame.waitForXPath('//iframe[@name="resultFrame"]', {visible: true});
                    } catch (error) {
                        console.log('Not found');
                        break;
                    }

                    await body_frame.waitForXPath('//iframe[@name="resultFrame"]', {visible: true});
                    let [result_frame]: any = await body_frame.$x('//iframe[@name="resultFrame"]');
                    result_frame = await result_frame.contentFrame();
            
                    await result_frame.waitForXPath('//iframe[@name="resultListFrame"]', {visible: true});
                    let [result_list_frame]: any = await result_frame.$x('//iframe[@name="resultListFrame"]');
                    result_list_frame = await result_list_frame.contentFrame();

                    await result_list_frame.waitForXPath('//table[contains(@class, "datagrid-btable")]/tbody/tr/td/table/tbody/tr', {visible: true});
                    let resultRows = await result_list_frame.$x('//table[contains(@class, "datagrid-btable")]/tbody/tr/td/table/tbody/tr');

                    for (const row of resultRows) {
                        let names = await result_list_frame.evaluate((el: any) => el.children[5].innerText.trim(), row);
                        console.log(names);
                        names = names.split('\n');
                        names = names.filter((name:string) => name.trim() !== '');
                        let recordDate = await result_list_frame.evaluate((el: any) => el.children[9].textContent.trim(), row);
                        let caseType = await result_list_frame.evaluate((el: any) => el.children[3].textContent.trim(), row);

                        let practiceType = this.getPracticeType(caseType);

                        for (const name of names) {
                            if (this.isEmptyOrSpaces(name!)) {
                                continue;
                            }
                            const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                            const prod = await db.models.Product.findOne({ name: productName }).exec();
                            const parseName: any = this.newParseName(name!.trim());
                            if (parseName.type === 'COMPANY' || parseName.fullName === '') continue;
                            const data = {
                                'Property State': 'OH',
                                'County': 'Franklin',
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
                                        
                    await result_frame.waitForXPath('//iframe[@name="subnav"]');
                    let [subnav_frame]: any = await result_frame.$x('//iframe[@name="subnav"]');
                    subnav_frame = await subnav_frame.contentFrame();

                    let nextPageEnabled = await subnav_frame.$x(`//a[contains(@onclick, "parent.navigateResults('next')")]`);
                    if (nextPageEnabled.length === 0) {
                        nextPage = false;
                    } else {
                        let nextPageButton = await subnav_frame.$x(`//a[contains(@onclick, "parent.navigateResults('next')")]`);
                        await nextPageButton[0].click();
                        await this.sleep(5000);
                    }
                }
                console.log(countRecords);
                fromDate.setDate(fromDate.getDate()+1);
                const [logoutbutton] = await page.$x(this.xpaths.logout);
                await Promise.all([
                    logoutbutton.click(),
                    page.waitForNavigation()
                ]);
            }
            await AbstractProducer.sendMessage('Franklin', 'Ohio', countRecords, 'Civil & Lien');
        } catch (error) {
            console.log(error);
            await AbstractProducer.sendMessage('Franklin', 'Ohio', countRecords, 'Civil & Lien');
            return false;
        }
        return true;
    }
}