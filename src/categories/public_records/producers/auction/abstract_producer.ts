import puppeteer from 'puppeteer';

import { IPublicRecordProducer } from '../../../../models/public_record_producer';
import db, { PublicRecordOwner, PublicRecordOwnerProductProperty, PublicRecordProperty } from '../../../../models/db';
// config
import { config as CONFIG } from '../../../../config';
import { IConfigEnv } from '../../../../iconfig';
const config: IConfigEnv = CONFIG[process.env.NODE_ENV || 'production'];

import SnsService from '../../../../services/sns_service';
import axios from 'axios';
import { saveToOwnerProductPropertyByProducer } from '../../../../services/general_service';

export default abstract class AbstractProducer {
    browser: puppeteer.Browser | undefined;
    browserPages = {
        generalInfoPage: undefined as undefined | puppeteer.Page
    };
    productId = '';
    stateToCrawl: string;
    publicRecordProducer: IPublicRecordProducer;
    
    abstract async init(): Promise<boolean>;
    abstract async read(): Promise<boolean>;
    abstract async parseAndSave(): Promise<boolean>;

    ///////////////////////////////////////////////////////////////////////
    // Send Notification   
    ///////////////////////////////////////////////////////////////////////
    static async sendMessage(county: string, state: string, countRecords: number, sourceType: string) {
        // const snsService = new SnsService();
        // let topicName = SnsService.CIVIL_TOPIC_NAME;
        // if (! await snsService.exists(topicName)) {
        //     await snsService.create(topicName);
        // }

        // if (! await snsService.subscribersReady(topicName, SnsService.CIVIL_UPDATE_SUBSCRIBERS)) {
        //     await snsService.subscribeList(topicName);
        // }
        // await snsService.publish(topicName, `${county} county, ${state} total ${sourceType} data saved: ${countRecords}`);
        console.log(`${county} county, ${state} total ${sourceType} data saved: ${countRecords}`);
    }

    constructor(publicRecordProducer: IPublicRecordProducer) {
        this.publicRecordProducer = publicRecordProducer;
        this.stateToCrawl = this.publicRecordProducer?.state || '';
    }

    async startParsing(finishScript?: Function) {
        try {
            // initiate pages
            let initialized = await this.init();
            if (initialized) {
                // check read
                console.log('Check newSource.read()', await this.read());
            } else {
                return false;
            }
            
            const practiceType = 'auction';
            const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
            this.productId = await db.models.Product.findOne({name: productName}).exec();
    
            // call parse and save
            let success = await this.parseAndSave();
            return success;
        } catch (error) {
            console.log(error);
            return false;
        } finally {
            //end the script and close the browser regardless of result
            await this.browser?.close();
            if (finishScript) finishScript();
        }
    }

    async launchBrowser(): Promise<puppeteer.Browser> {
        return await puppeteer.launch({
            headless: config.puppeteer_headless,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors', '--enable-features=NetworkService' ],
            ignoreDefaultArgs: ['--disable-extensions'],
            ignoreHTTPSErrors: true,
            timeout: 60000
        });
    }

    async setParamsForPage(page: puppeteer.Page): Promise<void> {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.0 Safari/537.36');
        await page.setViewport({ height: 800, width: 1200 });
    }

    protected normalizeStringForMongo(sourceString: string) {
        return sourceString.toLocaleLowerCase().replace('_', '-').replace(/[^A-Z\d\s\-]/ig, '').replace(/\s+/g, '-');
    }
    protected getFormattedDate(date: Date) {
        let year: any = date.getFullYear();
        let month: any = (1 + date.getMonth());
        let day: any = date.getDate();
        if (year === NaN || day === NaN || month === NaN) {
            return '';
        }
        month = month.toString().padStart(2, '0');
        day = day.toString().padStart(2, '0');
        return month + '/' + day + '/' + year;
    }
    
    protected async getTextByXpathFromPage(page: puppeteer.Page, xPath: string) {
        const [elm] = await page.$x(xPath);
        if (elm == null) {
            return '';
        }
        let text = await page.evaluate(j => j.innerText, elm);
        return text.replace(/\n/g, ' ');
    }

    protected async getTextByXpathFromPageV2(page: puppeteer.Page, xPath: string) {
        const [elm] = await page.$x(xPath);
        if (elm == null) {
            return '';
        }
        let text = await page.evaluate(j => j.textContent, elm);
        return text.trim();
    }

    async getInnerTextByXpathFromPage(page: puppeteer.Page, xPath: string): Promise<string> {
        const [elm] = await page.$x(xPath);
        if (elm == null) {
            return '';
        }
        let text = await page.evaluate(j => j.innerText, elm);
        return text;
    }
    protected enqueueAddresses = async (countyPropsObj: any) => {
        for (let county of Object.keys(countyPropsObj)) {
            console.log(`County: ${county}`);

            for (let propertyAddressObj of countyPropsObj[county]) {
                // Add propertyAddressObj to queue collection in mongo here
                console.log(`   - ${JSON.stringify(propertyAddressObj)}`)
            }
            // Produce message in SQS queue here
        }
    }

    async openPage(page: puppeteer.Page, link: string, xpath: string) {
        let retries = 0;
        while (retries < 15) {
            try {
                console.log(link);
                await page.goto(link, {waitUntil: 'load'});
                await page.waitForXPath(xpath);
                return true;
            } catch (error) {
                console.log(error);
                retries++;
                console.log(`Site loading was failed, retrying now... [${retries}]`);
            }
        }
        return false;
    }

    //////////// PARSE NAME METHODS & VARIABLES ////////////////
    companyIdentifiersArray = [
        'GENERAL', 'TRUSTEES', 'INC', 'ORGANIZATION',
        'CORP', 'CORPORATION', 'LLC', 'MOTORS', 'BANK', 'UNITED',
        'CO', 'COMPANY', 'FEDERAL', 'MUTUAL', 'ASSOC', 'AGENCY',
        'PARTNERSHIP', 'CHURCH', 'CITY', 'SECRETARY',
        'DEVELOPMENT', 'INVESTMENT', 'ESTATE', 'LLP', 'LP', 'HOLDINGS',
        'LOAN', 'CONDOMINIUM', 'CATHOLIC', 'INVESTMENTS', 'D/B/A', 'COCA COLA',
        'LTD', 'CLINIC', 'TODAY', 'PAY', 'CLEANING', 'COSMETIC', 'CLEANERS',
        'FURNITURE', 'DECOR', 'FRIDAY HOMES', 'MIDLAND', 'SAVINGS', 'PROPERTY',
        'ASSET', 'PROTECTION', 'SERVICES', 'TRS', 'ET AL', 'L L C', 'NATIONAL',
        'ASSOCIATION', 'MANAGMENT', 'PARAGON', 'MORTGAGE', 'CHOICE', 'PROPERTIES',
        'J T C', 'RESIDENTIAL', 'OPPORTUNITIES', 'FUND', 'LEGACY', 'SERIES',
        'HOMES', 'LOAN', 'FAM', 'PRAYER', 'WORKFORCE', 'HOMEOWNER', 'L P', 'UNION',
        'DEPARTMENT', 'LOANTRUST', 'OPT2', 'COMMONWEALTH', 'PENNSYLVANIA', 'UNIT', 
        'KEYBANK', 'LENDING', 'FUNDING', 'AMERICAN', 'COUNTY', 'AUTHORITY', 
        'LENDING', 'FCU', 'TOWNSHIP', 'SPECTRUM', 'CU', 'GATEWAY',
        'LOANS', 'MERS', 'SPECTRUM', 'CU', 'BK', 'UN', 'PA', 'DOLLAR', 'ASSN', 'MTG', 'REVOLUTION', 'NATL',
        'BUSINESS', 'CREDIT', 'COMMUNITY'
    ];
    suffixNamesArray = ['I', 'II', 'III', 'IV', 'V', 'ESQ', 'JR', 'SR'];
    removeFromNamesArray = ['ET', 'AS', 'DECEASED', 'DCSD', 'CP\/RS', 'JT\/RS', 'TR', 'TRUSTEE', 'TRUST'];

    // main method that will used in any producer.
    protected newParseName(name: string){
        name = name.trim();
        name = name.replace(/\s+/g,' ');
        let result;
        const companyRegexString = `\\b(?:${this.companyIdentifiersArray.join('|')})\\b`;
        const companyRegex = new RegExp(companyRegexString, 'i');
        const removeFromNameRegexString = `^(.*?)\\b(?:${this.removeFromNamesArray.join('|')})\\b.*?$`;
        const removeFromNamesRegex = new RegExp(removeFromNameRegexString, 'i');

        // check if the name is company
        if (name.match(companyRegex)) {
            result = {
                type: name.match(/(LLC)|(L L C)/i) ? 'LLC' : 'COMPANY',
                firstName: '',
                lastName: '',
                middleName: '',
                fullName: name.trim(),
                suffix: ''
            };
            return result;
        }

        // remove anything inside removeFromNamesArray because it's not company and it's a person.
        let cleanName = name.match(removeFromNamesRegex);
        if (cleanName) {
            name = cleanName[1];
        }

        // check if the name is contains comma or not
        if(name.match(/,/g)){
            result = this.parseNameWithComma(name);
        } else {
            result = this.parseNameWithoutComma(name);
        }
        return result;
    }

    // e.g WILSON, JACK W
    protected parseNameWithComma(name: string){
        let result;
        const suffixNamesRegex = new RegExp(`\\b(?:${this.suffixNamesArray.join('|')})\\b`, 'i');

        try {
            const suffix = name.match(suffixNamesRegex);
            name = name.replace(suffixNamesRegex, '');
            name = name.replace(/\s+/g, ' ');
            let ownersNameSplited = name.split(',');
            const defaultLastName = ownersNameSplited[0].trim();
            let firstNameParser = ownersNameSplited[1].trim().split(/\s+/g);
            const firstName = firstNameParser[0].trim();
            firstNameParser.shift();
            const middleName = firstNameParser.join(' ');
            const fullName = `${defaultLastName}, ${firstName} ${middleName} ${suffix ? suffix[0] : ''}`;
            result = {
                firstName,
                lastName: defaultLastName,
                middleName,
                fullName: fullName.trim(),
                suffix: suffix ? suffix[0] : ''
            };
        }
        catch (e) {

        }
        if (!result) {
            result = {
                firstName: '',
                lastName: '',
                middleName: '',
                fullName: name.trim(),
                suffix: ''
            };
        }
        return result;
    }

    // e.g WILSON JACK W
    protected parseNameWithoutComma(name: string){
        let result;

        const suffixNamesRegex = new RegExp(`\\b(?:${this.suffixNamesArray.join('|')})\\b`, 'i');
        const suffix = name.match(suffixNamesRegex);
        name = name.replace(suffixNamesRegex, '');
        name = name.replace(/\s+/g, ' ');
        let ownersNameSplited: any = name.split(' ');
        const defaultLastName = ownersNameSplited[0].trim();
        ownersNameSplited.shift();
        try {
            const firstName = ownersNameSplited[0].trim();
            ownersNameSplited.shift();
            const middleName = ownersNameSplited.join(' ');
            const fullName = `${defaultLastName}, ${firstName} ${middleName} ${suffix ? suffix[0] : ''}`;
            result = {
                firstName,
                lastName: defaultLastName,
                middleName,
                fullName: fullName.trim(),
                suffix: suffix ? suffix[0] : ''
            }
        } catch (e) {
        }
        if (!result) {
            result = {
                firstName: '',
                lastName: '',
                middleName: '',
                fullName: name.trim(),
                suffix: ''
            };
        }
        return result;
    }

    // Example of the data:
    // const Data = {
    //   "Property Address": propertyAddress.trim(),
    //   "Property City": propertyCity.trim(),
    //   "Property State": "FL",
    //   "Property Zip": propertyZip.trim(),
    //   "First Name": firstName,
    //   "Last Name": lastName.replace(",","").trim(),
    //   "Middle Name": middleName,
    //   "Name Suffix": suffixName,
    //   "Full Name": fullName.trim(),
    //   "County": "Hillsborough",
    //   "practiceType": practiceType,
    //   "vacancyProcessed": false,
    //   "fillingDate": civilDataFillingDate,
    //   "productId": prod._id
    // }

    async saveToOwnerProductProperty(data: any){
        // If the data has full name and property address
        return await saveToOwnerProductPropertyByProducer(data, this.publicRecordProducer);
    }

    ////// get random sleep in one minute //////
    getRandomInt(min: number, max: number) {
        return Math.floor(Math.random() * (max - min) ) + min;
    }
    async sleep(ms: number){
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    protected async randomSleepInOneMinute(){
        let randInt = this.getRandomInt(10000,60000);
        console.log("Sleeping with", randInt, "ms...");
        await this.sleep(randInt);
    }
    protected async randomSleepIn5Sec(){
        let randInt = this.getRandomInt(1000,5000);
        console.log("Sleeping with", randInt, "ms...");
        await this.sleep(randInt);
    }
}