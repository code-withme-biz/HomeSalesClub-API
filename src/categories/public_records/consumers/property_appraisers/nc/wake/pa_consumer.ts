import puppeteer from 'puppeteer';
import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
import {IPublicRecordAttributes} from '../../../../../../models/public_record_attributes'
import {IPublicRecordProducer} from "../../../../../../models/public_record_producer";
import {IOwnerProductProperty} from "../../../../../../models/owner_product_property";
import {IProperty} from "../../../../../../models/property";

const parser = require('parse-address');
const {parseFullName} = require('parse-full-name');

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'http://services.wakegov.com/realestate/'
    }

    xpaths = {
        isPAloaded: '//input[@name="stname"]'
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
            console.log(error)
            return '';
        }
    }

    async getTextByXpathFromPage(page: puppeteer.Page, xPath: string): Promise<string> {
        const [elm] = await page.$x(xPath);
        if (elm == null) {
            return '';
        }
        let text = await page.evaluate(j => j.textContent, elm);
        return text;
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
            console.log(error)
            return '';
        }
    }

    /**
     * analysis name
     * @param name
     */
    discriminateAndRemove(name: string): any {
        const companyIdentifiersArray = ['GENERAL', 'TRUSTEE', 'TRUSTEES', 'INC', 'ORGANIZATION', 'CORP', 'CORPORATION', 'LLC', 'MOTORS', 'BANK', 'UNITED', 'CO', 'COMPANY', 'FEDERAL', 'MUTUAL', 'ASSOC', 'AGENCY', 'OF', 'SECRETARY', 'DEVELOPMENT', 'INVESTMENTS', 'HOLDINGS', 'ESTATE', 'LLP', 'LP', 'TRUST', 'LOAN', 'CONDOMINIUM', 'CHURCH', 'CITY', 'CATHOLIC', 'D/B/A', 'COCA COLA', 'LTD', 'CLINIC', 'TODAY', 'PAY', 'CLEANING', 'COSMETIC', 'CLEANERS', 'FURNITURE', 'DECOR', 'FRIDAY HOMES', 'SAVINGS', 'PROPERTY', 'PROTECTION', 'ASSET', 'SERVICES', 'L L C', 'NATIONAL', 'ASSOCIATION', 'MANAGEMENT', 'PARAGON', 'MORTGAGE', 'CHOICE', 'PROPERTIES', 'J T C', 'RESIDENTIAL', 'OPPORTUNITIES', 'FUND', 'LEGACY', 'SERIES', 'HOMES', 'LOAN'];
        const removeFromNamesArray = ['ET', 'AS', 'DECEASED', 'DCSD', 'CP\/RS', 'JT\/RS', 'esq', 'esquire', 'jr', 'jnr', 'sr', 'snr', '2', 'ii', 'iii', 'iv', 'md', 'phd', 'j.d.', 'll.m.', 'm.d.', 'd.o.', 'd.c.', 'p.c.', 'ph.d.', '&'];
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

        // owner name
        let owner_full_name = name_str;
        let owner_first_name = '';
        let owner_last_name = '';
        let owner_middle_name = '';

        const owner_class_name = this.discriminateAndRemove(owner_full_name);
        if (owner_class_name.type === 'person') {
            const owner_temp_name = parseFullName(owner_class_name.name);
            owner_first_name = owner_temp_name.first ? owner_temp_name.first : '';
            owner_last_name = owner_temp_name.last ? owner_temp_name.last : '';
            owner_middle_name = owner_temp_name.middle ? owner_temp_name.middle : '';
        }

        result['full_name'] = owner_full_name;
        result['first_name'] = owner_first_name;
        result['last_name'] = owner_last_name;
        result['middle_name'] = owner_middle_name;
        result['suffix'] = this.getSuffix(owner_full_name);
        return result;
    }

    getSuffix(name: string): any {
        const suffixList = ['esq', 'esquire', 'jr', 'jnr', 'sr', 'snr', '2', 'ii', 'iii', 'iv', 'md', 'phd', 'j.d.', 'll.m.', 'm.d.', 'd.o.', 'd.c.', 'p.c.', 'ph.d.'];
        name = name.toLowerCase();
        for (let suffix of suffixList) {
            let regex = new RegExp(' ' + suffix, 'gm');
            if (name.match(regex)) {
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
        try {
            const address1_number = address1.number === undefined ? '' : address1.number.trim().toUpperCase();
            const address2_number = address2.number === undefined ? '' : address2.number.trim().toUpperCase();
            const address1_prefix = address1.prefix === undefined ? '' : address1.prefix.trim().toUpperCase();
            const address2_prefix = address2.prefix === undefined ? '' : address2.prefix.trim().toUpperCase();
            const address1_type = address1.type === undefined ? '' : address1.type.trim().toUpperCase();
            const address2_type = address2.type === undefined ? '' : address2.type.trim().toUpperCase();
            const address1_street = address1.street === undefined ? '' : address1.street.trim().toUpperCase();
            const address2_street = address2.street === undefined ? '' : address2.street.trim().toUpperCase();

            return (address1_number === address2_number) &&
                (address1_prefix === address2_prefix) &&
                (address1_type === address2_type) &&
                (address1_street === address2_street);
        } catch (e) {
            return false
        }
    }

    // the main parsing function. if read() succeeds, parseAndSave is started().
    // return true after all parsing is complete

    // docsToParse is the collection of all address objects to parse from mongo.
    // !!! Only mutate document objects with the properties that need to be added!
    // if you need to multiply a document object (in case of multiple owners
    // or multiple properties (2-3, not 30) you can't filter down to one, use this.cloneMongoDocument(document);
    // once all properties from PA have been added to the document, call
    async parseAndSave(docsToParse: IOwnerProductProperty): Promise<boolean> {
        const page = this.browserPages.propertyAppraiserPage;
        if (page === undefined) return false;
        let document = docsToParse;
            if (!this.decideSearchByV2(document)) {
                // console.log('Insufficient info for Owner and Property');
                return false;
            }
            try {
                
                // await document.save();
            } catch (e) {
                // console.log(e);
            }
            let address;
            let search_addr;
            let first_name = '';
            let last_name = '';
            let middle_name = '';
            let owner_name = '';
            let owner_name_regexp = '';

            if (this.searchBy === 'name') {
                const nameInfo = this.getNameInfo(document.ownerId);
                first_name = nameInfo.first_name;
                last_name = nameInfo.last_name;
                middle_name = nameInfo.middle_name;
                owner_name = nameInfo.owner_name;
                owner_name_regexp = nameInfo.owner_name_regexp;
                if (owner_name === '') return false;
                console.log(`Looking for owner: ${owner_name}`);
            } else {
                
                try {
                    const parseaddr = this.getAddressV2(document.propertyId);
                    address = this.getAddress(document.propertyId);
                    search_addr = address['street_with_type'];
                    if(!this.isEmptyOrSpaces(parseaddr.street_address)){
                        address['parsed'] = parser.parseLocation(parseaddr.street_address);
                        search_addr = parseaddr.street_address;
                    }
                } catch (e) {
                    search_addr = document.propertyId['Property Address'];
                }
                console.log(`Looking for address: ${search_addr}`);
            }
            // do everything that needs to be done for each document here
            // parse address or owner

            let retry_count = 0;
            while (true) {
                if (retry_count > 3) {
                    console.error('Connection/website error for 15 iteration.');
                    return false;
                }
                try {
                    await page.goto(this.urls.propertyAppraiserPage, {waitUntil: 'load'});
                } catch (error) {
                    await page.reload();
                }

                try {
                    if (this.searchBy === 'name') {
                        if (first_name) {
                            const inputLastHandle = await page.$('input[name="owner1"]');
                            if (last_name && inputLastHandle) {
                                await inputLastHandle.type(last_name, {delay: 100});
                            }

                            const inputMiddleHandle = await page.$('input[name="owner4"]');
                            if (inputMiddleHandle)
                                await inputMiddleHandle.type(middle_name, {delay: 100});


                            const inputlFirstHandle = await page.$('input[name="owner2"]');
                            if (first_name && inputlFirstHandle) {
                                await inputlFirstHandle.type(first_name, {delay: 100});
                            } else continue;

                            await Promise.all([
                                inputlFirstHandle.type(String.fromCharCode(13), {delay: 150}),
                                page.waitForNavigation()
                            ]);
                            await page.waitFor(1000);
                        } else {

                            const inputCompanyHandle = await page.$('input[name="owner3"]');
                            if (inputCompanyHandle)
                                await inputCompanyHandle.type(owner_name, {delay: 100});
                            else
                                continue;

                            await Promise.all([
                                inputCompanyHandle.type(String.fromCharCode(13), {delay: 150}),
                                page.waitForNavigation()
                            ]);
                            await page.waitFor(1000);


                        }
                    } else {
                        if (!address || !address['street_name'] || !address['parsed']['number']){
                            console.log("Not found!");
                            break;
                        }
                        const street_addr = address['street_name'];
                        // input street number
                        const inputNumHandle = await page.$('input[name="stnum"]');
                        if (address['parsed']['number'] && inputNumHandle) {
                            await inputNumHandle.type(address['parsed']['number'], {delay: 100});
                        }
                        // // input address
                        const inputAddrHandle = await page.$('input[name="stname"]');
                        if (inputAddrHandle)
                            await inputAddrHandle.type(street_addr, {delay: 100});
                        else
                            continue;

                        await Promise.all([
                            inputAddrHandle.type(String.fromCharCode(13), {delay: 150}),
                            page.waitForNavigation()
                        ]);
                        await page.waitFor(1000);
                    }
                    // // check result//
                    let link_handle_selector
                    if (this.searchBy === 'name') {
                        link_handle_selector = 'body > table:nth-of-type(2) > tbody > tr > td > table > tbody > tr:nth-child(2) > td:nth-child(5) > b > a';
                    } else {
                        link_handle_selector = 'body > table:nth-of-type(2) > tbody > tr > td > table > tbody > tr:nth-child(2) > td:nth-child(2) > b > a';
                    }
                    const link_handle = await page.$(link_handle_selector);
                    if (link_handle) {
                        await Promise.all([
                            link_handle.click(),
                            page.waitForNavigation()
                        ]);
                        const result: any = await this.getPropertyInfos(page, address);
                        if (result) await this.parseResult(result, document);
                    }
                    break;
                } catch (error) {
                    console.log(error);
                    console.log('retrying... ', retry_count);
                    retry_count++;
                    await page.waitFor(1000);
                }
            }
        return true;
    }

    async parseResult(result: any, document: any) {
        let dataFromPropertyAppraisers = {
            'Full Name': result['owner_names'][0]['full_name'],
            'First Name': result['owner_names'][0]['first_name'],
            'Last Name': result['owner_names'][0]['last_name'],
            'Middle Name': result['owner_names'][0]['middle_name'],
            'Name Suffix': result['owner_names'][0]['suffix'],
            'Mailing Care of Name': '',
            'Mailing Address': result['mailing_address'],
            'Mailing Unit #': '',
            'Mailing City': result['mailing_address_parsed'] ? result['mailing_address_parsed']['city'] : '',
            'Mailing State': result['mailing_address_parsed'] ? result['mailing_address_parsed']['state'] : '',
            'Mailing Zip': result['mailing_address_parsed'] ? result['mailing_address_parsed']['zip'] : '',
            'Property Address': result['property_address'],
            'Property Unit #': '',
            'Property City': result['property_address_parsed']['city'],
            'Property State': 'NC',
            'Property Zip': result['property_address_parsed']['zip'],
            'County': 'wake',
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
        console.log(dataFromPropertyAppraisers)
        try {
            await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
        } catch (e) {
            //
        }
    }

    async getPropertyInfos(page: puppeteer.Page, address: any): Promise<any> {
        // name
        const owner_names = [];
        const owner_name_xpath= '//*[text()="Property Owner"]/ancestor::tr[1]/following-sibling::tr[1]/td/b/font';
        const owner_name = await this.getTextByXpathFromPage(page, owner_name_xpath);
        const owner_name_arr = owner_name.split('&');
        for (let owner_name_iter of owner_name_arr) {
            if (owner_name_iter.trim() === '') break;
            const ownerName = this.parseOwnerName(owner_name_iter.trim());
            owner_names.push(ownerName);
        }
        // property address
        let property_address, property_address_parsed;
        if (this.searchBy === 'name') {
            const addrProperty_xpath = `//*[text()="Property Location Address"]/ancestor::tr[1]/following-sibling::tr[1]/td/b/font`;
            const cityProperty_xpath = `//*[text()="Property Location Address"]/ancestor::tr[1]/following-sibling::tr[2]/td/b/font`;
            let addrProperty = await this.getTextByXpathFromPage(page, addrProperty_xpath);
            let city = await this.getTextByXpathFromPage(page, cityProperty_xpath);
            property_address = this.simplifyString(addrProperty);
            property_address_parsed = parser.parseLocation(this.simplifyString(addrProperty + ', ' + city));
        } else {
            property_address = address;
            property_address_parsed = parser.parseLocation(address)
        }
        // mailing address
        const addr_selector = `//*[contains(text(), "Mailing Address")]/ancestor::tr[1]/following-sibling::tr[1]/td/b/font`;
        const city_selector = `//*[contains(text(), "Mailing Address")]/ancestor::tr[1]/following-sibling::tr[2]/td/b/font`;
        let addr = await this.getTextByXpathFromPage(page, addr_selector);
        let city = await this.getTextByXpathFromPage(page, city_selector);
        let mailing_address = addr + ', ' + city;
        mailing_address = this.simplifyString(mailing_address);
        const mailing_address_parsed = parser.parseLocation(mailing_address);

        // owner occupied
        const owner_occupied = this.compareAddress(property_address_parsed, mailing_address_parsed);

        // assessed value and est. value
        const total_assessed_xpath = '//*[text()="Total Value Assessed*"]/ancestor::td[1]/following-sibling::td[1]//font';
        const total_assessed_value = await this.getTextByXpathFromPage(page, total_assessed_xpath);

        // est value
        const [est_handle] = await page.$x('//*[text()="Land"]/ancestor::td[1]');
        if (!est_handle) return null;
        await Promise.all([
            est_handle.click(),
            page.waitForNavigation()
        ]);
        const est_value_xpath = '//*[text()="Total Land Value Assessed"]/ancestor::td[1]/following-sibling::td[1]//font';
        const est_value = await this.getTextByXpathFromPage(page, est_value_xpath);

        // property type
        const [property_type_handle] = await page.$x('//*[text()="Buildings"]/ancestor::td[1]');
        if (!property_type_handle) return null;
        await Promise.all([
            property_type_handle.click(),
            page.waitForNavigation()
        ]);
        const property_type_xpath = '//*[text()="Bldg Type"]/ancestor::td[1]/following-sibling::td[1]//font';
        let property_type = await this.getTextByXpathFromPage(page, property_type_xpath);
        property_type = property_type.slice(3).trim();
        const effective_year_built_xpath = '//*[text()="Eff Year"]/ancestor::td[1]/following-sibling::td[1]//font';
        const effective_year_built = await this.getTextByXpathFromPage(page, effective_year_built_xpath);

        // sales info
        const [sales_handle] = await page.$x('//*[text()="Sales"]/ancestor::td[1]');
        if (!sales_handle) return null;
        await Promise.all([
            sales_handle.click(),
            page.waitForNavigation()
        ]);
        const last_recording_xpath = '//*[text()="Built"]/ancestor::tr[1]/following-sibling::tr[1]/td[14]';
        const last_sale_amount_xpath = '//*[text()="Built"]/ancestor::tr[1]/following-sibling::tr[1]/td[13]';
        const last_sale_recording_date = await this.getTextByXpathFromPage(page, last_recording_xpath);
        const last_sale_amount = await this.getTextByXpathFromPage(page, last_sale_amount_xpath);

        return {
            property_address,
            property_address_parsed,
            owner_names,
            mailing_address,
            mailing_address_parsed,
            owner_occupied,
            property_type,
            total_assessed_value,
            last_sale_recording_date,
            last_sale_amount,
            est_value,
            effective_year_built
        }
    }
}