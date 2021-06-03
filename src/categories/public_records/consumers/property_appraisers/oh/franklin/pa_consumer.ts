import puppeteer from 'puppeteer';
import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
import { IPublicRecordAttributes } from '../../../../../../models/public_record_attributes'
const parser = require('parse-address');
const nameParsingService = require('../../consumer_dependencies/nameParsingServiceNew');

import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';
import { IProperty } from '../../../../../../models/property';

let index = 0;

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'https://treapropsearch.franklincountyohio.gov/'
    }

    xpaths = {
        isPAloaded: '//input[@value="Search"]'
    }

    constructor(publicRecordProducer: IPublicRecordProducer, ownerProductProperties: IOwnerProductProperty, browser: puppeteer.Browser, page: puppeteer.Page) {
        super();
        this.publicRecordProducer = publicRecordProducer;
        this.ownerProductProperties = ownerProductProperties;
        this.browser = browser;
        this.browserPages.propertyAppraiserPage = page;
    }

    readDocsToParse(): IOwnerProductProperty {
        return this.ownerProductProperties;
    }

    // use this to initialize the browser and go to a specific url.
    // setParamsForPage is needed (mainly for AWS), do not remove or modify it please.
    // return true when page is usable, false if an unexpected error is encountered.
    async init(): Promise<boolean> {
        if (!this.browserPages.propertyAppraiserPage || !this.browser) return false;
        await this.setParamsForPage(this.browserPages.propertyAppraiserPage);
        let retries = 0;
        while (true) {
          try {
            await this.browserPages.propertyAppraiserPage.goto(this.urls.propertyAppraiserPage, { waitUntil: 'load' });
            break;
          } catch (err) {
            console.log(err);
            retries++;
            if (retries > 3) {
                console.log('******** website loading failed');
                return false;
            }
            this.randomSleepIn5Sec();
            console.log(`******** website loading failed, retring... [${retries}]`);
          }
        }
        return true;
    };

    // use this as a middle layer between init() and parseAndSave().
    // this should check if the page is usable or if there was an error,
    // so use an xpath that is available when page is usable.
    // return true when it's usable, false if it errors out.
    async read(): Promise<boolean> {
        try {
            await this.browserPages.propertyAppraiserPage?.waitForXPath(this.xpaths.isPAloaded);
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    /**
     * convert address to required infos
     * @param document : IPublicRecordAttributes 
     *  full_address:  1527 N 23rd St, Lincoln, NE 68503
        street_name:   23rd St
        street_full:   1527 N 23rd St
        parsed
            number:     1527
            prefix:     N
            street:     23rd
            type:     St
            city:       Lincoln
            state:      NE
            zip:        68503
     */
    getAddress(document: IProperty): any {
        // 'Property Address': '162 DOUGLAS HILL RD',
        // 'Property City': 'WEST BALDWIN',
        // County: 'Cumberland',
        // 'Property State': 'ME',
        // 'Property Zip': '04091',
        const full_address = `${document['Property Address']}, ${document['Property City']}, ${document['Property State']} ${document['Property Zip']}`
        const parsed = parser.parseLocation(document['Property Address']);
        
        let street_name = parsed.street.trim();
        let street_full = document['Property Address'];
        let street_with_type = (parsed.number ? parsed.number : '') + ' ' + (parsed.prefix ? parsed.prefix : '') + ' ' + parsed.street + ' ' + (parsed.type ? parsed.type : '');
        street_with_type = street_with_type.trim();

        return {
            full_address,
            street_name,
            street_with_type,
            street_full,
            parsed
        }
    }

    /**
     * check if element exists
     * @param page 
     * @param selector 
     */
    async checkExistElement(page: puppeteer.Page, selector: string): Promise<Boolean> {
        const exist = await page.$(selector).then(res => res !== null);
        return exist;
    }

    /**
     * get textcontent from specified element
     * @param page 
     * @param root 
     * @param selector 
     */
    async getElementTextContent(page: puppeteer.Page, selector: string): Promise<string> {
        try {
            const existSel = await this.checkExistElement(page, selector);
            if (!existSel) return '';
            let content = await page.$eval(selector, el => el.textContent)
            return content ? content.trim() : '';
        } catch (error) {
            return '';
        }
    }
    /**
     * get innerHTML from specified element
     * @param page 
     * @param root 
     * @param selector 
     */
    async getElementHtmlContent(page: puppeteer.Page, selector: string): Promise<string> {
        try {
            const existSel = await this.checkExistElement(page, selector);
            if (!existSel) return '';
            const content = await page.$eval(selector, el => el.innerHTML)
            return content ? content : '';
        } catch (error) {
            return '';
        }
    }

    async getTextByXpathFromPage(page: puppeteer.Page, xPath: string): Promise<string> {
        const [elm] = await page.$x(xPath);
        if (elm == null) {
            return '';
        }
        let text = await page.evaluate(j => j.innerText, elm);
        return text.replace(/\n/g, ' ');
    }

    /**
     * analysis name
     * @param name 
     */
    discriminateAndRemove(name: string) : any {
        const companyIdentifiersArray = [ 'GENERAL', 'TRUSTEE', 'TRUSTEES', 'INC', 'ORGANIZATION', 'CORP', 'CORPORATION', 'LLC', 'MOTORS', 'BANK', 'UNITED', 'CO', 'COMPANY', 'FEDERAL', 'MUTUAL', 'ASSOC', 'AGENCY' , 'OF' , 'SECRETARY' , 'DEVELOPMENT' , 'INVESTMENTS', 'HOLDINGS', 'ESTATE', 'LLP', 'LP', 'TRUST', 'LOAN', 'CONDOMINIUM', 'CHURCH', 'CITY', 'CATHOLIC', 'D/B/A', 'COCA COLA', 'LTD', 'CLINIC', 'TODAY', 'PAY', 'CLEANING', 'COSMETIC', 'CLEANERS', 'FURNITURE', 'DECOR', 'FRIDAY HOMES', 'SAVINGS', 'PROPERTY', 'PROTECTION', 'ASSET', 'SERVICES', 'L L C', 'NATIONAL', 'ASSOCIATION', 'MANAGEMENT', 'PARAGON', 'MORTGAGE', 'CHOICE', 'PROPERTIES', 'J T C', 'RESIDENTIAL', 'OPPORTUNITIES', 'FUND', 'LEGACY', 'SERIES', 'HOMES', 'LOAN'];
        const removeFromNamesArray = ['ET', 'AS', 'DECEASED', 'DCSD', 'CP\/RS', 'JT\/RS', 'esq','esquire','jr','jnr','sr','snr','2','ii','iii','iv','md','phd','j.d.','ll.m.','m.d.','d.o.','d.c.','p.c.','ph.d.', '&'];
        const companyRegexString = `\\b(?:${companyIdentifiersArray.join('|')})\\b`;
        const removeFromNameRegexString = `^(.*?)\\b(?:${removeFromNamesArray.join('|')})\\b.*?$`;
        const companyRegex = new RegExp(companyRegexString, 'i');
        const removeFromNamesRegex = new RegExp(removeFromNameRegexString, 'i');
        let isCompanyName = name.match(companyRegex);
        if (isCompanyName) {
            return {
                type: 'company',
                name: name
            }
        }
      
        let cleanName = name.match(removeFromNamesRegex);
        if (cleanName) {
            name = cleanName[1];
        }
        return {
            type: 'person',
            name: name
      }
    }

    /**
     * Parse owner names
     * @param name_str : string
     * @param address : string
     */
    parseOwnerName(name_str: string): any[] {
        const result: any = {};
  
        let parserName = nameParsingService.newParseName(name_str);
  
        result['full_name'] = parserName.fullName;
        result['first_name'] = parserName.firstName;
        result['last_name'] = parserName.lastName;
        result['middle_name'] = parserName.middleName;
        result['suffix'] = parserName.suffix;
        return result;
    }

    getSuffix(name: string) : any {
        const suffixList = ['esq','esquire','jr','jnr','sr','snr','2','ii','iii','iv','md','phd','j.d.','ll.m.','m.d.','d.o.','d.c.','p.c.','ph.d.'];
        name = name.toLowerCase();
        for(let suffix of suffixList){
            let regex = new RegExp(' '+suffix, 'gm');
            if (name.match(regex)){
                return suffix;
            }
        }
        return '';
    }
    /**
     * Remove spaces, new lines
     * @param text : string
     */
    simplifyString(text: string): string {
        return text.replace(/( +)|(\n)/gs, ' ').trim();
    }

    /**
     * Compare 2 addresses
     * @param address1 
     * @param address2 
     */
    compareAddress(address1: any, address2: any): Boolean {
        const address1_number = address1.number===undefined ? '' : address1.number.trim().toUpperCase();
        const address2_number = address2 ? (address2.number===undefined ? '' : address2.number.trim().toUpperCase()) : '';
        const address1_prefix = address1 && address1.prefix===undefined ? '' : address1.prefix.trim().toUpperCase();
        const address2_prefix = address2 ? (address2.prefix===undefined ? '' : address2.prefix.trim().toUpperCase()) : '';
        const address1_type = address1.type===undefined ? '' : address1.type.trim().toUpperCase();
        const address2_type = address2 ? (address2.type===undefined ? '' : address2.type.trim().toUpperCase()) : '';
        const address1_street = address1.street===undefined ? '' : address1.street.trim().toUpperCase();
        const address2_street = address2 ? (address2.street===undefined ? '' : address2.street.trim().toUpperCase()) : '';

        return  (address1_number === address2_number) &&
                (address1_prefix === address2_prefix) &&
                (address1_type === address2_type) &&
                (address1_street === address2_street);
    }

    // the main parsing function. if read() succeeds, parseAndSave is started().
    // return true after all parsing is complete 

    // docsToParse is the collection of all address objects to parse from mongo.
    // !!! Only mutate document objects with the properties that need to be added!
    // if you need to multiply a document object (in case of multiple owners
    // or multiple properties (2-3, not 30) you can't filter down to one, use this.cloneMongoDocument(document);
    // once all properties from PA have been added to the document, call 
    async parseAndSave(docsToParse: IOwnerProductProperty): Promise<boolean>   {
        const page = this.browserPages.propertyAppraiserPage;
        if (page === undefined) return false;
        let start = 0;
        let document = docsToParse;
            if (!this.decideSearchByV2(document)) {
              console.log('Insufficient info for Owner and Property');
              return false;
            }
            
            // do everything that needs to be done for each document here
            // parse address
            let address;
            let search_addr = '';
            let first_name = '';
            let last_name = '';
            let owner_name = '';
            let owner_name_regexp = '';

            if (this.searchBy === 'name') {
                const nameInfo = this.getNameInfo(document.ownerId);
                first_name = nameInfo.first_name;
                last_name = nameInfo.last_name;
                owner_name = nameInfo.owner_name;
                owner_name_regexp = nameInfo.owner_name_regexp;
                if (owner_name === '') return false;
                console.log(`Looking for owner: ${owner_name}`);
            }
            else {
                try{
                    const parsed = parser.parseLocation(document.propertyId['Property Address']);
                    search_addr = parsed['number'] + ' ' + parsed['street'];
                    const parsev2 = this.getAddressV2(document.propertyId);
                    if(!this.isEmptyOrSpaces(parsev2.street_address)){
                        const parsed2 = parser.parseLocation(parsev2.street_address);
                        search_addr = parsed2['number'] + ' ' + parsed2['street'];
                    }
                } catch(e){
                    search_addr = document.propertyId['Property Address'];
                }
                    console.log(`Looking for address: ${search_addr}`);
            }
            if (this.searchBy === 'name') {
                try {
                    await page.waitForXPath('//strong[contains(text(), "Name")]/preceding-sibling::input[1]');
                    const [inputhandler] = await page.$x('//strong[contains(text(), "Name")]/preceding-sibling::input[1]');
                    if (inputhandler) {
                        await inputhandler.click();
                    } else {
                        return false;
                    }
                } catch (error) {
                    return false;
                }
            } else {
                try {
                    await page.waitForXPath('//strong[contains(text(), "Street Address")]/preceding-sibling::input[1]');
                    const [inputhandler] = await page.$x('//strong[contains(text(), "Street Address")]/preceding-sibling::input[1]');
                    if (inputhandler) {
                        await inputhandler.click();
                    } else {
                        return false;
                    }
                } catch (error) {
                    return false;
                }
            }

            const inputHandle = await page.$('input[id*="_tbSearch"]');
            if (inputHandle) {
                await inputHandle.click({clickCount: 3});
                await inputHandle.press('Backspace');
                await inputHandle.type(this.searchBy === 'name' ?  owner_name : search_addr, {delay: 100});
            }

            try {
                await Promise.all([
                    page.click('input[value="Search"]'),
                    page.waitForNavigation()
                ])
            } catch (error) {
                await page.goto(this.urls.propertyAppraiserPage, { waitUntil: 'load' });
                return false;
            }

            const rows = await page.$x('//div[@id="divBodyContent"]//div[contains(@class, "results")]');
            const content = await page.$x('//div[@id="propertyHeaderList"]');
            const url = this.urls.propertyAppraiserPage;
            if (rows.length > 0) {
                await page.waitFor(3000)
                if (this.searchBy === 'name') {
                    for (let j = 0; j < rows.length; j++) {
                        const nameEL = await page.$x(`//div[@id="divBodyContent"]//div[contains(@class, "results")][${j + 1}]//span`);
                        let name_string = await nameEL[0].evaluate(el => el.textContent?.trim());
                        name_string = name_string?.replace('Owner', '').trim();
                        if (name_string?.includes(document.ownerId["Full Name"].replace(',', ''))) {
                            const linkHandle = await page.$x(`//div[@id="divBodyContent"]//div[contains(@class, "results")][${j + 1}]//a`);
                            if (linkHandle.length > 0) {
                                const link = await linkHandle[0].evaluate(el => el.getAttribute('href'));
                                const detailPage = await this.browser?.newPage();
                                if (!detailPage) {
                                    break;
                                }
                                const clickResult = await this.waitForSuccess(async () => {
                                    await Promise.all([
                                        detailPage.goto(url + link, {waitUntil: 'networkidle0'}),
                                        detailPage.waitForNavigation()
                                    ])
                                })
                                if (!clickResult) {
                                    return false;
                                } 
    
                                let result;
                                try {
                                    result = await this.getPropertyInfos(detailPage, address, document.ownerId["Full Name"].replace(',', ''));
                                    if (!result) {
                                        await detailPage.close();
                                        return true;
                                    }
                                } catch (e) {
                                }
                                try {
                                    await this.parseResult(result, document);
                                } catch (e) {                                
                                } 
                                await detailPage.close();
                            }  
                            break;                        
                        } 
                    }
                } else {
                    for (let j = 0; j < rows.length; j++) {
                        const linkHandle = await page.$x(`//div[@id="divBodyContent"]//div[contains(@class, "results")][${j + 1}]//a`);
                        if (linkHandle.length > 0) {
                            const link = await linkHandle[0].evaluate(el => el.getAttribute('href'));
                            const detailPage = await this.browser?.newPage();
                            if (!detailPage) {
                                break;
                            }
                            const clickResult = await this.waitForSuccess(async () => {
                                await Promise.all([
                                    detailPage.goto(url + link, {waitUntil: 'networkidle0'}),
                                    detailPage.waitForNavigation()
                                ])
                            })
                            if (!clickResult) {
                                return false;
                            } 

                            let result;
                            try {
                                result = await this.getPropertyInfos(detailPage, address, '');
                                if (!result) {
                                    await detailPage.close();
                                    continue;
                                }
                            } catch (e) {
                            }
                            try {
                                await this.parseResult(result, document);
                            } catch (e) {                                
                            } 
                            await detailPage.close();
                            break;    
                        }              
                    }
                }
            } else if (content.length > 0) {
                let result;
                try {
                    result = await this.getPropertyInfos(page, address, this.searchBy === 'name' ? document.ownerId["Full Name"].replace(',', '') : '');
                    if (!result) {
                        return true;
                    }
                } catch (e) {
                    console.log(e);
                }
                try {
                    await this.parseResult(result, document);
                } catch (e) {
                    console.log(e);                   
                }  
            }      
        console.log(index);
        return true;
    }

    async parseResult(result: any, document: any) {
        let dataFromPropertyAppraisers = {
            'Full Name': result['ownerName']['full_name'],
            'First Name': result['ownerName']['first_name'],
            'Last Name': result['ownerName']['last_name'],
            'Middle Name': result['ownerName']['middle_name'],
            'Name Suffix': result['ownerName']['suffix'],
            'Mailing Care of Name': '',
            'Mailing Address': result['mailing_address'],
            'Mailing Unit #': '',
            'Mailing City': result['mailing_address_city'] ? result['mailing_address_city'] : '',
            'Mailing State': result['mailing_address_city_parsed'] ? result['mailing_address_city_parsed']['state'] : '',
            'Mailing Zip': result['mailing_address_city_parsed'] ? result['mailing_address_city_parsed']['zip'] : '',
            'Property Address': result['property_address'],
            'Property Unit #': '',
            'Property City': result['property_address_city'],
            'Property State': 'OH',
            'Property Zip': result['property_address_zip'],
            'County': 'Franklin',
            'Owner Occupied': result['owner_occupied'],
            'Property Type': result['property_type'],
            'Total Assessed Value': result['total_assessed_value'],
            'Last Sale Recording Date': result['last_sale_recording_date'],
            'Last Sale Amount': result['last_sale_amount'],
            'Est. Remaining balance of Open Loans': '',
            'Est Value': result['est_value'],
            'yearBuilt': '',
            'Est Equity': '',
            'Lien Amount': ''
        };
        try{
            await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
            index++;
        } catch(e){
            //
        } 
    }

    async getPropertyInfos(page: puppeteer.Page, address: any, owner_name: string): Promise<any> {
        // name
        let full_name_xpath;
        if (owner_name.length > 0) {
            full_name_xpath = `//span[contains(text(), "${owner_name}") and contains(@id, "ctl00_cphBodyContent_lblOwn1")]`;
        } else {
            full_name_xpath = `//span[contains(@id, "ctl00_cphBodyContent_lblOwn1_1")]`
        }
        
        const full_name_el = await page.$x(full_name_xpath);
        if (full_name_el.length == 0) {
            return false;
        }
        let full_name = await this.getTextByXpathFromPage(page, full_name_xpath);
        full_name = this.simplifyString(full_name.replace(/[^a-zA-Z ]/g, ""));
        const ownerName = this.parseOwnerName(full_name);

        // property address
        const property_address_xpath = '//span[@id="ctl00_cphBodyContent_fcDetailsHeader_LocationAddressLine1"]';
        let property_address = await this.getTextByXpathFromPage(page, property_address_xpath);
        console.log('Property Address from web: ', property_address);
        const property_address_city_xpath = '//span[@id="ctl00_cphBodyContent_fcDetailsHeader_LocationAddressCity"]';
        let property_address_city = await this.getTextByXpathFromPage(page, property_address_city_xpath);
        const property_address_state_xpath = '//span[@id="ctl00_cphBodyContent_fcDetailsHeader_LocationAddressState"]';
        let property_address_state = await this.getTextByXpathFromPage(page, property_address_state_xpath);
        const property_address_zip_xpath = '//span[@id="ctl00_cphBodyContent_fcDetailsHeader_LocationAddressZip"]';
        let property_address_zip = await this.getTextByXpathFromPage(page, property_address_zip_xpath);
        const property_address_parsed = parser.parseLocation(property_address);

        // mailing address
        const mailing_address_xpath = '//span[@id="ctl00_cphBodyContent_fcDetailsHeader_MailingAddressLine1"]';
        let mailing_address = await this.getTextByXpathFromPage(page, mailing_address_xpath);
        const is_valid_address = mailing_address.match(/[a-zA-Z]/g) !== null;
        mailing_address = is_valid_address ? mailing_address : address['full_address'];
        const mailing_address_parsed = parser.parseLocation(mailing_address);
        const mailing_address_city_xpath = '//span[@id="ctl00_cphBodyContent_fcDetailsHeader_MCSZ"]';
        let mailing_address_city_str = await this.getTextByXpathFromPage(page, mailing_address_city_xpath);
        let mailing_address_city_parsed = parser.parseLocation(mailing_address + ' ' +  mailing_address_city_str);

        // owner occupied
        let owner_occupied: any = false;
        try{
            owner_occupied = this.compareAddress(property_address_parsed, mailing_address_parsed);
        } catch(e){
            //
        }

        // assessed value and est. value
        const total_assessed_value_xpath = '//span[@id="ctl00_cphBodyContent_fcDetailsHeader_lblTotal"]';
        const est_value_xpath = '//span[@id="ctl00_cphBodyContent_fcDetailsHeader_lblImprovement"]';
        const total_assessed_value = await this.getTextByXpathFromPage(page, total_assessed_value_xpath);
        const est_value = await this.getTextByXpathFromPage(page, est_value_xpath);

        // property type
        const property_type_xpath = '//span[contains(@id, "ctl00_cphBodyContent_fcDetailsHeader_lblLegal")]';
        const property_type_handles = await page.$x(property_type_xpath);
        let property_type = '';
        for (let i = 0; i < property_type_handles.length; i++) {
            const element = property_type_handles[i];
            const txt = await element.evaluate(el => el.textContent?.trim());
            property_type = property_type + txt + ' ';
        }
        property_type = property_type.trim();
        
        // sales info
        const paymentsEL = await page.$x('//a[text()="Payments"]');
        await Promise.all([
            paymentsEL[0].click()
        ]);

        let url = await page.url();
        for (let i = 2020; i > 2016; i--) {
            try {
                let retry_count = 0;
                while (true) {
                    if (retry_count > 3) {
                        return false;
                    }
                    try {
                        await page.goto(url + `&tab=3&year=${i}`, {waitUntil: 'load'});
                        break;
                    } catch (error) {
                        retry_count++;
                        console.log('retrying - ', retry_count)
                        await page.reload();
                    }
                }
                const dateXpath = '//div[@id="ctl00_cphBodyContent_fcPaymentContainer_ctl12_PaymentPanel"]//tr[last()]';
                const dateHandle = await page.$x(dateXpath);
                if (dateHandle.length == 0) {
                    continue;
                }
                break;                
            } catch (error) {
                continue;
            }
        }
        const last_sale_recording_date_xpath = '//div[@id="ctl00_cphBodyContent_fcPaymentContainer_ctl12_PaymentPanel"]//tr[last()]/td[1]';
        const last_sale_amount_xpath = '//div[@id="ctl00_cphBodyContent_fcPaymentContainer_ctl12_PaymentPanel"]//tr[last()]/td[2]';
        const last_sale_recording_date = await this.getTextByXpathFromPage(page, last_sale_recording_date_xpath);
        const last_sale_amount = await this.getTextByXpathFromPage(page, last_sale_amount_xpath);
        
        return {
            ownerName,
            property_address,
            property_address_city,
            property_address_state,
            property_address_zip,
            property_address_parsed,
            mailing_address,
            mailing_address_city_parsed,
            owner_occupied,
            property_type,
            total_assessed_value, 
            last_sale_recording_date, 
            last_sale_amount, 
            est_value
        }

    }

    async waitForSuccess(func: Function): Promise<boolean> {
        let retry_count = 0;
        while (true){
            if (retry_count > 50){
                console.error('Connection/website error for 30 iteration.');
                return false;
            }
            try {
                await func();
                break;
            }
            catch (error) {
                retry_count++;
                console.log(`retrying page loading -- ${retry_count}`);
            }
        }
        return true;
  }
}