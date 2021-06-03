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
    'CU', 'BK', 'UN', 'PA', 'DOLLAR', 'ASSN', 'REVOLUTION', 'COMMUNITY', 'PLACE', 'SPECTRUM',
    'BAR OF CALIFORNIA', 'COMPENSATION', 'STATE', 'TARGET', 'CAPISTRANO', 'UNIFIED', 'CENTER', 'WEST',
    'MASSAGE', 'INTERINSURANCE', 'PARTNERS', 'COLLECTIONS', 'N A', 'OFFICE', 'HUMAN', 'FAMILY',
    'INTERBANK', 'BBVA', 'HEIRS', 'EECU', 'BBVA', 'FIRSTBANK', 'GROUP', 'INTERBANK', 'GRANTEE', 'SCHOOL', 'DELETE', 'LIVING', 
    'LOANDEPOTCOM', 'JOINT', 'TEXASLENDINGCOM', 'FINANCIAL', 'PRIMELENDING', 'BOKF', 'USAA', 'IBERIABANK',
    'DBA', 'GOODMORTGAGECOM', 'BENEFICIARY', 'HOMEBUYERS', 'NEXBANK', 'ACCESSBANK', 'PROFIT', 'DATCU',
    'CFBANK', 'CORPORTION', 'LOANDEPOTCOM', 'CAPITAL', 'HOMEBANK', 'FSB', 'FELLOWSHIP', 'ASSOCIATES',
    'ACADEMY', 'VENTURE', 'REVOCABLE', 'CONSTRUCTION', 'HOMETOWN', 'ORANGE', 'CALIFORNIA', 'X',
    'NATIONALBK', 'MICHIGAN', 'FOUNDATION', 'GRAPHICS', 'UNITY', 'NORTHPARK', 'PLAZA', 'FOREST', 'REALTY', 
    'OUTDOORSOLUTIONS', 'NEWREZ', 'LOANPAL', 'MICROF', 'GRAPHICS', 'CARRINGTON', 'Pennsylvania', 'DISTRICT',
    'CLUB', 'GIVEN', 'NONE', 'INIMPENDENT', 'TRUS', 'AND', 'TRUST', 'CLINTON', 'WASHINGTON', 'NATIONWIDE',
    'INVESTMENT', 'INDIANA', 'PHASE'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')

export default class CivilProducer extends AbstractProducer {
    urls = {
        generalInfoPage: 'https://i2e.uslandrecords.com/NJ/Gloucester/D/Default.aspx'
    }

    xpaths = {
        isPageLoaded: '//input[@id="SearchFormEx1_btnSearch"]'
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

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let countRecords = 0;
        try {
            try {
                await page.select('select[name="SearchCriteriaName1$DDL_SearchName"]', 'Recorded Land Recorded Date Search');
            } catch (error) {
                
            }
            const dateRange = await this.getDateRange('New Jersey', 'Gloucester');
            let fromDate = this.getFormattedDate(dateRange.from);
            let date = new Date();
            date.setDate(dateRange.to.getDate() - 1);
            let toDate = this.getFormattedDate(date);

            // setting date range
            await page.waitForXPath('//input[@id="SearchFormEx1_DRACSTextBox_DateFrom"]', {visible: true});
            const [fromDateHandle] = await page.$x('//input[@id="SearchFormEx1_DRACSTextBox_DateFrom"]');
            await fromDateHandle.click({clickCount: 3})
            await fromDateHandle.press('Backspace');
            await fromDateHandle.type(fromDate, {delay: 100});
            const [toDateHandle] = await page.$x('//input[@id="SearchFormEx1_DRACSTextBox_DateTo"]');
            await toDateHandle.click({clickCount: 3})
            await toDateHandle.press('Backspace');
            await toDateHandle.type(toDate, {delay: 100});

            // click search button
            let retries = 0;
            let isClicked = false;
            while (!isClicked) {                    
                const [searchButtonHandle] = await page.$x('//input[@id="SearchFormEx1_btnSearch"]');
                await searchButtonHandle.focus();
                await searchButtonHandle.click();

                try {
                    const alert = await page.$x('//div[@id="MessageBoxCtrl1_WidgetContainer"]');
                    if (alert.length > 0) {
                        console.log('No Records');
                    } else {
                        let pageNum = 1;
                        let isLast = false;
                        while (!isLast) {
                            await page.waitForXPath(`//table[@id="DocList1_ctl10"]/tbody/tr/td[3]/a[text()="${pageNum}" and @disabled="disabled"]`);
                            await page.waitForXPath('//div[@id="DocList1_ContentContainer1"]');
                            const results = await page.$x('//div[@id="DocList1_ContentContainer1"]//table//tbody/tr//tr[contains(@class, "Row")]');

                            for (let i = 0; i < results.length; i++) {
                                // click search button     
                                let retries1 = 0;
                                let caseID;
                                while (true) {
                                    let caseHandle = await page.$x('//a[contains(@id, "ButtonRow_Doc")]');
                                    caseID = await caseHandle[i].evaluate(el => el.textContent?.trim());
                                    const linkHandle = await page.$x(`//div[@id="DocList1_ContentContainer1"]//table//tbody/tr[contains(@class, "DataGrid")][${i + 1}]/td[2]/a`);
                                    await linkHandle[0].click();
                                    try {
                                        await page.waitForXPath(`//table[@id="DocDetails1_DetailsTable"]//table[@id="DocDetails1_Table_Details"]//tr[@class="DataGridRow"]/td[text()="${caseID}"]`);
                                    } catch (error) {
                                        retries1++;
                                        console.log(`retrying open...${retries1}`);
                                        if (retries1 > 15) return false;
                                        await page.waitFor(1000);
                                        continue;
                                    }
                                    break;
                                }
                                
                                const data = await page.$x('//table[@id="DocDetails1_DetailsTable"]//table[@id="DocDetails1_Table_Details"]//tr[@class="DataGridRow"]');
                                const date = await data[0].evaluate(el => el.children[1].textContent?.trim());
                                const type = await data[0].evaluate(el => el.children[3].textContent?.trim());
                                let nameHandles = await page.$x('//table[@id="DocDetails1_DetailsTable"]//table[@id="DocDetails1_Table_GrantorGrantee"]//tr[contains(@class, "DataGrid")]/td[text()="Grantee"]/parent::tr/td[1]/a');
                                if (nameHandles.length == 0) {
                                    nameHandles = await page.$x('//table[@id="DocDetails1_DetailsTable"]//table[@id="DocDetails1_Table_GrantorGrantee"]//tr[contains(@class, "DataGrid")]/td[text()="Mortgagee"]/parent::tr/td[1]/a');
                                }
                                for (const nameHandle of nameHandles) {
                                    const name = await nameHandle.evaluate(el => el.textContent?.trim());
                                    if (this.isEmptyOrSpaces(name!) || removeRowRegex.test(name!)) {
                                        continue;
                                    }
                                    const parserName: any = this.newParseName(name!);
                                    if(parserName.type && parserName.type == 'COMPANY'){
                                        continue;
                                    }
                                    if (await this.getData(page, name, type, date, caseID)) {
                                        countRecords++
                                    }  
                                }
                            }
                            
                            const nextElement = await page.$x('//a[@id="DocList1_LinkButtonNext"]');
                            if (nextElement.length > 0) {
                                pageNum++;
                                isLast = false;
                                await nextElement[0].click();
                            } else {
                                isLast = true;
                            }
                        }
                    }
                    isClicked = true;
                } catch (error) {
                    retries++;
                    console.log(`retrying...${retries}`);
                    if (retries > 3) return false;
                    await page.waitFor(1000);
                    isClicked = false;
                }
            }

            await AbstractProducer.sendMessage('Gloucester', 'New Jersey', countRecords, 'Civil & Lien');
            await page.close();
            await this.browser?.close();
            console.log('------', countRecords, '------')
            return true;
        }
        catch (error) {
            console.log('Error: ', error);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Gloucester', 'New Jersey', countRecords, 'Civil & Lien', errorImage);
        }

        return false;
    }

    async getData(page: puppeteer.Page, name: any, type: any, date: any, caseID: any): Promise<any> {
        const { firstName, lastName, middleName, fullName, suffix } = this.newParseName(name!);
        let practiceType = this.getPracticeType(type);
        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({ name: productName }).exec();

        const data = {
            'caseUniqueId': caseID,
            'Property State': 'NY',
            'County': 'Gloucester',
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