import puppeteer from 'puppeteer';
const parseaddress = require('parse-address');
import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
import { IPublicRecordAttributes } from '../../../../../../models/public_record_attributes'
const nameParsingService = require('../../consumer_dependencies/nameParsingServiceNew');

import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'https://apps.richmondgov.com/applications/propertysearch/Search.aspx'
    }

    xpaths = {
        isPAloaded: '//span[contains(., "Search by Property Address")]'
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

    // the main parsing function. if read() succeeds, parseAndSave is started().
    // return true after all parsing is complete 

    // docsToParse is the collection of all address objects to parse from mongo.
    // !!! Only mutate document objects with the properties that need to be added!
    // if you need to multiply a document object (in case of multiple owners
    // or multiple properties (2-3, not 30) you can't filter down to one, use this.cloneMongoDocument(document);
    // once all properties from PA have been added to the document, call 
    async parseAndSave(docsToParse: IOwnerProductProperty): Promise<boolean> {
        
        const url_search = 'https://apps.richmondgov.com/applications/propertysearch/Search.aspx';
        /* XPath & Selector Configurations */
        const footer_selector = '#MasterFooter';
        const search_by_address_xpath = '//span[contains(., "Search by Property Address")]';
        const number_input_selector = '#MainContent_tcPropertySearch_tcPropertyAddress_txtBlgNumMin';
        const street_input_selector = '#MainContent_tcPropertySearch_tcPropertyAddress_txtStName';
        const search_button_selector = '#MainContent_btnSubmit';
        const reset_button_selector = '#MainContent_btnReset';
        const search_result_xpath = '//tr[contains(@class, "searchRow")]';
        const property_address_combined_xpath = '//span[contains(., "Street Address:")]/parent::div/span[2]';
        const mailing_address_combined_xpath = '//span[contains(., "Mailing Address:")]/parent::div/span[2]';
        const owner_names_xpath = '//span[contains(., "Owner:")]/parent::div/span[2]';
        const property_type_xpath = '//span[contains(., "Property Class:")]/parent::div/span[2]';
        const assessment_tab_xpath = '//a[./span[contains(., "Assessments")]]';
        const total_assessed_value_xpath = '//th[contains(., "Total Value")]/ancestor::tbody/tr[2]/td[4]'
        const transfer_tab_xpath = '//a[./span[contains(., "Transfers")]]';
        const extension_tab_xpath = '//a[./span[contains(., "Extensions")]]'
        const last_sale_date_xpath = '//th[contains(., "Transfer Date")]/ancestor::tbody/tr[2]/td[1]';
        const last_sale_amount_xpath = '//th[contains(., "Consideration Amount")]/ancestor::tbody/tr[2]/td[2]';
        const year_built_xpath = '//span[contains(., "Year Built:")]/parent::div/span[2]';

        const page = this.browserPages.propertyAppraiserPage!;
        let doc = docsToParse;

            if (!this.decideSearchByV2(doc)) {
                return false;
            }

            if (this.searchBy === 'name') {
                console.log("By name detected! The site is only supported searched by property address: https://apps.richmondgov.com/applications/propertysearch/Search.aspx");
                return false;
            }
            // do everything that needs to be done for each document here
            let address_input = doc.propertyId["Property Address"];
            let parse_address = parseaddress.parseLocation(address_input);
            const parsev2 = this.getAddressV2(doc.propertyId);
            if(!this.isEmptyOrSpaces(parsev2.street_address)){
                address_input = parsev2.street_address;
                parse_address = parseaddress.parseLocation(parsev2.street_address);
            }

            if(!parse_address || (!parse_address.number && !parse_address.street)){
                console.log("Street number & street name is missing!");
                return false;
            }

            await page.goto(url_search);
            await page.waitForSelector(footer_selector, {visible:true});
            let property_tab_button = await page.$x(search_by_address_xpath);
            await property_tab_button[0].click();
            await page.waitForSelector(number_input_selector, {visible:true});
            await page.click(reset_button_selector);
            await page.waitForNavigation();
            if(parse_address.number){
                await page.$eval(number_input_selector, (el:any, value:any) => el.value = value, parse_address.number); // Send keys
            }
            if(parse_address.street){
                await page.$eval(street_input_selector, (el:any, value:any) => el.value = value, parse_address.street); // Send keys
            }
            await page.click(search_button_selector);
            await page.waitForNavigation();

            try{
                let search_result = await page.$x(search_result_xpath);
                await search_result[0].click();
            }catch{
                console.log(address_input, "=> Address not found!");
                return true;
            }

            await page.waitForSelector(footer_selector, {visible:true});
            let property_address_combined = await page.evaluate(el => el.textContent, (await page.$x(property_address_combined_xpath))[0]);
            let mailing_address_combined = await page.evaluate(el => el.textContent, (await page.$x(mailing_address_combined_xpath))[0]);
            let owner_names = await page.evaluate(el => el.textContent, (await page.$x(owner_names_xpath))[0]);

            let property_type;
            try{
                property_type = await page.evaluate(el => el.textContent, (await page.$x(property_type_xpath))[0]);
            } catch {
                property_type = '';
            }

            let total_assessed_value;
            try{
                total_assessed_value = await page.evaluate(el => el.textContent, (await page.$x(total_assessed_value_xpath))[0]);
            } catch {
                total_assessed_value = '';
            }

            let last_sale_date, last_sale_amount;
            try{
                last_sale_date = await page.evaluate(el => el.textContent, (await page.$x(last_sale_date_xpath))[0]);
                last_sale_amount = await page.evaluate(el => el.textContent, (await page.$x(last_sale_amount_xpath))[0]);
            } catch {
                last_sale_date = '';
                last_sale_amount = '';
            }

            let year_built;
            try{
                year_built = await page.evaluate(el => el.textContent, (await page.$x(year_built_xpath))[0]);
            }catch{
                year_built = ''
            }

            /* Normalize the name */
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
                let owner_1_array = name_and_type_1.name.split(" ");
                owner_last_1 = owner_1_array ? owner_1_array.shift() : '';
                owner_first_1 = owner_1_array ? owner_1_array.shift() : '';
                owner_middle_1 = owner_1_array ? owner_1_array.shift() : '';
            } else {
                owner_suffix_1 = '';
            }
            if(have_2_owners){
                owner_fullname_2 = name_and_type_2.name;
                if (name_and_type_2.type == 'person'){
                    let owner_2_array = name_and_type_2.name.split(" ");
                    owner_last_2 = owner_last_1;
                    owner_first_2 = owner_2_array ? owner_2_array.shift() : '';
                    owner_middle_2 = owner_2_array ? owner_2_array.shift() : '';
                } else {
                    owner_suffix_2 = '';
                }
            }

            /* Normalize the mailing address */
            let mailing_address_combined_arr = mailing_address_combined.split(",");
            let mailing_address = mailing_address_combined_arr[0].trim();
            let mailing_city = mailing_address_combined_arr[1].trim();
            let mailing_state_zip = mailing_address_combined_arr[2].trim();
            let mailing_state_zip_arr = mailing_state_zip.split(" ");
            let mailing_zip = mailing_state_zip_arr[1];
            let mailing_state = mailing_state_zip_arr[0];

            /* Normalize the property address */
            let property_address_combined_arr = property_address_combined.split(",");
            let property_address = property_address_combined_arr[0].trim();
            let property_state_zip = property_address_combined_arr[1].trim();
            let property_state_zip_arr = property_state_zip.split(" ");
            let property_state = property_state_zip_arr[0];
            let property_zip = property_state_zip_arr[1];

            // Owner Occupied
            let owner_occupied = false;
            if(mailing_state == property_state.trim() && property_zip == mailing_zip){
                let arr_property_address = address_input.toLowerCase().split(" ");
                let arr_mailing_address = mailing_address.toLowerCase().split(" ");
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

            property_type = property_type.replace(/-\n\s*/g, '');

            let dataFromPropertyAppraisers: any = {};
            dataFromPropertyAppraisers['Owner Occupied'] = owner_occupied;
            dataFromPropertyAppraisers['Full Name'] = owner_fullname_1 ? owner_fullname_1.trim() : '';
            dataFromPropertyAppraisers['First Name'] = owner_first_1 ? owner_first_1 : '';
            dataFromPropertyAppraisers['Last Name'] = owner_last_1 ? owner_last_1 : '';
            dataFromPropertyAppraisers['Middle Name'] = owner_middle_1 ? owner_middle_1 : '';
            dataFromPropertyAppraisers['Name Suffix'] = owner_suffix_1 ? owner_suffix_1 : '';
            dataFromPropertyAppraisers['Mailing Care of Name'] = '';
            dataFromPropertyAppraisers['Mailing Address'] = mailing_address.trim();
            dataFromPropertyAppraisers['Mailing Unit #'] = '';
            dataFromPropertyAppraisers['Mailing City'] = mailing_city;
            dataFromPropertyAppraisers['Mailing State'] = mailing_state;
            dataFromPropertyAppraisers['Mailing Zip'] = mailing_zip;
            dataFromPropertyAppraisers['Property Type'] = property_type.trim();
            dataFromPropertyAppraisers['Property Address'] = doc.propertyId['Property Address'];
            dataFromPropertyAppraisers['Total Assessed Value'] = total_assessed_value.trim();
            dataFromPropertyAppraisers['Last Sale Recording Date'] = last_sale_date;
            dataFromPropertyAppraisers['Last Sale Amount'] = last_sale_amount.trim();
            dataFromPropertyAppraisers['Est. Remaining balance of Open Loans'] = '';
            dataFromPropertyAppraisers['Est Value'] = '';
            dataFromPropertyAppraisers['yearBuilt'] = year_built;
            dataFromPropertyAppraisers['Est Equity'] = '';
            dataFromPropertyAppraisers['Lien Amount'] = '';
            dataFromPropertyAppraisers['County'] = 'Richmond';
            dataFromPropertyAppraisers['Property State'] = 'VA';
            try{
                await this.saveToOwnerProductPropertyV2(doc, dataFromPropertyAppraisers);
            } catch(e){
                //
            }
        return true;
    }
}