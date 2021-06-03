// import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
// import {IPublicRecordAttributes} from '../../../../../../models/public_record_attributes';

// import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
// import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';

// const californiaHelper = require('../../consumer_dependencies/californiaHelper');

// export default class PAConsumer extends AbstractPAConsumer {
//     publicRecordProducer: IPublicRecordProducer;
//     ownerProductProperties: IOwnerProductProperty[];

//     urls = {
//         propertyAppraiserPage: 'https://pqweb.parcelquest.com/#home',
//     }

//     xpaths = {
//         isPAloaded: '//*[@id="txtName"]',
//     }

//     constructor(publicRecordProducer: IPublicRecordProducer, ownerProductProperties: IOwnerProductProperty) {
//         super();
//         this.publicRecordProducer = publicRecordProducer;
//         this.ownerProductProperties = ownerProductProperties;
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
//         await this.browserPages!.propertyAppraiserPage!.close();
//         for (let document of docsToParse) {
//             const scraped = await californiaHelper.scrapDataForAddress(this.browser!, this.setParamsForPage, 'ALA', 'Alameda', document, this.cloneMongoDocument);
//             // !scraped && console.log('Address not found: ', document['Property Address'])
//         }
//         return true;
//     }
// }