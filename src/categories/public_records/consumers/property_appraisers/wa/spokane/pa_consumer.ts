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
//         propertyAppraiserPage: 'https://cp.spokanecounty.org/scout/propertyinformation/'
//     }

//     xpaths = {
//         isPAloaded: '//*[@id="txtSearch"]'
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










//             //affect the current address
//             let address = document["Property Address"];
//             console.log('------------------Looking for address : ' + address + "--------------------")





//             //main try 
//             try {

//                 //go to the search page
//                 try {
//                     await page.goto('https://cp.spokanecounty.org/scout/propertyinformation/', {
//                         waitUntil: 'networkidle0',
//                         timeout: 60000
//                     });
//                 } catch (error) {
//                     console.log("error  : " + error);
//                     console.log('couldnt head to cp.spokanecounty.org retrying ... ');
//                     //retry for second time
//                     try {

//                         await page.goto('https://cp.spokanecounty.org/scout/propertyinformation/', {
//                             waitUntil: 'networkidle0',
//                             timeout: 60000
//                         });
//                     } catch (error) {
//                         console.log("error  : " + error);
//                         await this.browser?.close();
//                         return false
//                     }

//                 }





//                 //fill in the address
//                 try {
//                     await page.waitForXPath(`//*[@id="txtSearch"]`);
//                     let [searchBox] = await page.$x(`//*[@id="txtSearch"]`);
//                     await searchBox.click({ clickCount: 3 });
//                     await searchBox.press('Backspace');
//                     await searchBox.type(address);

//                 } catch (error) {
//                     console.log('Error in fill in the address :');
//                     console.log(error);
//                 }










//                 //click search 
//                 try {
//                     await page.waitForXPath(`//*[@id="MainContent_btnSearch"]`);
//                     let [searchButton] = await page.$x(`//*[@id="MainContent_btnSearch"]`);
//                     await searchButton.click();
//                 } catch (error) {
//                     console.log('Error in click search  :');
//                     console.log(error);
//                 }








//                 //wait for loading
//                 try {
//                     await page.waitForNavigation();
//                 } catch (error) {
//                     console.log('Error in loading :');
//                     console.log(error);
//                 }


//                 let [notFoundIndicator] = await page.$x(`//*[contains(text(),'No record found by that search criteria')]`);
//                 if (notFoundIndicator) {
//                     console.log("address Not Found ! ");
//                 } else {





//                     let secondaryOwnersNamesArray = [];
//                     //Owner Name
//                     try {
//                         let [OwnerName]: any = await page.$x(`//*[@id="MainContent_OwnerName_dlOwner_txtNameLabel_0"]`);
//                         if (OwnerName) {
//                             OwnerName = await OwnerName.getProperty('innerText');
//                             OwnerName = await OwnerName.jsonValue();
//                             // console.log('Owner Name: ');
//                             // console.log(OwnerName);
//                             // console.log('\n')






//                             let discriminateResult = discriminateAndRemove(OwnerName);
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
//                             console.log('Owner Name Not Available');
//                         }

//                     } catch (error) {
//                         console.log('Error in Owner Name :');
//                         console.log(error);
//                     }








//                     //Mailing address
//                     try {
//                         let parsedMailingAddress;
//                         let [MailingAddress]: any = await page.$x(`//*[@id="MainContent_OwnerName_dlOwner_addressLabel_0"]`);
//                         if (MailingAddress) {
//                             MailingAddress = await MailingAddress.getProperty('innerText');
//                             MailingAddress = await MailingAddress.jsonValue();
//                             // console.log('Mailing address : ');
//                             // console.log(MailingAddress);
//                             // console.log('\n')




//                             if (MailingAddress && MailingAddress.trim() != '') {
//                                 document["Mailing Address"] = MailingAddress.replace(/(\r\n|\n|\r)/gm, " ")
//                                 //add mailing city, state and zip
//                                 let mailingAddress_separated = parseAddress.parseLocation(MailingAddress);
//                                 if (mailingAddress_separated.city) {
//                                     document["Mailing City"] = mailingAddress_separated.city;
//                                 }
//                                 if (mailingAddress_separated.state) {
//                                     document["Mailing State"] = mailingAddress_separated.state;
//                                 }
//                                 if (mailingAddress_separated.zip) {
//                                     document["Mailing Zip"] = mailingAddress_separated.zip;
//                                 }
//                             }




//                         } else {
//                             console.log('Mailing address Not Available');
//                             console.log('\n')

//                         }

//                     } catch (error) {
//                         console.log('Error in Mailing address :');
//                         console.log(error);
//                     }









//                     //property type
//                     try {
//                         let [propertyType]: any = await page.$x(`//*[@id="MainContent_Dwelling_GridView6"]/tbody/tr[1]/td[5]`);
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
//                             console.log('\n')

//                         }
//                     } catch (error) {
//                         console.log('Error in property type :');
//                         console.log(error);
//                     }





//                     //Total assessed value
//                     try {
//                         let [totalAssessedValue]: any = await page.$x(`//*[@id="MainContent_AssessedValue_GridView4"]/tbody/tr[1]/td[2]`);
//                         if (totalAssessedValue) {
//                             totalAssessedValue = await totalAssessedValue.getProperty('innerText');
//                             totalAssessedValue = await totalAssessedValue.jsonValue();
//                             // console.log('Total assessed value : ');
//                             // console.log(totalAssessedValue);
//                             // console.log('\n')
//                             if (totalAssessedValue && totalAssessedValue.trim() != '')
//                                 document["Total Assessed Value"] = totalAssessedValue;


//                         } else {
//                             console.log('Total assessed value Not Available');
//                             console.log('\n')

//                         }
//                     } catch (error) {
//                         console.log('Error in Total assessed value :');
//                         console.log(error);
//                     }










//                     //Last sale recording date
//                     try {
//                         let [lastSaleDate]: any = await page.$x(`//*[@id="MainContent_Sales_GridView13"]/tbody/tr[1]/td[1]`);
//                         if (lastSaleDate) {
//                             lastSaleDate = await lastSaleDate.getProperty('innerText');
//                             lastSaleDate = await lastSaleDate.jsonValue();
//                             // console.log('Last sale recording date : ');
//                             // console.log(lastSaleDate);
//                             // console.log('\n')
//                             if (lastSaleDate && lastSaleDate.trim() != '')
//                                 document["Last Sale Recording Date"] = lastSaleDate;

//                         } else {
//                             console.log('Last sale recording date Not Available');
//                             console.log('\n')

//                         }
//                     } catch (error) {
//                         console.log('Error in Last sale recording date :');
//                         console.log(error);
//                     }









//                     //Last sale amount
//                     try {
//                         let [lastSaleAmount]: any = await page.$x(`//*[@id="MainContent_Sales_GridView13"]/tbody/tr[1]/td[2]`);
//                         if (lastSaleAmount) {
//                             lastSaleAmount = await lastSaleAmount.getProperty('innerText');
//                             lastSaleAmount = await lastSaleAmount.jsonValue();
//                             // console.log('Last sale amount : ');
//                             // console.log(lastSaleAmount);
//                             // console.log('\n')
//                             if (lastSaleAmount && lastSaleAmount.trim() != '')
//                                 document["Last Sale Amount"] = lastSaleAmount;

//                         } else {
//                             console.log('Last sale amount Not Available');
//                             console.log('\n')

//                         }
//                     } catch (error) {
//                         console.log('Error in Last sale amount :');
//                         console.log(error);
//                     }









//                     //Estimated value
//                     try {
//                         let [EstimatedValue]: any = await page.$x(`//*[@id="MainContent_AssessedValue_GridView4"]/tbody/tr[1]/td[3]`);
//                         if (EstimatedValue) {
//                             EstimatedValue = await EstimatedValue.getProperty('innerText');
//                             EstimatedValue = await EstimatedValue.jsonValue();
//                             // console.log('Estimated value : ');
//                             // console.log(EstimatedValue);
//                             // console.log('\n')
//                             if (EstimatedValue && EstimatedValue.trim() != '')
//                                 document["Est Value"] = EstimatedValue;


//                         } else {
//                             console.log('Estimated value Not Available');
//                             console.log('\n')

//                         }
//                     } catch (error) {
//                         console.log('Error in Estimated value :');
//                         console.log(error);
//                     }









//                     //effictive year built
//                     try {
//                         let [effictiveYearBuilt]: any = await page.$x(`//*[@id="MainContent_Dwelling_GridView6"]/tbody/tr[1]/td[2]`);
//                         if (effictiveYearBuilt) {
//                             effictiveYearBuilt = await effictiveYearBuilt.getProperty('innerText');
//                             effictiveYearBuilt = await effictiveYearBuilt.jsonValue();
//                             // console.log('effictive year built : ');
//                             // console.log(effictiveYearBuilt);
//                             // console.log('\n')
//                             if (effictiveYearBuilt && effictiveYearBuilt.trim() != '')
//                                 document["yearBuilt"] = effictiveYearBuilt;

//                         } else {
//                             console.log('effictive year built Not Available');
//                             console.log('\n')

//                         }
//                     } catch (error) {
//                         console.log('Error in effictive year built :');
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