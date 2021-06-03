import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';

import { getTextByXpathFromPage } from '../../../../../../services/general_service';

export default class CivilProducer extends AbstractProducer {
    browser: puppeteer.Browser | undefined;
    browserPages = {
        generalInfoPage: undefined as undefined | puppeteer.Page
    };
    urls = {
        generalInfoPage: 'http://208.73.86.205/cmwebsearch_pfp/Custom_Search.aspx'
    }

    xpaths = {
        isPAloaded: '//select[@id="_ctl0_ContentPlaceHolder1_custom_search1_drpFldsLst"]'
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
            'County': 'Carroll',
            'First Name': parseName.firstName,
            'Last Name': parseName.lastName,
            'Middle Name': parseName.middleName,
            'Name Suffix': parseName.suffix,
            'Full Name': parseName.fullName,
            "vacancyProcessed": false,
            fillingDate: date,
            productId: prod._id,
            originalDocType: docType
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }

    // This is main function
    async parseAndSave(): Promise<boolean> {
        let countRecords = 0;
        // 2000
        try{
            let dateRange = await this.getDateRange('Georgia', 'Carroll', 60);
            let fromDate = dateRange.from;
            let toDate = dateRange.to;
            let fromDateString = this.getFormattedDate(fromDate);
            let toDateString = this.getFormattedDate(toDate);
            let page = this.browserPages.generalInfoPage!;
            await Promise.all([
                page.select('#_ctl0_ContentPlaceHolder1_custom_search1_drpFldsLst', 'FilingDate'),
                page.waitForNavigation()
            ]);
            await page.waitForSelector('#_ctl0_ContentPlaceHolder1_custom_search1_txtStartDate');
            await page.type('#_ctl0_ContentPlaceHolder1_custom_search1_txtStartDate', fromDateString, {delay: 150});
            await page.type('#_ctl0_ContentPlaceHolder1_custom_search1_txtEndDate', toDateString, {delay: 150});
            await Promise.all([
                page.click('#_ctl0_ContentPlaceHolder1_custom_search1_btnAdd'),
                page.waitForNavigation()
            ]);
            let searchButton = await page.$x('//input[@id="_ctl0_ContentPlaceHolder1_custom_search1_btnFind"]');
            await Promise.all([
                searchButton[0].click(),
                page.waitForNavigation()
            ]);
            await this.sleep(5000);
            let resultRows = await page.$x('//tr[contains(@onclick, "CaseView.aspx")]');
            if(resultRows.length < 2){
                console.log('Not found!');
                console.log(await page.content());
                await AbstractProducer.sendMessage('Carroll', 'Georgia', countRecords, 'Civil & Lien');
                return true;
            }
            resultRows.shift();
            let nextPage = true;
            let pageNum = 1;
            while(nextPage){
                console.log('Page:',pageNum);
                resultRows = await page.$x('//tr[contains(@onclick, "CaseView.aspx")]');
                resultRows.shift();
                console.log(resultRows.length);
                for(const resultRow of resultRows){
                    let onclick = await resultRow.evaluate(el => el.getAttribute('onclick'));
                    let url = onclick?.split("href='")[1];
                    url = 'http://208.73.86.205/cmwebsearch_pfp/' + url?.replace(/'|;/g, '');
                    console.log(url);
                    let page2 = await this.browser?.newPage();
                    await this.setParamsForPage(page2!);
                    await page2?.goto(url);
                    await page2?.waitForXPath('//span[@id="txtFilingDate"]');
                    let filingDate = await getTextByXpathFromPage(page2!, '//span[@id="txtFilingDate"]');
                    let docType = await getTextByXpathFromPage(page2!, '//span[@id="lblCompCodeDesc"]');
                    let nameRows = await page2?.$x('//table[@id="PartyGrid_grdParty"]/tbody/tr');
                    nameRows?.shift();
                    if(nameRows){
                        for(const nameRow of nameRows){
                            let name = await nameRow.evaluate(el => el.children[1].textContent?.trim());
                            if(name?.includes('$') || name?.includes('NO.:') || name?.includes('VIN:')){
                                continue;
                            }
                            if(await this.getData(page, filingDate, name, docType)){
                                countRecords += 1;
                            }
                        }
                    }
                    await page2?.close();
                }
                let [nextPageHandle] = await page.$x('//a[@id="_ctl0_lblNextlnk" and not(contains(@disabled,"disabled"))]');
                if(nextPageHandle){
                    await Promise.all([
                        nextPageHandle.click(),
                        page.waitForNavigation()
                    ]);
                    pageNum++;
                } else {
                    break;
                }
            }
            console.log(countRecords);
            await AbstractProducer.sendMessage('Carroll', 'Georgia', countRecords, 'Civil & Lien');
            return true;
        } catch (error){
            console.log(error);
            await AbstractProducer.sendMessage('Carroll', 'Georgia', countRecords, 'Civil & Lien');
            return false;
        }
    }
}