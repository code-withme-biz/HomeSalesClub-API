// import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
// import {IPublicRecordAttributes} from '../../../../../../models/public_record_attributes';

// const californiaHelper = require('../../consumer_dependencies/californiaHelper');

// export default class PAConsumer extends AbstractPAConsumer {
//     source: string;
//     state: string;
//     county: string;
//     categories: string[];

//     urls = {
//         propertyAppraiserPage: 'https://pqweb.parcelquest.com/#home',
//     }

//     xpaths = {
//         isPAloaded: '//*[@id="txtName"]',
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
//             await this.browserPages.propertyAppraiserPage.goto(this.urls.propertyAppraiserPage, {waitUntil: 'load'});
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
//         await this.browserPages!.propertyAppraiserPage!.close();
//         let page: any;
//         for (let document of docsToParse) {
//             try {
//                 page = await this.browser!.newPage();
//                 await page._client.send('Network.clearBrowserCookies');
//                 await this.setParamsForPage(page);
//                 await page.setCacheEnabled(false);
//                 page = await californiaHelper.loginParcelQuest(page);
//                 if (!page) throw new Error();
//                 const searchAddress = await californiaHelper.searchAddress(page, 'SLO', document["Property Address"]);
//                 if (!searchAddress) throw new Error();
//                 const [clickViewResult] = await page.$x('//button[contains(text(),"View Results")]');
//                 await clickViewResult.click();
//                 const data = await californiaHelper.getJsonDataAfterViewResult(page, document["Property Address"]);
//                 if (!data) throw new Error();
//                 try {
//                     const result = await californiaHelper.parseJsonData(data, document["Property Address"], 'San Luis Obispo');
//                     for (let index = 0; index < result['owner_names'].length; index++) {
//                         const owner_name = result['owner_names'][index];
//                         if (index == 0) {
//                             document['Full Name'] = owner_name['fullName'];
//                             document['First Name'] = owner_name['firstName'];
//                             document['Last Name'] = owner_name['lastName'];
//                             document['Middle Name'] = owner_name['middleName'];
//                             document['Name Suffix'] = owner_name['suffix'];
//                             document['Owner Occupied'] = result['Owner Occupied'];
//                             document['Mailing Care of Name'] = '';
//                             document['Mailing Address'] = result['Mailing Address'];
//                             document['Mailing City'] = result['Mailing City'];
//                             document['Mailing State'] = result['Mailing State'];
//                             document['Mailing Zip'] = result['Mailing Zip'];
//                             document['Mailing Unit #'] = '';
//                             document['Property Type'] = result['Property Type'];
//                             document['Total Assessed Value'] = result['Total Assessed Value'];
//                             document['Last Sale Recording Date'] = result['Last Sale Recoding Date'];
//                             document['Last Sale Amount'] = result['Last Sale Amount'];
//                             document['Est. Remaining balance of Open Loans'] = '';
//                             document['Est Value'] = result['Est. Value'];
//                             document['yearBuilt'] = result['yearBuilt'];
//                             document['Est Equity'] = '';
//                             await document.save();
//                         } else {
//                             let newDocument = await this.cloneMongoDocument(document)
//                             newDocument['Full Name'] = owner_name['fullName'];
//                             newDocument['First Name'] = owner_name['firstName'];
//                             newDocument['Last Name'] = owner_name['lastName'];
//                             newDocument['Middle Name'] = owner_name['middleName'];
//                             newDocument['Name Suffix'] = owner_name['suffix'];
//                             await newDocument.save();
//                         }
//                     }
//                 } catch (error) {
//                 }
//             } catch (e) {
//                 console.log('Address not found: ', document["Property Address"]);
//             }
//             await page!.close();
//         }
//         return true;
//     }
// }