import puppeteer from 'puppeteer';
import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
const parser = require('parse-address');
const nameParsingService = require('../../consumer_dependencies/nameParsingServiceNew');

import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';
import { IProperty } from '../../../../../../models/property';
var addressit = require('addressit');

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        pinPage: 'https://www.cookcountyassessor.com/advanced-search',
        propertyPage: 'http://cookcountypropertyinfo.com/'
    }

    xpaths = {
        isPAloaded: '//button[@id="edit-submit--2"]'
    }

    constructor(publicRecordProducer: IPublicRecordProducer, ownerProductProperties: IOwnerProductProperty, browser: puppeteer.Browser, page: puppeteer.Page) {
        super();
        this.publicRecordProducer = publicRecordProducer;
        this.ownerProductProperties = ownerProductProperties;
        this.browser = browser;
        this.browserPages.propertyAppraiserPage = page;
      }
      
      async init(): Promise<boolean> {
        if (!this.browserPages.propertyAppraiserPage || !this.browser) return false;
        await this.setParamsForPage(this.browserPages.propertyAppraiserPage);
        return true;
    };
      
    readDocsToParse(): IOwnerProductProperty {
        return this.ownerProductProperties;
    }

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
            
            await page.goto(this.urls.pinPage, { waitUntil: 'load' });
            // do everything that needs to be done for each document here
            // parse address
            let address: any;
            let address2: any; // parsing with addressit
            let search_addr;

            let first_name = '';
            let last_name = '';
            let owner_name = '';
            let owner_name_regexp = '';

            if (this.searchBy === 'name') {
                const nameInfo = this.getNameInfo(document.ownerId);
                first_name = nameInfo.first_name;
                last_name = nameInfo.last_name;
                owner_name = nameInfo.first_name + " " + nameInfo.last_name;
                owner_name = owner_name.trim();
                owner_name_regexp = nameInfo.owner_name_regexp;
                if (owner_name === '') return false;
                console.log(`Looking for owner: ${owner_name}`);
            }
            else {
                address2 = this.getAddressV2(document.propertyId);
                address = parser.parseLocation(address2.full_address);
                // console.log(address);
                search_addr = address2.full_address;
                if (!address['number'] || !address['street'] || !address['city'] || !search_addr) {
                    if(address['number'] && address['street'] && !address['city'] && document.propertyId['Property City']){
                        address['city'] = document.propertyId['Property City'];
                    } else {
                        address['city'] = 'CHICAGO';
                    }
                }
                console.log(`Looking for address: ${search_addr}`);
            }

            let retry_count = 0;
            while (true){
                if (retry_count > 30){
                    console.error('Connection/website error for 30 iteration.');
                    return false;
                }
                try {
                    await page.waitForXPath('//input[@id="edit-get-applicantname"]');
                    break;
                }
                catch (error) {
                    retry_count++;
                    console.log('retrying ... ', retry_count)
                    await page.reload();
                }
            }    

            if (this.searchBy === 'name') {
                const inputHandle = await page.$('input#edit-get-applicantname');
                await inputHandle!.click({clickCount: 3});
                await inputHandle!.press('Backspace');
                await inputHandle!.type(owner_name, {delay: 100});
                await Promise.all([
                    page.click('button#edit-submit--2'),
                    page.waitForNavigation()
                ]);
            }
            else {
                const input_number = await page.$('input#edit-get-housenumberbeg');
                await input_number?.type(address['number'], {delay: 150});
                if (address['prefix']) {
                    await page.select('select#edit-get-direction', address['prefix']);
                }
                const input_street = await page.$('input#edit-get-streetname');
                await input_street?.type(address['street'], {delay: 150});
                const input_city = await page.$('input#edit-get-city');
                await input_city?.type(address['city'], {delay: 150});
                await Promise.all([
                    page.click('button#edit-submit'),
                    page.waitForNavigation()
                ]);
            }

            const search_results = await page.$x('//table[@id="search-result"]/tbody/tr');
            let checkOneProperty = await page.$x('//h2[text()="PIN & Address"]');
            if (search_results.length > 0){
                const temp_link = await search_results[0].evaluate(el => el.children[0].children[0].getAttribute('href'));
                if (temp_link?.trim() != '/pin/') {
                    const rows = await page.$x('//table[@id="search-result"]/tbody/tr');
                    let links = [];
                    if (this.searchBy === 'name') {
                        for (const row of rows) {
                            const name = await page.evaluate(el => el.children[2].textContent.trim(), row);
                            const regexp = new RegExp(owner_name_regexp);
                            if (!regexp.exec(name.toUpperCase())) continue;
                            const link = await page.evaluate(el => el.children[0].children[0].href, row);
                            links.push(link);
                        }
                    } else {
                        for (const row of rows) {
                            const {addr, city, link} = await page.evaluate(el => ({
                                addr: el.children[2].textContent?.trim(), 
                                city: el.children[3].textContent?.trim(), 
                                link: el.children[0].children[0].href
                            }), row);
                            if (addr === search_addr && city === address['city']) {
                                links.push(link);
                            }
                        }
                    }
                    if (links.length === 0) {
                        console.log("The search results is not reliable! (different from the keyword)");
                        return true;
                    }
                    for (const link of links) {
                        await page.goto(link, {waitUntil: 'load'});
                        let result1 = await this.getPropertyInfos(page);
                        let result2 = await this.searchByPin(page, result1.pin);
                        if (result2) await this.parseResult({...result1, ...result2}, document);
                    }
                } else {
                    console.log('No Results!');                        
                }
            } else if (checkOneProperty.length > 0){
                let result1 = await this.getPropertyInfos(page);
                let result2 = await this.searchByPin(page, result1.pin);
                if (result2) await this.parseResult({...result1, ...result2}, document);
            } else {
                console.log("Not found!");
                return true;
            }
            await this.randomSleepIn5Sec();      
        return true;
    }

    async parseResult(result: any, document: any) {
        let dataFromPropertyAppraisers = {
            'Full Name': result['ownernames'].fullName,
            'First Name': result['ownernames'].firstName,
            'Last Name': result['ownernames'].lastName,
            'Middle Name': result['ownernames'].middleName,
            'Name Suffix': result['ownernames'].suffix,
            'Mailing Care of Name': '',
            'Mailing Address': result['mailing_address'],
            'Mailing Unit #': '',
            'Mailing City': '',
            'Mailing State': '',
            'Mailing Zip': '',
            'Property Address': result['property_address'],
            'Property Unit #': '',
            'Property City': result['property_city'],
            'Property State': 'IL',
            'Property Zip': '',
            'County': 'Cook',
            'Owner Occupied': result['property_address'] === result['mailing_address'],
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
        console.log(dataFromPropertyAppraisers);
        try{
            await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
        } catch(e){
            //
        } 
    }

    async searchByPin(page: puppeteer.Page, pin_number: string): Promise<any> {
        await page.goto(this.urls.propertyPage, {waitUntil: 'networkidle0'});
        const pin_numbers = pin_number.split('-');
        if (pin_numbers.length !== 5) {
            console.log('Invalid PIN number');
            return null;
        }
        for (let index = 0 ; index < 5 ; index++) {
            const inputbox = await page.$(`input#pinBox${index+1}`);
            await inputbox?.type(pin_numbers[index], {delay: 150});
        }
        await Promise.all([
            page.click('#ContentPlaceHolder1_PINAddressSearch_btnSearch'),
            page.waitForNavigation()
        ]);
        let name = await this.getTextByXpathFromPage(page, '//*[@id="ContentPlaceHolder1_PropertyInfo_propertyMailingName"]');
        const mailing_address = await this.getTextByXpathFromPage(page, '//*[@id="ContentPlaceHolder1_PropertyInfo_propertyMailingAddress"]');
        if (name.includes('&')){
            name = name.split('&')[1].trim();
        }
        const ownernames = nameParsingService.newParseNameFML(name);
        return {
            ownernames,
            mailing_address
        };
    }

    async getPropertyInfos(page: puppeteer.Page): Promise<any> {
        // PIN
        const pin = await this.getTextByXpathFromPage(page, '//*[text()="Pin"]/following-sibling::span[1]');

        // property address
        const property_address = await this.getTextByXpathFromPage(page, '//*[text()="Address"]/following-sibling::span[1]');
        const property_city = await this.getTextByXpathFromPage(page, '//*[text()="City"]/following-sibling::span[1]');

        // sales info
        const last_sale_recording_date = '';
        const last_sale_amount = '';

        // property type
        const property_type = await this.getTextByXpathFromPage(page, '//span[text()="Use"]/following-sibling::span[1]');

        // assessed value and est. value
        const total_assessed_value = await this.getTextByXpathFromPage(page, '//span[contains(text(), "Total Assessed Value")]/parent::div/span[2]');
        const est_value = await this.getTextByXpathFromPage(page, '//span[contains(text(), "Total Estimated Market Value")]/parent::div/span[2]');

        return {
            pin,
            property_address,
            property_city,
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
            if (retry_count > 30){
                console.error('Connection/website error for 30 iteration.');
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
}