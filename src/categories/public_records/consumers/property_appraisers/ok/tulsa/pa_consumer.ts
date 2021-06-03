import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
import puppeteer from "puppeteer";
const nameParsingService = require('../../consumer_dependencies/nameParsingService');
const addressService = require('../../consumer_dependencies/addressService')
const parser = require('parse-address');

import {IPublicRecordProducer} from '../../../../../../models/public_record_producer';
import {IOwnerProductProperty} from '../../../../../../models/owner_product_property';

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'https://assessor.tulsacounty.org/assessor-property-search.php',
    }

    xpaths = {
        isPAloaded: '//button[@name="accepted"]',
    }

    constructor(publicRecordProducer: IPublicRecordProducer, ownerProductProperties: IOwnerProductProperty, browser: puppeteer.Browser, page: puppeteer.Page) {
        super();
        this.publicRecordProducer = publicRecordProducer;
        this.ownerProductProperties = ownerProductProperties;
        this.browser = browser;
        this.browserPages.propertyAppraiserPage = page;
      }  

    readDocsToParse(): IOwnerProductProperty {
        return this.ownerProductProperties;
    }

    async finderIds(page: puppeteer.Page) {
        try {
            return await page.evaluate(() => {
                let options = Array.from(document.querySelectorAll('#pickone > tbody > tr > td:first-child'));
                return options.map(x => x.innerHTML);
            })
        } catch (error) {
            console.log(error)
            return []
        }
    }

    async parsePage(page: puppeteer.Page) {
        const rawOwnerName = await this.getOrdinalTableText(page, 'general', 'Owner name');
        const estimationValue = await this.getOrdinalTableText(page, 'quick', 'Fair cash (market) value');
        let address = await this.getAddress(page, 'general', 'Owner mailing address');
        const {state, city, zip} = addressService.parsingDelimitedAddress(address);
        address = address.replace(/\n/g, ' ')
        const grossAssessedValue = await this.getOrdinalTableText(page, 'tax', 'Gross assessed value', 3);
        let propertySaleDate = await this.getSalesTableText(page, 1);
        propertySaleDate = propertySaleDate.trim() === 'No sale information is available' ? '' : propertySaleDate;
        let propertySalePrice = await this.getSalesTableText(page, 4);
        propertySalePrice = /\$—/.test(propertySalePrice) ? '' : propertySalePrice;

        let propertyAddressFull = await this.getTextContentByXpathFromPage(page, '//td[text()="Situs address"]/parent::tr/td[2]')
        let propertyAddressArr = propertyAddressFull.split('  ');
        let propertyAddress = propertyAddressArr[0].trim();
        console.log('Property address from web:', propertyAddress);
        const processedNamesArray = nameParsingService.parseOwnersFullName(rawOwnerName);
        const ownerOccupied = addressService.comparisonAddresses(address, propertyAddress);
        const propertyType = await this.getOrdinalTableText(page, 'general', 'Zoning');

        return {
            'owner_names': processedNamesArray,
            'Unit#': '',
            'Property Address': propertyAddress,
            'Property State': 'Oklahoma',
            'Property Zip': '',
            'County': 'Tulsa',
            'Owner Occupied': ownerOccupied,
            'Mailing Care of Name': '',
            'Mailing Address': address,
            'Mailing Unit #': '',
            'Mailing City': city,
            'Mailing State': state,
            'Mailing Zip': zip,
            'Property Type': propertyType,
            'Total Assessed Value': grossAssessedValue,
            'Last Sale Recoding Date': propertySaleDate,
            'Last Sale Amount': propertySalePrice,
            'Est. Value': estimationValue,
            'yearBuilt': '',
            'Est. Equity': '',
        };
    }

//Get text from ordinal table from property info page
    async getOrdinalTableText(page: puppeteer.Page, tableId: string, label: string, childNumber = 1) {
        const selector = `//*[@id="${tableId}"]//td[contains(text(), "${label}")]/following-sibling::td[${childNumber}]`;
        const [elm] = await page.$x(selector);
        if (elm == null) {
            return '';
        }
        let text = await page.evaluate(j => j.innerText, elm);
        return text.replace(/\n/g, ' ');
    };

    async getAddress(page: puppeteer.Page, tableId: string, label: string, childNumber = 1) {
        const selector = `//*[@id="${tableId}"]//td[contains(text(), "${label}")]/following-sibling::td[${childNumber}]`;
        const [elm] = await page.$x(selector);
        if (elm == null) {
            return '';
        }
        return await page.evaluate(j => j.innerText, elm);
    };

    //Get text from property info sales section
    async getSalesTableText(page: puppeteer.Page, elementNumber: number) {
        const selector = `//*[@id="sales"]//tr[1]/td[${elementNumber}]`;
        const [elm] = await page.$x(selector);
        if (elm == null) {
            return '';
        }
        let text = await page.evaluate(j => j.innerText, elm);
        return text.replace(/\n/g, ' ');
    };

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
            await this.browserPages.propertyAppraiserPage?.click('.buttonset > .positive');
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

            if (!this.decideSearchByV2(document)) {
                console.log('Insufficient info for Owner and Property');
                return false;
            }
            

            let searchAddress;
            let first_name = '';
            let last_name = '';
            let owner_name = '';
            let owner_name_regexp = '';

            if (this.searchBy === 'name') {
                const nameInfo = this.getNameInfo(document.ownerId);
                first_name = nameInfo.first_name;
                last_name = nameInfo.last_name;
                owner_name = nameInfo.owner_name;
                owner_name_regexp = nameInfo.owner_name_regexp;
                if (owner_name === '') return false;
                console.log(`Looking for owner: ${owner_name}`);
            }
            else {
                searchAddress = parser.parseLocation(document.propertyId['Property Address']);
                const parseaddr = this.getAddressV2(document.propertyId);
                if(!this.isEmptyOrSpaces(parseaddr.street_address)){
                searchAddress = parser.parseLocation(parseaddr.street_address);
                }
                if(!searchAddress || (!searchAddress.number && !searchAddress.street)){
                    console.log("Street name and number is missing!");
                    return false;
                }
                console.log(`Looking for address: ${document.propertyId['Property Address']}`);
            }
            try {
                await page.goto(this.urls.propertyAppraiserPage, {waitUntil: 'networkidle0'});
                let tosButton = await page.$x('//button[@name="accepted"]');
                if (tosButton.length > 0){
                    await tosButton[0].click();
                }
                await page.waitForXPath('//*[@id="srchaddr"]//label[contains(text(), "Property address")]');
                if(this.searchBy == 'address'){
                    if(searchAddress.street){
                        searchAddress.street = searchAddress.street.replace(/\b(?:N|S|W|E|East|West|North|South)\b/gi, '');
                        searchAddress.street.trim()
                    }
                    const [clickAddressElement] = await page.$x('//*[@id="srchaddr"]//label[contains(text(), "Property address")]');
                    await clickAddressElement.click();
                    if(searchAddress.number){
                        await page.focus('#streetno');
                        await page.keyboard.type(searchAddress.number);
                    }
                    searchAddress.prefix && await page.select('#streetno ~ select[name=predirection]', searchAddress.prefix.toUpperCase());
                    if(searchAddress.street){
                        await page.focus('#streetname');
                        await page.keyboard.type(searchAddress.street.trim());
                    }
                    if (searchAddress.type) {
                        try {
                            searchAddress.type = searchAddress.type == 'Rd' ? 'Road' : searchAddress.type
                            const [optionSuffix] = await page.$x(`//*[@id="streettype"]/option[contains(text(), "${searchAddress.type}")]`);
                            const valueSuffix: string = <string>await (await optionSuffix.getProperty('value')).jsonValue();
                            await page.select("#streettype", valueSuffix);
                        } catch (e) {
                        }
                    }
                    await page.click('#bttnaddr');
                } else {
                    const [clickAddressElement] = await page.$x('//*[@id="srchprsn"]//label[contains(text(), "Owner name")]');
                    await clickAddressElement.click();
                    await page.focus('#ln');
                    await page.keyboard.type(last_name);
                    await page.focus('#fn');
                    await page.keyboard.type(first_name);
                    await page.click('#bttnprsn');
                }
                await page.waitForSelector('#content');
                const elementSingle = await page.$('#quick');
                if (!!elementSingle) {
                    await page.waitForSelector('#quick');
                    const result = await this.parsePage(page);
                    let dataFromPropertyAppraisers: any = {};
                    dataFromPropertyAppraisers['Full Name'] = result['owner_names'][0]['fullName'];
                    dataFromPropertyAppraisers['First Name'] = result['owner_names'][0]['firstName'];
                    dataFromPropertyAppraisers['Last Name'] = result['owner_names'][0]['lastName'];
                    dataFromPropertyAppraisers['Middle Name'] = result['owner_names'][0]['middleName'];
                    dataFromPropertyAppraisers['Name Suffix'] = result['owner_names'][0]['suffix'];
                    dataFromPropertyAppraisers['Owner Occupied'] = result['Owner Occupied'];
                    dataFromPropertyAppraisers['Mailing Care of Name'] = '';
                    dataFromPropertyAppraisers['Mailing Address'] = result['Mailing Address'];
                    dataFromPropertyAppraisers['Mailing City'] = result['Mailing City'];
                    dataFromPropertyAppraisers['Mailing State'] = result['Mailing State'];
                    dataFromPropertyAppraisers['Mailing Zip'] = result['Mailing Zip'];
                    dataFromPropertyAppraisers['Mailing Unit #'] = '';
                    dataFromPropertyAppraisers['Property Type'] = result['Property Type'];
                    dataFromPropertyAppraisers['Total Assessed Value'] = result['Total Assessed Value'];
                    dataFromPropertyAppraisers['Last Sale Recording Date'] = result['Last Sale Recoding Date'];
                    dataFromPropertyAppraisers['Last Sale Amount'] = result['Last Sale Amount'];
                    dataFromPropertyAppraisers['Est. Remaining balance of Open Loans'] = '';
                    dataFromPropertyAppraisers['Est Value'] = result['Est. Value'];
                    dataFromPropertyAppraisers['yearBuilt'] = '';
                    dataFromPropertyAppraisers['Est Equity'] = '';
                    dataFromPropertyAppraisers['County'] = 'Tulsa';
                    dataFromPropertyAppraisers['Property State'] = 'OK';
                    dataFromPropertyAppraisers['Property Address'] = result['Property Address'];
                    try {
                        await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
                    } catch(e){
                        //
                    }
                } else {
                    try {
                        await page.waitForSelector('#pickone_wrapper', {timeout: 7000});
                        if(this.searchBy == 'address'){
                            const ids = await this.finderIds(page);
                            await page.goto(`https://www.assessor.tulsacounty.org/assessor-property.php?account=${ids[0]}&go=1`);
                            await page.waitForSelector('#quick');
                            const result = await this.parsePage(page);
                            let dataFromPropertyAppraisers: any = {};
                            dataFromPropertyAppraisers['Full Name'] = result['owner_names'][0]['fullName'];
                            dataFromPropertyAppraisers['First Name'] = result['owner_names'][0]['firstName'];
                            dataFromPropertyAppraisers['Last Name'] = result['owner_names'][0]['lastName'];
                            dataFromPropertyAppraisers['Middle Name'] = result['owner_names'][0]['middleName'];
                            dataFromPropertyAppraisers['Name Suffix'] = result['owner_names'][0]['suffix'];
                            dataFromPropertyAppraisers['Owner Occupied'] = result['Owner Occupied'];
                            dataFromPropertyAppraisers['Mailing Care of Name'] = '';
                            dataFromPropertyAppraisers['Mailing Address'] = result['Mailing Address'];
                            dataFromPropertyAppraisers['Mailing City'] = result['Mailing City'];
                            dataFromPropertyAppraisers['Mailing State'] = result['Mailing State'];
                            dataFromPropertyAppraisers['Mailing Zip'] = result['Mailing Zip'];
                            dataFromPropertyAppraisers['Mailing Unit #'] = '';
                            dataFromPropertyAppraisers['Property Type'] = result['Property Type'];
                            dataFromPropertyAppraisers['Total Assessed Value'] = result['Total Assessed Value'];
                            dataFromPropertyAppraisers['Last Sale Recording Date'] = result['Last Sale Recoding Date'];
                            dataFromPropertyAppraisers['Last Sale Amount'] = result['Last Sale Amount'];
                            dataFromPropertyAppraisers['Est. Remaining balance of Open Loans'] = '';
                            dataFromPropertyAppraisers['Est Value'] = result['Est. Value'];
                            dataFromPropertyAppraisers['yearBuilt'] = '';
                            dataFromPropertyAppraisers['Est Equity'] = '';
                            dataFromPropertyAppraisers['County'] = 'Tulsa';
                            dataFromPropertyAppraisers['Property State'] = 'OK';
                            dataFromPropertyAppraisers['Property Address'] = result['Property Address'];
                            try {
                                await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
                            } catch(e){
                                //
                            }
                        } else {
                            const search_results = await page.$x('//table[@id="pickone"]/tbody/tr');
                            const datalinks = [];
                            for(const row of search_results){
                                let id = await row.evaluate(el => el.children[0].textContent?.trim());
                                let link = `https://www.assessor.tulsacounty.org/assessor-property.php?account=${id}&go=1`
                                let name = await row.evaluate(el => el.children[1].textContent?.trim());
                                const regexp = new RegExp(owner_name_regexp);
                                if (regexp.exec(name!.toUpperCase())){
                                    datalinks.push(link);
                                }
                            }
                            for (const datalink of datalinks){
                                console.log(datalink)
                                await page.goto(datalink, {waitUntil: 'networkidle0'});
                                const result = await this.parsePage(page);
                                let dataFromPropertyAppraisers: any = {};
                                dataFromPropertyAppraisers['Full Name'] = result['owner_names'][0]['fullName'];
                                dataFromPropertyAppraisers['First Name'] = result['owner_names'][0]['firstName'];
                                dataFromPropertyAppraisers['Last Name'] = result['owner_names'][0]['lastName'];
                                dataFromPropertyAppraisers['Middle Name'] = result['owner_names'][0]['middleName'];
                                dataFromPropertyAppraisers['Name Suffix'] = result['owner_names'][0]['suffix'];
                                dataFromPropertyAppraisers['Owner Occupied'] = result['Owner Occupied'];
                                dataFromPropertyAppraisers['Mailing Care of Name'] = '';
                                dataFromPropertyAppraisers['Mailing Address'] = result['Mailing Address'];
                                dataFromPropertyAppraisers['Mailing City'] = result['Mailing City'];
                                dataFromPropertyAppraisers['Mailing State'] = result['Mailing State'];
                                dataFromPropertyAppraisers['Mailing Zip'] = result['Mailing Zip'];
                                dataFromPropertyAppraisers['Mailing Unit #'] = '';
                                dataFromPropertyAppraisers['Property Type'] = result['Property Type'];
                                dataFromPropertyAppraisers['Total Assessed Value'] = result['Total Assessed Value'];
                                dataFromPropertyAppraisers['Last Sale Recording Date'] = result['Last Sale Recoding Date'];
                                dataFromPropertyAppraisers['Last Sale Amount'] = result['Last Sale Amount'];
                                dataFromPropertyAppraisers['Est. Remaining balance of Open Loans'] = '';
                                dataFromPropertyAppraisers['Est Value'] = result['Est. Value'];
                                dataFromPropertyAppraisers['yearBuilt'] = '';
                                dataFromPropertyAppraisers['Est Equity'] = '';
                                dataFromPropertyAppraisers['County'] = 'Tulsa';
                                dataFromPropertyAppraisers['Property State'] = 'OK';
                                dataFromPropertyAppraisers['Property Address'] = result['Property Address'];
                                try {
                                    await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
                                } catch(e){
                                    //
                                }
                            }
                        }
                    } catch (e) {
                        // console.log(e);
                        console.log('Not found!');
                    }
                }
            } catch (e) {
                // console.log(e);
                console.log('Not found!');
            }
            // await page.waitForSelector('button.positive[name=accepted]');
            // await page.click('button.positive[name=accepted]');
        return true;
    }
}