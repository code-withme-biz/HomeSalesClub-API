// import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
// import {IPublicRecordAttributes} from '../../../../../../models/public_record_attributes';
// import puppeteer from "puppeteer";
// const nameParsingService = require('../../consumer_dependencies/nameParsingService');
// const addressService = require('../../consumer_dependencies/addressService');
// const parser = require('parse-address');

// export default class PAConsumer extends AbstractPAConsumer {
//     source: string;
//     state: string;
//     county: string;
//     categories: string[];

//     urls = {
//         propertyAppraiserPage: 'http://web.jacksoncounty.org/pdo/search.cfm?myGroup=situs_num',
//     }

//     xpaths = {
//         isPAloaded: '//*[@id="btnMap"]',
//     }

//     constructor(state: string, county: string, categories: string[] = ['foreclosure', 'preforeclosure', 'auction', 'tax-lien', 'bankruptcy'], source: string = '') {
//         super();
//         this.source = source;
//         this.state = state;
//         this.county = county;
//         this.categories = categories;
//     }

//     async getTextByXpathFromPage(page: puppeteer.Page, xPath: string) {
//         const [elm] = await page.$x(xPath);
//         if (elm == null) {
//             return null;
//         }
//         let text = await page.evaluate(j => j.innerText, elm);
//         return text.replace(/\n/g, ' ');
//     }

//     async getAddressByXpathFromPage(page: puppeteer.Page, xPath: string) {
//         const [elm] = await page.$x(xPath);
//         if (elm == null) {
//             return null;
//         }
//         return await page.evaluate(j => j.innerText, elm);
//     }

//     async finderIds(page: puppeteer.Page) {
//         try {
//             let ids = [];
//             const elementsId = await page.$x('//*[contains(text(), "Account #")]/following-sibling::td[1]/a');
//             for (let i = 0; i < elementsId.length; i++) {
//                 const id = await elementsId[i].evaluate(e => e.innerHTML);
//                 ids.push(id.trim().replace(/-/g, ''));
//             }
//             return ids;
//         } catch (error) {
//             console.log(error)
//             return [];
//         }
//     }
//     parseAddress(fullAddress: string) {
//         try {
//             const splitedAddress = fullAddress.split('\n')
//             const match = /^(.*?)\s*([A-Z]{2})\s*,\s*([\d\-]+)$/.exec(splitedAddress![1])
//             const normalizeZip = /^(\d{5})/.exec(match![3])![1];
//             return {city: match![1], zip: normalizeZip, state: match![2]};
//         } catch (e) {
//             return {city: '', zip: '', state: ''};
//         }
//     }

//     async parsePage(page: puppeteer.Page, propertyAddress: string) {
//         await page.waitForXPath('//td[contains(text(), "Owner")]/following-sibling::td[1]');
//         const rawOwnerName = await this.getTextByXpathFromPage(page, '//td[contains(text(), "Owner")]/following-sibling::td[1]');
//         const processedNamesArray = nameParsingService.parseOwnersFullNameWithoutComma(rawOwnerName);
//         let address = await this.getAddressByXpathFromPage(page, `//td[contains(text(), "Mailing")]/following-sibling::td[1]`);
//         address = address?.replace(/.*\n/, '').replace(/\n\n/, '\n');
//         const {state, city, zip} = this.parseAddress(address);
//         address = address.replace(/\n/g, ' ');
//         const grossAssessedValue = await this.getTextByXpathFromPage(page, '//*[@id="MarketTable"]//td[contains(text(), "Total")]/following-sibling::td[4]');
//         const estValue = await this.getTextByXpathFromPage(page, '//*[@id="MarketTable"]//td[contains(text(), "Total")]/following-sibling::td[1]');
//         let isOwnerOccupied = addressService.comparisonAddresses(address, propertyAddress);

//         return {
//             'owner_names': processedNamesArray,
//             'Unit#': '',
//             'Property City': '',
//             'Property State': 'Oregon',
//             'Property Zip': '',
//             'County': 'Jackson',
//             'Owner Occupied': isOwnerOccupied,
//             'Mailing Care of Name': '',
//             'Mailing Address': address,
//             'Mailing Unit #': '',
//             'Mailing City': city,
//             'Mailing State': state,
//             'Mailing Zip': zip,
//             'Property Type': '',
//             'Total Assessed Value': grossAssessedValue ? grossAssessedValue : '',
//             'Last Sale Recoding Date': '',
//             'Last Sale Amount': '',
//             'Est. Value': estValue,
//             'yearBuilt': '',
//             'Est. Equity': '',
//         };
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
//         const page = this.browserPages.propertyAppraiserPage;
//         if (page === undefined) return false;
//         for (let document of docsToParse) {
//             try {
//                 const address = parser.parseLocation(document["Property Address"]);
//                 await page.waitForSelector('#btnMap');
//                 const [addressButton] = await page.$x('//input[@type="Button" and @value="Address"]');
//                 await addressButton.click();
//                 if (address.number) {
//                     const [inputNumber] = await page.$x('//form/table[4]/tbody/tr[1]/td[2]/input');
//                     await inputNumber.type(address.number);
//                 }
//                 const [inputStreet] = await page.$x('//form/table[4]/tbody/tr[2]/td[2]/input');
//                 await inputStreet.type(address.street);
//                 await page.click('input[type="submit"]');
//                 await page.waitForSelector('#headerTable', {timeout: 5000});
//                 const ids = await this.finderIds(page);
//                 if (ids.length < 4) {
//                     for (let j = 0; j < ids.length; j++) {
//                         await page.goto(`http://web.jacksoncounty.org/pdo/Ora_asmt_details.cfm?account=${ids[j]}`);
//                         const result = await this.parsePage(page, document["Property Address"]);
//                         for (let i = 0; i < result['owner_names'].length; i++) {
//                             const owner_name = result['owner_names'][i];
//                             if (i == 0 && j == 0) {
//                                 document['Full Name'] = owner_name['fullName'];
//                                 document['First Name'] = owner_name['firstName'];
//                                 document['Last Name'] = owner_name['lastName'];
//                                 document['Middle Name'] = owner_name['middleName'];
//                                 document['Name Suffix'] = owner_name['suffix'];
//                                 document['Owner Occupied'] = result['Owner Occupied'];
//                                 document['Mailing Care of Name'] = '';
//                                 document['Mailing Address'] = result['Mailing Address'];
//                                 document['Mailing City'] = result['Mailing City'];
//                                 document['Mailing State'] = result['Mailing State'];
//                                 document['Mailing Zip'] = result['Mailing Zip'];
//                                 document['Mailing Unit #'] = '';
//                                 document['Property Type'] = result['Property Type'];
//                                 document['Total Assessed Value'] = result['Total Assessed Value'];
//                                 document['Last Sale Recording Date'] = result['Last Sale Recoding Date'];
//                                 document['Last Sale Amount'] = result['Last Sale Amount'];
//                                 document['Est. Remaining balance of Open Loans'] = '';
//                                 document['Est Value'] = result['Est. Value'];
//                                 document['yearBuilt'] = '';
//                                 document['Est Equity'] = '';

//                                 console.log(document)
//                                 await document.save();
//                             } else {
//                                 let newDocument = await this.cloneMongoDocument(document);
//                                 newDocument['Full Name'] = owner_name['fullName'];
//                                 newDocument['First Name'] = owner_name['firstName'];
//                                 newDocument['Last Name'] = owner_name['lastName'];
//                                 newDocument['Middle Name'] = owner_name['middleName'];
//                                 newDocument['Name Suffix'] = owner_name['suffix'];
//                                 newDocument['Owner Occupied'] = result['Owner Occupied'];
//                                 newDocument['Mailing Care of Name'] = '';
//                                 newDocument['Mailing Address'] = result['Mailing Address'];
//                                 newDocument['Mailing City'] = result['Mailing City'];
//                                 newDocument['Mailing State'] = result['Mailing State'];
//                                 newDocument['Mailing Zip'] = result['Mailing Zip'];
//                                 newDocument['Mailing Unit #'] = '';
//                                 newDocument['Property Type'] = result['Property Type'];
//                                 newDocument['Total Assessed Value'] = result['Total Assessed Value'];
//                                 newDocument['Last Sale Recording Date'] = result['Last Sale Recoding Date'];
//                                 newDocument['Last Sale Amount'] = result['Last Sale Amount'];
//                                 newDocument['Est. Remaining balance of Open Loans'] = '';
//                                 newDocument['Est Value'] = result['Est. Value'];
//                                 newDocument['yearBuilt'] = '';
//                                 newDocument['Est Equity'] = '';
//                                 console.log(newDocument)
//                                 await newDocument.save();
//                             }
//                         }
//                     }
//                 } else  console.log('Many matches found!')
//             } catch
//                 (e) {
//                 console.log('Address not found: ', document["Property Address"],document["Property City"]);
//             }
//             await page.goto('http://web.jacksoncounty.org/pdo/search.cfm?myGroup=situs_num');
//         }
//         return true;
//     }
// }

