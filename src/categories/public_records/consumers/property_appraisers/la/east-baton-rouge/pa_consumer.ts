// import puppeteer from 'puppeteer';
// const parseaddress = require('parse-address');
// import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
// import { IPublicRecordAttributes } from '../../../../../../models/public_record_attributes'

// /* XPath & Selector Configurations */
// const select_property_radio_xpath = '//form[contains(., "Property Address")]/input[3]'; // To select search by address radio button
// const select_name_radio_xpath = '//form[contains(., "Name")]/input[2]';
// const name_input_xpath = '//*[contains(@placeholder, "Enter just the last name")]';
// const address_number_input_selector = '.addressBoxNumber';
// const street_name_input_selector = '.addressBoxName';
// const search_button_selector = '.btn';
// const property_address_xpath = '//*[text()="Physical Address"]/following-sibling::span/text()';
// const property_details_button_xpath = '//th[contains(., "Parcel#")]/ancestor::table/tbody/tr[1]/td[4]';
// const print_button_xpath = '//img[contains(@class, "printButton")]'; // To ensure the elements on property page is loaded successfully
// const owner_names_xpath = '//div[@data-group="ownerName"]//span[2]'; // Owner Names
// const mailing_address_row_xpath = '//div[@data-group="mailingAddress"]/div/span/text()';
// // const mailing_address_xpath = '//div[@data-group="mailingAddress"]/div/span/text()[1]'; // Mailing Address
// // const mailing_address_2_xpath = '//div[@data-group="mailingAddress"]/div/span/text()[2]'; // Mailing City, State, Zip
// const property_type_xpath = '//div[@data-group="ptype"]/div/span'; // Property Type
// const total_assessed_value_xpath = '//th[contains(., "Assessed Value")]/ancestor::table/tbody/tr[@class="total"]/td[2]'; // Total Assessed Value
// const est_value_xpath = '//th[contains(., "Market Value")]/ancestor::table/tbody/tr[@class="total"]/td[3]'; // Est Value
// const last_sale_date_xpath = '//th[contains(., "Deed#")]/ancestor::table/tbody/tr[1]/td[3]'; // Last Sale Recording Date
// const last_sale_amount_xpath = '//th[contains(., "Deed#")]/ancestor::table/tbody/tr[1]/td[4]'; // Last Sale Amount

// export default class PAConsumer extends AbstractPAConsumer {
//     source: string;
//     state: string;
//     county: string;
//     categories: string[];

//     urls = {
//         propertyAppraiserPage: 'http://ebrassessor.azurewebsites.net/searchonly'
//     }

//     xpaths = {
//         isPAloaded: '//form[contains(., "Property Address")]/input[3]'
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
//         const url_search = 'http://ebrassessor.azurewebsites.net/searchonly';
//         for (let doc of docsToParse) {
//             this.searchBy = doc["Property Address"] ? 'address' : 'name';
//             // do everything that needs to be done for each document here
//             let address_input = '';
//             let parse_address;
//             let first_name = '';
//             let last_name = '';
//             let owner_name = '';
//             let owner_name_regexp = '';

//             if (this.searchBy === 'name') {
//                 const nameInfo = this.getNameInfo(doc);
//                 first_name = nameInfo.first_name;
//                 last_name = nameInfo.last_name;
//                 owner_name = nameInfo.owner_name;
//                 owner_name_regexp = nameInfo.owner_name_regexp;
//                 if (owner_name === '') continue;
//                 console.log(`Looking for owner: ${owner_name}`);
//             }
//             else {
//                 address_input = doc["Property Address"];
//                 parse_address = parseaddress.parseLocation(address_input);
//                 if (parse_address.sec_unit_num){
//                     parse_address.street = parse_address.street + " " +parse_address.type + ". #" + parse_address.sec_unit_num; // This is to optimize the search result
//                 }
//                 console.log(`Looking for address: ${address_input}`);
//             }
            
//             await page.goto(url_search);

//             if (this.searchBy === 'name') {
//                 await page.waitForXPath(select_name_radio_xpath, {visible: true});
//                 let select_name_radio = await page.$x(select_name_radio_xpath);
//                 await page.waitFor(1000);
//                 await select_name_radio[0].click();
//                 await page.waitFor(1000);    
//                 await page.waitForXPath(name_input_xpath, {visible: true});
//                 const [name_input_handle] = await page.$x(name_input_xpath);
//                 await name_input_handle.type(owner_name, {delay: 100});
//             }
//             else {
//                 await page.waitForXPath(select_property_radio_xpath, {visible: true})
//                 let select_property_radio = await page.$x(select_property_radio_xpath);
//                 await page.waitFor(1000);
//                 await select_property_radio[0].click();
//                 await page.waitFor(1000);
//                 await page.waitForSelector(address_number_input_selector, {visible: true});
//                 await page.waitForSelector(street_name_input_selector, {visible: true});
//                 if(parse_address.number){
//                     await page.type(address_number_input_selector, parse_address.number); // Send keys
//                 }
//                 await page.waitFor(1000);
//                 await page.type(street_name_input_selector, parse_address.street); // Send keys
//             }
            
//             await page.evaluate((selector) => document.querySelector(selector).click(), search_button_selector);
//             try{
//                 await page.waitForXPath(property_details_button_xpath, {visible: true, timeout: 10000});
//             } catch{
//                 console.log("Not Found!");
//                 continue;
//             }

//             const rows = await page.$x('//th[contains(., "Parcel#")]/ancestor::table/tbody/tr');
//             const datalinks = [];
//             if (this.searchBy === 'name') {
//                 for (const row of rows) {
//                     const {name, link} = await page.evaluate(el => ({name: el.children[1].textContent.trim(), link: el.children[3].children[0].href}), row);
//                     const regexp = new RegExp(owner_name_regexp);
//                     if (!regexp.exec(name.toUpperCase())) continue;
//                     datalinks.push(link);
//                 }
//             }
//             else {
//                 const link = await page.evaluate(el => el.children[3].children[0].href, rows[0]);
//                 datalinks.push(link);
//             }
//             if (datalinks.length === 0) {
//                 console.log("Not Found");
//                 continue;
//             }
//             for (const datalink of datalinks) {
//                 await page.goto(datalink, {waitUntil: 'load'});
//                 await page.waitForXPath(print_button_xpath);
//                 await this.getData(page, doc);
//             }            
//         }
//         return true;
//     }
//     async getData(page: puppeteer.Page, doc: IPublicRecordAttributes) {
//         let owner_names = await page.evaluate((el: any) => el.textContent, (await page.$x(owner_names_xpath))[0]);

//         let mailing_address, mailing_address_2;
//         try{
//             let mailing_address_rows = await page.$x(mailing_address_row_xpath);
//             let mailing_address_number = mailing_address_rows.length - 1; // Number of Row
//             let mailing_address_2_number = mailing_address_rows.length; // Number of Row
//             mailing_address = await page.evaluate((el: any) => el.textContent, (await page.$x('//div[@data-group="mailingAddress"]/div/span/text()['+mailing_address_number+']'))[0]);
//             mailing_address_2 = await page.evaluate((el: any) => el.textContent, (await page.$x('//div[@data-group="mailingAddress"]/div/span/text()['+mailing_address_2_number+']'))[0]);
//         } catch {
//             mailing_address = '';
//             mailing_address_2 = '';
//         }

//         let property_address;
//         try {
//             property_address = await page.$x(property_address_xpath);
//             property_address = await page.evaluate(el => el.textContent, property_address[0]);
//             property_address = property_address.replace(/\s+/gs, ' ').trim();
//             if (this.searchBy === 'name')
//                 doc['Property Address'] = property_address;
//         }
//         catch {
//             property_address = '';
//         }

//         let property_type, last_sale_date, last_sale_amount, est_value, total_assessed_value;
//         try{
//             property_type = await page.evaluate((el: any) => el.textContent, (await page.$x(property_type_xpath))[0]);
//         } catch {
//             property_type = '';
//         }
//         try{
//             last_sale_date = await page.evaluate((el: any) => el.textContent, (await page.$x(last_sale_date_xpath))[0]);
//         } catch {
//             last_sale_date = '';
//         }
//         try{
//             last_sale_amount = await page.evaluate((el: any) => el.textContent, (await page.$x(last_sale_amount_xpath))[0]);
//         } catch {
//             last_sale_amount = '';
//         }
//         try{
//             est_value = await page.evaluate((el: any) => el.textContent, (await page.$x(est_value_xpath))[0]);
//         } catch {
//             est_value = '';
//         }
//         try{
//             total_assessed_value = await page.evaluate((el: any) => el.textContent, (await page.$x(total_assessed_value_xpath))[0]);
//         } catch {
//             total_assessed_value = '';
//         }

//         /* Normalize The Name */
//         let owner_fullname_1, owner_first_1, owner_last_1, owner_middle_1, owner_suffix_1;
//         console.log(owner_names);
//         owner_suffix_1 = this.getSuffix(owner_names);
//         let owner_name_and_type_1 = this.discriminateAndRemove(owner_names);
//         owner_fullname_1 = owner_name_and_type_1.name;
//         if (owner_name_and_type_1.type == 'person'){
//             let owner_1_array = owner_name_and_type_1.name.split(", ");
//             owner_last_1 = owner_1_array[0];
//             try{
//                 let owner_first_and_middle = owner_1_array[1];
//                 let owner_f_m_arr = owner_first_and_middle.split(" ");
//                 owner_first_1 = owner_f_m_arr ? owner_f_m_arr.shift() : '';
//                 owner_middle_1 = owner_f_m_arr ? owner_f_m_arr.shift() : '';
//             } catch {
//                 owner_last_1 = '';
//                 owner_first_1 = '';
//                 owner_middle_1 = '';
//             }
//         } else {
//             owner_suffix_1 = '';
//         }

//         /* Normalize the mailing address */
//         let mailing_zip, mailing_state, mailing_city;
//         if(mailing_address_2 != ''){
//             let mailing_city_zip_combined_arr = mailing_address_2.split(" ");
//             mailing_zip = mailing_city_zip_combined_arr.pop();
//             mailing_state = mailing_city_zip_combined_arr.pop();
//             mailing_city = '';
//             for(let city of mailing_city_zip_combined_arr){
//                 mailing_city += city + ' ';
//             }
//         } else {
//             mailing_zip = '';
//             mailing_state = '';
//             mailing_city = '';
//         }

//         /* Owner Occupied */
//         let owner_occupied = false;
//         if(mailing_state == 'LA'){
//             let arr_property_address = doc['Property Address'].toLowerCase().split(" ");
//             let arr_mailing_address = mailing_address.toLowerCase().split(" ");
//             let count_matches = 0;
//             for(let val1 of arr_property_address){
//                 for(let val2 of arr_mailing_address){
//                     if (val1 == val2){
//                         count_matches += 1;
//                     }
//                 }
//             }
//             if(arr_property_address[0] == arr_mailing_address[0] && count_matches >= 2){
//                 owner_occupied = true;
//             }
//         }

//         doc['Owner Occupied'] = owner_occupied;
//         doc['Full Name'] = owner_fullname_1 ? owner_fullname_1 : '';
//         doc['First Name'] = owner_first_1 ? owner_first_1 : '';
//         doc['Last Name'] = owner_last_1 ? owner_last_1 : '';
//         doc['Middle Name'] = owner_middle_1 ? owner_middle_1 : '';
//         doc['Name Suffix'] = owner_suffix_1 ? owner_suffix_1 : '';
//         doc['Mailing Care of Name'] = '';
//         doc['Mailing Address'] = mailing_address.trim();
//         doc['Mailing Unit #'] = '';
//         doc['Mailing City'] = mailing_city.trim();
//         doc['Mailing State'] = mailing_state;
//         doc['Mailing Zip'] = mailing_zip;
//         doc['Property Type'] = property_type;
//         doc['Total Assessed Value'] = total_assessed_value;
//         doc['Last Sale Recording Date'] = last_sale_date;
//         doc['Last Sale Amount'] = last_sale_amount.trim();
//         doc['Est. Remaining balance of Open Loans'] = '';
//         doc['Est Value'] = est_value;
//         doc['yearBuilt'] = '';
//         doc['Est Equity'] = '';
//         doc['Lien Amount'] = '';
//         await doc.save();
//         console.log(doc);
//     }
// }