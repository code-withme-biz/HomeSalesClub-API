import puppeteer, { launch } from 'puppeteer';
import { S3 } from 'aws-sdk';

import { IPublicRecordProducer } from '../../../models/public_record_producer';
import db, { PublicRecordOwner, PublicRecordOwnerProductProperty, PublicRecordProperty } from '../../../models/db';
// config
import { config as CONFIG } from '../../../config';
import { IConfigEnv } from '../../../iconfig';
const config: IConfigEnv = CONFIG[process.env.NODE_ENV || 'production'];

import SnsService from '../../../services/sns_service';
import S3Service from '../../../services/s3_service';
const parseFullName = require('parse-full-name').parseFullName;
import { saveToOwnerProductPropertyByProducer, getPracticeType, launchBrowser, launchTorBrowser, clearPage, setParamsForPage } from '../../../services/general_service';
import { PRACTICE_TYPES } from '../../../scripts/db/public_record_seed_generator';

export default abstract class AbstractProducer {
    browser: puppeteer.Browser | undefined;
    county_browser: puppeteer.Browser | undefined;
    county_page: puppeteer.Page | undefined;
    realtor_browser: puppeteer.Browser | undefined;
    realtor_page: puppeteer.Page | undefined;
    whitepages_browser: puppeteer.Browser | undefined;
    whitepages_page: puppeteer.Page | undefined;
    totalview_browser: puppeteer.Browser | undefined;
    totalview_page: puppeteer.Page | undefined;
    is_tor: boolean | undefined;

    browserPages = {
        generalInfoPage: undefined as undefined | puppeteer.Page
    };

    stateToCrawl: string;
    publicRecordProducer: IPublicRecordProducer;
    stateAbbreviationArray = [
        ['arizona', 'az'],
        ['alabama', 'al'],
        ['alaska', 'ak'],
        ['arkansas', 'ar'],
        ['california', 'ca'],
        ['colorado', 'co'],
        ['connecticut', 'ct'],
        ['delaware', 'de'],
        ['florida', 'fl'],
        ['georgia', 'ga'],
        ['hawaii', 'hi'],
        ['idaho', 'id'],
        ['illinois', 'il'],
        ['indiana', 'in'],
        ['iowa', 'ia'],
        ['kansas', 'ks'],
        ['kentucky', 'ky'],
        ['louisiana', 'la'],
        ['maine', 'me'],
        ['maryland', 'md'],
        ['massachusetts', 'ma'],
        ['michigan', 'mi'],
        ['minnesota', 'mn'],
        ['mississippi', 'ms'],
        ['missouri', 'mo'],
        ['montana', 'mt'],
        ['nebraska', 'ne'],
        ['nevada', 'nv'],
        ['new-hampshire', 'nh'],
        ['new-jersey', 'nj'],
        ['new-mexico', 'nm'],
        ['new-york', 'ny'],
        ['north-carolina', 'nc'],
        ['north-dakota', 'nd'],
        ['ohio', 'oh'],
        ['oklahoma', 'ok'],
        ['oregon', 'or'],
        ['pennsylvania', 'pa'],
        ['rhode-island', 'ri'],
        ['south-carolina', 'sc'],
        ['south-dakota', 'sd'],
        ['tennessee', 'tn'],
        ['texas', 'tx'],
        ['utah', 'ut'],
        ['vermont', 'vt'],
        ['virginia', 'va'],
        ['washington', 'wa'],
        ['west-virginia', 'wv'],
        ['wisconsin', 'wi'],
        ['wyoming', 'wy'],
    ];

    abstract async init(): Promise<boolean>;
    abstract async read(): Promise<boolean>;
    abstract async parseAndSave(): Promise<boolean>;

    ///////////////////////////////////////////////////////////////////////
    // Send Notification
    ///////////////////////////////////////////////////////////////////////
    static async sendMessage(county: string, state: string, countRecords: number, sourceType: string, imageUrl: string='', noScript:boolean=false) {
        // const snsService = new SnsService();
        // let topicName = SnsService.CIVIL_TOPIC_NAME;
        // if (! await snsService.exists(topicName)) {
        //     await snsService.create(topicName);
        // }

        // if (! await snsService.subscribersReady(topicName, SnsService.CIVIL_UPDATE_SUBSCRIBERS)) {
        //     await snsService.subscribeList(topicName);
        // }
        if (noScript) {
            console.log(`NO SCRIPT ${county} county, ${state} for ${sourceType}`);
        //     await snsService.publish(topicName, `NO SCRIPT ${county} county, ${state} for ${sourceType}`);
        } else {
            console.log(`${county} county, ${state} total ${sourceType} data saved: ${countRecords}`);
        //     const optional_data = imageUrl ? `Image Url: ${imageUrl}` : ''
        //     await snsService.publish(topicName, `${county} county, ${state} total ${sourceType} data saved: ${countRecords}\n${optional_data}`);
        }
    }

    constructor(publicRecordProducer: IPublicRecordProducer) {
        this.publicRecordProducer = publicRecordProducer;
        this.stateToCrawl = this.publicRecordProducer?.state || '';
    }

    async startParsing(finishScript?: Function) {
        try {
            this.is_tor = false;
            this.county_browser = await launchBrowser();
            this.county_page = await this.county_browser.newPage();
            await clearPage(this.county_page);
            await setParamsForPage(this.county_page);

            this.realtor_browser = await launchBrowser();
            this.realtor_page = await this.realtor_browser.newPage();
            await clearPage(this.realtor_page);
            await setParamsForPage(this.realtor_page);

            this.whitepages_browser = await launchBrowser();
            this.whitepages_page = await this.whitepages_browser.newPage();
            await setParamsForPage(this.whitepages_page);
            await clearPage(this.whitepages_page);

            this.totalview_browser = await launchBrowser();
            this.totalview_page = await this.totalview_browser.newPage();
            await clearPage(this.totalview_page);
            await setParamsForPage(this.totalview_page);
            
            // initiate pages
            let initialized = await this.init();
            if (initialized) {
                // check read
                console.log('Check newSource.read()', await this.read());
            } else {
                return false;
            }
            // call parse and save
            let success = await this.parseAndSave();

            //close all browsers and pages
            await this.closeAllBrowsers();

            return success;
        } 
        catch (error) {
            console.log(error);

            //close all browsers and pages
            await this.closeAllBrowsers();

            return false;
        } finally {
            //end the script and close the browser regardless of result
            
            //close all browsers and pages
            await this.closeAllBrowsers();

            if (finishScript) finishScript();
        }
    }

    async closeAllBrowsers() {
        await this.county_browser?.close();
        await this.whitepages_browser?.close();
        await this.realtor_browser?.close();
        await this.totalview_browser?.close();
        await this.browser?.close();
    }

    async launchBrowser(): Promise<puppeteer.Browser> {
        return await launchBrowser();
    }

    async launchTorBrowser(): Promise<puppeteer.Browser> {
        return await launchTorBrowser();
    }

    async setParamsForPage(page: puppeteer.Page): Promise<void> {
        await setParamsForPage(page);
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
    protected async getDateRange(state: string, county: string, dateRange = 30) {
        console.log('\n// =============== FETCHING DATE RANGE ===============')
        let normalizedState = this.normalizeStringForMongo(state);
        if(normalizedState.length > 2){
            for(let i = 0; i < this.stateAbbreviationArray.length; i++){
                if(this.stateAbbreviationArray[i][0] == normalizedState.trim()){
                    normalizedState = this.stateAbbreviationArray[i][1]; // e.g: florida to fl
                    break;
                }
            }
        }
        const normalizedCounty = this.normalizeStringForMongo(county);
        const categories = PRACTICE_TYPES;
        let productNamesArray = [];
        for (let category of categories) {
            let normalizedCategory = this.normalizeStringForMongo(category);
            let productName = `/${normalizedState}/${normalizedCounty}/${normalizedCategory}`;
            productNamesArray.push(productName);
        }
        let queryResultsArray = await db.models.Product.find({ name: { $in: productNamesArray } }).exec();
        let productIdsArray = [];
        for (let productDoc of queryResultsArray) {
            productIdsArray.push(productDoc._id);
        }

        let threedaysago = new Date();
        threedaysago.setDate(threedaysago.getDate()-3);

        const lastItemDB: any = await db.models.OwnerProductProperty.aggregate([
            {
                $match: {
                    fillingDate: { "$exists": true, "$nin": [ null, "" ] },
                    productId: { $in: productIdsArray }
                }
            }, {
                $project: {
                    fillingDate: {
                        $dateFromString: {
                            dateString: '$fillingDate',
                            onError: this.getFormattedDate(threedaysago)
                        }
                    }
                }
            }, {
                $sort: { fillingDate : -1}
            }, {
                $limit: 1
            }
        ]);
         const lastfillingDate = lastItemDB && lastItemDB.length > 0 ? lastItemDB[0].fillingDate : null;

        // const lastItemDB = await db.models.OwnerProductProperty.findOne({
        //     fillingDate: { "$exists": true, "$ne": null },
        //     productId: { $in: productIdsArray }
        // }, null, { sort: { fillingDate: -1 } }); // check last item from DB

        let fromDate;
        const DATERANGE = dateRange;
        if (lastfillingDate) {
            fromDate = new Date(lastfillingDate);
            if (isNaN(fromDate.getTime())) {
                fromDate = new Date();
                fromDate.setDate(fromDate.getDate() - DATERANGE);
            } else {
                fromDate.setDate(fromDate.getDate() - 1);
                const date = new Date();
                date.setDate(date.getDate()-DATERANGE);
                if (fromDate < date) {
                    fromDate = date;
                }
            }
        } else {
            fromDate = new Date();
            fromDate.setDate(fromDate.getDate() - DATERANGE);
        }
        let toDate = new Date();

        console.log('start date : ' + this.getFormattedDate(fromDate));
        console.log('end date : ' + this.getFormattedDate(toDate));
        console.log('\n');

        return {from: fromDate, to: toDate};
    }

    protected getSeparateDate(date: Date) {
        let from_year = date.getFullYear().toString();
        let from_month = (1 + date.getMonth()).toString().padStart(2, '0');
        let from_day = date.getDate().toString().padStart(2, '0');
        return {
            year: from_year,
            month: from_month,
            day: from_day
        }
    }

    protected async getTextContent(elemHandle: puppeteer.ElementHandle[]): Promise<string> {
        let retStr = '';

        if (elemHandle.length) {
            for (let singleElemHandle of elemHandle) {
                retStr += (await singleElemHandle.evaluate(elem => elem.textContent))?.trim() + ' ';
            }
            return retStr.trim();
        } else {
            return '';
        }
    }

    protected usingLocalDb(): boolean {
        if (config.database_uri.includes('localhost') || config.database_uri.includes('127.0.0.1') || config.database_uri.includes('mongodb://mongo:27017/')) {
            console.log('Using localDB, environment set to testing. Bucket will not be used.')
            return true;
        }
        return false;
    }

    private s3 = new S3({
        apiVersion: '2006-03-01',
        region: 'us-east-2'
    })

    protected getFileFromS3Bucket = async (identifierString: string) => {
        const s3bucket = 'scraper-json-data2';
        const s3key = `producer-dependencies/${identifierString}`;

        const params = {
            'Bucket': s3bucket,
            'Key': s3key
        }

        return new Promise((resolve, reject) => {
            this.s3.getObject(params, (err: any, data: any) => {
                if (err) {
                    if (err.code === 'NoSuchKey') {
                        console.warn(`File not found: ${s3key}`);
                    } else {
                        console.warn(err);
                    }
                    resolve(false);
                } else {
                    resolve(data.Body);
                }
            })
        })
    }

    protected writeFileToS3Bucket = async (identifierString: string, stringifiedBody: string) => {
        const s3bucket = 'scraper-json-data2';
        const s3key = `producer-dependencies/${identifierString}`;

        const params = {
            'Body': stringifiedBody,
            'Bucket': s3bucket,
            'Key': s3key
        }

        return new Promise((resolve, reject) => {
            this.s3.putObject(params, (err: any, data: any) => {
                if (err) {
                    console.warn(err);
                    resolve(false);
                } else {
                    resolve(true);
                }
            })
        })
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

    protected getPracticeType(docType: string) {
        return getPracticeType(docType);
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
        'BUSINESS', 'CREDIT', 'COMMUNITY', 'HEALTH', 'ELECTRONIC', 'REGISTRATION', 'INSTRUMENT', 'EDUCATIONAL', 'BUILDERS', 'TAX ASSESSORS', 'APARTMENTS', 'ESTATES',
        'FINANCE', 'CAPITAL', 'SYSTEMS','SUBDIVISION', 'UNKNOWN', 'GROUP', 'CUSTOMER', 'AVENUE', 'CONFERENCE', 'SQUARE', 'VILLAGE', 'SHOPS', 'FINANCIAL', 'MEDICAL', 'INDUSTRIAL', 'HOSPITAL',
        'CITIBANK', 'TOWN OF'
    ];

    suffixNamesArray = ['I', 'II', 'III', 'IV', 'V', 'ESQ', 'JR', 'SR'];
    removeFromNamesArray = ['ET', 'AS', 'DECEASED', 'DCSD', 'CP\/RS', 'JT\/RS', 'TR', 'TRUSTEE', 'TRUST', 'ETAL', 'REVOCABLE LIVING'];

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

    // e.g Elizabeth J Starr
    protected newParseNameFML(name: string){
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

        // parse with parse-full-name library
        const parser = parseFullName(name);
        result = {
            firstName: parser.first,
            lastName: parser.last,
            middleName: parser.middle,
            fullName: `${parser.last != '' ? parser.last + ', ' : ''}${parser.first} ${parser.middle} ${parser.suffix}`.trim(),
            suffix: parser.suffix
        };

        return result;
    }

    /**
     * save records
     * @param results { parseName, docType, fillingDate }
     * @param state
     * @param county
     */
    async saveRecords(results: any[], state: string, county: string) {
        let records = 0;
        let index = 0;
        let products: any = {};

        console.log(`****** TOTAL LENGTH = ${results.length} ******`);
        for (const result of results) {
            const {parseName, docType, fillingDate} = result;
            // get productId
            const product = products[docType];
            let productId = null;
            if (product) {
                productId = product;
            } else {
                const practiceType = this.getPracticeType(docType);
                const productName = `/${state.toLowerCase()}/${county}/${practiceType}`;
                const prod = await db.models.Product.findOne({name: productName}).exec();
                products[docType] = productId = prod._id;
            }
            // save data
            const data = {
                'Property State': state.toUpperCase(),
                'County': county.toLowerCase(),
                'First Name': parseName.firstName,
                'Last Name': parseName.lastName,
                'Middle Name': parseName.middleName,
                'Name Suffix': parseName.suffix,
                'Full Name': parseName.fullName,
                "vacancyProcessed": false,
                fillingDate: fillingDate,
                productId: productId,
                originalDocType: docType
            };
            if (await this.civilAndLienSaveToNewSchema(data)) records++;
            index++;
            console.log(`****** Processed ${results.length} / ${index} ******`)
        }
        console.log(`****** Successfully Saved ${results.length} / ${records} ******`)

        return records;
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
    async civilAndLienSaveToNewSchema(data: any){
        // Using Tor Browser
        if( (this.normalizeStringForMongo(data['County']) == 'pima' && data['Property State'] == 'AZ') || data['Property State'] == 'AR' || (this.normalizeStringForMongo(data['County']) == 'prince-william' && data['Property State'] == 'VA') || (this.normalizeStringForMongo(data['County']) == 'st-joseph' && data['Property State'] == 'IN') || (this.normalizeStringForMongo(data['County']) == 'sedgwick' && data['Property State'] == 'KS')){
            if(!this.is_tor){
                await this.county_page?.close();
                await this.county_browser?.close();
                this.county_browser = await this.launchTorBrowser();
                this.county_page = await this.county_browser.newPage();
                await clearPage(this.county_page);
                await setParamsForPage(this.county_page);
                this.is_tor = true;
            }
        }
        
        return await saveToOwnerProductPropertyByProducer(data, this.publicRecordProducer, this.county_page, this.whitepages_page, this.realtor_page, this.totalview_page);
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
    protected async randomSleepInOneSec(){
        let randInt = this.getRandomInt(500,1000);
        console.log("Sleeping with", randInt, "ms...");
        await this.sleep(randInt);
    }
    ////// Upload image on s3
    async uploadImageOnS3(page: puppeteer.Page): Promise<string> {
        try {
            console.log('**** Uploading screenshot on s3 ****');
            let base64String = await page.screenshot({type: 'jpeg'});
            const s3Service = new S3Service();
            const filename = this.publicRecordProducer.county + '-' + this.publicRecordProducer.state.toLowerCase() + '-error';
            const location = await s3Service.uploadBase64Image(S3Service.ERROR_SCREENSHOT_BUCKET_NAME, filename, base64String);
            return location;
        } catch (error) {
            console.log('**** Error during saving screenshot on s3 ****');
            return '';
        }
    }
}
