// import puppeteer from 'puppeteer';
// const axios = require("axios");
// const parseAddress = require('parse-address');

// import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
// import { IPublicRecordAttributes } from '../../../../../../models/public_record_attributes'


// export default class PAConsumer extends AbstractPAConsumer {
//     source: string;
//     state: string;
//     county: string;
//     categories: string[];

//     urls = {
//         propertyAppraiserPage: 'https://www.larimer.org/assessor/search#/property/'
//     }

//     xpaths = {
//         isPAloaded: '//*[@id="parcelno"]'
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

//         const companyIdentifiersArray = ['GENERAL', 'TRUST', 'TRUSTEE', 'TRUSTEES', 'INC', 'ORGANIZATION', 'CORP', 'CORPORATION', 'LLC', 'MOTORS', 'BANK', 'UNITED', 'CO', 'COMPANY', 'FEDERAL', 'MUTUAL', 'ASSOC', 'AGENCY', 'PA', 'P A', '\\d\\/?\\d+', 'TR', 'S A', 'FIRM', 'PORTFOLIO', 'LEGAL', 'CLUB', 'LP', 'DEPARTMENT', 'DEPT'];
//         const removeFromNamesArray = ['ET', 'AS', 'DECEASED', 'DCSD', 'CP\/RS', 'JT\/RS', 'JTRS', 'TRS', 'C\/O', '\\(BEN\\)', 'EST OF', 'FKA'];
//         const suffixNamesArray = ['II', 'III', 'IV', 'ESQ', 'JR', 'SR'];

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
//             const suffixRegexString = `(?:\\s+(?:${suffixNamesArray.join('|')})\\s*$)`;
//             const normalizeNameRegexString = `^\\s*([^\\s]+)\\s+([^\\s]+)(?:\\s+(.*?))?\\s*$`;
//             const normalizeNameRegex = new RegExp(normalizeNameRegexString, 'i');
//             const suffixRegex = new RegExp(suffixRegexString, 'i');

//             let nameWithoutSuffix = fullName;
//             let nameSuffix = '';
//             let hasSuffix = fullName.match(suffixRegex);
//             if (hasSuffix) {
//                 nameSuffix = hasSuffix[0].trim()
//                 nameWithoutSuffix = nameWithoutSuffix.replace(hasSuffix[0], '');
//                 console.log(nameWithoutSuffix);
//             }

//             let normalizedNameMatch = nameWithoutSuffix.match(normalizeNameRegex);
//             if (normalizedNameMatch) {
//                 let firstName = normalizedNameMatch[2];
//                 let middleName = normalizedNameMatch[3] || '';
//                 let lastName = normalizedNameMatch[1];
//                 return {
//                     fullName: fullName.trim(),
//                     firstName: firstName.trim(),
//                     middleName: middleName.trim(),
//                     lastName: lastName.trim(),
//                     nameSuffix: nameSuffix.trim()
//                 }
//             }
//             return {
//                 firstName: '',
//                 middleName: '',
//                 lastName: '',
//                 nameSuffix: '',
//                 fullName: fullName.trim()
//             }
//         }

//         const checkForMultipleNamesAndNormalize = (name: any) => {
//             let results = [];
//             let lastNameBkup = '';

//             let multipleNames = name.match(/^(.*?)\s*\/\s*(.*?)$/);
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
//                 multipleNames = secondName.match(/^(.*?)\s*\/\s*(.*?)$/);
//                 if (!multipleNames && secondName.trim()) {
//                     let normalized = normalizeNames(secondName);
//                     if (normalized && lastNameBkup) {
//                         if (!normalized.hasOwnProperty('firstName')) {
//                             normalized['firstName'] = normalized['fullName'];
//                             normalized['lastName'] = lastNameBkup;
//                             normalized['middleName'] = '';
//                             normalized['nameSuffix'] = normalized['nameSuffix'] || '';
//                             normalized['fullName'] = `${normalized['lastName']} ${normalized['fullName']}`
//                         } else {
//                             normalized['middleName'] = normalized['firstName'] + normalized['middleName'];
//                             normalized['firstName'] = normalized['lastName'];
//                             normalized['lastName'] = lastNameBkup;
//                             normalized['nameSuffix'] = normalized['nameSuffix'] || '';
//                             normalized['fullName'] = `${normalized['lastName']} ${normalized['fullName']}`
//                         }

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


//         let apiUrl;

//         const queryParams = {
//             prop: "property",
//             parcel: "undefined",
//             scheduleNumber: "undefined",
//             serialIdentification: "undefined",
//             name: "undefined",
//             fromAddrNum: "undefined",
//             toAddrNum: "undefined",
//             address: "",
//             city: "Any",
//             subdivisionNumber: "undefined",
//             sales: "any",
//             subdivisionName: "undefined"
//         };
//         for (let document of docsToParse) {
//             this.searchBy = document["Property Address"] ? 'address' : 'name';
//             console.log(document.id)
//             // do everything that needs to be done for each document here
//             let adressToLookFor = '';
//             let seperatedAddress: string[] = [];
//             let first_name = '';
//             let last_name = '';
//             let owner_name = '';
//             let owner_name_regexp = '';

//             if (this.searchBy === 'name') {
//                 const nameInfo = this.getNameInfo(document);
//                 first_name = nameInfo.first_name;
//                 last_name = nameInfo.last_name;
//                 owner_name = nameInfo.owner_name;
//                 owner_name_regexp = nameInfo.owner_name_regexp;
//                 if (owner_name === '') continue;
//                 console.log(`Looking for owner: ${owner_name}`);
//             }
//             else {
//                 adressToLookFor = document["Property Address"];
//                 console.log(`Looking for address: ${adressToLookFor}`);
//             }

//             if (this.searchBy === 'name') {
//                 queryParams.name = owner_name;
//             }   
//             else {
//                 seperatedAddress = adressToLookFor.split(" ");
//                 queryParams.fromAddrNum = seperatedAddress[0];
//                 queryParams.toAddrNum = seperatedAddress[0];
//                 queryParams.address = seperatedAddress[1];
//             }
//             apiUrl = "https://apps.larimer.org/api/assessor/property/?" +
//                 "prop=" + queryParams +
//                 "&parcel=" + queryParams.parcel +
//                 "&scheduleNumber=" + queryParams.scheduleNumber +
//                 "&serialIdentification=" + queryParams.serialIdentification +
//                 "&name=" + queryParams.name +
//                 "&fromAddrNum=" + queryParams.fromAddrNum +
//                 "&toAddrNum=" + queryParams.toAddrNum +
//                 "&address=" + queryParams.address +
//                 "&city=" + queryParams.city +
//                 "&subdivisionNumber=" + queryParams.subdivisionNumber +
//                 "&sales=" + queryParams.sales +
//                 "&subdivisionName=" + queryParams.subdivisionName;
//             await axios
//                 .get(apiUrl)
//                 .then(async (res: any) => {
//                     res = res.data;
//                     if (res.records == null || res.records.length == 0) {
//                         console.log("Error ! couldnt find this Address ! ")
//                     } else {
//                         let arrayOfResults = res.records;
//                         let maxScore = 0;
//                         let matches = [];
//                         for (let i = 0; i < arrayOfResults.length; i++) {
//                             let element = arrayOfResults[i];

//                             if (this.searchBy === 'name') {
//                                 const regexp = new RegExp(owner_name_regexp);
//                                 if (!regexp.exec(element.ownername1.toUpperCase())) continue;
//                                 matches.push(element);
//                             }
//                             else {
//                                 let numberOfOccurence = 0;
//                                 seperatedAddress.forEach((word: any) => {
//                                     if (element.locationaddress.includes(word))
//                                         numberOfOccurence++;
//                                 });
//                                 if (numberOfOccurence > maxScore) {
//                                     maxScore = numberOfOccurence;
//                                     matches = [element];
//                                 }
//                             }




//                         }
//                         if (matches.length > 0) {
//                             for (const moreProbableElement of matches) {
//                                 //get sales data
//                                 await axios
//                                     .get("https://apps.larimer.org/api/assessor/?prop=sales&accountno=" + moreProbableElement.accountno)
//                                     .then((res: any) => {
//                                         res = res.data;
//                                         //Last Sale Recording Date
//                                         if (res.records && res.records[0] && res.records[0].saledt) {
//                                             document["Last Sale Recording Date"] = res.records[0].saledt;
//                                         }
//                                         //Last Sale Amount 
//                                         if (res.records && res.records[0] && res.records[0].salep) {
//                                             document["Last Sale Amount"] = res.records[0].salep;
//                                         }
//                                     }).catch((error: any) => {
//                                         console.log(error)
//                                     });




//                                 //get value data
//                                 let total = 0;
//                                 await axios
//                                     .get("https://apps.larimer.org/api/assessor/?prop=valuedetail&accountno=" + moreProbableElement.accountno)
//                                     .then((res: any) => {



//                                         res = res.data;




//                                         if (res.records) {
//                                             res.records.forEach((row: any) => {
//                                                 total = total + parseInt(row.rawassdval, 10);
//                                             });
//                                             //Total Assessed Value
//                                             document["Total Assessed Value"] = total.toString();
//                                             console.log('total assessed value : ' + total);
//                                         }



//                                         //Property Type
//                                         if (res.records && res.records[0] && res.records[0].abstdescr) {
//                                             document["Property Type"] = res.records[0].abstdescr;
//                                         }



//                                     }).catch((error: any) => {
//                                         console.log(error)
//                                     });




//                                 //grab mailling and owner name
//                                 await axios
//                                     .get("https://apps.larimer.org/api/assessor/?prop=detail&accountno=" + moreProbableElement.accountno)
//                                     .then(async (res: any) => {
//                                         res = res.data;


//                                         //owner names
//                                         if (res.records && res.records[0] && res.records[0].ownername1) {
//                                             let ownerName = res.records[0].ownername1;
//                                             let discriminateResult = discriminateAndRemove(ownerName);
//                                             if (discriminateResult.type == 'person') {
//                                                 let separatedNamesArray = checkForMultipleNamesAndNormalize(discriminateResult.name);
//                                                 for (let separatedNameObj of separatedNamesArray) {
//                                                     document["Full Name"] = separatedNameObj.fullName;
//                                                     document["First Name"] = separatedNameObj.firstName;
//                                                     document["Last Name"] = separatedNameObj.lastName;
//                                                     document["Middle Name"] = separatedNameObj.middleName;
//                                                     document["Name Suffix"] = separatedNameObj.nameSuffix;
//                                                 }
//                                             } else {
//                                                 document["Full Name"] = ownerName;
//                                             }

//                                         }

//                                         //add second owner name if first one is null
//                                         if (res.records && res.records[0] && res.records[0].ownername2 && res.records[0].ownername1 == null) {
//                                             let ownerName = res.records[0].ownername2;
//                                             let discriminateResult = discriminateAndRemove(ownerName);
//                                             if (discriminateResult.type == 'person') {
//                                                 let separatedNamesArray = checkForMultipleNamesAndNormalize(discriminateResult.name);
//                                                 for (let separatedNameObj of separatedNamesArray) {
//                                                     document["Full Name"] = separatedNameObj.fullName;
//                                                     document["First Name"] = separatedNameObj.firstName;
//                                                     document["Last Name"] = separatedNameObj.lastName;
//                                                     document["Middle Name"] = separatedNameObj.middleName;
//                                                     document["Name Suffix"] = separatedNameObj.nameSuffix;
//                                                 }
//                                             } else {
//                                                 document["Full Name"] = ownerName;
//                                             }

//                                         }

//                                         if (this.searchBy === 'name') {
//                                             //property address
//                                             console.log('property address :')
//                                             if (res.records && res.records[0] && res.records[0].mailaddress1) {
//                                                 let propertyAddress = res.records[0].locationaddress
//                                                 document["Property Address"] = propertyAddress;
//                                                 document["Property City"] = res.records[0].locationcity;
//                                                 document["Property State"] = 'CO';
//                                                 document["Property Zip"] = res.records[0].locationzipcode;
//                                             }
//                                         }

//                                         //mailling address
//                                         console.log('mailling address :')
//                                         if (res.records && res.records[0] && res.records[0].mailaddress1) {
//                                             let mailingAddress = res.records[0].mailaddress1
//                                             let address = parseAddress.parseLocation(mailingAddress);
//                                             document["Mailing Address"] = mailingAddress;
//                                             document["Mailing City"] = address.city;
//                                             document["Mailing State"] = address.state;
//                                             document["Mailing Zip"] = address.zip;
//                                         }


//                                         //add second mailing address if the first one is null
//                                         if (res.records && res.records[0] && res.records[0].mailaddress2 && res.records[0].mailaddress1 == null) {
//                                             let mailingAddress = res.records[0].mailaddress2
//                                             let address = parseAddress.parseLocation(mailingAddress);
//                                             document["Mailing Address"] = mailingAddress;
//                                             document["Mailing City"] = address.city;
//                                             document["Mailing State"] = address.state;
//                                             document["Mailing Zip"] = address.zip;
//                                         }


//                                         //owner occupied
//                                         let ownerOccupied;
//                                         if (document["Mailing Address"] != "" && document["Property Address"]) {
//                                             //clean up addresses from new lines then compare
//                                             if (
//                                                 document["Mailing Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase().includes(document["Property Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase()) ||
//                                                 document["Mailing Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase() == document["Property Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase() ||
//                                                 document["Property Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase().includes(document["Mailing Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase())
//                                             ) {
//                                                 ownerOccupied = true;
//                                             } else {
//                                                 ownerOccupied = false;
//                                             }
//                                             document["Owner Occupied"] = ownerOccupied;
//                                         }


//                                         //document parsed 
//                                         console.log(await document.save());



//                                     }).catch((error: any) => {
//                                         console.log(error)
//                                     });
//                             }
//                         }
//                         else {
//                             console.log("No house found");
//                         }

//                     }


//                 })
//                 .catch((error: any) => {
//                     console.log(error);
//                 });





//         }
//         return true;
//     }

// }