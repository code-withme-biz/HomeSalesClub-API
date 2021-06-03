import puppeteer from 'puppeteer';

import { IPublicRecordProducer } from '../../../../models/public_record_producer';
import db, { PublicRecordOwner, PublicRecordOwnerProductProperty, PublicRecordProperty } from '../../../../models/db';
// config
import { config as CONFIG } from '../../../../config';
import { IConfigEnv } from '../../../../iconfig';
const config: IConfigEnv = CONFIG[process.env.NODE_ENV || 'production'];
import { clearPage, launchBrowser, saveToOwnerProductPropertyByProducer, setParamsForPage } from '../../../../services/general_service';

import SnsService from '../../../../services/sns_service';
import axios from 'axios';
const parseaddress = require('parse-address');
const addressit = require('addressit');

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

    browserPages = {
        generalInfoPage: undefined as undefined | puppeteer.Page
    };
    refetch = false;
    productId = '';
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
    static async sendMessage(county: string, state: string, countRecords: number, sourceType: string) {
        // const snsService = new SnsService();
        // let topicName = SnsService.CIVIL_TOPIC_NAME;
        // if (! await snsService.exists(topicName)) {
        //     await snsService.create(topicName);
        // }

        // if (! await snsService.subscribersReady(topicName, SnsService.CIVIL_UPDATE_SUBSCRIBERS)) {
        //     await snsService.subscribeList(topicName);
        // }
        console.log(`${county} county, ${state} total ${sourceType} data saved: ${countRecords}`);
    }

    constructor(publicRecordProducer: IPublicRecordProducer, refetch: boolean) {
        this.publicRecordProducer = publicRecordProducer;
        this.stateToCrawl = this.publicRecordProducer?.state || '';
        this.refetch = refetch;
    }

    async startParsing(finishScript?: Function) {
        try {
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
            
            const practiceType = 'code-violation';
            const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
            this.productId = await db.models.Product.findOne({name: productName}).exec();
    
            // call parse and save
            let success = await this.parseAndSave();

            //close all browsers and pages
            await this.closeAllBrowsers();

            return success;
        } catch (error) {
            console.log(error);

            //close all browsers and pages
            await this.closeAllBrowsers();

            return false;
        } finally {
            //end the script and close the browser regardless of result
            await this.browser?.close();

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

    async setParamsForPage(page: puppeteer.Page): Promise<void> {
        await setParamsForPage(page);
    }

    protected normalizeStringForMongo(sourceString: string) {
        return sourceString.toLocaleLowerCase().replace('_', '-').replace(/[^A-Z\d\s\-]/ig, '').replace(/\s+/g, '-');
    }
    protected getFormattedDate(date: Date) {
        let year = date.getFullYear();
        let month = (1 + date.getMonth()).toString().padStart(2, '0');
        let day = date.getDate().toString().padStart(2, '0');

        return month + '/' + day + '/' + year;
    }
    
    async getPrevCodeViolationId(sourceId: number, isDate = false, defaultValue: number = 1, withYear: boolean = false) {
        const lastItemDB: any = await db.models.OwnerProductProperty.findOne({
            productId: this.productId,
            codeViolationId: { $ne: null },
            $and: [
                { sourceId: {$ne: null} },
                { sourceId: sourceId }
            ]}).sort({codeViolationId: -1}).exec();
        console.log(lastItemDB)

        const DATERANGE = process.env.NODE_ENV === 'test' ? 30 : 30;
        if(lastItemDB && !this.refetch){
            let codeViolationId = lastItemDB.codeViolationId;
            if (isDate) {
                let newDate = new Date();
                newDate.setDate(newDate.getDate() - DATERANGE);
                if (newDate.getTime() > codeViolationId) codeViolationId = newDate.getTime();
                console.log('##############  Searching from [1] ', new Date(codeViolationId));
            } else {
                if (withYear) {
                    const updateStartNum = (startNum: number) => {
                        let year = (new Date()).getFullYear();
                        let length = startNum.toString().length - 4;
                        if (length < 0) return 1;
                        let initNum = parseInt(`${year}${'0'.padStart(length, '0')}`);
                        if (initNum > startNum) {
                            return 1;
                        }
                        return startNum % (10**length);
                    }
                    codeViolationId = updateStartNum(codeViolationId);
                } else {
                    if (codeViolationId < defaultValue) codeViolationId = defaultValue;
                }                
                console.log('############## Starting from ID [1] = ', codeViolationId);
            }
            return codeViolationId;
        } else {
            let codeViolationId: any;
            if (isDate) {
                if (defaultValue === 1) {
                    codeViolationId = new Date();
                    codeViolationId.setDate(codeViolationId.getDate() - DATERANGE);
                    console.log('############## Searching from [2] ', new Date(codeViolationId));
                    return codeViolationId.getTime();
                }
                console.log('############## Searching from [2] ', new Date(defaultValue));
                return defaultValue;
            } else {
                if (withYear) { // remove year
                    let length = defaultValue.toString().length - 4;
                    if (length < 0) return defaultValue;
                    codeViolationId = defaultValue % (10**length);
                } else {
                    codeViolationId = defaultValue;
                }                
            }
            console.log('############## Starting from ID [2] = ', codeViolationId);
            return codeViolationId;
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
        while (retries < 3) {
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
    async civilAndLienSaveToNewSchema(data: any){
        return await saveToOwnerProductPropertyByProducer(data, this.publicRecordProducer, this.county_page, this.whitepages_page, this.realtor_page, this.totalview_page);
    }

    // get data from code violation api
    async getCodeViolationData(baseurl: string, limit: number, offset: number, fillingDateKey: string = '', from: any = null, to: any = null, letterMonth: boolean = false) {
        
        const symbol = baseurl.match(/.json$/) ? '?' : '&';
        let url = `${baseurl}${symbol}$limit=${limit}&$offset=${offset}`;
        if (fillingDateKey && from && to) {
            let fromDate = from.toLocaleDateString('en-US', {
                year: "numeric",
                month:  letterMonth ? "short" : "2-digit",
                day: "2-digit"
            });
            let toDate = to.toLocaleDateString('en-US', {
                year: "numeric",
                month: letterMonth ? "short" : "2-digit",
                day: "2-digit"
            });
            if (!letterMonth) {
                fromDate = fromDate.split('/');
                fromDate = `${fromDate[2]}-${fromDate[0]}-${fromDate[1]}`;
                toDate = toDate.split('/');
                toDate = `${toDate[2]}-${toDate[0]}-${toDate[1]}`;
            }        
            url = `${url}&$where=${fillingDateKey} between '${fromDate}' and '${toDate}'`
        }
        console.log(`Fetching for URL: ${url}`);

        const response = await axios.get(url);
        if (response.status === 200) {
            const {data} = response;
            return {
                success: true,
                end: data.length < limit,
                data
            }
        }
        else {
            return {
                success: false
            }
        }
    }

    /**
     * CitizenService
     * @param installationID
     */
    async handleCitizenSerice(page: puppeteer.Page, installationID: number, sourceId: number) {
        const url = `https://www.citizenserve.com/Portal/PortalController?Action=showSearchPage&ctzPagePrefix=Portal_&installationID=${installationID}`;
        const isPageLoaded = await this.openPage(page, url, '//*[@id="filetype"]');
        if (!isPageLoaded) {
            console.log('Page loading failed');
            return 0;
        }
        await page.select('#filetype', 'Code');
        await page.waitForSelector('#address', {visible: true});
        await Promise.all([
            page.click('#submitRow button'),
            page.waitForNavigation()
        ]);

        let rows = await page.$x('//*[@id="resultContent"]/table/tbody/tr');
        if (rows.length === 0) {
            console.log('No records found');
            return 0;
        }

        let prevFillingDate = await this.getPrevCodeViolationId(sourceId, true, (new Date('1/1/2010')).getTime());
        let countRecords = 0;
        while (true) {
            let flag = false;
            rows = await page.$x('//*[@id="resultContent"]/table/tbody/tr');
            for (const row of rows) {
                let fillingdate = await row.evaluate(el => el.children[4].textContent) || '';
                fillingdate = fillingdate.replace(/\s+|\n/gm, ' ').trim();
                let casetype = await row.evaluate(el => el.children[6].textContent) || '';
                casetype = casetype.replace(/\s+/gm, ' ').trim();
                let property_address = await row.evaluate(el => el.children[1].textContent) || '';
                property_address = property_address.replace(/\s+/gm, ' ').trim();
                let codeViolationId = (new Date(fillingdate)).getTime();
                if (prevFillingDate > codeViolationId) {
                    flag = true;
                    break;
                }
                const data = {
                    'Property State': this.publicRecordProducer.state,
                    'County': this.publicRecordProducer.county,
                    'Property Address': property_address,
                    "vacancyProcessed": false,
                    "productId": this.productId,
                    fillingDate: fillingdate,
                    originalDocType: casetype,
                    sourceId: sourceId,
                    codeViolationId: codeViolationId
                };
                if (await this.civilAndLienSaveToNewSchema(data))
                    countRecords++;
            }
            if (flag) break;
            const [nextPageButton] = await page.$x('//*[@class="icon-arrow-right"]/ancestor::a[1]');
            if (nextPageButton) {
                await nextPageButton.click();
                await page.waitForXPath('//*[contains(@class, "icon-spin")]', {visible: true});
                await page.waitForXPath('//*[contains(@class, "icon-spin")]', {hidden: true});
                await this.sleep(1000);
            } else {
                break;
            }
        }
        return countRecords;
    }

    async getOffset(cnt_apis: number) {
        let offsets: any = '';
        if (this.publicRecordProducer.offset === '') {
            offsets = [];
            for (let i = 0 ; i < cnt_apis ; i++)
                offsets.push(0);
            offsets = offsets.join(' | ');
            this.publicRecordProducer.offset = offsets;
            await this.publicRecordProducer.save();
        }
        return this.publicRecordProducer.offset.split(' | ').map((of:string) => parseInt(of));
    }

    async updateOffset(offsets: number[]) {
        let offsets_ = offsets.join(' | ');
        this.publicRecordProducer.offset = offsets_;
        await this.publicRecordProducer.save();
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

    getStreetAddress = (full_address:string) => {
        const parsed = addressit(full_address);
        let street_address = (parsed.number ? parsed.number : '') + ' ' + (parsed.street ? parsed.street : '') + ' ' + (parsed.unit ? '#'+parsed.unit : '');
        street_address = street_address.replace(/\s+/, ' ').trim();
        return street_address;
    }

    isEmptyOrSpaces = (str: string) => {
        return str === null || str.match(/^\s*$/) !== null;
    }
}