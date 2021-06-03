import puppeteer from 'puppeteer';
import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
import { IPublicRecordAttributes } from '../../../../../../models/public_record_attributes'
const parser = require('parse-address');
const nameParsingService = require('../../consumer_dependencies/nameParsingServiceNew');

import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';


export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'http://www.deltacomputersystems.com/AL/AL43/pappraisala.html'
    }

    xpaths = {
        isPAloaded: '//input[@name="HTMADDRNUMBER"]'
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

    sleep(ms: number) : any {
        return new Promise(resolve => setTimeout(resolve, ms));
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

    // the main parsing function. if read() succeeds, parseAndSave is started().
    // return true after all parsing is complete 

    // docsToParse is the collection of all address objects to parse from mongo.
    // !!! Only mutate document objects with the properties that need to be added!
    // if you need to multiply a document object (in case of multiple owners
    // or multiple properties (2-3, not 30) you can't filter down to one, use this.cloneMongoDocument(document);
    // once all properties from PA have been added to the document, call 
    async parseAndSave(docsToParse: IOwnerProductProperty): Promise<boolean> {
        // console.log(`Documents to look up: ${docsToParse.length}.`);

        const page = this.browserPages.propertyAppraiserPage!;
        let document = docsToParse;
        
            if (!this.decideSearchByV2(document)) {
                return false;
            }
            
            // do everything that needs to be done for each document here
            let address_input = '';
            let address_input_lower = '';
            let address_no = '';
            let address_street = '';
            
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
                address_input = document.propertyId["Property Address"];
                let parse_addr = parser.parseLocation(address_input);
                const parsev2 = this.getAddressV2(document.propertyId);
                console.log(`Looking for address: ${address_input}`);
                if(!this.isEmptyOrSpaces(parsev2.street_address)){
                    parse_addr = parser.parseLocation(parsev2.street_address);
                }
                if(!parse_addr || (!parse_addr.number && !parse_addr.street)){
                    console.log("The street number and street name is missing!");
                    return false;
                }
                address_no = parse_addr.number ? parse_addr.number : '';
                address_street = ((parse_addr.street ? parse_addr.street : '') + ' ' + (parse_addr.type ? parse_addr.type : '')).trim();
                address_input_lower = (address_no + address_street).toLowerCase().replace(/\s+/g,'').trim();
            }
            
            let retry_count = 0;
            while (true){
                if (retry_count > 3){
                    console.error('Connection/website error for 15 iteration.');
                    return false;
                }
                try{
                    await page.goto('http://www.deltacomputersystems.com/AL/AL43/pappraisala.html'); // Go to search page
                } catch(error){
                    await page.reload();
                }
                try{
                    await page.waitForSelector('input[name="HTMADDRNUMBER"]', {visible: true}) // Wait for input appear
                    if (this.searchBy === 'name') {
                        await page.$eval('input[name="HTMNAME"]', (el: any, value: any) => el.value = value, owner_name);
                    } else {
                        await page.$eval('input[name="HTMADDRNUMBER"]', (el: any, value: any) => el.value = value, address_no); // Send keys
                        await page.$eval('input[name="HTMADDRSTREET"]', (el: any, value: any) => el.value = value, address_street);
                    }
                    await Promise.all([
                        page.click('input[name="HTMSUBMIT"]'),
                        page.waitForNavigation()
                    ]);

                    const rows = await page.$x('//table//table//tr[./td[contains(., "ADDRESS")]]/parent::tbody/tr[position()>1]');
                    if(rows.length < 1){
                        console.log('Not found!');
                        break;
                    }
                    const datalinks = [];
                    if (this.searchBy === 'name') {
                        console.log(rows.length)
                        for (const row of rows) {
                            const {name, link} = await page.evaluate(el => ({name: el.children[0].textContent.trim(), link: el.children[0].children[0].href}), row);
                            const regexp = new RegExp(owner_name_regexp);
                            if (!regexp.exec(name.toUpperCase())) continue;
                            console.log(name)
                            datalinks.push(link);
                        }
                    }
                    else {
                        let {address_result, link} = await page.evaluate(el => ({address_result: el.children[0].textContent, link: el.children[0].children[0].href}), rows[0]);
                        let address_result_lower = address_result.toLowerCase().replace(/\s/g,'');
                        if (address_input_lower != address_result_lower) {
                            console.log(address_input_lower, address_result_lower, "=> The result address doesn't match with the input address!"); // If the address of the input is not match with the address from the search result, skip the address.
                            break;
                        }
                        datalinks.push(link);
                    }

                    if (datalinks.length === 0) {
                        console.log("No house found");
                        break;
                    }
                    for (const datalink of datalinks) {
                        console.log(datalink);
                        await page.goto(datalink, {waitUntil: 'networkidle0'});
                        // await page.waitForXPath('/html/body/p/img', {visible: true}) // Waiting for footer image element, this to ensure to all result appear
                        // Owner Name
                        let owner_name_xpath = '//tr[./td[contains(., "NAME")]]/td[2]';
                        let owner_names = await this.getTextContentByXpathFromPage(page, owner_name_xpath);
                        let owner_fullname_1, owner_first_1, owner_last_1, owner_middle_1, owner_suffix_1, owner_fullname_2, owner_first_2, owner_last_2, owner_middle_2, owner_suffix_2;
                        let arr_names = owner_names.split(" & ");
                        owner_suffix_1 = this.getSuffix(arr_names[0]);
                        let name_and_type_1 = this.discriminateAndRemove(arr_names[0]);
                        owner_fullname_1 = name_and_type_1.name;
                        let have_2_owners = true;
                        let name_and_type_2;
                        try {
                            owner_suffix_2 = this.getSuffix(arr_names[1]);
                            name_and_type_2 = this.discriminateAndRemove(arr_names[1]);
                        } catch {
                            have_2_owners = false;
                        }
                        
                        if (name_and_type_1.type == 'person'){
                            let owner_1_array = name_and_type_1.name.trim().split(/,\s+/g);
                            owner_last_1 = owner_1_array ? owner_1_array.shift() : '';
                            if(owner_1_array.length > 0){
                                let owner_1_array_2 = owner_1_array[0].trim().split(/\s+/g);
                                owner_first_1 = owner_1_array_2 ? owner_1_array_2.shift() : '';
                                owner_middle_1 = owner_1_array_2 ? owner_1_array_2.shift() : '';
                            } else {
                                owner_first_1 = '';
                                owner_middle_1 = '';
                            }
                        } else {
                            owner_suffix_1 = '';
                        }

                        if(have_2_owners){
                            owner_fullname_2 = name_and_type_2.name;
                            if (name_and_type_2.type == 'person'){
                                if(owner_fullname_2.includes(',')){
                                    let owner_2_array = name_and_type_2.name.trim().split(/,\s+/g);
                                    owner_first_2 = owner_2_array ? owner_2_array.shift() : '';
                                    if(owner_2_array.length > 0){
                                        let owner_1_array_2 = owner_2_array[0].trim().split(/\s+/g);
                                        owner_last_2 = owner_1_array_2 ? owner_1_array_2.shift() : '';
                                        owner_middle_2 = owner_1_array_2 ? owner_1_array_2.shift() : '';
                                    } else {
                                        owner_last_2 = '';
                                        owner_middle_2 = '';
                                    }
                                } else {
                                    let owner_2_array = name_and_type_2.name.trim().split(/\s+/g);
                                    owner_first_2 = owner_2_array ? owner_2_array.shift() : '';
                                    owner_last_2 = owner_last_1;
                                    owner_middle_2 = owner_2_array ? owner_2_array.shift() : '';
                                }
                            } else {
                                owner_suffix_2 = '';
                            }
                        }
                        let parcel_xpath = await page.$x('//tr[./td[contains(., "ADDRESS")]]/parent::tbody//tr[6]/td[1]');
                        let parcel_tr = await page.evaluate(el => el.textContent, parcel_xpath[0]);
                        let mailing_address, mailing_detail;
                        if(parcel_tr.trim().includes('PARCEL')){ // Check if the address has 2 row for the details
                            // Mailing Address
                            let mailing_address_1_xpath = await page.$x('//tr[./td[contains(., "ADDRESS")]]/td[2]');
                            mailing_address = await page.evaluate(el => el.textContent, mailing_address_1_xpath[0]);
                            let mailing_detail_xpath = await page.$x('//tr[./td[contains(., "ADDRESS")]]/parent::tbody//tr[5]/td[2]');
                            mailing_detail = await page.evaluate(el => el.textContent, mailing_detail_xpath[0]);
                        } else {
                            // Mailing Address
                            mailing_address = '';
                            let mailing_address_1_xpath = await page.$x('//tr[./td[contains(., "ADDRESS")]]/td[2]');
                            let mailing_address_1 = await page.evaluate(el => el.textContent, mailing_address_1_xpath[0]);
                            mailing_address += mailing_address_1.trim() + " ";
                            let mailing_address_2_xpath = await page.$x('//tr[./td[contains(., "ADDRESS")]]/parent::tbody//tr[5]/td[2]');
                            let mailing_address_2 = await page.evaluate(el => el.textContent, mailing_address_2_xpath[0]);
                            mailing_address += mailing_address_2.trim();
                            let mailing_detail_xpath = await page.$x('//tr[./td[contains(., "ADDRESS")]]/parent::tbody//tr[6]/td[2]');
                            mailing_detail = await page.evaluate(el => el.textContent, mailing_detail_xpath[0]);
                        }
                        mailing_address = mailing_address.trim();
                        let arr_mailing_detail = mailing_detail.trim().split(/\s+/g);
                        let mailing_zip = arr_mailing_detail.pop();
                        let mailing_state = arr_mailing_detail.pop();
                        let mailing_city = '';
                        for(let city_str of arr_mailing_detail){
                            mailing_city += city_str + " ";
                        }
                        mailing_city = mailing_city.trim();

                        // Property Address
                        const [property_address_xpath] = await page.$x('//tr[./td[contains(., "PROPERTY ADDRESS")]]/td[2]');
                        const property_address = (await page.evaluate(el => el.textContent, property_address_xpath)).trim();
                        console.log("Property address from web:", property_address);
                        // Owner Occupied
                        let owner_occupied = false;
                        if(mailing_state == 'AL'){
                            let arr_property_address = this.searchBy === 'name' ?  property_address.trim().toLowerCase().split(" ") : address_input.trim().toLowerCase().split(" ");
                            let arr_mailing_address = mailing_address.trim().toLowerCase().split(" ");
                            let count_matches = 0;
                            for(let val1 of arr_property_address){
                                for(let val2 of arr_mailing_address){
                                    if (val1 == val2){
                                        count_matches += 1;
                                    }
                                }
                            }
                            if(arr_property_address[0] == arr_mailing_address[0] && count_matches >= 2){
                                owner_occupied = true;
                            }
                        }

                        // Property Type
                        let property_type_xpath = await page.$x('//tr[./td[contains(., "BLDG")]]/td[6]');
                        let property_type;
                        try{
                            property_type = await page.evaluate(el => el.textContent, property_type_xpath[0]);
                        } catch {
                            property_type = '';
                        }
                        property_type = property_type.trim();

                        // Total Assessed Value
                        let total_assessed_value = '';
                        try{
                            let total_assessed_value_xpath = await page.$x('//td[contains(., "ASSESSMENT VALUE")]');
                            let total_assessed = await page.evaluate(el => el.textContent, total_assessed_value_xpath[1]);
                            total_assessed_value = total_assessed.trim().split(/\s+/g)[2];
                        } catch(e){

                        }

                        // Last Sale Recording Date
                        let last_deed_xpath = '//tr[./td[contains(., "LAST DEED DATE")]]/td[2]';
                        let last_deed_date = await this.getTextContentByXpathFromPage(page, last_deed_xpath);
                        last_deed_date = last_deed_date.trim();

                        // Est Value
                        let est_value_xpath = '//tr[./td[contains(., "TOTAL PARCEL VALUE")]]/td[2]';
                        let est_value = await this.getTextContentByXpathFromPage(page, est_value_xpath);
                        est_value = est_value.trim();

                        let dataFromPropertyAppraisers: any = {};
                        dataFromPropertyAppraisers['Owner Occupied'] = owner_occupied;
                        dataFromPropertyAppraisers['Full Name'] = owner_fullname_1 ? owner_fullname_1.trim() : '';
                        dataFromPropertyAppraisers['First Name'] = owner_first_1 ? owner_first_1 : '';
                        dataFromPropertyAppraisers['Last Name'] = owner_last_1 ? owner_last_1 : '';
                        dataFromPropertyAppraisers['Middle Name'] = owner_middle_1 ? owner_middle_1 : '';
                        dataFromPropertyAppraisers['Name Suffix'] = owner_suffix_1 ? owner_suffix_1 : '';
                        dataFromPropertyAppraisers['Mailing Care of Name'] = '';
                        dataFromPropertyAppraisers['Mailing Address'] = mailing_address;
                        dataFromPropertyAppraisers['Mailing Unit #'] = '';
                        dataFromPropertyAppraisers['Mailing City'] = mailing_city;
                        dataFromPropertyAppraisers['Mailing State'] = mailing_state;
                        dataFromPropertyAppraisers['Mailing Zip'] = mailing_zip;
                        dataFromPropertyAppraisers['Property Type'] = property_type;
                        dataFromPropertyAppraisers['Total Assessed Value'] = total_assessed_value;
                        dataFromPropertyAppraisers['Last Sale Recording Date'] = last_deed_date;
                        dataFromPropertyAppraisers['Last Sale Amount'] = '';
                        dataFromPropertyAppraisers['Est. Remaining balance of Open Loans'] = '';
                        dataFromPropertyAppraisers['Est Value'] = est_value;
                        dataFromPropertyAppraisers['yearBuilt'] = '';
                        dataFromPropertyAppraisers['Est Equity'] = '';
                        dataFromPropertyAppraisers['Lien Amount'] = '';
                        dataFromPropertyAppraisers['Property Address'] = property_address;
                        dataFromPropertyAppraisers['County'] = this.publicRecordProducer.county;
                        dataFromPropertyAppraisers['Property State'] = this.publicRecordProducer.state.toUpperCase();
                        try{
                            await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
                        } catch(e){
                            //
                        }
                    }
                    break;
                } catch(error){
                    console.error(error);
                    let power = Math.pow(2, retry_count + 1);
                    let duration = (power - 1) * 1001;
                    this.sleep(duration);
                    retry_count += 1;
                }
            }
            await this.randomSleepIn5Sec();
        // }
        return true;
    }
}