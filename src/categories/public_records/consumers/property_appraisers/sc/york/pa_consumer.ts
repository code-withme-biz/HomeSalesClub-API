// import puppeteer from 'puppeteer';
// import axios from 'axios';

// import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
// import { IPublicRecordAttributes } from '../../../../../../models/public_record_attributes'


// export default class PAConsumer extends AbstractPAConsumer {
//     source: string;
//     state: string;
//     county: string;
//     categories: string[];

//     urls = {
//         propertyAppraiserPage: 'https://qpublic.schneidercorp.com/Application.aspx?App=YorkCountySC&Layer=Parcels&PageType=Search'
//     }

//     xpaths = {
//         isPAloaded: '//div[contains(@class, "footer-disclaimer-text")]'
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
//         const url_search = 'https://qpublic.schneidercorp.com/Application.aspx?App=YorkCountySC&Layer=Parcels&PageType=Search';

//         await page.goto(url_search);

//         try{
//             await page.waitForXPath('//a[contains(., "Agree")]', {visible: true});
//         } catch {
//             await page.waitForXPath('//a[contains(., "Unblock me")]', {visible: true}); // Recaptcha page
//             console.log("Resolving captcha...");
//             let recaptchaSitekeyHandle = await page.$x('//*[@class="g-recaptcha"]');
//             let siteKey = await recaptchaSitekeyHandle[0].evaluate((elem) => elem.getAttribute('data-sitekey'));
//             let pageUrl = await page.url();
//             const captchaSolution:any = await resolveRecaptcha2(siteKey, pageUrl);
//             let recaptchaHandle = await page.$x('//*[@id="g-recaptcha-response"]');
//             await recaptchaHandle[0].evaluate((elem:any, captchaSolution:any) => elem.innerHTML = captchaSolution, captchaSolution);
//             console.log("Done.");
//             await page.waitFor(3000);
//             let submit_recaptcha = await page.$x('//a[contains(., "Unblock me")]');
//             await submit_recaptcha[0].click();
//         }
        
//         try{
//             await page.waitForXPath('//a[contains(., "Agree")]', {visible: true});
//             let agree_button = await page.$x('//a[contains(., "Agree")]'); // Wait for pop up
//             agree_button[0].click();
//         } catch{
//             // pass it
//         }

//         await page.waitForSelector('.footer-disclaimer-text', {visible: true});

//         for (let document of docsToParse) {
//             // do everything that needs to be done for each document here
//             let address_input = document["Property Address"];
//             console.log(address_input);
//             await page.goto(url_search);
//             try {
//                 await page.waitForSelector('.footer-disclaimer-text', {visible: true});
//             } catch {
//                 let is_captcha = true;
//                 try{
//                     await page.waitForXPath('//a[contains(., "Unblock me")]', {visible: true}); // Recaptcha page
//                 } catch {
//                     is_captcha = false;
//                 }
//                 if (is_captcha){
//                     console.log("Resolving captcha...");
//                     let recaptchaSitekeyHandle = await page.$x('//*[@class="g-recaptcha"]');
//                     let siteKey = await recaptchaSitekeyHandle[0].evaluate((elem) => elem.getAttribute('data-sitekey'));
//                     let pageUrl = await page.url();
//                     const captchaSolution:any = await resolveRecaptcha2(siteKey, pageUrl);
//                     let recaptchaHandle = await page.$x('//*[@id="g-recaptcha-response"]');
//                     await recaptchaHandle[0].evaluate((elem, captchaSolution) => elem.innerHTML = captchaSolution, captchaSolution);
//                     console.log("Done.");
//                     await page.waitFor(3000);
//                     let submit_recaptcha = await page.$x('//a[contains(., "Unblock me")]');
//                     await submit_recaptcha[0].click();
//                     await page.waitForSelector('.footer-disclaimer-text', {visible: true});
//                 }
//             }
//             await page.$eval('input[name="ctlBodyPane$ctl01$ctl01$txtAddress"]', (el: any, value:any) => el.value = value, address_input); // Send keys
//             await page.click('a[id="ctlBodyPane_ctl01_ctl01_btnSearch"]');
//             await page.waitFor(3000);
//             try {
//                 await page.waitForSelector('.footer-disclaimer-text', {visible: true});
//             } catch {
//                 let is_captcha = true;
//                 try{
//                     await page.waitForXPath('//a[contains(., "Unblock me")]', {visible: true}); // Recaptcha page
//                 } catch {
//                     is_captcha = false;
//                 }
//                 if (is_captcha){
//                     console.log("Resolving captcha...");
//                     let recaptchaSitekeyHandle = await page.$x('//*[@class="g-recaptcha"]');
//                     let siteKey = await recaptchaSitekeyHandle[0].evaluate((elem) => elem.getAttribute('data-sitekey'));
//                     let pageUrl = await page.url();
//                     const captchaSolution:any = await resolveRecaptcha2(siteKey, pageUrl);
//                     let recaptchaHandle = await page.$x('//*[@id="g-recaptcha-response"]');
//                     await recaptchaHandle[0].evaluate((elem, captchaSolution) => elem.innerHTML = captchaSolution, captchaSolution);
//                     console.log("Done.");
//                     await page.waitFor(3000);
//                     let submit_recaptcha = await page.$x('//a[contains(., "Unblock me")]');
//                     await submit_recaptcha[0].click();
//                     await page.waitForSelector('.footer-disclaimer-text', {visible: true});
//                 }
//             }

//             // Property Address
//             let property_address;
//             try{
//                 property_address = await page.evaluate(el => el.textContent, (await page.$x('//strong[contains(.,"Location Address")]/ancestor::tr/td[1]/span/text()[1]'))[0]);
//             } catch {
//                 console.log(address_input, "=> Address not found!");
//                 continue;
//             }
            
//             // Owner Names
//             let owner_names = await page.evaluate(el => el.textContent, (await page.$x('//div[contains(.,"Owners")]/ancestor::section/div/div/div[1]/child::*[1]'))[0]);

//             // Mailing Address
//             const mailing_rows = await page.$x('//div[contains(.,"Owners")]/ancestor::section/div/div/div[1]/child::*');
//             let mail_addr_num = mailing_rows.length - 1;
//             const mailing_address = await page.evaluate(el => el.textContent, (await page.$x('//div[contains(.,"Owners")]/ancestor::section/div/div/div[1]/child::*['+mail_addr_num+']'))[0]);
//             let mailing_city_zip_combined = await page.evaluate(el => el.textContent, (await page.$x('//div[contains(.,"Owners")]/ancestor::section/div/div/div[1]/child::*['+mailing_rows.length+']'))[0]);
//             let mailing_city_zip_combined_arr = mailing_city_zip_combined.split(" ");
//             const mailing_zip = mailing_city_zip_combined_arr.pop();
//             const mailing_state = mailing_city_zip_combined_arr.pop();
//             let mailing_city = '';
//             for(let city of mailing_city_zip_combined_arr){
//                 mailing_city += city + ' ';
//             }
//             mailing_city = mailing_city.trim();
            
//             // Property Type
//             const property_type = await page.evaluate(el => el.textContent, (await page.$x('//strong[contains(.,"Land Use")]/ancestor::tr/td[1]/span/text()[1]'))[0]);

//             // Total Assessed Value
//             let total_assessed_value;
//             try{
//                 total_assessed_value = await page.evaluate(el => el.textContent, (await page.$x('//th[contains(., "Total Assessed Value")]/parent::tr/td[2]'))[0]);
//             } catch {
//                 total_assessed_value = '';
//             }

//             // Last Sale Date
//             let last_sale_date;
//             try{
//                 last_sale_date = await page.evaluate(el => el.textContent, (await page.$x('//th[contains(., "Sale Date")]/ancestor::table/tbody/tr[1]/th[1]'))[0]);
//             } catch {
//                 last_sale_date = '';
//             }

//             // Last Sale Amount
//             let last_sale_amount;
//             try{
//                 last_sale_amount = await page.evaluate(el => el.textContent, (await page.$x('//th[contains(., "Sale Date")]/ancestor::table/tbody/tr[1]/td[1]'))[0]);
//             } catch{
//                 last_sale_amount = '';
//             }

//             // Est Value
//             let est_value;
//             try{
//                 est_value = await page.evaluate(el => el.textContent, (await page.$x('//th[contains(., "Total Market Value")]/ancestor::tr/td[2]'))[0]);
//             } catch {
//                 est_value = '';
//             }

//             // yearBuilt
//             let effective_year;
//             try{
//                 effective_year = await page.evaluate(el => el.textContent, (await page.$x('//th[contains(., "Year Built")]/ancestor::tr/td[1]/span'))[0]);
//             } catch {
//                 effective_year = '';
//             }
//             /* Normalize the name */
//             let owner_fullname_1, owner_first_1, owner_last_1, owner_middle_1, owner_suffix_1, owner_fullname_2, owner_first_2, owner_last_2, owner_middle_2, owner_suffix_2;
//             console.log(owner_names.trim());
//             let arr_names = owner_names.split(" & ");
//             owner_suffix_1 = this.getSuffix(arr_names[0]);
//             let name_and_type_1 = this.discriminateAndRemove(arr_names[0]);
//             owner_fullname_1 = name_and_type_1.name;
//             let have_2_owners = true;
//             let name_and_type_2;
//             try {
//                 owner_suffix_2 = this.getSuffix(arr_names[1]);
//                 name_and_type_2 = this.discriminateAndRemove(arr_names[1]);
//             } catch {
//                 have_2_owners = false;
//             }
            
//             if (name_and_type_1.type == 'person'){
//                 let owner_1_array = name_and_type_1.name.split(" ");
//                 owner_last_1 = owner_1_array ? owner_1_array.shift() : '';
//                 owner_first_1 = owner_1_array ? owner_1_array.shift() : '';
//                 owner_middle_1 = owner_1_array ? owner_1_array.shift() : '';
//             } else {
//                 owner_suffix_1 = '';
//             }
//             if(have_2_owners){
//                 owner_fullname_2 = name_and_type_2.name;
//                 if (name_and_type_2.type == 'person'){
//                     let owner_2_array = name_and_type_2.name.split(" ");
//                     owner_last_2 = owner_last_1;
//                     owner_first_2 = owner_2_array ? owner_2_array.shift() : '';
//                     owner_middle_2 = owner_2_array ? owner_2_array.shift() : '';
//                 } else {
//                     owner_suffix_2 = '';
//                 }
//             }

//             // Owner Occupied
//             let owner_occupied = false;
//             if(mailing_state == 'SC'){
//                 let arr_property_address = property_address.toLowerCase().split(" ");
//                 let arr_mailing_address = mailing_address.toLowerCase().split(" ");
//                 let count_matches = 0;
//                 for(let val1 of arr_property_address){
//                     for(let val2 of arr_mailing_address){
//                         if (val1 == val2){
//                             count_matches += 1;
//                         }
//                     }
//                 }
//                 if(arr_property_address[0] == arr_mailing_address[0] && count_matches >= 2){
//                     owner_occupied = true;
//                 }
//             }

//             document['Owner Occupied'] = owner_occupied;
//             document['Full Name'] = owner_fullname_1 ? owner_fullname_1.trim() : '';
//             document['First Name'] = owner_first_1 ? owner_first_1 : '';
//             document['Last Name'] = owner_last_1 ? owner_last_1 : '';
//             document['Middle Name'] = owner_middle_1 ? owner_middle_1 : '';
//             document['Name Suffix'] = owner_suffix_1 ? owner_suffix_1 : '';
//             document['Mailing Care of Name'] = '';
//             document['Mailing Address'] = mailing_address;
//             document['Mailing Unit #'] = '';
//             document['Mailing City'] = mailing_city;
//             document['Mailing State'] = mailing_state;
//             document['Mailing Zip'] = mailing_zip;
//             document['Property Type'] = property_type;
//             document['Total Assessed Value'] = total_assessed_value;
//             document['Last Sale Recording Date'] = last_sale_date;
//             document['Last Sale Amount'] = last_sale_amount;
//             document['Est. Remaining balance of Open Loans'] = '';
//             document['Est Value'] = est_value;
//             document['yearBuilt'] = effective_year;
//             document['Est Equity'] = '';
//             document['Lien Amount'] = '';
//             await document.save();
//             console.log(document);
//             if(have_2_owners){
//                 let newDocument = await this.cloneMongoDocument(document);
//                 newDocument['Full Name'] = owner_fullname_2 ? owner_fullname_2.trim() : '';
//                 newDocument['First Name'] = owner_first_2 ? owner_first_2 : '';
//                 newDocument['Last Name'] = owner_last_2 ? owner_last_2 : '';
//                 newDocument['Middle Name'] = owner_middle_2 ? owner_middle_2 : '';
//                 newDocument['Name Suffix'] = owner_suffix_2 ? owner_suffix_2 : '';
//                 await newDocument.save();
//                 console.log(newDocument);
//             }
//         }
//         return true;
//     }
// }