import puppeteer from 'puppeteer';
const parseaddress = require('parse-address');
import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';

export default class PAConsumer extends AbstractPAConsumer {
  publicRecordProducer: IPublicRecordProducer;
  ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'http://www.dallascad.org/SearchAddr.aspx',
        searchByOwnerPage: 'http://www.dallascad.org/SearchOwner.aspx'
    }

    xpaths = {
        isPAloaded: '//span[@id="Footer1_lblYear"]'
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

        let total_lookups = 0;
        let total_successful_lookups = 0;
        let successful_lookups = 0;
        const address_number_input_selector = '#txtAddrNum';
        const owner_name_input_selector = '#txtOwnerName';
        const street_input_selector = '#txtStName';
        const search_button_selector = '#cmdSubmit';
        const footer_selector = '#Footer1_lblYear';
        const property_button_xpath = '//td[contains(., "Property Address")]/ancestor::tbody/tr/td[2]/a';
        const property_address_xpath = '//span[contains(@id, "_lblPropAddr")]';
        const owner_names_xpath = '//span[@id="lblOwner"]/parent::div[1]/text()[5]';
        const mailing_address_1_xpath = '//span[@id="lblOwner"]/parent::div[1]/text()[7]';
        const mailing_address_2_xpath = '//span[@id="lblOwner"]/parent::div[1]/text()[8]';
        const effective_year_built_xpath = '//span[@id="MainImpRes1_lblEffYrBuilt"]';
        const property_type_xpath = '//table[@id="Land1_dgLand"]/tbody/tr[2]/td[2]';
        const last_sale_date_xpath = '//span[@id="LegalDesc1_lblSaleDate"]';
        const est_value_xpath = '//span[@id="ValueSummary1_pnlValue_lblTotalVal"]';

        const page = this.browserPages.propertyAppraiserPage!;
        let document = docsToParse;
            await this.randomSleepIn5Sec();
            total_lookups++;
            if (!this.decideSearchByV2(document)) {
                console.log('Insufficient info for Owner and Property');
                return false;
            }
            

            // do everything that needs to be done for each document here
            let url_search;

            let address_input = '';
            let first_name = '';
            let last_name = '';
            let owner_name = '';
            let owner_name_regexp = '';
            let parser: any;
            let address_input_number = '';
            let address_input_street = '';

            if (this.searchBy === 'address') {
                url_search = this.urls.propertyAppraiserPage;
                address_input = document.propertyId["Property Address"];
                parser = parseaddress.parseLocation(address_input);
                const parsev2 = this.getAddressV2(document.propertyId);
                if(!this.isEmptyOrSpaces(parsev2.street_address)){
                    parser = parseaddress.parseLocation(parsev2.street_address);
                }
                if(!parser || (!parser.number && !parser.street)){
                    console.log("Number and street name is missing!");
                    return false;
                }
                address_input_number = parser.number ? parser.number : '';
                address_input_street = parser.street ? parser.street : '';
            } else if (this.searchBy === 'name') {
                url_search = this.urls.searchByOwnerPage;

                const nameInfo = this.getNameInfo(document.ownerId, ' ');
                first_name = nameInfo.first_name;
                last_name = nameInfo.last_name;
                owner_name = nameInfo.owner_name;
                console.log(owner_name)
                owner_name_regexp = nameInfo.owner_name_regexp;
            } else {
                return false;
            }



            await page.goto(url_search);
            await page.waitForSelector(footer_selector, { visible:true });

            if (this.searchBy === 'address') {
                await page.$eval(address_number_input_selector, (el: any, value: any) => el.value = value, address_input_number); // Send keys
                await page.$eval(street_input_selector, (el: any, value: any) => el.value = value, address_input_street); // Send keys
            }
            else {
                if (owner_name === '') return false;

                await page.$eval(owner_name_input_selector, (el: any, value: any) => el.value = value, owner_name); // Send keys
            }
            await Promise.all([
                page.click(search_button_selector),
                page.waitForNavigation()
            ]);

            await page.waitForSelector(footer_selector);
            const detalinks = [];
            let property_button_handles = await page.$x(property_button_xpath);
            if (property_button_handles.length === 0) {
                console.log('###### No house found');
                return true;
            }

            if (this.searchBy === 'address') {
                const datalink = await page.evaluate(el => el.href, property_button_handles[0]);
                detalinks.push(datalink);
            }
            else {
                let index = 0;
                const owner_name_handles = await page.$x('//td[contains(., "Property Address")]/ancestor::tbody/tr/td[4]/span');
                // console.log('owner_name_handles = ', owner_name_handles.length);
                for (const property_button_handle of property_button_handles) {
                    let owner_name_get = await page.evaluate(el => el.textContent, owner_name_handles[index]);
                    owner_name_get = owner_name_get.split('&')[0].trim();
                    // console.log(owner_name_get, owner_name_regexp);
                    const regexp = new RegExp(owner_name_regexp);
                    if (regexp.exec(owner_name_get.toUpperCase())) {
                        const datalink = await page.evaluate(el => el.href, property_button_handle);
                        console.log(datalink)
                        detalinks.push(datalink);
                    }
                    index++;
                }
            }
            if (detalinks.length === 0) {
                console.log('@@@@@@ No house found');
                return true;
            }
            successful_lookups++;
            for (const datalink of detalinks) {
                await this.randomSleepIn5Sec();
                let retries = 0;
                while (true) {
                    try {
                        await page.goto(datalink, {waitUntil: 'load'});
                        break;
                    } catch (err) {
                        retries++;
                        if (retries > 3) {
                            console.log('******** website loading failed');
                            return false;
                        }
                        this.randomSleepIn5Sec();
                        console.log(`******** website loading failed, retring... [${retries}]`);
                    }        
                }
                await page.waitForSelector(footer_selector, { visible:true });

                let property_address = await this.getTextByXpathFromPage(page, property_address_xpath)
                property_address = property_address.replace(/\s+/g,' ');

                let owner_names = await this.getTextByXpathFromPage(page, owner_names_xpath);
                let mailing_address_1 = await this.getTextByXpathFromPage(page, mailing_address_1_xpath);
                let mailing_address_2 = await this.getTextByXpathFromPage(page, mailing_address_2_xpath);
                if (mailing_address_2.trim() === ''){
                    mailing_address_1 = await this.getTextByXpathFromPage(page, '//span[@id="lblOwner"]/parent::div[1]/text()[6]');
                    mailing_address_2 = await this.getTextByXpathFromPage(page, '//span[@id="lblOwner"]/parent::div[1]/text()[7]');
                }
                let property_type;
                try{
                    property_type = await this.getTextByXpathFromPage(page, property_type_xpath);
                } catch {
                    property_type = '';
                }
                let last_sale_date;
                try{
                    last_sale_date = await this.getTextByXpathFromPage(page, last_sale_date_xpath);
                } catch {
                    last_sale_date = '';
                }
                let est_value;
                try {
                    est_value = await this.getTextByXpathFromPage(page, est_value_xpath);
                } catch {
                    est_value = '';
                }
                let effective_year_built;
                try{
                    effective_year_built = await this.getTextByXpathFromPage(page, effective_year_built_xpath);
                } catch {
                    effective_year_built = '';
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
                        owner_first_2 = owner_2_array ? owner_2_array.shift() : '';
                        owner_last_2 = owner_2_array ? owner_2_array.shift() : '';
                        owner_middle_2 = owner_2_array ? owner_2_array.shift() : '';
                    } else {
                        owner_suffix_2 = '';
                    }
                }
                owner_last_1 = owner_last_1 ? owner_last_1.replace(",","") : '';
                owner_last_2 = owner_last_2 ? owner_last_2.replace(",","") : '';

                /* Normalize the mailing address */
                let mailing_address_combined_arr = mailing_address_2.split(", ");
                let mailing_city = mailing_address_combined_arr[0];
                let mailing_state_zip_combined = mailing_address_combined_arr[1]?.trim();
                let mailing_state_zip_combined_arr = mailing_state_zip_combined?.split(/\s/) || [];
                let mailing_zip = mailing_state_zip_combined_arr?.pop();
                mailing_zip = mailing_zip?.slice(0,5);
                let mailing_state = '';
                for(let state of mailing_state_zip_combined_arr){
                    mailing_state += state + ' ';
                }
                mailing_state = mailing_state.trim();

                // Owner Occupied
                let owner_occupied = false;
                if(mailing_state == 'TEXAS' && (address_input != undefined)){
                    let arr_property_address = address_input.trim().toLowerCase().split(" ");
                    let arr_mailing_address = mailing_address_1.trim().toLowerCase().split(" ");
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
                    'Full Name': owner_fullname_1 ? owner_fullname_1.trim() : '',
                    'First Name': owner_first_1 ? owner_first_1 : '',
                    'Last Name': owner_last_1 ? owner_last_1 : '',
                    'Middle Name': owner_middle_1 ? owner_middle_1 : '',
                    'Name Suffix': owner_suffix_1 ? owner_suffix_1 : '',
                    'Mailing Care of Name': '',
                    'Mailing Address': mailing_address_1.trim(),
                    'Mailing Unit #': '',
                    'Mailing City': mailing_city,
                    'Mailing State': mailing_state,
                    'Mailing Zip': mailing_zip,
                    'Property Address': property_address,
                    'Property Unit #': '',
                    'Property State': 'TX',
                    'County': 'Dallas',
                    'Owner Occupied': owner_occupied,
                    'Property Type': property_type.trim(),
                    'Last Sale Recording Date': last_sale_date.trim(),
                    'Est. Remaining balance of Open Loans': '',
                    'Est Value': est_value.trim(),
                    'yearBuilt': effective_year_built,
                    'Est Equity': '',
                    'Lien Amount': ''
                };
                console.log(dataFromPropertyAppraisers);
                if (await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers)) total_successful_lookups++;

            }
            console.log('^v^v^v^v^v^v^v^v^v^v^v^v^v^v^v^v^v^v^v^v^v^v^v^v^v^v^v^v^');
            console.log(`TOTAL: ${total_lookups}, SUCCESS: ${successful_lookups}, TOTAL SAVED: ${total_successful_lookups}`)
            console.log('^v^v^v^v^v^v^v^v^v^v^v^v^v^v^v^v^v^v^v^v^v^v^v^v^v^v^v^v^');
        return true;
    }
    async getTextByXpathFromPage(page: puppeteer.Page, xPath: string): Promise<string> {
        const [elm] = await page.$x(xPath);
        if (elm == null) {
            return '';
        }
        let text = await page.evaluate(j => j.textContent, elm);
        return text.trim();
      }
}