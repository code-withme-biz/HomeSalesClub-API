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
//         propertyAppraiserPage: 'https://jeffersonpva.ky.gov/property-search/'
//     }

//     xpaths = {
//         isPAloaded: '//*[@id="psfldAddress"]'
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

//         //there is JS alerts that blick the script, this event will make sure that doesnt heppen!
//         page.on('dialog', async dialog => {
//             dialog.accept();
//         });

//         for (let document of docsToParse) {
//             this.searchBy = document["Property Address"] ? 'address' : 'name';
//             //affect the current address
//             let address = document["Property Address"];
//             console.log('------------------Looking for address : ' + address + "--------------------")






//             //go to the PA ebsite
//             try {
//                 await page.goto('https://jeffersonpva.ky.gov/property-search/', {
//                     waitUntil: 'networkidle0',
//                     timeout: 80000
//                 });
//             } catch (error) {
//                 console.log("error  : " + error);
//                 console.log('couldnt head to jeffersonpva.ky.gov retrying ... ');
//                 //retry for second time
//                 try {

//                     await page.goto('https://jeffersonpva.ky.gov/property-search/', {
//                         waitUntil: 'networkidle0',
//                         timeout: 80000
//                     });
//                 } catch (error) {
//                     console.log("error  : " + error);
//                     return false;
//                 }

//             }








//             //main try 
//             try {


//                 try {
//                     //fill in the address
//                     await page.waitForXPath(`//*[contains(@id,'search')]/*/*[contains(text(),'Search by Address')]/following-sibling::input[1]`);
//                     let [searchBox] = await page.$x(`//*[contains(@id,'search')]/*/*[contains(text(),'Search by Address')]/following-sibling::input[1]`);

//                     await searchBox.click({ clickCount: 3 });
//                     await searchBox.press('Backspace');
//                     await searchBox.type(address);

//                     //click search 
//                     await page.waitForXPath(`//*[contains(@id,'searchFormAddress')]/fieldset/p[2]/input`);
//                     let [searchButton] = await page.$x(`//*[contains(@id,'searchFormAddress')]/fieldset/p[2]/input`);
//                     await searchButton.click();
//                 } catch (error) {
//                     console.log("couldnt search for this address.. due to the following error : ")
//                     console.log(error);
//                     continue;

//                 }




//                 try {
//                     //wait for results to load
//                     await page.waitForNavigation({
//                         waitUntil: 'load',
//                         timeout: 60000
//                     });
//                 } catch (error) {
//                     console.log('waitForNavigation error')
//                     console.log(error);
//                 }




//                 let [successIndicator]: any = await page.$x(`//*[@id="primary"]/div/nav/ul/li[1]/a`);
//                 if (successIndicator) {
//                     try {
//                         successIndicator = await successIndicator.getProperty('innerText');
//                         successIndicator = await successIndicator.jsonValue();
//                     } catch (error) {
//                         console.log("couldnt read successIndicator value, error :");
//                         console.log(error);
//                     }

//                     if (successIndicator.includes('Previous Property')) {
//                         let secondaryOwnersNamesArray = [];
//                         try {
//                             //get Owner Name
//                             let [OwnerName]: any = await page.$x(`//*[@id="basic-info"]/dl/dd[2]`);
//                             if (OwnerName) {
//                                 OwnerName = await OwnerName.getProperty('innerText');
//                                 OwnerName = await OwnerName.jsonValue();
//                                 console.log("Owner Name : " + OwnerName);

//                                 let discriminateResult = discriminateAndRemove(OwnerName);
//                                 if (discriminateResult.type == 'person') {
//                                     let separatedNamesArray = checkForMultipleNamesAndNormalize(discriminateResult.name);

//                                     for (let i = 0; i < separatedNamesArray.length; i++) {
//                                         let separatedNameObj = separatedNamesArray[i];
//                                         if (i == 0) {
//                                             document["Full Name"] = separatedNameObj.fullName;
//                                             document["First Name"] = separatedNameObj.firstName;
//                                             document["Last Name"] = separatedNameObj.lastName;
//                                             document["Middle Name"] = separatedNameObj.middleName;
//                                             document["Name Suffix"] = separatedNameObj.nameSuffix;
//                                         }
//                                         else {
//                                             secondaryOwnersNamesArray.push(separatedNamesArray[i]);
//                                         }

//                                     }
//                                 } else {
//                                     document["Full Name"] = discriminateResult.name;
//                                 }
//                             }
//                         } catch (error) {
//                             console.log('Owner name error : ');
//                             console.log(error);
//                         }





//                         try {
//                             //get mailling Address
//                             let [maillingAddress]: any = await page.$x(`//*[@id="basic-info"]/dl/dd[1]`);
//                             if (maillingAddress) {
//                                 maillingAddress = await maillingAddress.getProperty('innerText');
//                                 maillingAddress = await maillingAddress.jsonValue();
//                                 maillingAddress = maillingAddress.trim();
//                                 document["Mailing Address"] = maillingAddress;


//                                 //add mailing city, state and zip
//                                 let maillingAddress_separated = parseAddress.parseLocation(maillingAddress);
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
//                         } catch (error) {
//                             console.log('Mailing Address Error :')
//                             console.log(error);
//                         }




//                         try {
//                             //get property Type
//                             let [propertyType]: any = await page.$x(`//*[@id="improvements"]/div/div[1]/dl/dd[1]`);
//                             if (propertyType) {
//                                 propertyType = await propertyType.getProperty('innerText');
//                                 propertyType = await propertyType.jsonValue();
//                                 //remove the string before : and keep the property type only
//                                 propertyType = propertyType.split(":").pop();
//                                 propertyType = propertyType.trim();
//                                 //add the property type only if it exists
//                                 if (propertyType != "") {
//                                     document["Property Type"] = propertyType;
//                                 }
//                             }
//                         } catch (error) {
//                             console.log('Error in property type :');
//                             console.log(error);
//                         }


//                         try {
//                             //get Assessed value
//                             let [assessedValue]: any = await page.$x(`//*[@id="basic-info"]/dl/dd[6]`);
//                             if (assessedValue) {
//                                 assessedValue = await assessedValue.getProperty('innerText');
//                                 assessedValue = await assessedValue.jsonValue();
//                                 assessedValue = assessedValue.trim();
//                                 if (assessedValue != "") {
//                                     document["Total Assessed Value"] = assessedValue;
//                                 }
//                             }
//                         } catch (error) {
//                             console.log('Error in total assessed value :');
//                             console.log(error);
//                         }



//                         try {
//                             //get last Sale Date
//                             let [lastSaleDate]: any = await page.$x(`//*[@id="sales-container"]/div[2]/table/tbody/tr[1]/td[3]`);
//                             if (lastSaleDate) {
//                                 lastSaleDate = await lastSaleDate.getProperty('innerText');
//                                 lastSaleDate = await lastSaleDate.jsonValue();
//                                 lastSaleDate = lastSaleDate.trim();
//                                 if (lastSaleDate != "") {
//                                     document["Last Sale Recording Date"] = lastSaleDate;
//                                 }
//                             }
//                         } catch (error) {
//                             console.log('Error in last sale date :');
//                             console.log(error);
//                         }




//                         try {
//                             //get last Sale Price
//                             let [lastSalePrice]: any = await page.$x(`//*[@id="sales-container"]/div[2]/table/tbody/tr[1]/td[2]`);
//                             if (lastSalePrice) {
//                                 lastSalePrice = await lastSalePrice.getProperty('innerText');
//                                 lastSalePrice = await lastSalePrice.jsonValue();
//                                 lastSalePrice = lastSalePrice.trim();
//                                 if (lastSalePrice != "") {
//                                     document["Last Sale Amount"] = lastSalePrice;
//                                 }
//                             }

//                         } catch (error) {
//                             console.log('Error in last sale price :');
//                             console.log(error);
//                         }



//                         //owner occupied
//                         try {
//                             let ownerOccupied;
//                             if (document["Mailing Address"] != "" && document["Property Address"]) {
//                                 //normalize addresses then compare
//                                 if (
//                                     document["Mailing Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase().includes(document["Property Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase()) ||
//                                     document["Mailing Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase() == document["Property Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase() ||
//                                     document["Property Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase().includes(document["Mailing Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase())
//                                 ) {
//                                     ownerOccupied = true;
//                                 } else {
//                                     ownerOccupied = false;
//                                 }
//                                 document["Owner Occupied"] = ownerOccupied;
//                             }

//                         } catch (error) {
//                             console.log("Owner Occupied ERROR : ")
//                             console.log(error);
//                         }


//                         //document parsed 
//                         //save 
//                         console.log(await document.save());



//                         try {
//                             //all secondaryOwnersNamesArray are persons no need to test them 
//                             secondaryOwnersNamesArray.forEach(async ownerNameSeparated => {

//                                 console.log('---------- cloned doc ----------')
//                                 let newDoc = await this.cloneMongoDocument(document);
//                                 newDoc["Full Name"] = ownerNameSeparated.fullName;
//                                 newDoc["First Name"] = ownerNameSeparated.firstName;
//                                 newDoc["Last Name"] = ownerNameSeparated.lastName;
//                                 newDoc["Middle Name"] = ownerNameSeparated.middleName;
//                                 newDoc["Name Suffix"] = ownerNameSeparated.nameSuffix;

//                                 console.log(await newDoc.save());
//                             });
//                         } catch (error) {
//                             console.log('Error in separating other owners names :');
//                             console.log(error);
//                         }



//                     } else {
//                         console.log('Address not Found');
//                     }
//                 } else {
//                     console.log('Address not Found');
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