import puppeteer from 'puppeteer';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import db from '../../../../../../models/db';
import SnsService from '../../../../../../services/sns_service';

const removeRowArray = [
    'CITY', 'DEPT', 'CTY', 'UNITED STATES', 'BANK', 'FIA CARD SERVICES NA',
    'FLORIDA PACE FUNDING AGENCY', 'COUNTY', 'CREDIT', 'HOSPITAL', 'FUNDING', 'UNIVERSITY',
    'MEDICAL', 'CONDOMINIUM ASSOCIATION', 'LOTS', 'TEXAS STATE', 'VETERANS', 'SECRETARY', 'DEPARTMENT',
    'INDIVIDUAL', 'INDIVIDUALLY', 'FINANCE', 'CITIBANK', 'MERS', 'STATE TAX COMMISSION', 'BUSINESS',
	'CU', 'BK', 'UN', 'PA', 'DOLLAR', 'ASSN', 'REVOLUTION', 'COMMUNITY', 'PLACE', 'SPECTRUM'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')

export default class CivilProducer extends AbstractProducer {
    urls = {
        generalInfoPage: 'http://www.wcdeeds.us/dts/Navigate.asp?SimpleSearch.x=42&SimpleSearch.y=16'
    }

    xpaths = {
        isPageLoaded: '//input[@value="Detail Data"]'
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
            await this.browserPages.generalInfoPage.setDefaultNavigationTimeout(60000);
            await this.browserPages.generalInfoPage.goto(this.urls.generalInfoPage, {waitUntil: 'load'});
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

    async getDateRangeString(date: any, today: any): Promise<any> {        
        const day = ("00" + (date.getDate())).slice(-2);
        const month = ("00" + (date.getMonth() + 1)).slice(-2);
        const year =  date.getFullYear();

        const day1 = ("00" + (today.getDate())).slice(-2);
        const month1 = ("00" + (today.getMonth() + 1)).slice(-2);
        const year1 =  today.getFullYear();

        return { from: {day: day, month: month, year: year}, to: {day: day1, month: month1, year: year1} };
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let countRecords = 0;
        try {            
            // setting the date rage
            const dateRange = await this.getDateRange('Pennsylvania', 'Westmoreland');
            let dateRangeStr = await this.getDateRangeString(dateRange.from, dateRange.to);
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            await Promise.all([
                page.select('select[name="StartMonth"]', months[dateRangeStr.from.month - 1]),
                page.select('select[name="StartDay"]', dateRangeStr.from.day.toString()),
                page.select('select[name="StartYear"]', dateRangeStr.from.year.toString()),
                page.select('select[name="EndMonth"]', months[dateRangeStr.to.month - 1]),
                page.select('select[name="EndDay"]', dateRangeStr.to.day.toString()),
                page.select('select[name="EndYear"]', dateRangeStr.to.year.toString())
            ])

            const searchClickResult = await this.waitForSuccess(async () => {
                await Promise.all([
                    page.click('input[value="Detail Data"]'),
                    page.waitForNavigation()
                ])
            });
            if (!searchClickResult) {
                return false;
            }
            
            const results = await page.$x('//table[@align="Top"]/tbody');
            const tableXpath = '//table[@align="Top"]';
            if (results.length > 0) {
                for (let i = 0; i < results.length; i++) {
                    let caseID = await results[i].evaluate(el => el.children[1].children[0].textContent?.trim());
                    caseID = caseID?.split(' ')[1];
                    let date = await results[i].evaluate(el => el.children[2].children[0].textContent?.trim());
                    date = date?.split(' ')[1];
                    let type = await results[i].evaluate(el => el.children[3].children[0].textContent?.trim());
                    type = type?.split(' ')[2];
                    let namesHandle = await page.$x(`${tableXpath}[${i + 1}]/tbody//tbody/tr[2]`);
                    if (namesHandle.length == 0) {
                        namesHandle = await page.$x(`${tableXpath}[${i + 1}]/tbody//tbody/tr[1]`);
                    }
                    const nameText = await namesHandle[0].evaluate(el => el.children[2].textContent?.trim());
                    const names = nameText?.split('/');
                    for (let name of names!) {
                        name = name.trim();
                        if (this.isEmptyOrSpaces(name!) || removeRowRegex.test(name)) {
                            continue;
                        }

                        const parserName: any = this.newParseName(name);
                        if(parserName.type && parserName.type == 'COMPANY'){
                            continue;
                        }
                        if (await this.getData(page, name.trim(), type, date, caseID)) {
                            countRecords++
                        }  
                    }
                     
                }
            } else {
                console.log('No Records')
            }
            await AbstractProducer.sendMessage('Westmoreland', 'Pennsylvania', countRecords, 'Civil & Lien');
            await page.close();
            await this.browser?.close();
            return true;
        }
        catch (error) {
            console.log('Error: ', error);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Westmoreland', 'Pennsylvania', countRecords, 'Civil & Lien', errorImage);
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
                console.log(`retrying search -- ${retry_count}`);
            }
        }
        return true;
    }

    async getData(page: puppeteer.Page, name: any, type: any, date: any, caseID: any): Promise<any> {
        const { firstName, lastName, middleName, fullName, suffix } = this.newParseName(name!);
        let practiceType = this.getPracticeType(type);
        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({ name: productName }).exec();

        const data = {
            'caseUniqueId': caseID,
            'Property State': 'PA',
            'County': 'Westmoreland',
            'First Name': firstName,
            'Last Name': lastName,
            'Middle Name': middleName,
            'Name Suffix': suffix,
            'Full Name': fullName,
            "vacancyProcessed": false,
            fillingDate: date,
            'productId': prod._id,
            originalDocType: type
        };

        return (await this.civilAndLienSaveToNewSchema(data));
    }
     // To check empty or space
    isEmptyOrSpaces(str: string) {
        return str === null || str.match(/^\s*$/) !== null;
    }
}