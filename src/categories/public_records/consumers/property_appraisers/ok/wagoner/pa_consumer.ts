import puppeteer from 'puppeteer';
const parserAddress = require('parse-address');
import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';
const nameParsingService = require('../../consumer_dependencies/nameParsingServiceNew');
import { IProperty } from '../../../../../../models/property';

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;
    /* XPath & Selector Configurations */
    search_input_selector = 'input[id="primary_search"]'; // Search Input Field
    search_button_selector = 'button[title="Submit search query"]'; // Search Button

    mailing_rows_xpath = '//div[contains(@class, "mailing")]//div[contains(@class, "value")]/text()';
    last_sale_date_xpath = '//div[@id="panel_section_Sales"]//table/tbody[1]/tr/td[1]';
    last_sale_amount_xpath = '//div[@id="panel_section_Sales"]//table/tbody[1]/tr/td[2]';
    property_type_xpath = '//p[./span[contains(., "Class")]]/span[2]';
    property_address_xpath = '//div[@class="location text-highlight"]/span/text()';
    total_assessed_value_xpath = '//div[contains(@class, "valuation")]//span[contains(@class, "value")]';
    year_built_xpath = '//p[./span[contains(., "Year Built")]]/span[2]';
    multiple_row_xpath = '//div[@class="data-list-section"]/ul/li[1]/p/span[@class="value  "][1]';

    urls = {
        propertyAppraiserPage: 'https://property.spatialest.com/ok/wagoner#/'
    }

    xpaths = {
        isPAloaded: '//button[text()="I Understand"]'
    }

    constructor(publicRecordProducer: IPublicRecordProducer, ownerProductProperties: IOwnerProductProperty, browser: puppeteer.Browser, page: puppeteer.Page) {
        super();
        this.publicRecordProducer = publicRecordProducer;
        this.ownerProductProperties = ownerProductProperties;
        this.browser = browser;
        this.browserPages.propertyAppraiserPage = page;
    }

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

    sleep(ms: number): any {
        return new Promise(resolve => setTimeout(resolve, ms));
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

    readDocsToParse(): IOwnerProductProperty {
        return this.ownerProductProperties;
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

    compareAddress(address1: any, address2: any): Boolean {
        const address1_number = address1.number === undefined ? '' : address1.number.trim().toUpperCase();
        const address2_number = address2 ? (address2.number === undefined ? '' : address2.number.trim().toUpperCase()) : '';
        const address1_prefix = address1 && address1.prefix === undefined ? '' : address1.prefix.trim().toUpperCase();
        const address2_prefix = address2 ? (address2.prefix === undefined ? '' : address2.prefix.trim().toUpperCase()) : '';
        const address1_type = address1.type === undefined ? '' : address1.type.trim().toUpperCase();
        const address2_type = address2 ? (address2.type === undefined ? '' : address2.type.trim().toUpperCase()) : '';
        const address1_street = address1.street === undefined ? '' : address1.street.trim().toUpperCase();
        const address2_street = address2 ? (address2.street === undefined ? '' : address2.street.trim().toUpperCase()) : '';

        return (address1_number === address2_number) &&
            (address1_prefix === address2_prefix) &&
            (address1_type === address2_type) &&
            (address1_street === address2_street);
    }


    getAddress(document: IProperty): any {
        // 'Property Address': '162 DOUGLAS HILL RD',
        // 'Property City': 'WEST BALDWIN',
        // County: 'Cumberland',
        // 'Property State': 'ME',
        // 'Property Zip': '04091',
        const full_address = `${document['Property Address']}, ${document['Property City']}, ${document['Property State']} ${document['Property Zip']}`
        const parsed = parserAddress.parseLocation(document['Property Address']);

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

    async parseResult(page: puppeteer.Page, link: any, document: IOwnerProductProperty, address: any) {
        if (link != '') { await page.goto(link, { waitUntil: 'load' }); }
        await page.waitForXPath(this.mailing_rows_xpath, { visible: true, timeout: 10000 });
        let mailing_rows = await page.$x(this.mailing_rows_xpath);
        let mailing_address = '';
        let mailing_rows_data = [];
        let index_address = 1;
        for (let i = 1; i < mailing_rows.length + 1; i++) {
            let p_data = await page.evaluate(el => el.textContent, (await page.$x(this.mailing_rows_xpath + "[" + i + "]"))[0]);
            mailing_rows_data.push(p_data);
            let parse_addr = parserAddress.parseLocation(p_data);
            try {
                if (parse_addr.number) {
                    mailing_address = p_data;
                    index_address = i - 1;
                }
            } catch {
                // pass
            }
        }
        let owner_names = mailing_rows_data[0];
        let mailing_address_2 = mailing_rows_data[mailing_rows_data.length - 1];

        let property_address, property_type, last_sale_date, total_assessed_value, last_sale_amount, year_built, est_value;

        try {
            property_type = await page.evaluate(el => el.textContent, (await page.$x(this.property_type_xpath))[0]);
        } catch {
            property_type = '';
        }
        try {
            property_address = await page.evaluate(el => el.textContent, (await page.$x(this.property_address_xpath))[0]);
        } catch {
            property_address = '';
        }
        console.log('Property Address from web: ', property_address);
        let property_address_parsed = parserAddress.parseLocation(property_address);
        let property_address_array = property_address.split(" ");
        property_address = property_address_array.slice(0, property_address_array.length - 2).join(' ');

        property_address =
            ((property_address_parsed['number'] ? property_address_parsed['number'] + ' ' : '') +
                (property_address_parsed['prefix'] ? property_address_parsed['prefix'] + ' ' : '') +
                (property_address_parsed['street'] ? property_address_parsed['street'] + ' ' : '') +
                (property_address_parsed['type'] ? property_address_parsed['type'] : '')).trim();
        try {
            last_sale_date = await page.evaluate(el => el.textContent, (await page.$x(this.last_sale_date_xpath))[0]);
        } catch {
            last_sale_date = '';
        }
        try {
            total_assessed_value = await page.evaluate(el => el.textContent, (await page.$x(this.total_assessed_value_xpath))[0]);
        } catch {
            total_assessed_value = '';
        }
        try {
            est_value = await page.evaluate(el => el.textContent, (await page.$x(this.total_assessed_value_xpath))[0]);
        } catch {
            est_value = '';
        }
        try {
            last_sale_amount = await page.evaluate(el => el.textContent, (await page.$x(this.last_sale_amount_xpath))[0]);
        } catch {
            last_sale_amount = '';
        }
        try {
            year_built = await page.evaluate(el => el.textContent, (await page.$x(this.year_built_xpath))[0]);
        } catch {
            year_built = '';
        }

        // GET ADDRESS DATA
        let mailing_address_2_arr = mailing_address_2.split(/\s+/g);
        let mailing_zip = mailing_address_2_arr.pop().trim();
        let mailing_state = mailing_address_2_arr.pop().trim();
        let mailing_city = '';
        for(const word of mailing_address_2_arr){
            mailing_city += word + ' ';
        }
        mailing_city = mailing_city.trim();

        // Normalize the owner's name
        let arr_names = owner_names.split(":");
        const owner_names_fix = [];
        for (let owner_name_iter of arr_names) {
            if (owner_name_iter === '') break;
            const ownerName = this.parseOwnerName(owner_name_iter);
            owner_names_fix.push(ownerName);
        }

        const mailing_address_parsed = parserAddress.parseLocation(mailing_address);
        const owner_occupied = this.compareAddress(this.searchBy === 'name' ? property_address_parsed : address['parsed'], mailing_address_parsed);
        let objOwner: any = owner_names_fix[0];
        let dataFromPropertyAppraisers = {
            'Full Name': objOwner.full_name,
            'First Name': objOwner.first_name,
            'Last Name': objOwner.last_name,
            'Middle Name': objOwner.middle_name,
            'Name Suffix': objOwner.suffix,
            'Mailing Care of Name': '',
            'Mailing Address': mailing_address.trim(),
            'Mailing Unit #': '',
            'Mailing City': mailing_city,
            'Mailing State': mailing_state,
            'Mailing Zip': mailing_zip,
            'Property Address': property_address,
            'Property Unit #': '',
            'Property City': property_address_parsed['city'],
            'Property State': this.publicRecordProducer.state,
            'Property Zip': property_address_parsed['zip'] === undefined ? '' : property_address_parsed['zip'],
            'County': this.publicRecordProducer.county,
            'Owner Occupied': owner_occupied,
            'Property Type': property_type,
            'Total Assessed Value': total_assessed_value,
            'Last Sale Recording Date': last_sale_date,
            'Last Sale Amount': last_sale_amount,
            'Est. Remaining balance of Open Loans': '',
            'Est Value': est_value,
            'yearBuilt': year_built,
            'Est Equity': '',
            'Lien Amount': ''
        };
        try {
            await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
        } catch (e) {
            //
        }
    }

    // the main parsing function. if read() succeeds, parseAndSave is started().
    // return true after all parsing is complete 

    // documentsToParse is the collection of all address objects to parse from mongo.
    // !!! Only mutate document objects with the properties that need to be added!
    // if you need to multiply a document object (in case of multiple owners
    // or multiple properties (2-3, not 30) you can't filter down to one, use this.cloneMongodocument(document);
    // once all properties from PA have been added to the document, call 
    async parseAndSave(docsToParse: IOwnerProductProperty): Promise<boolean> {

        const url_search = 'https://property.spatialest.com/ok/wagoner#/';

        let countRecordsSuccess = 0;
        const page = this.browserPages.propertyAppraiserPage!;
        let doc = docsToParse;
            // do everything that needs to be done for each doc here
            if (!this.decideSearchByV2(doc)) {
                console.log('Insufficient info for Owner and Property');
                
            }
            
            // do everything that needs to be done for each doc here
            let search_value = "";
            let owner_name_regexp = '';
            let address;
            if (this.searchBy === 'name') {
                const nameInfo = this.getNameInfo(doc.ownerId);
                let owner_name = nameInfo.owner_name;
                owner_name_regexp = nameInfo.owner_name_regexp;
                if (owner_name === '') return false;
                search_value = owner_name;
                console.log('Looking for owner : ' + search_value)
            }
            else {
                search_value = doc.propertyId['Property Address'];
                const parseaddr = this.getAddressV2(doc.propertyId);
                if(!this.isEmptyOrSpaces(parseaddr.street_address)){
                    search_value = parseaddr.street_address;
                }
                address = this.getAddress(doc.propertyId);
                if(address['parsed'] && address['parsed']['number']){
                    let num = address['parsed']['number'];
                    num = num.padStart(5, '0');
                    let search_value_arr = search_value.split(/\s+/g);
                    search_value_arr.shift();
                    search_value_arr.splice(0, 0, num);
                    search_value = search_value_arr.join(' ');
                }

                console.log('Looking for address : ' + search_value)
            }

            await page.goto(url_search, {waitUntil: 'networkidle0'});
            let [tos] = await page.$x('//button[text()="I Understand"]');
            try{
                if(tos){
                    await tos.click();
                }
            } catch(e){

            }
            await page.evaluate(() => (<HTMLInputElement>document.getElementById("primary_search")).value = "")
            await this.sleep(2000)
            await page.type(this.search_input_selector, search_value);
            await this.sleep(1000)
            try {
                await Promise.all([page.click(this.search_button_selector), page.waitForNavigation()]);
            } catch (err) {
                console.log(err);
                return false;
            }


            let flagMultipleRow = false;

            try {
                await page.waitForXPath(this.mailing_rows_xpath, { visible: true, timeout: 6000 });

            } catch {
                flagMultipleRow = true;
            }

            if (flagMultipleRow) {
                try {
                    await page.waitForXPath(this.multiple_row_xpath, { visible: true, timeout: 6000 });
                    let rows = await page.$x('//div[@class="result-item-wrapper"]/div/a');
                    let nameOwnerRow = await page.$x('//div[@class="data-list-section"]/ul/li[2]/p/span[@class="value  "]');
                    for (let j = 0; j < rows.length; j++) {
                        const href = await page.evaluate(el => ({ link: el.href }), rows[j]);
                        const name = await nameOwnerRow[j].evaluate(el => el.textContent);
                        const regexp = new RegExp(owner_name_regexp);
                        if (!regexp.exec(name!.toUpperCase())) continue;
                        console.log("Processing => ", href.link);
                        try {
                            await this.parseResult(page, href.link, doc, address);
                        } catch (e) {
                        }
                        if(this.searchBy == 'address'){
                            break;
                        }
                    }
                } catch (err) {
                    console.log(search_value, "=> not found!");
                    return true;
                }

            } else {
                console.log("Processing => ", search_value);
                await this.parseResult(page, '', doc, address);
            }
            await this.randomSleepIn5Sec();

        return true;
    }


}