import puppeteer from 'puppeteer';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import db from '../../../../../../models/db';
import SnsService from '../../../../../../services/sns_service';


export default class CivilProducer extends AbstractProducer {
    urls = {
        generalInfoPage: 'https://recording.charlotteclerk.com/Search/DocumentType'
    }

    xpaths = {
        isPageLoaded: '//input[@id="btnSubmit"]'
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
        await this.browserPages.generalInfoPage.setDefaultNavigationTimeout(100000);
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
            // setting doc type list
            const docTypeSelects = ['DEED', 'LIEN', 'FORECLOSURE', 'MARRIAGE', 'MORTGAGE'];
            const typeListButton = await page.$x('//span[@aria-controls="s2DocumentTypes_listbox"]');
            await typeListButton[0].click();
            await page.waitForXPath('//ul[@id="s2DocumentTypes_listbox"]');  
            await page.waitFor(3000);
            const items = await page.$x('//ul[@id="s2DocumentTypes_listbox"]/li');

            let typeItems = [];
            for (let i = 0; i < items.length; i++) {
                const type = await items[i].evaluate(el => el.textContent?.trim());
                if (type?.includes(docTypeSelects[0]) || type?.includes(docTypeSelects[1])|| type?.includes(docTypeSelects[2])|| type?.includes(docTypeSelects[3])|| type?.includes(docTypeSelects[4])) {
                    typeItems.push(type);
                }              
            }

            for (let i = 0; i < typeItems.length; i++) {
                const [inputHandle] = await page.$x('//input[@aria-labelledby="s2DocumentTypes_label"]');
                await inputHandle.click({clickCount: 3});
                await inputHandle.press('Backspace');
                await inputHandle.type(`${typeItems[i]}`, {delay: 50});
                await page.waitFor(500);
                await (await page.$x(`//ul[@id="s2DocumentTypes_listbox"]/li[text()="${typeItems[i]}"]`))[0].click();
                await page.waitFor(500)
            }

            // setting date range
            const dateRange = await this.getDateRange('Florida', 'Charlotte');
            await (await page.$x('//input[@id="s2Start"]'))[0].click({clickCount: 3});
            await (await page.$x('//input[@id="s2Start"]'))[0].press('Backspace');
            await (await page.$x('//input[@id="s2Start"]'))[0].type(this.getFormattedDate(dateRange.from), {delay: 150});
            await (await page.$x('//input[@id="s2End"]'))[0].click({clickCount: 3});
            await (await page.$x('//input[@id="s2End"]'))[0].press('Backspace');
            await (await page.$x('//input[@id="s2End"]'))[0].type(this.getFormattedDate(dateRange.to), {delay: 150});  

            try {
                await Promise.all([
                    page.$eval('input#btnSubmit', el => el.removeAttribute('disabled')),
                    page.click('input#btnSubmit'),
                    page.waitForNavigation()
                ]);
            } catch (error) {
                console.log(error);
                return false;
            }

            await page.waitForXPath('//*[@id="DocumentGrid"]/div[3]');
            await page.waitFor(3000);
            const [pageHandler] = await page.$x('//*[@id="DocumentGrid"]/div[3]');
            const itemText = await pageHandler.evaluate(el => el.textContent?.trim());

            if (itemText == "No items to display") {
                console.log("No Records");
                return false;
            };

            let isLast = false;
            let countPage = 1;

            while (!isLast) {
                await page.waitForXPath('//*[@id="DocumentGrid"]/div[2]/table/tbody/tr');
                const contentHandle = await page.$x('//*[@id="DocumentGrid"]/div[2]/table/tbody/tr');
                await this.randomSleepIn5Sec();
                console.log(contentHandle.length);
                for (let i = 0; i < contentHandle.length; i++) {
                    const nameHandle = await page.$x(`//*[@id="DocumentGrid"]/div[2]/table/tbody/tr[${i + 1}]/td[7]`);
                    const pageHandle = await page.$x(`//*[@id="DocumentGrid"]/div[2]/table/tbody/tr[${i + 1}]/td[10]`);
                    const numberHandle = await page.$x(`//*[@id="DocumentGrid"]/div[2]/table/tbody/tr[${i + 1}]/td[11]`);
                    const dateHandle = await page.$x(`//*[@id="DocumentGrid"]/div[2]/table/tbody/tr[${i + 1}]/td[12]`);
                    const typeHandle = await page.$x(`//*[@id="DocumentGrid"]/div[2]/table/tbody/tr[${i + 1}]/td[13]`);

                    const name = await nameHandle[0].evaluate(el => el.textContent?.trim());
                    const pageNum = await pageHandle[0].evaluate(el => el.textContent?.trim());
                    const number = await numberHandle[0].evaluate(el => el.textContent?.trim());
                    const date = await dateHandle[0].evaluate(el => el.textContent?.trim());
                    const type = await typeHandle[0].evaluate(el => el.textContent?.trim());
                    if(await this.getData(page, name, pageNum, number, type, date)){
                        countRecords++;
                    }
                }

                const [nextBtnHandle] = await page.$x('//*[@id="DocumentGrid"]/div[3]/a[@aria-label="Go to the next page"]');
                const [lastBtnHandle] = await page.$x('//*[@id="DocumentGrid"]/div[3]/a[@aria-label="Go to the last page"]');
                const lastBtnclassName = await lastBtnHandle.evaluate(el => el.getAttribute('class'));
                
                if (lastBtnclassName == 'k-link k-pager-nav k-pager-last k-state-disabled') {
                    break;
                } else {
                    countPage++;
                    await nextBtnHandle.click();
                    await this.randomSleepIn5Sec();
                }
            }

            await AbstractProducer.sendMessage('Charlotte', 'Florida', countRecords, 'Civil & Lien');
            await page.close();
            await this.browser?.close();
            return true;
        }
        catch (error) {
            console.log('Error: ', error);
        }
        await AbstractProducer.sendMessage('Charlotte', 'Florida', countRecords, 'Civil & Lien');
        return false;
    }

    async getData(page: puppeteer.Page, name: any, pageNum: any, number: any, type: any, date: any): Promise<any> {
        const fullname = name.split("\n")[0];
        const parseName: any = this.newParseName(fullname);
        if(parseName.type && parseName.type == 'COMPANY'){
            return false;
        }

        let practiceType = this.getPracticeType(type);
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
            "vacancyProcessed": false,
            fillingDate: date,
            productId: prod._id,
            originalDocType: type
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }
}