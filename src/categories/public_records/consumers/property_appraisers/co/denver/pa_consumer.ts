// import puppeteer from 'puppeteer';
// import axios from 'axios';
// import querystring from 'querystring';
// import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
// import { IPublicRecordAttributes } from '../../../../../../models/public_record_attributes'


// export default class PAConsumer extends AbstractPAConsumer {
//     source: string;
//     state: string;
//     county: string;
//     categories: string[];

//     urls = {
//         propertyAppraiserPage: 'http://www.deltacomputersystems.com/al/al47/pappraisala.html'
//     }

//     xpaths = {
//         isPAloaded: '//input[@name="HTMADDRNUMBER"]'
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

//         const page = this.browserPages.propertyAppraiserPage!;
//         const directions: any = {'west':'w', 'north':'n', 'south':'s', 'east':'e'};
//         const optional_number_address_input = ['apt', 'unit', '#'];

//         for (let document of docsToParse) {
//             this.searchBy = document["Property Address"] ? 'address' : 'name';
//             // do everything that needs to be done for each document here
//             let address_input = document["Property Address"];
//             let retry_count = 0;
//             while (true){
//                 if (retry_count > 3){
//                     console.error('Connection/website error for 15 iteration.');
//                     this.browser?.close();
//                     return false;
//                 }
//                 try{
//                     let address_input_1 = address_input;
//                     address_input = address_input.replace(/\./g, '').toLowerCase();
//                     let have_direction = false;
//                     for(let direction in directions){
//                         address_input = address_input.replace(direction,directions[direction]);
//                         let regex_direction = new RegExp(' '+directions[direction]+' ','g');
//                         if (address_input.match(regex_direction)){
//                             have_direction = true;
//                         }
//                     }
//                     let pattern_address = /(\S*) ([nwse]) (\S*)|(\S*) (\S*)/g; // For example: "2380 s brentwood" from "2380 s brentwood st"
//                     let matches = pattern_address.exec(address_input)!;
//                     let address_for_suggestedsearching;
//                     try{
//                         address_for_suggestedsearching = matches[1].toString() + " " + matches[2].toString() + " " + matches[3].toString();
//                     } catch {
//                         address_for_suggestedsearching = matches[4].toString() + " " + matches[5].toString();
//                     }
//                     let check_suggested_address_url = 'https://www.denvergov.org/denvermapsservices/FindAutoSuggestResults/?stem='+querystring.escape(address_for_suggestedsearching)+'&types=realpropertyaddress,realpropertypin,realpropertyschednum';
//                     let req_check_suggested_address = await axios.get(check_suggested_address_url);
//                     let req_data = req_check_suggested_address.data.lists;
//                     if(req_data.length < 1){
//                         console.log(address_input,"=> Address not appear in the search result!")
//                         break;
//                     }
//                     let suggestion_address = req_data[0].v[0];
//                     let address_input_fix = '';
//                     if(!have_direction){
//                         let pattern_direction = /\S* ([nwse]) \S*/g;
//                         let matches = [];
//                         let addr_arr = address_for_suggestedsearching.split(" ");
//                         while (matches = pattern_direction.exec(suggestion_address)!) {
//                             addr_arr.splice(1, 0, matches[1]);
//                         }
//                         for (let addr of addr_arr){
//                             address_input_fix += addr + ' ';
//                         }
//                         address_input_fix = address_input_fix.trim();
//                     } else {
//                         address_input_fix = address_for_suggestedsearching;
//                     }
//                     // console.log(address_input_fix);
//                     let aptsuite = '';
//                     for(let o of optional_number_address_input){
//                         let optional_number_arr = address_input.split(o);
//                         if (optional_number_arr.length > 1){
//                             aptsuite = optional_number_arr[1].trim();
//                             break;
//                         }
//                     }
//                     let go_next_page = true;
//                     let page_number = 1;
//                     let found = false;
//                     let parcel_id = '';
//                     while(go_next_page){
//                         let check_address_url = 'https://www.denvergov.org/property/realproperty/search/search/0/?searchText='+querystring.escape(address_input_fix)+'&page='+page_number;
//                         let req_check_address = await axios.get(check_address_url);
//                         let req_data_2 = req_check_address.data.Properties;
//                         try{
//                             if (req_data_2.length < 1){
//                                 go_next_page = false;
//                                 break;
//                             }
//                         } catch {
//                             console.log(address_input,"=> Address not appear in the search result!")
//                             break;
//                         }
//                         for(let address_result of req_data_2){
//                             let address_obj = address_result.Address;
//                             let street_result = address_obj.Street1.toLowerCase().trim();
//                             let aptsuite_result = address_obj.AptSuite.toLowerCase().trim();
//                             let address_regex = new RegExp(address_input_fix, 'g');
//                             if (street_result.match(address_regex)){
//                                 if(aptsuite_result == aptsuite){
//                                     found = true;
//                                     parcel_id = address_result.ParcelID;
//                                     go_next_page = false;
//                                     break;
//                                 }
//                             }
//                         }
//                         page_number += 1;
//                     }
//                     if(!found){
//                         console.log(address_input,"=> Address does not match with the search result!")
//                         break;
//                     }
//                     await page.goto('https://www.denvergov.org/property/realproperty/assessment/'+parcel_id);
//                     await page.waitFor('.footer-copyright', {visible:true})

//                     // Owner Full Name
//                     let owner_fullname_xpath = await page.$x('//th[contains(.,"Owner")]/ancestor::tbody/tr/td/div[1]');
//                     let owner_names = await page.evaluate(el => el.textContent, owner_fullname_xpath[0]);

//                     // Property Type
//                     let property_type_xpath = await page.$x('//th[contains(.,"Property Type")]/ancestor::tbody/tr/td[5]');
//                     let property_type =  await page.evaluate(el => el.textContent, property_type_xpath[0]);

//                     // Mailing Address
//                     let mailing_address_xpath = await page.$x('//th[contains(.,"Owner")]/ancestor::tbody/tr/td/div[3]')
//                     let mailing_address = await page.evaluate(el => el.textContent, mailing_address_xpath[0]);
//                     mailing_address = mailing_address.replace(/\s\s+/g, ' ');

//                     // Mailing Address City, State, Zip
//                     let mailing_address_xpath_2 = await page.$x('//th[contains(.,"Owner")]/ancestor::tbody/tr/td/div[4]')
//                     let mailing_address_2 = await page.evaluate(el => el.textContent, mailing_address_xpath_2[0]);
//                     mailing_address_2 = mailing_address_2.replace(/\s\s+/g, ' ');

//                     // Total Assessed Value
//                     let total_assessed_value_xpath = await page.$x('//h4[contains(.,"Current Year")]/parent::div/parent::div//tr[contains(., "Total")]/td[3]');
//                     let total_assessed_value = await page.evaluate(el => el.textContent, total_assessed_value_xpath[0]);

//                     // Est Value
//                     let est_value_xpath = await page.$x('//h4[contains(.,"Current Year")]/parent::div/parent::div//tr[contains(., "Total")]/td[2]');
//                     let est_value = await page.evaluate(el => el.textContent, est_value_xpath[0]);

//                     await page.goto('https://www.denvergov.org/property/realproperty/chainoftitle/'+parcel_id);
//                     await page.waitFor('.footer-copyright', {visible:true})

//                     // Last Sale Date & Last Sale Amount
//                     let last_sale_date, last_sale_amount;
//                     try{
//                         let last_sale_date_xpath = await page.$x('//th[contains(.,"Sale Date")]/ancestor::tbody/tr[2]/td[4]');
//                         last_sale_date = await page.evaluate(el => el.textContent, last_sale_date_xpath[0]);
//                     } catch {
//                         last_sale_date = '';
//                     }
//                     try{
//                         let last_sale_amount_xpath = await page.$x('//th[contains(.,"Sale Price")]/ancestor::tbody/tr[2]/td[5]');
//                         last_sale_amount = await page.evaluate(el => el.textContent, last_sale_amount_xpath[0]);
//                     } catch {
//                         last_sale_amount = '';
//                     }

//                     /* Normalize the name */
//                     let owner_fullname_1, owner_first_1, owner_last_1, owner_middle_1, owner_suffix_1, owner_fullname_2, owner_first_2, owner_last_2, owner_middle_2, owner_suffix_2;
//                     let arr_names = owner_names.split(" & ");
//                     owner_suffix_1 = this.getSuffix(arr_names[0]);
//                     let name_and_type_1 = this.discriminateAndRemove(arr_names[0]);
//                     owner_fullname_1 = name_and_type_1.name;
//                     let have_2_owners = true;
//                     let name_and_type_2;
//                     try {
//                         owner_suffix_2 = this.getSuffix(arr_names[1]);
//                         name_and_type_2 = this.discriminateAndRemove(arr_names[1]);
//                     } catch {
//                         have_2_owners = false;
//                     }
                    
//                     if (name_and_type_1.type == 'person'){
//                         try{
//                             let owner_1_array_1 = name_and_type_1.name.trim().split(',');
//                             owner_last_1 = owner_1_array_1 ? owner_1_array_1.shift() : '';
//                             let owner_1_array_2 = owner_1_array_1[0].split(' ');
//                             owner_first_1 = owner_1_array_2 ? owner_1_array_2.shift() : '';
//                             owner_middle_1 = owner_1_array_2 ? owner_1_array_2.shift() : '';
//                         } catch{
//                             owner_last_1 = '';
//                             owner_first_1 = '';
//                             owner_middle_1 = '';
//                         }
//                     } else {
//                         owner_suffix_1 = '';
//                     }
//                     if(have_2_owners){
//                         owner_fullname_2 = name_and_type_2.name;
//                         if (name_and_type_2.type == 'person'){
//                             if(owner_fullname_2.includes(',')){
//                                 let owner_2_array = name_and_type_2.name.trim().split(/,\s+/g);
//                                 owner_first_2 = owner_2_array ? owner_2_array.shift() : '';
//                                 if(owner_2_array.length > 0){
//                                     let owner_1_array_2 = owner_2_array[0].trim().split(/\s+/g);
//                                     owner_last_2 = owner_1_array_2 ? owner_1_array_2.shift() : '';
//                                     owner_middle_2 = owner_1_array_2 ? owner_1_array_2.shift() : '';
//                                 } else {
//                                     owner_last_2 = '';
//                                     owner_middle_2 = '';
//                                 }
//                             } else {
//                                 let owner_2_array = name_and_type_2.name.trim().split(/\s+/g);
//                                 owner_first_2 = owner_2_array ? owner_2_array.shift() : '';
//                                 owner_last_2 = owner_last_1;
//                                 owner_middle_2 = owner_2_array ? owner_2_array.shift() : '';
//                             }
//                         } else {
//                             owner_suffix_2 = '';
//                         }
//                     }

//                     /* Normalize the address detail */
//                     let address_array_comma = mailing_address_2.split(" , ");
//                     if (address_array_comma.length < 2){
//                         address_array_comma = mailing_address_2.split(", ");
//                     }
//                     let mailing_city = address_array_comma[0].trim();
//                     let state_and_zip_arr = address_array_comma[1].split(" ");
//                     let mailing_state = state_and_zip_arr[0];
//                     let mailing_zip = state_and_zip_arr[1];

//                     // Owner Occupied
//                     let owner_occupied = false;
//                     if(mailing_state == 'CO'){
//                         let arr_property_address = address_input.trim().toLowerCase().split(" ");
//                         let arr_mailing_address = mailing_address.trim().toLowerCase().split(" ");
//                         let count_matches = 0;
//                         for(let val1 of arr_property_address){
//                             for(let val2 of arr_mailing_address){
//                                 if (val1 == val2){
//                                     count_matches += 1;
//                                 }
//                             }
//                         }
//                         if(arr_property_address[0] == arr_mailing_address[0] && count_matches >= 2){
//                             owner_occupied = true;
//                         }
//                     }

//                     document['Owner Occupied'] = owner_occupied;
//                     document['Full Name'] = owner_fullname_1 ? owner_fullname_1.trim() : '';
//                     document['First Name'] = owner_first_1 ? owner_first_1 : '';
//                     document['Last Name'] = owner_last_1 ? owner_last_1 : '';
//                     document['Middle Name'] = owner_middle_1 ? owner_middle_1 : '';
//                     document['Name Suffix'] = owner_suffix_1 ? owner_suffix_1 : '';
//                     document['Mailing Care of Name'] = '';
//                     document['Mailing Address'] = mailing_address.trim();
//                     document['Mailing Unit #'] = '';
//                     document['Mailing City'] = mailing_city;
//                     document['Mailing State'] = mailing_state;
//                     document['Mailing Zip'] = mailing_zip;
//                     document['Property Type'] = property_type.trim();
//                     document['Total Assessed Value'] = total_assessed_value.trim();
//                     document['Last Sale Recording Date'] = last_sale_date.trim();
//                     document['Last Sale Amount'] = last_sale_amount.trim();
//                     document['Est. Remaining balance of Open Loans'] = '';
//                     document['Est Value'] = est_value.trim();
//                     document['yearBuilt'] = '';
//                     document['Est Equity'] = '';
//                     document['Lien Amount'] = '';
//                     await document.save();

//                     if(have_2_owners){
//                         let newDocument = await this.cloneMongoDocument(document)
//                         newDocument['Full Name'] = owner_fullname_2 ? owner_fullname_2.trim() : '';
//                         newDocument['First Name'] = owner_first_2 ? owner_first_2 : '';
//                         newDocument['Last Name'] = owner_last_2 ? owner_last_2 : '';
//                         newDocument['Middle Name'] = owner_middle_2 ? owner_middle_2 : '';
//                         newDocument['Name Suffix'] = owner_suffix_2 ? owner_suffix_2 : '';
//                         await newDocument.save();
//                     }
//                     break;
//                 } catch(error){
//                     console.error(error);
//                     let power = Math.pow(2, retry_count + 1);
//                     let duration = (power - 1) * 1001;
//                     this.sleep(duration);
//                     retry_count += 1;
//                 }
//             }
//         }
//         return true;
//     }
// }