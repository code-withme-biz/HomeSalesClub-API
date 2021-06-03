// import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
// import {IPublicRecordAttributes} from '../../../../../../models/public_record_attributes';
// import puppeteer from "puppeteer";

// const nameParsingService = require('../../consumer_dependencies/nameParsingService');
// const addressService = require('../../consumer_dependencies/addressService');

// import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
// import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';

// export default class PAConsumer extends AbstractPAConsumer {
//     publicRecordProducer: IPublicRecordProducer;
//     ownerProductProperties: IOwnerProductProperty[];

//     urls = {
//         propertyAppraiserPage: 'https://maps.arcgis.com/apps/webappviewer/index.html?id=868170827e4443d2be37eb60562446ae',
//     }

//     xpaths = {
//         isPAloaded: '//*[@title="Parcel Report" and @role="button"]',
//     }

//     constructor(publicRecordProducer: IPublicRecordProducer, ownerProductProperties: IOwnerProductProperty) {
//         super();
//         this.publicRecordProducer = publicRecordProducer;
//         this.ownerProductProperties = ownerProductProperties;
//     }

//     async getTextByXpathFromPage(page: puppeteer.Page, xPath: string) {
//         const [elm] = await page.$x(xPath);
//         if (elm == null) {
//             return '';
//         }
//         let text = await page.evaluate(j => j.innerText, elm);
//         return text.replace(/\n/g, ' ');
//     }

//     async getTextContentByXpathFromPage(page: puppeteer.Page, xPath: string) {
//         const [elm] = await page.$x(xPath);
//         if (elm == null) {
//             return '';
//         }
//         let text = await page.evaluate(j => j.textContent, elm);
//         return text.replace(/\n/g, ' ');
//     }

//     async parseAPNPage(apnId: string) {
//         const apnPage = await this.browser?.newPage();
//         await this.setParamsForPage(apnPage!);
//         try {
//             await apnPage!.goto(`http://assessor.coconino.az.gov:82/assessor/taxweb/account.jsp?guest=true&accountNum=${apnId}`);
//             await apnPage!.waitForXPath('//*[@id="middle"]');
//             const rawOwnerName = (await this.getTextContentByXpathFromPage(apnPage!, '//*[@id="middle"]//*[contains(text(), "Owner Name")]/following-sibling::text()')).trim();
//             const processedNamesArray = nameParsingService.parseOwnersFullNameWithoutComma(rawOwnerName)
//             const siteAddress = (await this.getTextContentByXpathFromPage(apnPage!, '//*[@id="middle"]//*[contains(text(), "Situs Address")]/following-sibling::text()[1]')).trim();
//             const addressStreet = (await this.getTextContentByXpathFromPage(apnPage!, '//*[@id="middle"]//*[contains(text(), "Owner Address")]/following-sibling::text()[1]')).trim();
//             const addressCityAndState = (await this.getTextContentByXpathFromPage(apnPage!, '//*[@id="middle"]//*[contains(text(), "Owner Address")]/following-sibling::text()[2]')).trim();
//             const {state, city, zip} = addressService.parsingDelimitedAddress(`${addressStreet}\n${addressCityAndState}`);
//             let saleDate = '', salePrice = '';
//             try {
//                 await apnPage!.waitForXPath('//*[contains(text(), "Sale History")]', {timeout: 5000});
//                 const [saleHistoryClick] = await apnPage!.$x('//*[contains(text(), "Sale History")]');
//                 await saleHistoryClick.click();
//                 await apnPage!.waitForXPath('//*[@id="SelectedGroupHTMLSummary"]');
//                 const [clickSales] = await apnPage!.$x('//*[@id="SelectedGroupHTMLSummary"]/tbody/tr[last()]/td[3]/a');
//                 await clickSales.click();
//                 await apnPage!.waitForXPath('//*[@id="Layout"]');
//                 salePrice = await this.getTextByXpathFromPage(apnPage!, '//*[@id="Layout"]//*[contains(text(), "Price")]/following-sibling::span[1]/span');
//                 saleDate = await this.getTextByXpathFromPage(apnPage!, '//*[@id="Layout"]//*[contains(text(), "Sale Date")]/following-sibling::span[1]/span');
//             } catch (e) {
//             }
//             await apnPage!.close();
//             return {
//                 processedNamesArray,
//                 siteAddress,
//                 address: `${addressStreet} ${addressCityAndState}`,
//                 state,
//                 city,
//                 zip,
//                 salePrice,
//                 saleDate
//             };
//         } catch (e) {
//             await apnPage!.close();
//             return {processedNamesArray: [], address: '', state: '', city: '', zip: '', salePrice: '', saleDate: ''};
//         }
//     }

//     async parsePage(page: puppeteer.Page, propertyAddress: string, owner_name_regexp: string) {
//         await page.waitForXPath('//*[contains(text(), "Owner Name")]/following-sibling::td[1]');
//         const apnId = await this.getTextByXpathFromPage(page, '//*[contains(text(), "Account #:")]/following-sibling::td[1]');
//         if (this.searchBy === 'name') {
//             const ownerName = await this.getTextByXpathFromPage(page, '//*[contains(text(), "Owner Name:")]/following-sibling::td[1]');
//             console.log(ownerName);
//             const regexp = new RegExp(owner_name_regexp);
//             if (!regexp.exec(ownerName.toUpperCase())) return null;
//             console.log('~~~~~~~~~')
//         }
//         const propertyType = await this.getTextByXpathFromPage(page, '//*[contains(text(), "Zoning Description:")]/following-sibling::td[1]')
//         const {processedNamesArray, siteAddress, address, state, city, zip, salePrice, saleDate} = await this.parseAPNPage(apnId);
//         const isOwnerOccupied = addressService.comparisonAddresses(address, this.searchBy === 'name' ? siteAddress : propertyAddress);
//         return {
//             'owner_names': processedNamesArray,
//             'Unit#': '',
//             'Property Address': this.searchBy === 'name' ? siteAddress : propertyAddress,
//             'Property City': '',
//             'Property State': 'Arizona',
//             'Property Zip': '',
//             'County': 'Coconino',
//             'Owner Occupied': isOwnerOccupied,
//             'Mailing Care of Name': '',
//             'Mailing Address': address,
//             'Mailing Unit #': '',
//             'Mailing City': city,
//             'Mailing State': state,
//             'Mailing Zip': zip,
//             'Property Type': propertyType,
//             'Total Assessed Value': '',
//             'Last Sale Recoding Date': saleDate,
//             'Last Sale Amount': salePrice,
//             'Est. Value': '',
//             'yearBuilt': '',
//             'Est. Equity': '',
//         };
//     }

//     readDocsToParse(): IOwnerProductProperty[] {
//         return this.ownerProductProperties;
//     }

//     // use this to initialize the browser and go to a specific url.
//     // setParamsForPage is needed (mainly for AWS), do not remove or modify it please.
//     // return true when page is usable, false if an unexpected error is encountered.
//     async init(): Promise<boolean> {
//         this.browser = await this.launchBrowser();
//         this.browserPages.propertyAppraiserPage = await this.browser.newPage();
//         await this.setParamsForPage(this.browserPages.propertyAppraiserPage);
//         try {
//             await this.browserPages.propertyAppraiserPage.setRequestInterception(true)
//             this.browserPages.propertyAppraiserPage.on('request', interceptedRequest => {
//                 if (interceptedRequest.url().includes('callback=dojo_request_script_callbacks')) {
//                     interceptedRequest.abort();
//                 } else {
//                     interceptedRequest.continue();
//                 }
//             })
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
//     async parseAndSave(docsToParse: IOwnerProductProperty[]): Promise<boolean> {
//         console.log(`Documents to look up: ${docsToParse.length}.`);
//         const page = this.browserPages.propertyAppraiserPage;
//         if (page === undefined) return false;
//         try {
//             await page.waitForXPath('//*[@id="jimu_dijit_Message_0"]/*[@class="button-container"]/div[1]', {timeout: 5000});
//             const [okElement] = await page.$x('//*[@id="jimu_dijit_Message_0"]/*[@class="button-container"]/div[1]');
//             await okElement.click();
//         } catch (e) {
//         }
//         await page.waitForXPath('//*[contains(text(), "I AGREE")]');
//         const [iAgreeElement] = await page.$x('//*[contains(text(), "I AGREE")]');
//         await iAgreeElement.click();
//         await page.waitForXPath('//*[@title="Parcel Report" and @role="button"]', {visible: true});
//         let j = 0;
//         for (let document of docsToParse) {
//             this.searchBy = document.propertyId["Property Address"] ? 'address' : 'name';
//             try {
//                 let first_name = '';
//                 let last_name = '';
//                 let owner_name = '';
//                 let owner_name_regexp = '';
//                 let search_term = '';
                
//                 if (this.searchBy === 'name') {
//                     const nameInfo = this.getNameInfo(document);
//                     first_name = nameInfo.first_name;
//                     last_name = nameInfo.last_name;
//                     owner_name = nameInfo.owner_name;
//                     owner_name_regexp = nameInfo.owner_name_regexp;
//                     if (owner_name === '') continue;
//                     console.log(`Looking for owner: ${owner_name}`);
//                     search_term = owner_name;
//                 }
//                 else {
//                     search_term = document.propertyId["Property Address"];
//                     console.log(`Looking for address: ${search_term}`);
//                 }
    
//                 await page.waitForSelector('#esri_dijit_Search_0_input');
//                 j && await page.click('.searchClear');
//                 await page.focus('#esri_dijit_Search_0_input');
//                 await page.keyboard.type(search_term);
//                 const [clickSearch] = await page.$x('//*[@class="searchBtn searchSubmit lastFocusNode"]');
//                 await clickSearch.click();
//                 await page.waitForSelector('#map_graphics_layer');
//                 const coordinatesCenter = await page.evaluate(() => {
//                     return ({x: window.innerWidth / 2, y: window.innerHeight / 2});
//                 })
//                 await page.waitForSelector('.esriPopup.esriPopupVisible', {timeout: 10000});
//                 await page.waitForXPath('//*[@class="action zoomTo"]');
//                 await page.click('.action.zoomTo');
//                 await page.waitForSelector('.esriPopup.esriPopupVisible');
//                 await page.waitFor(1000)
//                 const [clickParcelReport] = await page.$x('//*[@title="Parcel Report" and @role="button"]');
//                 await clickParcelReport.click();
//                 await page.waitForXPath('//h2[contains(text(), "Parcel Report")]', {visible: true});
//                 await page.waitForXPath('//*[@aria-label="Select tool" and @role="button"]', {visible: true});
//                 const [clickDrawMode] = await page.$x('//*[@aria-label="Select tool" and @role="button"]');
//                 await clickDrawMode.click();
//                 await page.mouse.move(coordinatesCenter.x - 10, coordinatesCenter.y);
//                 await page.mouse.down();
//                 await page.mouse.move(coordinatesCenter.x - 20, coordinatesCenter.y - 10);
//                 await page.mouse.up();
//                 await page.waitForXPath('//*[@class="esriCTAOIButtonDivContainer"]//*[@class="jimu-btn jimu-float-trailing esriCTShowReportsButton esriCTEllipsis"]');
//                 await page.waitFor(1000)
//                 const [clickReport] = await page.$x('//*[@class="esriCTAOIButtonDivContainer"]//*[contains(text(), "Report")]');
//                 await clickReport.click();
//                 const result = await this.parsePage(page, this.searchBy === 'name' ? '' : document.propertyId["Property Address"], this.searchBy === 'name' ? owner_name_regexp : '');
//                 if (result) {
//                     for (let i = 0; i < result['owner_names'].length; i++) {
//                         const owner_name = result['owner_names'][i];
//                         if (i == 0) {
//                             document.ownerId['Full Name'] = owner_name['fullName'];
//                             document.ownerId['First Name'] = owner_name['firstName'];
//                             document.ownerId['Last Name'] = owner_name['lastName'];
//                             document.ownerId['Middle Name'] = owner_name['middleName'];
//                             document.ownerId['Name Suffix'] = owner_name['suffix'];
//                             document.propertyId['Owner Occupied'] = result['Owner Occupied'];
//                             document.propertyId['Property Address'] = result['Property Address'];
//                             document.propertyId['Property City'] = result['Property City'];
//                             document.propertyId['Property State'] = result['Property State'];
//                             document.propertyId['Property Zip'] = result['Property Zip'];
//                             document.ownerId['Mailing Care of Name'] = '';
//                             document.ownerId['Mailing Address'] = result['Mailing Address'];
//                             document.ownerId['Mailing City'] = result['Mailing City'];
//                             document.ownerId['Mailing State'] = result['Mailing State'];
//                             document.ownerId['Mailing Zip'] = result['Mailing Zip'];
//                             document.ownerId['Mailing Unit #'] = '';
//                             document.propertyId['Property Type'] = result['Property Type'];
//                             document.propertyId['Total Assessed Value'] = result['Total Assessed Value'];
//                             document.propertyId['Last Sale Recording Date'] = result['Last Sale Recoding Date'];
//                             document.propertyId['Last Sale Amount'] = result['Last Sale Amount'];
//                             document.propertyId['Est. Remaining balance of Open Loans'] = '';
//                             document.propertyId['Est Value'] = result['Est. Value'];
//                             document.propertyId['yearBuilt'] = result['yearBuilt'];
//                             document.propertyId['Est Equity'] = '';
//                             document.processed = true;
//                             console.log(document)
//                             await document.save();
//                         } else {
//                             let newDocument = await this.cloneMongoDocument(document)
//                             newDocument['Full Name'] = owner_name['fullName'];
//                             newDocument['First Name'] = owner_name['firstName'];
//                             newDocument['Last Name'] = owner_name['lastName'];
//                             newDocument['Middle Name'] = owner_name['middleName'];
//                             newDocument['Name Suffix'] = owner_name['suffix'];
//                             console.log(newDocument)
//                             await newDocument.save();
//                         }
//                     }
//                 }
//             } catch (e) {
//                 console.log('Address not found: ', document.propertyId["Property Address"]);
//             }
//             try {
//                 const [clickBackButton] = await page.$x('//*[@class="esriCTBackButtonDiv"]');
//                 await clickBackButton.click();
//             } catch (e) {
//             }
//             try {
//                 const [clickStartOver] = await page.$x('//*[@title="Start Over" and @role="button"]');
//                 await clickStartOver.click();
//             } catch (e) {
//             }
//             try {
//                 const [clickClose] = await page.$x('//h2[contains(text(), "Parcel Report")]/following-sibling::div[1]/*[@class="close-btn" and @role="button"]');
//                 await clickClose.click();
//             } catch (e) {
//             }
//             j++;
//         }
//         return true;
//     }
// }