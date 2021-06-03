import puppeteer from 'puppeteer';
import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
import { IPublicRecordAttributes } from '../../../../../../models/public_record_attributes'

const parseAddress = require('parse-address');
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';
import { IProperty } from '../../../../../../models/property';

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'https://public.hcad.org/records/Real.asp?search=addr',
        searchByOwnerPage: 'https://public.hcad.org/records/Real.asp?search=name'
    }  

    xpaths = {
        isPAloaded: '//span[contains(text(), "LEGAL DISCLAIMER")]'
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

        const address_number_input_selector = 'input[name="stnum"]';
        const street_input_selector = 'input[name="stname"]';
        const owner_name_input_selector = 'input[name="searchval"]';
        const search_button_selector = 'input[type="submit"]';
        const footer_xpath = '//span[contains(text(), "LEGAL DISCLAIMER")]';
        const account_link_xpath = '//td[contains(., "Account Number")]/ancestor::tbody/tr/td[1]/a';

        const page = this.browserPages.propertyAppraiserPage!;
        page.setDefaultNavigationTimeout(100000);
        let document = docsToParse;
            if (!this.decideSearchByV2(document)) {
                return false;
            }
            // do everything that needs to be done for each document here
            

            let url_search;

            let address_input_number = '';
            let address_input_street = '';
            let first_name = '';
            let last_name = '';
            let owner_name = '';
            let owner_name_regexp = '';

            if (this.searchBy === 'address') {
                url_search = this.urls.propertyAppraiserPage;
    
                let address_input = document.propertyId["Property Address"];
                let parser = parseAddress.parseLocation(address_input);
                address_input_number = parser.number;
                address_input_street = parser.street;
            } else {
                url_search = this.urls.searchByOwnerPage;

                const nameInfo = this.getNameInfo(document.ownerId);
                first_name = nameInfo.first_name;
                last_name = nameInfo.last_name;
                owner_name = nameInfo.owner_name;
                owner_name_regexp = nameInfo.owner_name_regexp;
                if (owner_name === '') return false;                
            }

            await page.goto(url_search);
            await page.waitForXPath(footer_xpath, { visible:true });

            if (this.searchBy === 'address') {
                console.log("Looking for:", address_input_number, address_input_street);
                await page.$eval(address_number_input_selector, (el: any, value: any) => el.value = value, address_input_number); // Send keys
                await page.$eval(street_input_selector, (el: any, value: any) => el.value = value, address_input_street); // Send keys
            } else {
                console.log("Looking for:", owner_name);
                await page.$eval(owner_name_input_selector, (el: any, value: any) => el.value = value, owner_name); // Send keys
            }

            try{
                await Promise.all([
                page.waitForNavigation(),
                page.click(search_button_selector)
                ]);
            } catch (e){
                console.log('Not found!');
                // the result is not found
                return true;
            }
    
            const searchTitle = await page.$x('//a[contains(text(), "Your search for")]');
            if (searchTitle.length > 0) {
                const detalinks = [];
                let detail_link_handles = await page.$x(account_link_xpath);
                if (this.searchBy === 'address') {
                    const datalink = await page.evaluate(el => el.href, detail_link_handles[0]);
                    detalinks.push(datalink);
                }
                else {
                    for (const detail_link_handle of detail_link_handles) {
                        let [owner_name_handle] = await detail_link_handle.$x('../following-sibling::td[1]');
                        const owner_name_get = await page.evaluate(el => el.textContent, owner_name_handle);
                        const regexp = new RegExp(owner_name_regexp);
                        if (regexp.exec(owner_name_get.toUpperCase())) {
                            const datalink = await page.evaluate(el => el.href, detail_link_handle);
                            detalinks.push(datalink);
                        }
                    }
                }
                for (const datalink of detalinks) {
                    console.log("Processing =>", datalink);
                    try {
                        await page.goto(datalink, {waitUntil: 'load'});
                        const result = await this.getPropertyInfos(page);
                        await this.parseResult(result, document);
                    } catch(e){
                        console.log(e);
                        continue;
                    }
                }
            } else {
                const resultLbl = await page.$x('//*[contains(text(), "Currently, there are NO")]');
                if (resultLbl.length > 0) {
                    console.warn(await page.evaluate(el => el.textContent, resultLbl[0]));
                } else {
                    try{
                        const result = await this.getPropertyInfos(page);
                        await this.parseResult(result, document);
                    } catch(e){
                        //
                    }
                }
            }
        await this.randomSleepIn5Sec();
        return true;
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
          const owner_temp_name = owner_class_name.name.split(" ");
          owner_last_name = owner_temp_name ? owner_temp_name.shift() : '';
          owner_first_name = owner_temp_name ? owner_temp_name.shift() : '';
          owner_middle_name = owner_temp_name ? owner_temp_name.shift() : '';
        }
  
        result['full_name'] = owner_full_name;
        result['first_name'] = owner_first_name;
        result['last_name'] = owner_last_name;
        result['middle_name'] = owner_middle_name;
        result['suffix'] = this.getSuffix(owner_full_name);
        return result;
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
    getAddress(document: IPublicRecordAttributes): any {
        // 'Property Address': '162 DOUGLAS HILL RD',
        // 'Property City': 'WEST BALDWIN',
        // County: 'Cumberland',
        // 'Property State': 'ME',
        // 'Property Zip': '04091',
        const full_address = `${document['Property Address']}, ${document['Property City']}, ${document['Property State']} ${document['Property Zip']}`
        const parsed = parseAddress.parseLocation(full_address);
        
        let street_name = parsed.street.trim();
        let street_full = document['Property Address'];
        let street_with_type = (parsed.street + ' ' + (parsed.type ? parsed.type : '')).trim();
  
        return {
          full_address,
          street_name,
          street_with_type,
          street_full,
          parsed
        }
    }    

    getAddressFromParsed(parsed: any): string {
        let address = '';
        if (parsed.number) address = parsed.number + ' ';
        if (parsed.prefix) address += parsed.prefix + ' ';
        if (parsed.street) address += parsed.street + ' ';
        if (parsed.prefix) address += parsed.prefix + ' ';
        address = address.replace(/\s+/g, ' ');
        return address;
    }
  
    async parseResult(result: any, document: any) {
        try{
            let dataFromPropertyAppraisers = {
                'Full Name': result['owner_names'][0]['full_name'],
                'First Name': result['owner_names'][0]['first_name'],
                'Last Name': result['owner_names'][0]['last_name'],
                'Middle Name': result['owner_names'][0]['middle_name'],
                'Name Suffix': result['owner_names'][0]['suffix'],
                'Mailing Care of Name': '',
                'Mailing Address': result['mailing_address'] || '',
                'Mailing Unit #': '',
                'Mailing City': result['mailing_address_parsed'] ? result['mailing_address_parsed']['city']:'',
                'Mailing State': result['mailing_address_parsed'] ? result['mailing_address_parsed']['state']:'',
                'Mailing Zip': result['mailing_address_parsed'] ? result['mailing_address_parsed']['zip']:'',
                'Property Address': result['property_address'],
                'Property Unit #': '',
                'Property City': result['property_address_parsed'] ? result['property_address_parsed']['city'] : '',
                'Property State': 'TX',
                'Property Zip': result['property_address_parsed'] ? result['property_address_parsed']['zip'] : '',
                'County': 'Harris',
                'Owner Occupied': result['owner_occupied'] || '',
                'Property Type': result['property_type'] || '',
                'Total Assessed Value': result['total_assessed_value'] || '',
                'Last Sale Recording Date': result['last_sale_recording_date'] || '',
                'Last Sale Amount': result['last_sale_amount'] || '',
                'Est. Remaining balance of Open Loans': '',
                'Est Value': result['est_value'] || '',
                'yearBuilt': '',
                'Est Equity': '',
                'Lien Amount': ''
            }
            await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
        } catch(e){
            //
        }
            // }
            // else {
            //     let newDocument = await this.cloneDocument(document)
            //     newDocument['Full Name'] = owner_name['full_name'];
            //     newDocument['First Name'] = owner_name['first_name'];
            //     newDocument['Last Name'] = owner_name['last_name'];
            //     newDocument['Middle Name'] = owner_name['middle_name'];
            //     newDocument['Name Suffix'] = owner_name['suffix'];
            //     console.log(newDocument);
            //     await this.saveToLineItem(newDocument);
            //     await this.saveToOwnerProductProperty(newDocument);
            // }
    }
  
    async getPropertyInfos(page: puppeteer.Page): Promise<any> {
        const property_address_xpath = '//td[contains(text(), "Property Address:")]/following-sibling::th[1]';
        const owner_names_xpath = '//td[contains(text(), "Owner Name &")]/following-sibling::th[1]';
        const property_type_xpath = '//a[contains(text(), "State Class Code")]/../../following-sibling::tr[1]/td[1]';
        const owner_history_link_xpath = '//a[contains(text(), "Ownership History")]';
        const history_value_link_xpath = '//a[contains(text(), "Value History")]';
        const last_sale_date_xpath = '/html/body/table[2]/tbody/tr[4]/td[2]';
        const est_value_xpath = '/html/body/table[2]/tbody/tr[2]/th[1]';

        let property_address_html = await page.evaluate(el => el.innerHTML, (await page.$x(property_address_xpath))[0]);
        const property_address = property_address_html.split('<br>')[0].trim();
        const property_address_long = property_address_html.replace('<br>', ' ');
        let property_address_parsed = parseAddress.parseLocation(property_address_long);

        // name
        let full_name_mailing_text = await page.evaluate(el => el.innerText, (await page.$x(owner_names_xpath))[0]);
        const full_name = full_name_mailing_text.split('\n')[0] as string;

        const owner_names = [];
        const owner_name_arr = full_name.split('&').map(str => this.simplifyString(str));
        for (let owner_name_iter of owner_name_arr) {
          if (owner_name_iter === '') break;
          const ownerName = this.parseOwnerName(owner_name_iter);
          owner_names.push(ownerName);
        }

        let full_name_mailing_text_arr = full_name_mailing_text.trim().split('\n');
        console.log(full_name_mailing_text_arr);
        if(full_name_mailing_text_arr.length > 3){
            full_name_mailing_text_arr.shift();
        }
        const mailing_address = full_name_mailing_text_arr[1];
        const mailing_address_long = full_name_mailing_text_arr[1] + ' ' + full_name_mailing_text_arr[2];
        let mailing_address_parsed = parseAddress.parseLocation(mailing_address_long);
      
        // owner occupied
        const owner_occupied = this.compareAddress(property_address_parsed, mailing_address_parsed);
      
        // property type
        let property_type = ''
        try{
            property_type = await page.evaluate(el => el.innerText, (await page.$x(property_type_xpath))[0]);
        } catch(e){
            //
        }

        const owner_history_link = await page.evaluate(el => el.href, (await page.$x(owner_history_link_xpath))[0]);
        const history_value_link = await page.evaluate(el => el.href, (await page.$x(history_value_link_xpath))[0]);

        let owner_history_page = await this.browser!.newPage();
        await this.setParamsForPage(owner_history_page);
        await owner_history_page.goto(owner_history_link, { waitUntil: 'load' });
        let last_sale_recording_date = '';
        try{
            last_sale_recording_date = await owner_history_page.evaluate(el => el.innerText, (await owner_history_page.$x(last_sale_date_xpath))[0]);
        } catch(e){
            //
        }
        const last_sale_amount = '';
        await owner_history_page.close();

        let value_history_page = await this.browser!.newPage();
        await this.setParamsForPage(value_history_page);
        await value_history_page.goto(history_value_link, { waitUntil: 'load' });
        let est_value = '';
        try{
            est_value = await value_history_page.evaluate(el => el.innerText, (await value_history_page.$x(est_value_xpath))[0]);
        } catch(e){
            //
        }
        await value_history_page.close();

        return {
          owner_names,
          property_address,
          property_address_parsed,
          mailing_address,
          mailing_address_parsed,
          owner_occupied,
          property_type,
          last_sale_recording_date,
          last_sale_amount,
          est_value
        }
    }
}