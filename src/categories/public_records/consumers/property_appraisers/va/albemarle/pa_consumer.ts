// import puppeteer from 'puppeteer';
// const parseAddress = require('parse-address');

// import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
// import { IPublicRecordAttributes } from '../../../../../../models/public_record_attributes'

// export default class PAConsumer extends AbstractPAConsumer {
//     source: string;
//     state: string;
//     county: string;
//     categories: string[];

//     urls = {
//         propertyAppraiserPage: 'https://gisweb.albemarle.org/gpv_51/Viewer.aspx'
//     }

//     xpaths = {
//         isPAloaded: '//*[@id="pnlLeft"]'
//     }

//     constructor(state: string, county: string, categories: string[] = ['foreclosure', 'preforeclosure', 'auction', 'tax-lien', 'bankruptcy'], source: string = '') {
//         super();
//         this.source = source;
//         this.state = state;
//         this.county = county;
//         this.categories = categories;
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
//         //-------------------name seperation stuff goes here-------------------//

//         const companyIdentifiersArray = ['GENERAL', 'TRUST', 'TRUSTEE', 'TRUSTEES', 'INC', 'ORGANIZATION', 'CORP', 'CORPORATION', 'LLC', 'MOTORS', 'BANK', 'UNITED', 'CO', 'COMPANY', 'FEDERAL', 'MUTUAL', 'ASSOC', 'AGENCY', 'PA', 'P A', '\\d\\d+', 'TR', 'S A', 'FIRM', 'PORTFOLIO', 'LEGAL', 'MANAGEMENT', 'COUNTY', 'CWSAMS', 'LP', 'CITY', 'INDUSTRIAL', 'IND', 'PARK', 'HABITAT', 'HOLDINGS', 'MOUNT', 'MISSIONARY', 'PUBLIC', 'LAND', 'CHURCH\\s*OF'];
//         const removeFromNamesArray = ['ET', 'AS', 'DECEASED', 'DCSD', 'CP\/RS', 'JT\/RS', 'JTRS', 'TRS', 'C\/O', '\\(BEN\\)', 'EST OF', 'EST', 'LE(?=\\s*$)', 'H\/E', 'ETAL', 'ET AL'];
//         const suffixNamesArray = ['I', 'II', 'III', 'IV', 'V', 'ESQ', 'JR', 'SR']

//         const companyRegexString = `\\b(?:${companyIdentifiersArray.join('|')})\\b`;
//         const removeFromNameRegexString = `^(.*?)(?:\\b|\\s+)(?:${removeFromNamesArray.join('|')})(?:\\b(.*?))?$`;

//         const discriminateAndRemove = (name: any) => {
//             let isCompanyName = name.match(new RegExp(companyRegexString, 'i'));
//             if (isCompanyName) {
//                 return {
//                     type: 'company',
//                     name: name
//                 }
//             }

//             let cleanName = name.match(new RegExp(removeFromNameRegexString, 'i'))
//             if (cleanName) {
//                 if (cleanName[1].trim()) {
//                     name = cleanName[1];
//                 }
//                 else if (cleanName[2].trim()) {
//                     name = cleanName[2];
//                 }
//             }
//             return {
//                 type: 'person',
//                 name: name
//             }
//         }

//         const normalizeNames = (fullName: any) => {
//             const normalizeNameRegexString = `^\\s*(?:(.*?)\\s*,\\s*)?([^\\s]*)(?:\\s*(.*?))?(?:\\s*((?:${suffixNamesArray.join('|')})))?\\s*$`;
//             const normalizeNameRegex = new RegExp(normalizeNameRegexString, 'i');

//             let normalizedNameMatch = fullName.match(normalizeNameRegex);
//             if (normalizedNameMatch) {
//                 let firstName = normalizedNameMatch[2];
//                 let middleName = normalizedNameMatch[3] || '';
//                 let lastName = normalizedNameMatch[1] || '';
//                 let nameSuffix = normalizedNameMatch[4] || '';
//                 return {
//                     fullName: fullName.trim(),
//                     firstName: firstName.trim(),
//                     middleName: middleName.trim(),
//                     lastName: lastName.trim(),
//                     nameSuffix: nameSuffix.trim()
//                 }
//             }
//             return {
//                 fullName: fullName.trim()
//             }
//         }

//         const checkForMultipleNamesAndNormalize = (name: any) => {
//             let results = [];
//             let lastNameBkup = '';

//             let multipleNames = name.match(/^(.*?)\s*&\s*(.*?)$/);
//             while (multipleNames) {
//                 let secondName = '';
//                 if (multipleNames[1].trim()) {
//                     let normalized = normalizeNames(multipleNames[1])
//                     if (normalized.hasOwnProperty('lastName') && normalized.lastName) {
//                         lastNameBkup = normalized.lastName;
//                     } else if (lastNameBkup) {
//                         normalized['lastName'] = lastNameBkup;
//                     }
//                     results.push(normalized);
//                 }

//                 if (multipleNames[2].trim()) secondName = multipleNames[2];
//                 multipleNames = secondName.match(/^(.*?)\s*&\s*(.*?)$/);
//                 if (!multipleNames && secondName.trim()) {
//                     let normalized = normalizeNames(secondName);
//                     if ((!normalized.hasOwnProperty('lastName') || !normalized.lastName) && lastNameBkup) {
//                         normalized['lastName'] = lastNameBkup;
//                     }
//                     results.push(normalized);
//                 }
//             }

//             if (results.length) {
//                 return results;
//             }
//             return [normalizeNames(name)];
//         }
//         //--------------------------name separation stuff ends here---------------------------------//














//         const page = this.browserPages.propertyAppraiserPage!;


//         for (let document of docsToParse) {


//             //head to the PA website
//             //go to the search page
//             try {
//                 await page.goto('http://propaccess.traviscad.org/clientdb/?cid=1', {
//                     waitUntil: 'networkidle0',
//                     timeout: 60000
//                 });
//             } catch (error) {
//                 console.log("error  : " + error);
//                 console.log('couldnt head to propaccess.trueautomation.com retrying ... ');
//                 //retry for second time
//                 try {
//                     await page.goto('http://propaccess.traviscad.org/clientdb/?cid=1', {
//                         waitUntil: 'networkidle0',
//                         timeout: 60000
//                     });
//                 } catch (error) {
//                     console.log("error  : " + error);
//                     await this.browser?.close();
//                     return false;
//                 }

//             }









//             //affect the current address
//             let address: any = document["Property Address"];
//             console.log('------------------Looking for address : ' + address + "--------------------")


//             address = parseAddress.parseLocation(address);



//             //main try 
//             try {











//                 //go to the search page
//                 try {
//                     await page.goto('https://gisweb.albemarle.org/gpv_51/Viewer.aspx', {
//                         waitUntil: 'networkidle0',
//                         timeout: 60000
//                     });
//                 } catch (error) {
//                     console.log("error  : " + error);
//                     console.log('couldnt head to maps.clarkcountynv.gov retrying ... ');
//                     //retry for second time
//                     try {
//                         await page.goto('https://gisweb.albemarle.org/gpv_51/Viewer.aspx', {
//                             waitUntil: 'networkidle0',
//                             timeout: 60000
//                         });
//                     } catch (error) {
//                         console.log("error  : " + error);
//                         await this.browser?.close();
//                         return false;
//                     }

//                 }






















//                 //open search tab
//                 try {
//                     await page.waitForXPath(`//*[@id="tabSearch"]/a`);
//                     let [searchTab] = await page.$x(`//*[@id="tabSearch"]/a`);
//                     await searchTab.click();
//                     await page.waitFor(4000);
//                 } catch (error) {
//                     console.log('Error in open search tab:');
//                     console.log(error);
//                 }















//                 //fill in the house number
//                 try {
//                     if (address.number) {
//                         await page.waitForXPath(`//*[@data-id="PropAddressHouseNo"]`);
//                         let [houseNumberInput] = await page.$x(`//*[@data-id="PropAddressHouseNo"]`);
//                         await houseNumberInput.click({ clickCount: 3 });
//                         await houseNumberInput.press('Backspace');
//                         await houseNumberInput.type(address.number);
//                     }
//                 } catch (error) {
//                     console.log('Error in fill in the house number :');
//                     console.log(error);
//                 }




















//                 //fill in the address street name
//                 try {

//                     if (address.street) {
//                         await page.waitForXPath(`//*[@data-id="PropAddressStreet_autocomplete"]`);
//                         let [streetNameInput] = await page.$x(`//*[@data-id="PropAddressStreet_autocomplete"]`);
//                         await streetNameInput.click({ clickCount: 3 });
//                         await streetNameInput.press('Backspace');
//                         await streetNameInput.type(address.street);
//                         try {
//                             //wait for suggestion
//                             await page.waitForXPath(`//*[@data-index="0" and @class="autocomplete-suggestion"]`);
//                             //pick the first suggestion
//                             await page.keyboard.press('ArrowDown');

//                         } catch (error) {

//                         }
//                     }
//                 } catch (error) {
//                     console.log('Error in fill in the address street name :');
//                     console.log(error);
//                 }














//                 //click search 
//                 try {
//                     await page.waitForXPath(`//*[@id="cmdSearch"]`);
//                     let [searchButton] = await page.$x(`//*[@id="cmdSearch"]`);
//                     await searchButton.click();
//                 } catch (error) {
//                     console.log('Error in click search  :');
//                     console.log(error);
//                 }











//                 //wait for result text to change from searching to found
//                 let searchLabel: any;
//                 try {
//                     await page.waitForXPath(`//*[@id="labSearchCount" and contains(text(),'found')]`);
//                     //get the text from the search label
//                     [searchLabel] = await page.$x(`//*[@id="labSearchCount"]`);
//                     searchLabel = await searchLabel.getProperty('innerText');
//                     searchLabel = await searchLabel.jsonValue();
//                     searchLabel = searchLabel.trim();
//                 } catch (error) {
//                     console.log('Error in wait for result text to change from searching to found  :');
//                     console.log(error);
//                 }










//                 //if the search label doesnt have the value of 1 found then continue to the next address
//                 if (searchLabel == "None found") {
//                     console.log("address Not Found ! ");
//                     continue;
//                 } else if (searchLabel != "1 found") {
//                     console.log("found more than one result ! ");
//                     continue;
//                 } else {












//                     //wait for the panel to show
//                     try {
//                         console.log("address Found ! ");
//                         await page.waitForXPath(`//*[@id="pnlDataDisplay"]`);
//                         await page.waitFor(5000)

//                     } catch (error) {
//                         console.log('Error in wait for the panel to show :');
//                         console.log(error);
//                     }















//                     //owner name
//                     let secondaryOwnersNamesArray = [];

//                     try {

//                         let [ownerName]: any = await page.$x(`//*[@class="Label" and text()='Owner']/following-sibling::div[@class='Value']`);
//                         if (ownerName) {
//                             ownerName = await ownerName.getProperty('innerText');
//                             ownerName = await ownerName.jsonValue();



//                             let discriminateResult = discriminateAndRemove(ownerName);
//                             if (discriminateResult.type == 'person') {
//                                 let separatedNamesArray = checkForMultipleNamesAndNormalize(discriminateResult.name);

//                                 for (let i = 0; i < separatedNamesArray.length; i++) {
//                                     let separatedNameObj = separatedNamesArray[i];
//                                     if (i == 0) {
//                                         document["Full Name"] = separatedNameObj.fullName;
//                                         document["First Name"] = separatedNameObj.firstName;
//                                         document["Last Name"] = separatedNameObj.lastName;
//                                         document["Middle Name"] = separatedNameObj.middleName;
//                                         document["Name Suffix"] = separatedNameObj.nameSuffix;
//                                     }
//                                     else {
//                                         secondaryOwnersNamesArray.push(separatedNamesArray[i]);
//                                     }

//                                 }
//                             } else {
//                                 document["Full Name"] = discriminateResult.name;
//                             }



//                         } else {
//                             console.log('owner name Not Available');
//                         }

//                     } catch (error) {
//                         console.log('Error in owner name :');
//                         console.log(error);
//                     }












//                     //Mailing Address 
//                     try {
//                         let [mailingAddress]: any = await page.$x(`//*[@class="Label" and text()='Address']/following-sibling::div[@class='Value']`);
//                         if (mailingAddress) {
//                             mailingAddress = await mailingAddress.getProperty('innerText');
//                             mailingAddress = await mailingAddress.jsonValue();
//                             // console.log('mailing address : ');
//                             // console.log(mailingAddress);
//                             // console.log('\n')
//                             if (mailingAddress && mailingAddress.trim() != '') {
//                                 document["Mailing Address"] = mailingAddress.replace(/(\r\n|\n|\r)/gm, " ")
//                                 //add mailing city, state and zip
//                                 let maillingAddress_separated = parseAddress.parseLocation(mailingAddress);
//                                 if (maillingAddress_separated.city) {
//                                     document["Mailing City"] = maillingAddress_separated.city;
//                                 }
//                                 if (maillingAddress_separated.state) {
//                                     document["Mailing State"] = maillingAddress_separated.state;
//                                 }
//                                 if (maillingAddress_separated.zip) {
//                                     document["Mailing Zip"] = maillingAddress_separated.zip;
//                                 }
//                             }





//                         } else {
//                             console.log('Mailing Address Not Available');
//                         }

//                     } catch (error) {
//                         console.log('Error in Mailing Address :');
//                         console.log(error);
//                     }










//                     //property type
//                     try {
//                         let [propertyType]: any = await page.$x(`//*[@class="Label" and text()='Tax Type']/following-sibling::div[@class='Value']`);
//                         if (propertyType) {
//                             propertyType = await propertyType.getProperty('innerText');
//                             propertyType = await propertyType.jsonValue();
//                             // console.log('property type : ');
//                             // console.log(propertyType);
//                             // console.log('\n')
//                             if (propertyType && propertyType.trim() != '')
//                                 document["Property Type"] = propertyType;

//                         } else {
//                             console.log('property type Not Available');
//                         }

//                     } catch (error) {
//                         console.log('Error in property type :');
//                         console.log(error);
//                     }










//                     //total Assessed Value text
//                     try {
//                         let [totalAssessedValue]: any = await page.$x(`//*[@class="Label" and text()='Total Value']/following-sibling::div[@class='Value']`);
//                         if (totalAssessedValue) {
//                             totalAssessedValue = await totalAssessedValue.getProperty('innerText');
//                             totalAssessedValue = await totalAssessedValue.jsonValue();
//                             // console.log('total Assessed Value : ');
//                             // console.log(totalAssessedValue);
//                             // console.log('\n')
//                             if (totalAssessedValue && totalAssessedValue.trim() != '' && totalAssessedValue != 'N/A')
//                                 document["Total Assessed Value"] = totalAssessedValue;
//                         } else {
//                             console.log('total Assessed Value Not Available');
//                         }




//                     } catch (error) {
//                         console.log('Error in total Assessed Value text :');
//                         console.log(error);
//                     }









//                     //Last sale date
//                     try {
//                         let [lastSaleDate]: any = await page.$x(`//*[@class="Label" and text()='Sale Date']/following-sibling::div[@class='Value']`);
//                         if (lastSaleDate) {
//                             lastSaleDate = await lastSaleDate.getProperty('innerText');
//                             lastSaleDate = await lastSaleDate.jsonValue();
//                             // console.log('Last Sale Date : ');
//                             // console.log(lastSaleDate);
//                             // console.log('\n')
//                             if (lastSaleDate && lastSaleDate.trim() != '' && lastSaleDate != 'N/A')
//                                 document["Last Sale Recording Date"] = lastSaleDate;
//                         } else {
//                             console.log('Last Sale Date Not Available');
//                         }

//                     } catch (error) {
//                         console.log('Error in Last sale date :');
//                         console.log(error);
//                     }













//                     //Last sale price
//                     try {
//                         let [lastSalePrice]: any = await page.$x(`//*[@class="Label" and text()='Sale Price']/following-sibling::div[@class='Value']`);
//                         if (lastSalePrice) {
//                             lastSalePrice = await lastSalePrice.getProperty('innerText');
//                             lastSalePrice = await lastSalePrice.jsonValue();
//                             // console.log('last sale price : ');
//                             // console.log(lastSalePrice);
//                             // console.log('\n')
//                             if (lastSalePrice && lastSalePrice.trim() != '' && lastSalePrice != 'N/A')
//                                 document["Last Sale Amount"] = lastSalePrice;
//                         } else {
//                             console.log('last sale price Not Available');
//                         }
//                     } catch (error) {
//                         console.log('Error in Last sale price :');
//                         console.log(error);
//                     }










//                     //owner occupied
//                     try {
//                         let ownerOccupied;
//                         if (document["Mailing Address"] != "" && document["Property Address"]) {
//                             //normalize addresses then compare
//                             if (
//                                 document["Mailing Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase().includes(document["Property Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase()) ||
//                                 document["Mailing Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase() == document["Property Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase() ||
//                                 document["Property Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase().includes(document["Mailing Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase())
//                             ) {
//                                 ownerOccupied = true;
//                             } else {
//                                 ownerOccupied = false;
//                             }
//                             document["Owner Occupied"] = ownerOccupied;
//                         }

//                     } catch (error) {
//                         console.log("Owner Occupied ERROR : ")
//                         console.log(error);
//                     }


//                     //document parsed 




//                     //save 
//                     console.log(await document.save());


//                     try {
//                         //all secondaryOwnersNamesArray are persons no need to test them 
//                         secondaryOwnersNamesArray.forEach(async ownerNameSeparated => {

//                             console.log('---------- cloned doc ----------')
//                             let newDoc = await this.cloneMongoDocument(document);
//                             newDoc["Full Name"] = ownerNameSeparated.fullName;
//                             newDoc["First Name"] = ownerNameSeparated.firstName;
//                             newDoc["Last Name"] = ownerNameSeparated.lastName;
//                             newDoc["Middle Name"] = ownerNameSeparated.middleName;
//                             newDoc["Name Suffix"] = ownerNameSeparated.nameSuffix;

//                             console.log(await newDoc.save());
//                         });
//                     } catch (error) {
//                         console.log('Error in separating other owners names :');
//                         console.log(error);
//                     }




//                 }



//             } catch (error) {
//                 console.log(error);
//                 continue;
//             }




//         }





//         await this.browser?.close();
//         return true;
//     }

// }