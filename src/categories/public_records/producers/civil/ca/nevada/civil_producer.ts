import puppeteer from 'puppeteer';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import db from '../../../../../../models/db';
import SnsService from '../../../../../../services/sns_service';
export default class CivilProducer extends AbstractProducer {
    urls = {
        generalInfoPage: 'https://recorder.mynevadacounty.com/AcclaimWeb/search/Disclaimer?st=/AcclaimWeb/search/SearchTypeDocType'
    }

    xpaths = {
        isPageLoaded: '//input[@id="btnButton"]'
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
            console.warn('Page Loaded')
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }    
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let countRecords = 0;
        try {       
            const dateRange = await this.getDateRange('California', 'Nevada');

            try {
                await Promise.all([
                    page.$eval('input#btnButton', el => el.removeAttribute('disable')),
                    page.click('input#btnButton'),
                    page.waitForNavigation()
                ])
            } catch (error) {
                console.error(error);

                return false;
            }

            await page.waitFor(3000);

            // const showXpath = `//button[contains(text(), '...')]`;
            // const typesXpath = '//div[@id="DocTypesWin"]';
            // const listXpath = `//*[@id="DocTypelist"]/div/ul/li[2]`;

            // const [showElement] = await page.$x(showXpath);
            // await showElement.click();
            // await page.waitForXPath(typesXpath);
            // await (await page.$x(listXpath))[0].click();

            // await page.waitForXPath('//div[@id="DocumentTypesList-2"]/div[1]');
            
            // const docTypeSelects = ['DEED', 'LIEN', 'FORECLOSURE', 'MARRIAGE', 'MORTGAGE'];
            // const items = await page.$x('//div[@id="DocumentTypesList-2"]/div[1]/input');
            
            // for (let i = 0; i < items.length; i++) {
            //     const type = await items[i].evaluate(el => el.getAttribute('title'));
            //     if (type?.includes(docTypeSelects[0]) || type?.includes(docTypeSelects[1])|| type?.includes(docTypeSelects[2])|| type?.includes(docTypeSelects[3])|| type?.includes(docTypeSelects[4])) {
            //         const [inputHandle] = await page.$x(`//div[@id="DocumentTypesList-2"]/div[1]/input[@title="${type}"]`);
            //         await inputHandle.click();
            //         await page.waitFor(500);
            //     }    
            // }

            // await (await page.$x(`//input[contains(@onclick, 'GetDocTypeString()')]`))[0].click();

            // await page.waitFor(3000);

            const fromDateHandle = await page.$('input#RecordDateFrom');
            const toDateHandle = await page.$('input#RecordDateTo');

            const fromDate = this.getFormattedDate(dateRange.from);
            const toDate = this.getFormattedDate(dateRange.to);
            await fromDateHandle?.click({clickCount: 3});
            await fromDateHandle?.press('Backspace');
            await fromDateHandle?.type(fromDate, {delay: 150});

            await toDateHandle?.click({clickCount: 3});
            await toDateHandle?.press('Backspace');
            await toDateHandle?.type(toDate, {delay: 150});

            try {
                await Promise.all([
                    page.$eval('input#btnSearch', el => el.removeAttribute('disable')),
                    page.click('input#btnSearch'),
                ])
            } catch (error) {
                console.error(error);
                await AbstractProducer.sendMessage('Nevada', 'California', countRecords, 'Civil & Lien');
                return false;
            }
            

            let pageNum = 0;
            let countPage = 1;

            while (pageNum >= 0) {
                const tableXpath = '//div[@class="t-grid-content"]/table/tbody';
                await page.waitForXPath(tableXpath);
                if (pageNum == 0) {
                    await page.waitFor(10000);
                } else {
                    await page.waitFor(3000);
                }
                const results = await page.$x(`${tableXpath}/tr`);
                
                for (let i = 0; i < results.length; i++) {
                    const [nameHandle] = await page.$x(`${tableXpath}/tr[${i + 1}]/td[5]`);
                    const [dateHandle] = await page.$x(`${tableXpath}/tr[${i + 1}]/td[6]`);
                    const [typeHandle] = await page.$x(`${tableXpath}/tr[${i + 1}]/td[8]`);

                    const name = await nameHandle.evaluate(el => el.textContent?.trim());
                    const date = await dateHandle.evaluate(el => el.textContent?.trim());
                    const type = await typeHandle.evaluate(el => el.textContent?.trim());

                    if (await this.getData(page, name, type, date))
                        countRecords++;
                }
                pageNum++;
                const nextButtonXpath = '//div[@id="RsltsGrid"]/div[2]/div[2]/a[3]';
                const [nextButtonEL] = await page.$x(nextButtonXpath);
                const nextButtonDisabled = await page.evaluate(el => el.getAttribute('class'), nextButtonEL);
                if (nextButtonDisabled === 't-link t-state-disabled') {
                    break; 
                } else {
                    countPage++;
                    await nextButtonEL.click();
                }
            }
            await AbstractProducer.sendMessage('Nevada', 'California', countRecords, 'Civil & Lien');
            console.log(countRecords + ' saved');
            await page.close();
            await this.browser?.close();
            return true;
        }
        catch (error) {
            console.log('Error: ', error);
            await AbstractProducer.sendMessage('Nevada', 'California', countRecords, 'Civil & Lien');
        }

        return false;
    }

    async waitForSuccess(func: Function): Promise<boolean> {
        let retry_count = 0;
        while (true){
            if (retry_count > 3){
                console.error('Connection/website error for 15 iteration.');
                return false;
            }
            try {
                await func();
                break;
            }
            catch (error) {
                retry_count++;
            }
        }
        return true;
    }

    async getData(page: puppeteer.Page, name: any, type: any, date: any): Promise<any> {
        const full_name = name.replace(/\n/g, ' ').trim();
        const parsedName: any = this.newParseName(full_name);
        if (parsedName.type === 'COMPANY' || parsedName.fullName === '') return false;

        let practiceType = this.getPracticeType(type);
        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({ name: productName }).exec();
        const data = {
            'Property State': 'CA',
            'County': 'Nevada',
            'First Name': parsedName.firstName,
            'Last Name': parsedName.lastName,
            'Middle Name': parsedName.middleName,
            'Name Suffix': parsedName.suffix,
            'Full Name': parsedName.fullName,
            "vacancyProcessed": false,
            fillingDate: date,
            productId: prod._id,
            originalDocType: type
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }
}