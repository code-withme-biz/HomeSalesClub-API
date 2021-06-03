import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';
import puppeteer from 'puppeteer';

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;


    urls = {
        propertyAppraiserPage: 'https://www.tad.org/property-search/'
    }

    xpaths = {
        isPAloaded: '//div[@id="footer-widgets"]'
    }

    constructor(publicRecordProducer: IPublicRecordProducer, ownerProductProperties: IOwnerProductProperty, browser: puppeteer.Browser, page: puppeteer.Page) {
        super();
        this.publicRecordProducer = publicRecordProducer;
        this.ownerProductProperties = ownerProductProperties;
        this.browser = browser;
        this.browserPages.propertyAppraiserPage = page;
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

    // the main parsing function. if read() succeeds, parseAndSave is started().
    // return true after all parsing is complete 

    // docsToParse is the collection of all address objects to parse from mongo.
    // !!! Only mutate document objects with the properties that need to be added!
    // if you need to multiply a document object (in case of multiple owners
    // or multiple properties (2-3, not 30) you can't filter down to one, use this.cloneMongoDocument(document);
    // once all properties from PA have been added to the document, call 
    async parseAndSave(docsToParse: IOwnerProductProperty): Promise<boolean> {

        /* XPath & Selector Configurations */
        const search_input_selector = 'input[name="pas"]'; // Search Input Field
        const search_button_selector= 'input[name="tpas"]'; // Search Button
        const search_name_input_selector = 'input[name="tpason"]';
        const search_name_button_selector = 'div.owner > input[name="tpas"]';
        const property_button_xpath = '//td[@data-label="Account #"]/a'; // Property Button
        const property_owner_name_xpath = '//td[@data-label="Primary Owner Name"]/p[1]';
        const owner_name_row_xpath = '//div[@class="ownerInfo"]/p'; // Owner Name Rows to determine if the property have one owners or more than one
        const owner_name_1_xpath = '//div[@class="ownerInfo"]/p[2]'; // Owner Name 1
        const owner_name_2_xpath = '//div[@class="ownerInfo"]/p[3]'; // Owner Name 2
        const footer_xpath = '//div[@id="footer-widgets"]'; // Footer to ensure all element loaded

        const property_address_xpath = '//strong[text()="Property Address:"]/parent::p/span';
        const property_type_xpath = '//div[@class="stateCode"]/p/text()'; // Property Type
        const mailing_address_xpath = '//div[@class="ardent-html-contact-address"]/span[1]/a'; // Mailing Address
        const mailing_city_xpath = '//div[@class="ardent-html-contact-address"]/span[2]'; // Mailing City
        const mailing_state_xpath = '//div[@class="ardent-html-contact-address"]/span[3]'; // Mailing State
        const mailing_zip_xpath = '//div[@class="ardent-html-contact-address"]/span[4]'; // Mailing Zip
        const property_city_xpath = '//div[@class="propertyContent"]/p[2]/span'; // Property City
        const property_zip_xpath = '//div[@class="propertyContent"]/p[3]/span'; // Property Zip
        const last_sale_date_xpath = '//div[@class="deedDate"]/p/text()'; // Last Sale Date
        const est_value_xpath = '//div[@class="propertiesValues"]/div/table/tbody/tr[1]/td[@data-label="Total Market"]'; // Est Value

        const page = this.browserPages.propertyAppraiserPage!;
        const url_search = 'https://www.tad.org/property-search/';
        let document = docsToParse;
            if (!this.decideSearchByV2(document)) {
                console.log('Insufficient info for Owner and Property');
                return false;
            }

            try {
                
                // await document.save();
            } catch(e){
            // console.log(e);
            }
            // do everything that needs to be done for each document here

            let address_input=  '';
            let first_name = '';
            let last_name = '';
            let owner_name = '';
            let owner_name_regexp = '';  
  
            await page.goto(url_search);
            await page.waitForXPath(footer_xpath, {visible: true});

            if (this.searchBy === 'name') {

                const nameInfo = this.getNameInfo(document.ownerId);
                first_name = nameInfo.first_name;
                last_name = nameInfo.last_name;
                owner_name = nameInfo.full_name;
                owner_name_regexp = nameInfo.owner_name_regexp;
                if (owner_name === '') return false;

                console.log(`Looking for Owner: ${owner_name}`);
    
                await page.$eval(search_name_input_selector, (el: any, value: any) => el.value = value, owner_name); // Send keys
                await page.click(search_name_button_selector);
            }
            else {
                address_input = document.propertyId['Property Address'];
                const parsedaddr = this.getAddressV2(document.propertyId);
                if(!this.isEmptyOrSpaces(parsedaddr.street_address)){
                    address_input = parsedaddr.street_address;
                }
                console.log(`Looking for Address : ${address_input}`);
                await page.$eval(search_input_selector, (el: any, value: any) => el.value = value, address_input); // Send keys
                await page.click(search_button_selector);
            }
            
            await page.waitForXPath(footer_xpath, {visible: true});
            
            const datalinks = [];
            let property_button_handles = await page.$x(property_button_xpath);
            try {
                if (this.searchBy === 'address') {
                    const datalink = await page.evaluate(el => el.href, property_button_handles[0]);
                    datalinks.push(datalink);
                }
                else {
                    let index = 0;property_owner_name_xpath
                    const owner_name_handles = await page.$x(property_owner_name_xpath);
                    console.log(property_button_handles.length, owner_name_handles.length)
                    for (const owner_name_handle of owner_name_handles) {
                        const owner_name_get = await page.evaluate(el => el.textContent, owner_name_handle);
                        const regexp = new RegExp(owner_name_regexp);
                        if (regexp.exec(owner_name_get.toUpperCase())) {
                            console.log(owner_name_get)
                            const datalink = await page.evaluate(el => el.href, property_button_handles[index]);
                            datalinks.push(datalink);
                        }
                        index++;
                    }
                }
            } catch (error) {

            }
            for (let datalink of datalinks) {
                await page.goto(datalink, {waitUntil: 'load'});
                await page.waitForXPath(footer_xpath, {visible: true});

                let property_address: any = await page.$x(property_address_xpath);
                try {
                    property_address = property_address ? await page.evaluate(el => el.textContent, property_address[0]) : (this.searchBy === 'address' && document.propertyId['Property Address']);
                } catch (error) {
                    property_address = '';
                }

                let owner_name_rows = await page.$x(owner_name_row_xpath);
                let have_two_owners = false;
                if(owner_name_rows.length > 2){
                    have_two_owners = true;
                }

                let property_type, last_sale_date, est_value, mailing_address, mailing_city, mailing_state, mailing_zip, property_city, property_zip;
                try {
                    property_type = await page.evaluate(el => el.textContent, (await page.$x(property_type_xpath))[0]);
                } catch {
                    property_type = '';
                }
                try{
                    last_sale_date = await page.evaluate(el => el.textContent, (await page.$x(last_sale_date_xpath))[0]);
                }catch{
                    last_sale_date = '';
                }
                try{
                    est_value = await page.evaluate(el => el.textContent, (await page.$x(est_value_xpath))[0]);
                }catch{
                    est_value = '';
                }
                try{
                    mailing_address = await page.evaluate(el => el.textContent, (await page.$x(mailing_address_xpath))[0]);
                }catch{
                    mailing_address = '';
                }
                try{
                    mailing_city = await page.evaluate(el => el.textContent, (await page.$x(mailing_city_xpath))[0]);
                }catch{
                    mailing_city = '';
                }
                try{
                    mailing_state = await page.evaluate(el => el.textContent, (await page.$x(mailing_state_xpath))[0]);
                }catch{
                    mailing_state = '';
                }
                try{
                    mailing_zip = await page.evaluate(el => el.textContent, (await page.$x(mailing_zip_xpath))[0]);
                }catch{
                    mailing_zip = '';
                }
                try{
                    property_city = await page.evaluate(el => el.textContent, (await page.$x(property_city_xpath))[0]);
                }catch{
                    property_city = '';
                }
                try{
                    property_zip = await page.evaluate(el => el.textContent, (await page.$x(property_zip_xpath))[0]);
                }catch{
                    property_zip = '';
                }

                /* Normalize the name */
                let owner_fullname_1, owner_first_1, owner_last_1, owner_middle_1, owner_suffix_1, owner_fullname_2, owner_first_2, owner_last_2, owner_middle_2, owner_suffix_2;
                let owner_name_1 = await page.evaluate(el => el.textContent, (await page.$x(owner_name_1_xpath))[0]);
                // console.log(owner_name_1.trim());
                owner_suffix_1 = this.getSuffix(owner_name_1);
                let name_and_type_1 = this.discriminateAndRemove(owner_name_1);
                owner_fullname_1 = name_and_type_1.name;
                let name_and_type_2;
                if(have_two_owners){
                    let owner_name_2 = await page.evaluate(el => el.textContent, (await page.$x(owner_name_2_xpath))[0]);
                    // console.log(owner_name_2.trim());
                    owner_suffix_2 = this.getSuffix(owner_name_2);
                    name_and_type_2 = this.discriminateAndRemove(owner_name_2);
                }
                if (name_and_type_1.type == 'person'){
                    let owner_1_array = name_and_type_1.name.split(" ");
                    owner_last_1 = owner_1_array ? owner_1_array.shift() : '';
                    owner_first_1 = owner_1_array ? owner_1_array.shift() : '';
                    owner_middle_1 = owner_1_array ? owner_1_array.shift() : '';
                } else {
                    owner_suffix_1 = '';
                }
                if(have_two_owners){
                    owner_fullname_2 = name_and_type_2.name;
                    if (name_and_type_2.type == 'person'){
                        let owner_2_array = name_and_type_2.name.split(" ");
                        owner_last_2 = owner_2_array ? owner_2_array.shift() : '';
                        owner_first_2 = owner_2_array ? owner_2_array.shift() : '';
                        owner_middle_2 = owner_2_array ? owner_2_array.shift() : '';
                    } else {
                        owner_suffix_2 = '';
                    }
                }

                // Owner Occupied
                let owner_occupied = false;
                if(mailing_state == 'TX' && mailing_city.toLowerCase() == property_city.toLowerCase()){
                    let arr_property_address = property_address.toLowerCase().split(" ");
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

                let dataFromPropertyAppraisers = {
                    'Full Name': owner_fullname_1 ? owner_fullname_1 : '',
                    'First Name': owner_first_1 ? owner_first_1 : '',
                    'Last Name': owner_last_1 ? owner_last_1 : '',
                    'Middle Name': owner_middle_1 ? owner_middle_1 : '',
                    'Name Suffix': owner_suffix_1 ? owner_suffix_1 : '',
                    'Mailing Care of Name': '',
                    'Mailing Address': mailing_address,
                    'Mailing Unit #': '',
                    'Mailing City': mailing_city,
                    'Mailing State': mailing_state,
                    'Mailing Zip': mailing_zip,
                    'Property Address': property_address,
                    'Property Unit #': '',
                    'Property City': property_city,
                    'Property State': 'TX',
                    'Property Zip': property_zip,
                    'County': 'Tarrant',
                    'Owner Occupied': owner_occupied,
                    'Property Type': property_type.trim(),
                    'Total Assessed Value': '',
                    'Last Sale Recording Date': last_sale_date.trim(),
                    'Last Sale Amount': '',
                    'Est. Remaining balance of Open Loans': '',
                    'Est Value': est_value.trim(),
                    'yearBuilt': '',
                    'Est Equity': '',
                    'Lien Amount': ''
                };        
                console.log(dataFromPropertyAppraisers);
                await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
            }
            await this.randomSleepIn5Sec();
        return true;
    }
}