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
    'ACADEMY', 'VENTURE', 'REVOCABLE', 'CONSTRUCTION', 'HOMETOWN', 'ORANGE', 'CALIFORNIA', 'TRANSPORT', 'NON-RECORD', 
    'CHICAGO', 'STATE', 'COMP', 'SUMMIT', 'COURTS', 'CONDOMINIU', 'FINANCIAL', 'OFFICE', 'FORETHOUGHT', 'COM', 'ST', 'WORKERS',
    'MARKET', 'ENERGY', 'GOVERNMENT', 'IDOC', 'DPRT', 'ELECTRIC', 'TRADITIONS', 'REGIONAL', 'WELCOME', 'LILLIE',
    'UNKNOWN', 'VILLAGE', 'TRANSPORTATION', 'GLENVIEW', 'CPD', 'CENTRAL', 'NONE', 'Defender', 'Baltimore', 'Inc', 'NAME'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')

export default class CivilProducer extends AbstractProducer {
    urls = {
        generalInfoPage: 'https://sussex.landrecordsonline.com/sussex/search.do?indexName=opr'
    }

    xpaths = {
        isPageLoaded: '//a[@id="AdvSearch"]'
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
        const url = 'https://sussex.landrecordsonline.com/sussex/search.do?indexName=opr';
        try {
            const dateRange = await this.getDateRange('New Jersey', 'Sussex');
            let date = dateRange.from;
            let today = dateRange.to;
            let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24)) - 1;
            for (let i = days < 0 ? 1 : days; i >= 0; i--) { 
                const AdvSearchHandle = await page.$x('//a[@id="AdvSearch"]');
                if (AdvSearchHandle.length > 0) {
                    await AdvSearchHandle[0].click();
                    await page.waitForXPath('//input[@name="RecDate"]', {visible: true});
                }
                let dateSearch = new Date();
                dateSearch.setDate(dateSearch.getDate() - i);
                console.log('Start search with date: ', dateSearch.toLocaleDateString('en-US'));   
                const dateHandle = await page.$x('//input[@name="RecDate"]');
                await dateHandle[0].click({clickCount: 3});
                await dateHandle[0].press('Backspace');
                await dateHandle[0].type(dateSearch.toLocaleDateString('en-US', {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit"
                }), {delay: 100});
                await dateHandle[1].click({clickCount: 3});
                await dateHandle[1].press('Backspace');
                await dateHandle[1].type(dateSearch.toLocaleDateString('en-US', {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit"
                }), {delay: 100});
                
                await Promise.all([
                    page.click('button.searchAdv'),
                    page.waitForNavigation()
                ])
                
                let pageNum = 1;
                while (true) {
                    const rows = await page.$x('//div[@id="documents"]//tbody//td[text()="Grantee"]/parent::tr');
                    if (rows.length > 0) {
                        for (let i = 0; i < rows.length; i++) {
                            let caseID = await rows[i].evaluate(el => el.children[0].children[0].textContent?.trim());
                            let name = await rows[i].evaluate(el => el.children[2].textContent?.trim());
                            let date = await rows[i].evaluate(el => el.children[1].textContent?.trim());
                            let type = await rows[i].evaluate(el => el.children[4].textContent?.trim());
        
                            if (this.isEmptyOrSpaces(name!)) {
                                continue;
                            }
                            if (removeRowRegex.test(name!)) {
                                continue;
                            }
                            const parserName: any = this.newParseName(name!);
                            if(parserName.type && parserName.type == 'COMPANY'){
                                continue;
                            }
                            if (await this.getData(page, name!.trim(), type, date, caseID)) {
                                countRecords++
                            }  
                        }
                        const nextEL = await page.$x(`//a[text()="${pageNum + 1}"]`);
                        if (nextEL.length > 0) {
                            pageNum++;
                            const result = await this.waitForSuccess(async () => {
                                await Promise.all([
                                    nextEL[0].click(),
                                    page.waitForNavigation()
                                ])
                            })
                            if (!result) {
                                break;
                            }

                            let retry_count = 1;
                            while (true) {
                                if (retry_count > 3) {
                                    break;
                                }
                                try {
                                    await page.waitForXPath(`//span[text()="${pageNum}"]`, {visible: true});
                                    break;
                                } catch (error1) {
                                    console.log('retrying --- ', retry_count);
                                    retry_count++;
                                    await page.reload();
                                }
                            }
                        } else {
                            break;
                        }
                    } else {
                        break;
                    }
                }
                await page.goto(url, {waitUntil: 'load'});
            }
            await AbstractProducer.sendMessage('Sussex', 'New Jersey', countRecords, 'Civil & Lien');
            return true;
        }
        catch (error) {
            console.log(error);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Sussex', 'New Jersey', countRecords, 'Civil & Lien', errorImage);
        }
        
        return false;
    }

    async waitForSuccess(func: Function): Promise<boolean> {
        let retry_count = 0;
        while (true){
            if (retry_count > 25){
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

    async getData(page: puppeteer.Page, name: any, type: any, date: any, caseID: any): Promise<any> {
        const { firstName, lastName, middleName, fullName, suffix } = this.newParseName(name!);
        let practiceType = this.getPracticeType(type);
        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({ name: productName }).exec();
        
        const data = {
            'caseUniqueId': caseID,
            'Property State': 'NJ',
            'County': 'Sussex',
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