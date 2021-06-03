import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import { result } from 'lodash';

import { getTextByXpathFromPage } from '../../../../../../services/general_service';

export default class CivilProducer extends AbstractProducer {
    browser: puppeteer.Browser | undefined;
    browserPages = {
        generalInfoPage: undefined as undefined | puppeteer.Page
    };
    urls = {
        generalInfoPage: 'http://recordingsearch.car.elpasoco.com/rsui/opr/Search.aspx'
    }

    xpaths = {
        isPAloaded: '//input[@id="ctl00_ContentPlaceHolder1_txtDateFiledFrom"]'
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
            this.browserPages.generalInfoPage?.setDefaultTimeout(200000);
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
            'Property State': 'CO',
            'County': 'El Paso',
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
            const url = "http://recordingsearch.car.elpasoco.com/rsui/opr/Search.aspx";
            let dateRange = await this.getDateRange('Colorado', 'El Paso');
            let fromDate = dateRange.from;
            let toDate = dateRange.to;
            let fromDateString = this.getFormattedDate(fromDate);
            let page = this.browserPages.generalInfoPage!;
            let getLatestDate = await getTextByXpathFromPage(page, '//span[@id="ctl00_ContentPlaceHolder1_lblRecordingDatabase"]');
            let toDateString = getLatestDate.split(' - ')[1].trim();
            const docTypeHandles = await page.$x('//select[@id="ctl00_ContentPlaceHolder1_lbxDocumentTypes"]/option');
            let docTypes = [];
            for(const docTypeHandle of docTypeHandles){
                let docType = await docTypeHandle.evaluate(el => el.textContent?.trim());
                docTypes.push(docType);
            }
            for(const docType of docTypes){
                console.log('Processing:',docType);
                await page.goto(url);
                await page.waitForSelector('#ctl00_ContentPlaceHolder1_txtDateFiledFrom');
                await page.type('#ctl00_ContentPlaceHolder1_txtDateFiledFrom', fromDateString, {delay: 150});
                await page.type('#ctl00_ContentPlaceHolder1_txtDateFiledTo', toDateString, {delay: 150});
                let option = (await page.$x('//select[@id="ctl00_ContentPlaceHolder1_lbxDocumentTypes"]/option[text()="' + docType + '"]'))[0];
                let optionVal: any = await (await option.getProperty('value')).jsonValue();
                await page.select('#ctl00_ContentPlaceHolder1_lbxDocumentTypes', optionVal);
                let searchButton = await page.$x('//input[@id="ctl00_ContentPlaceHolder1_btnSubmit"]');
                try{
                    await Promise.all([
                        searchButton[0].click(),
                        page.waitForNavigation()
                    ]);
                } catch(e){
                    continue;
                }
                let resultRows = await page.$x('//table[@id="ctl00_ContentPlaceHolder1_gvSearchResults"]/tbody/tr');
                if(resultRows.length < 3){
                    console.log('Not found!');
                    continue;
                }
                let nextPage = true;
                let pageNum = 1;
                while(nextPage){
                    console.log('Page:',pageNum);
                    resultRows = await page.$x('//table[@id="ctl00_ContentPlaceHolder1_gvSearchResults"]/tbody/tr');
                    resultRows.shift();
                    resultRows.pop();
                    for(const resultRow of resultRows){
                        let names = [];
                        let nameHandle1 = await resultRow.evaluate(el => el.children[6].children[0].textContent?.trim());
                        names.push(nameHandle1);
                        let nameHandle2 = await resultRow.evaluate(el => el.children[7].children[0].textContent?.trim());
                        names.push(nameHandle2);
                        let recordDate = await resultRow.evaluate(el => el.children[4].textContent?.trim());
                        for(const name of names){
                            if(await this.getData(page, recordDate, name, docType)){
                                countRecords += 1;
                            }
                        }
                    }
                    let nextPageNum = pageNum + 1;
                    let [nextPageHandle] = await page.$x('//table[@id="ctl00_ContentPlaceHolder1_gvSearchResults"]/tbody/tr[last()]/td/table/tbody/tr[1]/td['+nextPageNum+']/a');
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
            }
            
            console.log(countRecords);
            await AbstractProducer.sendMessage('El Paso', 'Colorado', countRecords, 'Civil & Lien');
            return true;
        } catch (error){
            console.log(error);
            await AbstractProducer.sendMessage('El Paso', 'Colorado', countRecords, 'Civil & Lien');
            return false;
        }
    }
}