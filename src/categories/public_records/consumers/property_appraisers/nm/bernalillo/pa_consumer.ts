import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
import puppeteer from "puppeteer";
const nameParsingService = require('../../consumer_dependencies/nameParsingService');
const addressService = require('../../consumer_dependencies/addressService');
const parser = require('parse-address');

import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'http://assessor.bernco.gov/public.access/search/commonsearch.aspx?mode=realprop',
    }

    xpaths = {
        isPAloaded: '//*[@id="inpNo"]',
    }

    constructor(publicRecordProducer: IPublicRecordProducer, ownerProductProperties: IOwnerProductProperty, browser: puppeteer.Browser, page: puppeteer.Page) {
        super();
        this.publicRecordProducer = publicRecordProducer;
        this.ownerProductProperties = ownerProductProperties;
        this.browser = browser;
        this.browserPages.propertyAppraiserPage = page;
    }

    async getTextByXpathFromPage(page: puppeteer.Page, xPath: string) {
        const [elm] = await page.$x(xPath)
        if (elm == null) {
            return null;
        }
        let text = await page.evaluate(j => j.innerText, elm);
        return text.replace(/\n/g, ' ');
    }

    async parsePage(page: puppeteer.Page, propertyAddress: string) {
        const rawOwnerName = await this.getTextByXpathFromPage(page, '//*[@id="Current Owner"]//*[text()="Owner"]/following-sibling::td[1]');
        const processedNamesArray = await nameParsingService.parseOwnersFullNameWithoutComma(rawOwnerName);
        const {state, city, zip, fullAddress} = await this.getAndParseAddress(page);
        let isOwnerOccupied = addressService.comparisonAddresses(fullAddress, propertyAddress)
        const propertyType = await this.getTextByXpathFromPage(page, '//*[@id="Class"]//*[text()="Class"]/following-sibling::td[1]');
        const yearBuild = await this.getTextByXpathFromPage(page, '//*[@id="Real Property Attributes"]//*[text()="Year Built"]/following-sibling::td[1]');
        const [valuesElement] = await page.$x('//*[@id="sidemenu"]//*[text()="Values"]/parent::a');
        await valuesElement.click();
        await page.waitForSelector('#datalet_div_3');
        const grossAssessedValue = await this.getTextByXpathFromPage(page, '//*[@id="Net Taxable Value"]//*[text()="Class"]/following-sibling::td[1]');
        const estValue = await this.getTextByXpathFromPage(page, '//*[@id="Values"]//*[text()="Full Total Value"]/following-sibling::td[1]');
        return {
            'owner_names': processedNamesArray,
            'Unit#': '',
            'Property City': '',
            'Property State': 'New Mexico',
            'Property Zip': '',
            'County': 'Bernalillo',
            'Owner Occupied': isOwnerOccupied,
            'Mailing Care of Name': '',
            'Mailing Address': fullAddress,
            'Mailing Unit #': '',
            'Mailing City': city,
            'Mailing State': state,
            'Mailing Zip': zip,
            'Property Type': propertyType ? propertyType : '',
            'Total Assessed Value': grossAssessedValue ? grossAssessedValue : '',
            'Last Sale Recoding Date': '',
            'Last Sale Amount': '',
            'Est. Value': estValue,
            'yearBuilt': yearBuild,
            'Est. Equity': '',
        };
    }

    readDocsToParse(): IOwnerProductProperty {
        return this.ownerProductProperties;
    }

    async getAndParseAddress(page: puppeteer.Page) {
        const mailingAddress = await this.getTextByXpathFromPage(page, '//*[@id="Current Owner"]//*[text()="Owner Mailing Address"]/following-sibling::td[1]');
        const city = await this.getTextByXpathFromPage(page, '//*[@id="Current Owner"]//*[text()="City"]/following-sibling::td[1]');
        const state = await this.getTextByXpathFromPage(page, '//*[@id="Current Owner"]//*[text()="State"]/following-sibling::td[1]');
        let mailingZip = await this.getTextByXpathFromPage(page, '//*[@id="Current Owner"]//*[text()="Zip Code"]/following-sibling::td[1]');
        const foreignMailingAddress = await this.getTextByXpathFromPage(page, '//*[@id="Current Owner"]//*[text()="Foreign Mailling Address"]/following-sibling::td[1]');
        const fullAddress = `${foreignMailingAddress && foreignMailingAddress !== '\xa0' ? foreignMailingAddress : mailingAddress} ${city}, ${state} ${mailingZip}`;
        const zip = /^(\d{5})/.exec(mailingZip)![1];
        return {city, state, zip, fullAddress}
    }

    // use this to initialize the browser and go to a specific url.
    // setParamsForPage is needed (mainly for AWS), do not remove or modify it please.
    // return true when page is usable, false if an unexpected error is encountered.
    async init(): Promise<boolean> {
        if (!this.browserPages.propertyAppraiserPage || !this.browser) return false;
        await this.setParamsForPage(this.browserPages.propertyAppraiserPage);
        let retries = 0;
        while (true) {
          try {
            await this.browserPages.propertyAppraiserPage.goto(this.urls.propertyAppraiserPage, { waitUntil: 'load' });
            break;
          } catch (err) {
            console.log(err);
            retries++;
            if (retries > 3) {
                console.log('******** website loading failed');
                return false;
            }
            this.randomSleepIn5Sec();
            console.log(`******** website loading failed, retring... [${retries}]`);
          }
        }
        return true;
    };

    // use this as a middle layer between init() and parseAndSave().
    // this should check if the page is usable or if there was an error,
    // so use an xpath that is available when page is usable.
    // return true when it's usable, false if it errors out.
    async read(): Promise<boolean> {
        try {
            await this.browserPages.propertyAppraiserPage?.waitForXPath(this.xpaths.isPAloaded);
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    // the main parsing function. if read() succeeds, parseAndSave is started().
    // return true after all parsing is complete

    // docsToParse is the collection of all address objects to parse from mongo.
    // !!! Only mutate document objects with the properties that need to be added!
    // if you need to multiply a document object (in case of multiple owners
    // or multiple properties (2-3, not 30) you can't filter down to one, use this.cloneMongoDocument(document);
    // once all properties from PA have been added to the document, call
    async parseAndSave(docsToParse: IOwnerProductProperty): Promise<boolean> {
        const page = this.browserPages.propertyAppraiserPage;
        if (page === undefined) return false;
        let document = docsToParse;

            try {
                if (!this.decideSearchByV2(document)) {
                    return false;
                }
                if (this.searchBy === 'name') {
                    console.log("By name detected! The site is only supported searched by property address: http://assessor.bernco.gov/public.access/search/commonsearch.aspx?mode=realprop");
                    return false;
                }
                let address = parser.parseLocation(document.propertyId["Property Address"]);
                const parsev2 = this.getAddressV2(document.propertyId);
                let address_search = document.propertyId["Property Address"];
                if(!this.isEmptyOrSpaces(parsev2.street_address)){
                    address = parser.parseLocation(parsev2.street_address);
                    address_search = parsev2.street_address;
                }
                if(!address || !address.number || !address.street){
                    console.log('Street name or number is missing!');
                    return false;
                }
                await page.waitForSelector('#inpNo');
                await page.focus('#inpNo');
                await page.keyboard.type(address.number);
                await page.focus('#inpStreet');
                await page.keyboard.type(address.street);
                await page.click('#btSearch');
                await page.waitForSelector('#wrapper');
                const locationPath = await page.evaluate(() => window.location.pathname);
                if (locationPath != '/public.access/Datalets/Datalet.aspx') {
                    await page.waitForSelector('#searchResults');
                    const elements = await page.$$('tr.SearchResults');
                    if (elements.length < 4) {
                        await page.waitForSelector('#searchResults');
                        const element = (await page.$$('tr.SearchResults'))[0];
                        await element.click();
                        try {
                            await page.waitForSelector('#datalet_header_row');
                            const result = await this.parsePage(page, address_search);
                            let dataFromPropertyAppraiser: any = {};
                            dataFromPropertyAppraiser['Full Name'] = result['owner_names'][0]['fullName'];
                            dataFromPropertyAppraiser['First Name'] = result['owner_names'][0]['firstName'];
                            dataFromPropertyAppraiser['Last Name'] = result['owner_names'][0]['lastName'];
                            dataFromPropertyAppraiser['Middle Name'] = result['owner_names'][0]['middleName'];
                            dataFromPropertyAppraiser['Name Suffix'] = result['owner_names'][0]['suffix'];
                            dataFromPropertyAppraiser['Owner Occupied'] = result['Owner Occupied'];
                            dataFromPropertyAppraiser['Mailing Care of Name'] = '';
                            dataFromPropertyAppraiser['Mailing Address'] = result['Mailing Address'];
                            dataFromPropertyAppraiser['Mailing City'] = result['Mailing City'];
                            dataFromPropertyAppraiser['Mailing State'] = result['Mailing State'];
                            dataFromPropertyAppraiser['Mailing Zip'] = result['Mailing Zip'];
                            dataFromPropertyAppraiser['Mailing Unit #'] = '';
                            dataFromPropertyAppraiser['Property Type'] = result['Property Type'];
                            dataFromPropertyAppraiser['Total Assessed Value'] = result['Total Assessed Value'];
                            dataFromPropertyAppraiser['Last Sale Recording Date'] = result['Last Sale Recoding Date'];
                            dataFromPropertyAppraiser['Last Sale Amount'] = result['Last Sale Amount'];
                            dataFromPropertyAppraiser['Est. Remaining balance of Open Loans'] = '';
                            dataFromPropertyAppraiser['Est Value'] = result['Est. Value'];
                            dataFromPropertyAppraiser['yearBuilt'] = result['yearBuilt'];
                            dataFromPropertyAppraiser['Est Equity'] = '';
                            dataFromPropertyAppraiser['County'] = this.publicRecordProducer.county;
                            dataFromPropertyAppraiser['Property State'] = this.publicRecordProducer.state.toUpperCase();
                            try{
                                this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraiser);
                            }catch(e){
                                //
                            }
                            await page.click('#DTLNavigator_searchResultsAnchor');
                            await page.waitForSelector('#searchResults');
                        } catch (e) {
                        }
                    } else console.log('Many matches found!');
                } else {
                    await page.waitForSelector('#datalet_header_row');
                    const result = await this.parsePage(page, address_search);
                    let dataFromPropertyAppraiser: any = {};
                    dataFromPropertyAppraiser['Full Name'] = result['owner_names'][0]['fullName'];
                    dataFromPropertyAppraiser['First Name'] = result['owner_names'][0]['firstName'];
                    dataFromPropertyAppraiser['Last Name'] = result['owner_names'][0]['lastName'];
                    dataFromPropertyAppraiser['Middle Name'] = result['owner_names'][0]['middleName'];
                    dataFromPropertyAppraiser['Name Suffix'] = result['owner_names'][0]['suffix'];
                    dataFromPropertyAppraiser['Owner Occupied'] = result['Owner Occupied'];
                    dataFromPropertyAppraiser['Mailing Care of Name'] = '';
                    dataFromPropertyAppraiser['Mailing Address'] = result['Mailing Address'];
                    dataFromPropertyAppraiser['Mailing City'] = result['Mailing City'];
                    dataFromPropertyAppraiser['Mailing State'] = result['Mailing State'];
                    dataFromPropertyAppraiser['Mailing Zip'] = result['Mailing Zip'];
                    dataFromPropertyAppraiser['Mailing Unit #'] = '';
                    dataFromPropertyAppraiser['Property Type'] = result['Property Type'];
                    dataFromPropertyAppraiser['Total Assessed Value'] = result['Total Assessed Value'];
                    dataFromPropertyAppraiser['Last Sale Recording Date'] = result['Last Sale Recoding Date'];
                    dataFromPropertyAppraiser['Last Sale Amount'] = result['Last Sale Amount'];
                    dataFromPropertyAppraiser['Est. Remaining balance of Open Loans'] = '';
                    dataFromPropertyAppraiser['Est Value'] = result['Est. Value'];
                    dataFromPropertyAppraiser['yearBuilt'] = result['yearBuilt'];
                    dataFromPropertyAppraiser['Est Equity'] = '';
                    dataFromPropertyAppraiser['County'] = this.publicRecordProducer.county;
                    dataFromPropertyAppraiser['Property State'] = this.publicRecordProducer.state.toUpperCase();
                    try{
                        this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraiser);
                    }catch(e){
                        //
                    }
                }
            } catch
                (e) {
                console.log('Address not found: ', document.propertyId["Property Address"]);
            }
            await page.goto('http://assessor.bernco.gov/public.access/search/commonsearch.aspx?mode=realprop');
        return true;
    }
}

