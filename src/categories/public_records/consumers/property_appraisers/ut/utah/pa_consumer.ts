// import puppeteer from 'puppeteer';
// const parseaddress = require('parse-address');
// import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
// import { IPublicRecordAttributes } from '../../../../../../models/public_record_attributes'


// export default class PAConsumer extends AbstractPAConsumer {
//     source: string;
//     state: string;
//     county: string;
//     categories: string[];

//     urls = {
//         propertyAppraiserPage: 'http://www.utahcounty.gov/LandRecords/AddressSearchForm.asp'
//     }

//     xpaths = {
//         isPAloaded: '//input[@id="av_house"]'
//     }

//     constructor(state: string, county: string, categories: string[] = ['foreclosure', 'preforeclosure', 'auction', 'tax-lien', 'bankruptcy'], source: string = '') {
//         super();
//         this.source = source;
//         this.state = state;
//         this.county = county;
//         this.categories = categories;
//     }

//     discriminateAndRemove(name: string) : any {
//         const companyIdentifiersArray = [ 'GENERAL', 'TRUSTEE', 'TRUSTEES', 'INC', 'ORGANIZATION', 'CORP', 'CORPORATION', 'LLC', 'MOTORS', 'BANK', 'UNITED', 'CO', 'COMPANY', 'FEDERAL', 'MUTUAL', 'ASSOC', 'AGENCY' , 'OF' , 'SECRETARY' , 'DEVELOPMENT' , 'INVESTMENTS', 'HOLDINGS', 'ESTATE', 'LLP', 'LP', 'TRUST', 'LOAN', 'CONDOMINIUM', 'CHURCH', 'CITY', 'CATHOLIC', 'D/B/A', 'COCA COLA', 'LTD', 'CLINIC', 'TODAY', 'PAY', 'CLEANING', 'COSMETIC', 'CLEANERS', 'FURNITURE', 'DECOR', 'FRIDAY HOMES', 'SAVINGS', 'PROPERTY', 'PROTECTION', 'ASSET', 'SERVICES', 'L L C', 'NATIONAL', 'ASSOCIATION', 'MANAGEMENT', 'PARAGON', 'MORTGAGE', 'CHOICE', 'PROPERTIES', 'J T C', 'RESIDENTIAL', 'OPPORTUNITIES', 'FUND', 'LEGACY', 'SERIES', 'HOMES', 'LOAN'];
//         const removeFromNamesArray = ['ET', 'AS', 'DECEASED', 'DCSD', 'CP\/RS', 'JT\/RS', 'esq','esquire','jr','jnr','sr','snr','2','ii','iii','iv','md','phd','j.d.','ll.m.','m.d.','d.o.','d.c.','p.c.','ph.d.', '&'];
//         const companyRegexString = `\\b(?:${companyIdentifiersArray.join('|')})\\b`;
//         const removeFromNameRegexString = `^(.*?)\\b(?:${removeFromNamesArray.join('|')})\\b.*?$`;
//         const companyRegex = new RegExp(companyRegexString, 'i');
//         const removeFromNamesRegex = new RegExp(removeFromNameRegexString, 'i');
//         let isCompanyName = name.match(companyRegex);
//         if (isCompanyName) {
//             return {
//                 type: 'company',
//                 name: name
//             }
//         }
        
//         let cleanName = name.match(removeFromNamesRegex);
//         if (cleanName) {
//             name = cleanName[1];
//         }
//         return {
//             type: 'person',
//             name: name
//         }
//     }

//     sleep(ms: number) : any {
//         return new Promise(resolve => setTimeout(resolve, ms));
//     }

//     getSuffix(name: string) : any {
//         const suffixList = ['esq','esquire','jr','jnr','sr','snr','2','ii','iii','iv','md','phd','j.d.','ll.m.','m.d.','d.o.','d.c.','p.c.','ph.d.'];
//         name = name.toLowerCase();
//         for(let suffix of suffixList){
//             let regex = new RegExp(' '+suffix, 'gm');
//             if (name.match(regex)){
//                 return suffix;
//             }
//         }
//         return '';
//     }

//     async readDocsToParse() {
//         const docsToParse = await this.getDocumentsArrayFromMongo(this.state, this.county, this.categories);
//         return docsToParse;
//     }

//     // use this to initialize the browser and go to a specific url.
//     // setParamsForPage is needed (mainly for AWS), do not remove or modify it please.
//     // return true when page is usable, false if an unexpected error is encountered.
//     async init(): Promise<boolean> {
//         this.browser = await this.launchBrowser();
//         this.browserPages.propertyAppraiserPage = await this.browser.newPage();
//         await this.setParamsForPage(this.browserPages.propertyAppraiserPage);
//         try {
//             await this.browserPages.propertyAppraiserPage.goto(this.urls.propertyAppraiserPage, { waitUntil: 'load' });
//             return true;
//         } catch (err) {
//             console.warn(err);
//             return false;
//         }
//     };

//     // use this as a middle layer between init() and parseAndSave().
//     // this should check if the page is usable or if there was an error,
//     // so use an xpath that is available when page is usable.
//     // return true when it's usable, false if it errors out.
//     async read(): Promise<boolean> {
//         try {
//             await this.browserPages.propertyAppraiserPage?.waitForXPath(this.xpaths.isPAloaded);
//             return true;
//         } catch (err) {
//             console.warn('Problem loading property appraiser page.');
//             return false;
//         }
//     }

//     // the main parsing function. if read() succeeds, parseAndSave is started().
//     // return true after all parsing is complete 

//     // docsToParse is the collection of all address objects to parse from mongo.
//     // !!! Only mutate document objects with the properties that need to be added!
//     // if you need to multiply a document object (in case of multiple owners
//     // or multiple properties (2-3, not 30) you can't filter down to one, use this.cloneMongoDocument(document);
//     // once all properties from PA have been added to the document, call 
//     async parseAndSave(docsToParse: IPublicRecordAttributes[]): Promise<boolean> {
//         console.log(`Documents to look up: ${docsToParse.length}.`);
        
//         const url_search = 'http://www.utahcounty.gov/LandRecords/AddressSearchForm.asp';
//         /* XPath & Selector Configurations */
//         const number_field_selector = '#av_house';
//         const street_field_selector = '#av_street';
//         const dropdown_direction_selector = 'select#av_dir';
//         const search_button_selector = 'input[name="Submit"]';
//         const search_result_1_xpath = '//strong[contains(., "Property Address")]/ancestor::tbody/tr[2]/td[1]/a';
//         const search_result_2_xpath = '//strong[contains(., "Serial")]/ancestor::tbody/tr[2]/td[1]/a';
//         const property_address_combined_xpath = '//strong[contains(., "Property Address:")]/parent::td/text()';
//         const mailing_address_combined_xpath = '//strong[contains(., "Mailing Address:")]/parent::td/text()';
//         const owner_names_xpath = '//li[contains(., "Owner Names")]/ancestor::div/div/div/table[2]/tbody/tr[1]/td[3]';
//         const value_tab_xpath = '//li[contains(., "Value History")]';
//         const est_value_xpath = '//strong[contains(., "Market Value")]/ancestor::tbody/tr[3]/td[13]';
//         const property_type_xpath = '//strong[contains(., "Property Classification:")]/parent::p/text()[1]';
//         const footer_xpath = '//p[contains(., "This page was created on")]';
//         const directions:any = {'west':'w', 'north':'n', 'south':'s', 'east':'e'};
//         const apt_arr = ['apt', 'unit', '#'];

//         const page = this.browserPages.propertyAppraiserPage!;
//         for (let doc of docsToParse) {
//             // do everything that needs to be done for each document here
//             let address_input = doc["Property Address"];
//             let address_input_1 = address_input;
//             console.log(address_input);
//             address_input = address_input.toLowerCase();
//             let aptsuite = '';
//             for(let o of apt_arr){
//                 let optional_number_arr = address_input.split(o);
//                 if (optional_number_arr.length > 1){
//                     aptsuite = optional_number_arr[1].trim();
//                     break;
//                 }
//             }
//             let postdirection = '';
//             for(let direction in directions){
//                 let first_letter = directions[direction];
//                 let last_2_char = address_input.slice(address_input.length - 2);
//                 if (last_2_char == ' '+first_letter){
//                     postdirection = direction.toUpperCase();
//                 }
//             }
//             let pattern_address = /(\S*) ([nwse]) (\S*)|(\S*) (\S*)/g; // Remove the suffix street. For example: "2380 s brentwood" from "2380 s brentwood st"
//             let matches = pattern_address.exec(address_input);
//             let address_input_2;
//             try{
//                 address_input_2 = matches![1].toString() + " " + matches![2].toString() + " " + matches![3].toString();
//             } catch {
//                 address_input_2 = matches![4].toString() + " " + matches![5].toString();
//             }
//             let parser = parseaddress.parseLocation(address_input_2);
//             await page.goto(url_search, {waitUntil: 'networkidle0'});
//             await page.type(number_field_selector, parser.number);
//             await page.type(street_field_selector, parser.street);
//             if(parser.prefix){
//                 await page.select(dropdown_direction_selector, parser.prefix.toUpperCase());
//             }
//             await page.click(search_button_selector);
//             await page.waitForXPath(footer_xpath);

//             // Optimize the search result to get accurate data
//             let search_result_1;
//             if(aptsuite != ''){ // If there is suite/apt number in the address, find the right apt number in the search result using XPath
//                 let text_contain;
//                 if (postdirection != ''){
//                     text_contain = postdirection + " " + "Unit# "+aptsuite;
//                 } else {
//                     text_contain = "Unit# "+aptsuite;
//                 }
//                 search_result_1 = await page.$x('//td[contains(., "'+text_contain+'")]/parent::tr/td[1]/a');
//                 if(search_result_1.length < 1){
//                     if (postdirection != ''){
//                         text_contain = postdirection + " " + "Unit#"+aptsuite;
//                     } else {
//                         text_contain = "Unit#"+aptsuite;
//                     }
//                     search_result_1 = await page.$x('//td[contains(., "'+text_contain+'")]/parent::tr/td[1]/a');
//                 }
//             } else {
//                 if (postdirection != ''){
//                     search_result_1 = await page.$x('//td[contains(., "'+postdirection+'")]/parent::tr/td[1]/a');
//                 } else {
//                     search_result_1 = await page.$x(search_result_1_xpath);
//                 }
//             }
//             try{
//                 await search_result_1[0].click();
//             } catch {
//                 console.log(address_input, "=> Address not found!");
//                 continue;
//             }

//             await page.waitForXPath(footer_xpath);
//             let search_result_2 = await page.$x(search_result_2_xpath);
//             await search_result_2[0].click();
//             await page.waitForXPath(footer_xpath);

//             let owner_names = await page.evaluate(el => el.textContent, (await page.$x(owner_names_xpath))[0]);
//             let mailing_address_combined, property_address_combined, est_value;
//             try{
//                 mailing_address_combined = await page.evaluate(el => el.textContent, (await page.$x(mailing_address_combined_xpath))[0]);
//             } catch {
//                 mailing_address_combined = '';
//             }
//             try{
//                 property_address_combined = await page.evaluate(el => el.textContent, (await page.$x(property_address_combined_xpath))[0]);
//             } catch {
//                 property_address_combined = '';
//             }
//             let value_tab = await page.$x(value_tab_xpath);
//             await value_tab[0].click();
//             await page.waitFor(2000);
//             try{
//                 est_value = await page.evaluate(el => el.textContent, (await page.$x(est_value_xpath))[0]);
//             } catch {
//                 est_value = '';
//             }
//             let option_property_type = (await page.$x(
//                 '//*[@name = "nav"]/option[text() = "Property Valuation"]'
//             ))[0];
//             let value_option_property_type:any = await (await option_property_type.getProperty('value')).jsonValue();
//             await page.select('select[name="nav"]', value_option_property_type);
//             let property_type;
//             await page.waitForXPath('//h1[contains(., "Property Valuation Information")]');
//             try{
//                 // await page.waitForXPath(property_type_xpath);
//                 property_type = await page.evaluate(el => el.textContent, (await page.$x(property_type_xpath))[0]);
//             } catch {
//                 property_type = '';
//             }

//             /* Normalize the address */
//             let mailing_address = '';
//             let mailing_city = '';
//             let mailing_state = '';
//             let mailing_zip = '';
//             let property_city = '';
//             if(mailing_address_combined != ''){
//                 let parser_mailing = parseaddress.parseLocation(mailing_address_combined.trim());
//                 if(parser_mailing.city){
//                     mailing_city = parser_mailing.city;
//                 }
//                 if(parser_mailing.state){
//                     mailing_state = parser_mailing.state;
//                 }
//                 if(parser_mailing.zip){
//                     mailing_zip = parser_mailing.zip;
//                 }
//                 mailing_address = (parser_mailing.number ? parser_mailing.number : '') + (parser_mailing.prefix ? ' ' + parser_mailing.prefix : '') + (parser_mailing.street ? ' ' + parser_mailing.street : '') + (parser_mailing.suffix ? ' ' +parser_mailing.suffix : '');
//             }
//             if(property_address_combined != ''){
//                 let property_address_combined_arr = property_address_combined.split(" - ");
//                 property_city = property_address_combined_arr[1];
//             }

//             // Owner Occupied
//             let owner_occupied = false;
//             if(mailing_state != ''){
//                 if(mailing_state.trim() == 'UT'){
//                     let arr_property_address = address_input_1.toLowerCase().split(" ");
//                     let arr_mailing_address = mailing_address.trim().toLowerCase().split(" ");
//                     let count_matches = 0;
//                     for(let val1 of arr_property_address){
//                         for(let val2 of arr_mailing_address){
//                             if (val1 == val2){
//                                 count_matches += 1;
//                             }
//                         }
//                     }
//                     if(arr_property_address[0] == arr_mailing_address[0] && count_matches >= 2){
//                         owner_occupied = true;
//                     }
//                 }
//             }

//             /* Normalize the owner names */
//             let owner_fullname_1, owner_first_1, owner_last_1, owner_middle_1, owner_suffix_1

//             owner_suffix_1 = this.getSuffix(owner_names.trim());
//             let name_and_type_1 = this.discriminateAndRemove(owner_names.trim());
//             owner_fullname_1 = name_and_type_1.name;
            
//             if (name_and_type_1.type == 'person'){
//                 let owner_1_array = name_and_type_1.name.trim().split(/,\s+/g);
//                 owner_last_1 = owner_1_array ? owner_1_array.shift() : '';
//                 if(owner_1_array.length > 0){
//                     let owner_1_array_2 = owner_1_array[0].trim().split(/\s+/g);
//                     owner_first_1 = owner_1_array_2 ? owner_1_array_2.shift() : '';
//                     owner_middle_1 = owner_1_array_2 ? owner_1_array_2.shift() : '';
//                 } else {
//                     owner_first_1 = '';
//                     owner_middle_1 = '';
//                 }
//             } else {
//                 owner_suffix_1 = '';
//             }

//             doc['Owner Occupied'] = owner_occupied;
//             doc['Full Name'] = owner_fullname_1 ? owner_fullname_1 : '';
//             doc['First Name'] = owner_first_1 ? owner_first_1 : '';
//             doc['Last Name'] = owner_last_1 ? owner_last_1 : '';
//             doc['Middle Name'] = owner_middle_1 ? owner_middle_1 : '';
//             doc['Name Suffix'] = owner_suffix_1 ? owner_suffix_1 : '';
//             doc['Mailing Care of Name'] = '';
//             doc['Mailing Address'] = mailing_address;
//             doc['Mailing Unit #'] = '';
//             doc['Mailing City'] = mailing_city;
//             doc['Mailing State'] = mailing_state;
//             doc['Mailing Zip'] = mailing_zip;
//             doc['Property Type'] = property_type.trim();
//             doc['Total Assessed Value'] = '';
//             doc['Last Sale Recording Date'] = '';
//             doc['Last Sale Amount'] = '';
//             doc['Est. Remaining balance of Open Loans'] = '';
//             doc['Est Value'] = est_value;
//             doc['yearBuilt'] = '';
//             doc['Est Equity'] = '';
//             doc['Lien Amount'] = '';
//             console.log(doc);
//             await doc.save();
//         }
//         return true;
//     }
// }