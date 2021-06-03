import puppeteer from 'puppeteer';

const parser = require('parse-address');

import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
import {IPublicRecordProducer} from '../../../../../../models/public_record_producer';
import {IOwnerProductProperty} from '../../../../../../models/owner_product_property';
import {IProperty} from '../../../../../../models/property';

const companyIdentifiersArray = ['GENERAL', 'TRUST', 'TRUSTEE', 'TRUSTEES', 'INC', 'ORGANIZATION', 'CORP', 'CORPORATION', 'LLC', 'MOTORS', 'BANK', 'UNITED', 'CO', 'COMPANY', 'FEDERAL', 'MUTUAL', 'ASSOC', 'AGENCY', 'PA', 'P A', '\\d\\d+', 'TR', 'S A', 'FIRM', 'PORTFOLIO', 'LEGAL', 'MANAGEMENT', 'COUNTY', 'CWSAMS', 'LP', 'CITY', 'INDUSTRIAL', 'IND', 'PARK', 'HABITAT', 'HOLDINGS', 'MOUNT', 'MISSIONARY', 'PUBLIC', 'LAND', 'CHURCH\\s*OF'];
const removeFromNamesArray = ['ET', 'AS', 'DECEASED', 'DCSD', 'CP\/RS', 'JT\/RS', 'JTRS', 'TRS', 'C\/O', '\\(BEN\\)', 'EST OF', 'EST', 'LE(?=\\s*$)', 'H\/E', 'ETAL', 'ET AL'];
const suffixNamesArray = ['I', 'II', 'III', 'IV', 'V', 'ESQ', 'JR', 'SR']

const companyRegexString = `\\b(?:${companyIdentifiersArray.join('|')})\\b`;
const removeFromNameRegexString = `^(.*?)(?:\\b|\\s+)(?:${removeFromNamesArray.join('|')})(?:\\b(.*?))?$`;

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        sitePropertyAppraiserPage: 'https://maps.clarkcountynv.gov/assessor/AssessorParcelDetail/site.aspx',
        ownerPropertyAppraiserPage: 'https://maps.clarkcountynv.gov/assessor/AssessorParcelDetail/ownr.aspx'
    }

    xpaths = {
        isPAloaded: '//*[@id="HeaderDivContainer"]'
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

    // use this to initialize the browser and go to a specific url.
    // setParamsForPage is needed (mainly for AWS), do not remove or modify it please.
    // return true when page is usable, false if an unexpected error is encountered.
    async init(): Promise<boolean> {
        if (!this.browserPages.propertyAppraiserPage || !this.browser) return false;
        await this.setParamsForPage(this.browserPages.propertyAppraiserPage);
        let retries = 0;
        while (true) {
          try {
            await this.browserPages.propertyAppraiserPage.goto(this.urls.sitePropertyAppraiserPage, { waitUntil: 'load' });
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

    /**
     * convert address to required infos
     * @param document : IPublicRecordAttributes
     *  full_address:  1527 N 23rd St, Lincoln, NE 68503
     street_name:   23rd St
     street_full:   1527 N 23rd St
     parsed
     number:     1527
     prefix:     N
     street:     23rd
     type:     St
     city:       Lincoln
     state:      NE
     zip:        68503
     */
    getAddress(document: IProperty): any {
        // 'Property Address': '162 DOUGLAS HILL RD',
        // 'Property City': 'WEST BALDWIN',
        // County: 'Cumberland',
        // 'Property State': 'ME',
        // 'Property Zip': '04091',
        const full_address = `${document['Property Address']}, ${document['Property City']}, ${document['Property State']} ${document['Property Zip']}`
        const parsed = parser.parseLocation(document['Property Address']);

        let street_name = parsed.street.trim();
        let street_full = document['Property Address'];
        let street_with_type = (parsed.number ? parsed.number : '') + ' ' + (parsed.prefix ? parsed.prefix : '') + ' ' + parsed.street + ' ' + (parsed.type ? parsed.type : '');
        street_with_type = street_with_type.trim();

        return {
            full_address,
            street_name,
            street_with_type,
            street_full,
            parsed
        }
    }


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

    async getPropertyInfos(page: puppeteer.Page, address: any): Promise<any> {
        let propertyAddress, fullName, firstName,totalAssessedValue,
            lastName, midleName, nameSuffix, mailingAddress, mailingCity,
            mailingState, mailingZip, propertyType,lastSaleDate,
            lastSalePrice,ownerOccupied,propertyCity;
        
        let [propertyAddressElement]: any = await page.$x(`//*[@id="lblLocation"]`);
        if (propertyAddressElement) {
            propertyAddressElement = await propertyAddressElement.getProperty('innerText');
            propertyAddressElement = await propertyAddressElement.jsonValue();
            // console.log('property type : ');
            // console.log(propertyType);
            // console.log('\n')
            if (propertyAddressElement && propertyAddressElement.trim() != '')
                propertyAddress = propertyAddressElement;
        }
        let secondaryOwnersNamesArray: any = [];
        let arrayOfNames: any = [];
        let personsExist = false;
        let [ownerName]: any = await page.$x(`//*[@id="lblOwner1"]`);
        if (ownerName) {
            ownerName = await ownerName.getProperty('innerText');
            ownerName = await ownerName.jsonValue();
            ownerName = ownerName.split('\n');
            ownerName.forEach((line: any) => {
                line = line.split('&')
                line.forEach((element: any) => {
                    if (element != "") {
                        element = this.discriminateAndRemove(element);
                        arrayOfNames.push(element);
                        if (element.type == "person") {
                            personsExist = true;
                        }
                    }
                });
            });
            //if names have persons we delete the companies
            if (personsExist) {
                arrayOfNames.forEach((element: any) => {
                    if (element.type != "person") {
                        const index = arrayOfNames.indexOf(element);
                        if (index > -1) {
                            arrayOfNames.splice(index, 1);
                        }

                    }
                });
            }

            arrayOfNames.forEach((element: any) => {
                if (element.type == "person") {
                    let separatedNamesArray = this.checkForMultipleNamesAndNormalize(element.name);

                    for (let i = 0; i < separatedNamesArray.length; i++) {
                        let separatedNameObj = separatedNamesArray[i];
                        if (i == 0) {
                            fullName = separatedNameObj.fullName;
                            firstName = separatedNameObj.firstName;
                            lastName = separatedNameObj.lastName;
                            midleName = separatedNameObj.middleName;
                            nameSuffix = separatedNameObj.nameSuffix;
                        } else {
                            secondaryOwnersNamesArray.push(separatedNameObj);
                        }
                    }


                } else {
                    fullName = element.name;
                }
            });
            console.log('\n')
        } else {
            console.log('owner name Not Available');
        }
        try {
            let mailingAddressFull: any = "";
            let [mailingAddressPart1]: any = await page.$x(`//*[@id="lblAddr1"]`);
            if (mailingAddressPart1) {
                mailingAddressPart1 = await mailingAddressPart1.getProperty('innerText');
                mailingAddressPart1 = await mailingAddressPart1.jsonValue();
                // console.log('mailing address : ');
                // console.log(mailingAddressPart1);
                mailingAddressFull = mailingAddressFull + '\n' + mailingAddressPart1;

            }
            let [mailingAddressPart2]: any = await page.$x(`//*[@id="lblAddr2"]`);
            if (mailingAddressPart2) {
                mailingAddressPart2 = await mailingAddressPart2.getProperty('innerText');
                mailingAddressPart2 = await mailingAddressPart2.jsonValue();
                // console.log(mailingAddressPart2);
                mailingAddressFull = mailingAddressFull + '\n' + mailingAddressPart2;

            }
            let [mailingAddressPart3]: any = await page.$x(`//*[@id="lblAddr3"]`);
            if (mailingAddressPart3) {
                mailingAddressPart3 = await mailingAddressPart3.getProperty('innerText');
                mailingAddressPart3 = await mailingAddressPart3.jsonValue();
                // console.log(mailingAddressPart3);
                mailingAddressFull = mailingAddressFull + '\n' + mailingAddressPart3;

            }
            let [mailingAddressPart4]: any = await page.$x(`//*[@id="lblAddr4"]`);
            if (mailingAddressPart4) {
                mailingAddressPart4 = await mailingAddressPart4.getProperty('innerText');
                mailingAddressPart4 = await mailingAddressPart4.jsonValue();
                // console.log(mailingAddressPart4);
                mailingAddressFull = mailingAddressFull + '\n' + mailingAddressPart4;

            }
            let [mailingAddressPart5]: any = await page.$x(`//*[@id="lblAddr5"]`);
            if (mailingAddressPart5) {
                mailingAddressPart5 = await mailingAddressPart5.getProperty('innerText');
                mailingAddressPart5 = await mailingAddressPart5.jsonValue();
                // console.log(mailingAddressPart5);
                mailingAddressFull = mailingAddressFull + '\n' + mailingAddressPart5;
                mailingAddressFull = mailingAddressFull.trim();
            }


            if (mailingAddressFull && mailingAddressFull.trim() != '') {
                mailingAddress = mailingAddressFull.replace(/(\r\n|\n|\r)/gm, " ")
                //add mailing city, state and zip
                let maillingAddress_separated = parser.parseLocation(mailingAddress);
                if (maillingAddress_separated.city) {
                    mailingCity = maillingAddress_separated.city;
                }
                if (maillingAddress_separated.state) {
                    mailingState = maillingAddress_separated.state;
                }
                if (maillingAddress_separated.zip) {
                    mailingZip = maillingAddress_separated.zip;
                }
            }

        } catch (error) {
            console.log('Error in Mailing Address  :');
            console.log(error);
        }

        try {
            let [propertyCityElement]: any = await page.$x(`//*[@id="lblTown"]`);
            if (propertyCityElement) {
                propertyCityElement = await propertyCityElement.getProperty('innerText');
                propertyCityElement = await propertyCityElement.jsonValue();
                // console.log('property type : ');
                // console.log(propertyType);
                // console.log('\n')
                if (propertyCityElement && propertyCityElement.trim() != '')
                    propertyCity = propertyCityElement;

            } else {
                console.log('property type Not Available');
            }

        } catch (error) {
            console.log('Error in property type :');
            console.log(error);
        }

        try {
            let [propertyTypeElement]: any = await page.$x(`//*[@id="lblLandUse"]`);
            if (propertyTypeElement) {
                propertyTypeElement = await propertyTypeElement.getProperty('innerText');
                propertyTypeElement = await propertyTypeElement.jsonValue();
                // console.log('property type : ');
                // console.log(propertyType);
                // console.log('\n')
                if (propertyTypeElement && propertyTypeElement.trim() != '')
                    propertyType = propertyTypeElement;

            } else {
                console.log('property type Not Available');
            }

        } catch (error) {
            console.log('Error in property type :');
            console.log(error);
        }

        try {
            let [totalAssessedValueElement]: any = await page.$x(`//*[@id="lblTAssessed1"]`);
            if (totalAssessedValueElement) {
                totalAssessedValueElement = await totalAssessedValueElement.getProperty('innerText');
                totalAssessedValueElement = await totalAssessedValueElement.jsonValue();
                // console.log('total Assessed Value : ');
                // console.log(totalAssessedValue);
                // console.log('\n')
                if (totalAssessedValueElement && totalAssessedValueElement.trim() != '' && totalAssessedValueElement != 'N/A')
                    totalAssessedValue = totalAssessedValueElement;
            } else {
                console.log('total Assessed Value Not Available');
            }


        } catch (error) {
            console.log('Error in total Assessed Value text :');
            console.log(error);
        }

        try {
            let [lastSaleDateElement]: any = await page.$x(`//*[@id="lblSaleDate"]`);
            if (lastSaleDateElement) {
                lastSaleDateElement = await lastSaleDateElement.getProperty('innerText');
                lastSaleDateElement = await lastSaleDateElement.jsonValue();
                // console.log('Last Sale Date : ');
                // console.log(lastSaleDate);
                // console.log('\n')
                if (lastSaleDateElement && lastSaleDateElement.trim() != '')
                    lastSaleDate = lastSaleDateElement;
            } else {
                console.log('Last Sale Date Not Available');
            }

        } catch (error) {
            console.log('Error in Last sale date :');
            console.log(error);
        }

        try {
            let [lastSalePriceElement]: any = await page.$x(`//*[@id="lblSalePrice"]`);
            if (lastSalePriceElement) {
                lastSalePriceElement = await lastSalePriceElement.getProperty('innerText');
                lastSalePriceElement = await lastSalePriceElement.jsonValue();
                // console.log('last sale price : ');
                // console.log(lastSalePrice);
                // console.log('\n')
                if (lastSalePriceElement && lastSalePriceElement.trim() != '')
                    lastSalePrice = lastSalePriceElement;
            } else {
                console.log('last sale price Not Available');
            }
        } catch (error) {
            console.log('Error in Last sale price :');
            console.log(error);
        }

        try {
            let ownerOccupieds;
            if (mailingAddress != "" && propertyAddress) {
                //normalize addresses then compare
                if (
                    mailingAddress.replace(/(\r\n|\n|\r)/gm, "").toLowerCase().includes(propertyAddress.replace(/(\r\n|\n|\r)/gm, "").toLowerCase()) ||
                    mailingAddress.replace(/(\r\n|\n|\r)/gm, "").toLowerCase() == propertyAddress.replace(/(\r\n|\n|\r)/gm, "").toLowerCase() ||
                    propertyAddress.replace(/(\r\n|\n|\r)/gm, "").toLowerCase().includes(mailingAddress.replace(/(\r\n|\n|\r)/gm, "").toLowerCase())
                ) {
                    ownerOccupieds = true;
                } else {
                    ownerOccupieds = false;
                }
                ownerOccupied = ownerOccupieds;
            }

        } catch (error) {
            console.log("Owner Occupied ERROR : ")
            console.log(error);
        }

        const yearBuilt = await this.getTextContentByXpathFromPage(page, '//span[@id="lblConstrYr"]');

        return { propertyAddress, fullName, firstName,totalAssessedValue,
            lastName, midleName, nameSuffix, mailingAddress, mailingCity,
            mailingState, mailingZip, propertyType,lastSaleDate,
            lastSalePrice,ownerOccupied,propertyCity,yearBuilt}
    }


    normalizeNames(fullName: any) {
        const normalizeNameRegexString = `^\\s*(?:(.*?)\\s*,\\s*)?([^\\s]*)(?:\\s*(.*?))?(?:\\s*((?:${suffixNamesArray.join('|')})))?\\s*$`;
        const normalizeNameRegex = new RegExp(normalizeNameRegexString, 'i');

        let normalizedNameMatch = fullName.match(normalizeNameRegex);
        if (normalizedNameMatch) {
            let firstName = normalizedNameMatch[2];
            let middleName = normalizedNameMatch[3] || '';
            let lastName = normalizedNameMatch[1] || '';
            let nameSuffix = normalizedNameMatch[4] || '';
            return {
                fullName: fullName.trim(),
                firstName: firstName.trim(),
                middleName: middleName.trim(),
                lastName: lastName.trim(),
                nameSuffix: nameSuffix.trim()
            }
        }
        return {
            fullName: fullName.trim()
        }
    }

    discriminateAndRemove(name: any) {
        let isCompanyName = name.match(new RegExp(companyRegexString, 'i'));
        if (isCompanyName) {
            return {
                type: 'company',
                name: name
            }
        }

        let cleanName = name.match(new RegExp(removeFromNameRegexString, 'i'))
        if (cleanName) {
            if (cleanName[1].trim()) {
                name = cleanName[1];
            } else if (cleanName[2].trim()) {
                name = cleanName[2];
            }
        }
        return {
            type: 'person',
            name: name
        }
    }

    checkForMultipleNamesAndNormalize(name: any) {
        let results = [];
        let lastNameBkup = '';

        let multipleNames = name.match(/^(.*?)\s*&\s*(.*?)$/);
        while (multipleNames) {
            let secondName = '';
            if (multipleNames[1].trim()) {
                let normalized = this.normalizeNames(multipleNames[1])
                if (normalized.hasOwnProperty('lastName') && normalized.lastName) {
                    lastNameBkup = normalized.lastName;
                } else if (lastNameBkup) {
                    normalized['lastName'] = lastNameBkup;
                }
                results.push(normalized);
            }

            if (multipleNames[2].trim()) secondName = multipleNames[2];
            multipleNames = secondName.match(/^(.*?)\s*&\s*(.*?)$/);
            if (!multipleNames && secondName.trim()) {
                let normalized = this.normalizeNames(secondName);
                if ((!normalized.hasOwnProperty('lastName') || !normalized.lastName) && lastNameBkup) {
                    normalized['lastName'] = lastNameBkup;
                }
                results.push(normalized);
            }
        }

        if (results.length) {
            return results;
        }
        return [this.normalizeNames(name)];
    }

    // the main parsing function. if read() succeeds, parseAndSave is started().
    // return true after all parsing is complete

    // docsToParse is the collection of all address objects to parse from mongo.
    // !!! Only mutate document objects with the properties that need to be added!
    // if you need to multiply a document object (in case of multiple owners
    // or multiple properties (2-3, not 30) you can't filter down to one, use this.cloneMongoDocument(document);
    // once all properties from PA have been added to the document, call
    async parseAndSave(docsToParse: IOwnerProductProperty): Promise<boolean> {
        const page = this.browserPages.propertyAppraiserPage!;
        let document = docsToParse;
            if (!this.decideSearchByV2(document)) {
                console.log('Insufficient info for Owner and Property');
                return false;
            }
            

            let result;
            let address;
            let search_addr;
            let first_name = '';
            let last_name = '';
            let owner_name = '';
            let owner_name_regexp = '';
            let full_name = '';
            if (this.searchBy === 'name') {
                const nameInfo = this.getNameInfo(document.ownerId);
                first_name = nameInfo.first_name;
                last_name = nameInfo.last_name;
                owner_name = nameInfo.owner_name;
                full_name = nameInfo.full_name;
                owner_name_regexp = nameInfo.owner_name_regexp;
                if (owner_name === '') return false;
                console.log(`Looking for owner: ${owner_name}`);
            } else {
                address = parser.parseLocation(document.propertyId['Property Address']);
                const parsev2 = this.getAddressV2(document.propertyId);
                if(!this.isEmptyOrSpaces(parsev2.street_address)){
                    address = parser.parseLocation(parsev2.street_address);
                }
                console.log(`Looking for address: ${document.propertyId['Property Address']}`);
                if(!address.street && !address.number){
                    console.log("Missing street and number!");
                    return false;
                }
            }
            try {
                if (this.searchBy === 'name') {

                    try {
                        await page.goto(this.urls.ownerPropertyAppraiserPage, {
                            waitUntil: 'networkidle0',
                            timeout: 60000
                        });
                    } catch (error) {
                        console.log("error  : " + error);
                        console.log('couldnt head to maps.clarkcountynv.gov retrying ... ');
                        //retry for second time
                        try {
                            await page.goto(this.urls.ownerPropertyAppraiserPage, {
                                waitUntil: 'networkidle0',
                                timeout: 60000
                            });
                        } catch (error) {
                            console.log("error  : " + error);
                            return false;
                        }
                    }
                    if (first_name) {
                        try {
                            await page.waitForXPath(`//*[@id="txtBxLastName"]`);
                            let [searchBox] = await page.$x(`//*[@id="txtBxLastName"]`);
                            await searchBox.click({clickCount: 3});
                            await searchBox.press('Backspace');
                            await searchBox.type(last_name);
                        } catch (error) {
                            console.log('Error in fill in the last name');
                            console.log(error);
                        }

                        try {
                            await page.waitForXPath(`//*[@id="txtBxFirstName"]`);
                            let [searchBox] = await page.$x(`//*[@id="txtBxFirstName"]`);
                            await searchBox.click({clickCount: 3});
                            await searchBox.press('Backspace');
                            await searchBox.type(first_name);
                        } catch (error) {
                            console.log('Error in fill in the first name');
                            console.log(error);
                        }

                    } else {
                        try {
                            await page.waitForXPath(`//*[@id="txtBxLastName"]`);
                            let [searchBox] = await page.$x(`//*[@id="txtBxLastName"]`);
                            await searchBox.click({clickCount: 3});
                            await searchBox.press('Backspace');
                            await searchBox.type(full_name);
                        } catch (error) {
                            console.log('Error in fill in the company name (full_name)');
                            console.log(error);
                        }
                    }

                    try {
                        await page.waitForXPath(`//*[@id="btnSubmit"]`);
                        let [searchButton] = await page.$x(`//*[@id="btnSubmit"]`);
                        await searchButton.click();
                        await page.waitForNavigation();

                    } catch (error) {
                        console.log('Error in click search :');
                        console.log(error);
                    }
                    let [notFoundIndicator] = await page.$x(`//*[contains(text(),'No record found for your selection')]`);
                    if (notFoundIndicator) return true;
                    try {
                        await page.waitForXPath(`//*[@id="gvList"]/tbody/tr[2]/td[4]/a`);
                        let [parcelLink] = await page.$x(`//*[@id="gvList"]/tbody/tr[2]/td[4]/a`);
                        if (parcelLink) {
                            await parcelLink.click();
                            await page.waitForNavigation();

                        } else {
                            console.log('Parcel link is not available');
                            return true;
                        }
                    } catch (error) {
                        console.log('Error in open result :');
                        console.log(error);
                    }

                } else {
                    //go to the search page
                    try {
                        await page.goto(this.urls.sitePropertyAppraiserPage, {
                            waitUntil: 'networkidle0',
                            timeout: 60000
                        });
                    } catch (error) {
                        console.log("error  : " + error);
                        console.log('couldnt head to maps.clarkcountynv.gov retrying ... ');
                        //retry for second time
                        try {
                            await page.goto(this.urls.sitePropertyAppraiserPage, {
                                waitUntil: 'networkidle0',
                                timeout: 60000
                            });
                        } catch (error) {
                            console.log("error  : " + error);
                            return false;
                        }

                    }

                    //fill in the street name
                    try {
                        if (address.street) {
                            await page.waitForXPath(`//*[@id="txtName"]`);
                            let [searchBox] = await page.$x(`//*[@id="txtName"]`);
                            await searchBox.click({clickCount: 3});
                            await searchBox.press('Backspace');
                            if (address.city) {
                                await searchBox.type(address.street + " " + address.city);
                            } else {
                                await searchBox.type(address.street);
                            }
                        }

                    } catch (error) {
                        console.log('Error in fill in the street name :');
                        console.log(error);
                    }

                    //fill in the house number
                    try {
                        if (address.number) {
                            await page.waitForXPath(`//*[@id="txtNumber"]`);
                            let [houseNumberInputMin] = await page.$x(`//*[@id="txtNumber"]`);
                            await houseNumberInputMin.click({clickCount: 3});
                            await houseNumberInputMin.press('Backspace');
                            await houseNumberInputMin.type(address.number);
                        }
                    } catch (error) {
                        console.log('Error in fill in the house number :');
                        console.log(error);
                    }

                    //click search
                    try {
                        await page.waitForXPath(`//*[@id="btnSubmit"]`);
                        let [searchButton] = await page.$x(`//*[@id="btnSubmit"]`);
                        await searchButton.click();
                        await page.waitForNavigation();

                    } catch (error) {
                        console.log('Error in click search :');
                        console.log(error);
                    }
                    let [notFoundIndicator] = await page.$x(`//*[contains(text(),'No record found for your selection')]`);
                    if (notFoundIndicator) return true;
                    //open result
                    try {
                        await page.waitForXPath(`//*[@id="gvList"]/tbody/tr[2]/td[3]/a`);
                        let [parcelLink] = await page.$x(`//*[@id="gvList"]/tbody/tr[2]/td[3]/a`);
                        if (parcelLink) {
                            await parcelLink.click();
                            await page.waitForNavigation();

                        } else {
                            console.log('Parcel link is not available');
                            return true;
                        }
                    } catch (error) {
                        console.log('Error in open result :');
                        console.log(error);
                    }
                }
                result = await this.getPropertyInfos(page, address);
                try{
                    await this.parseResult(result, document);
                } catch (e) {
                    // pass
                }

            } catch
                (error) {
                console.log(error);
                return false;
            }
        return true;
    }


    async parseResult(result: any, document: any) {
        let dataFromPropertyAppraisers = {
            'Full Name': result['fullName'],
            'First Name': result['firstName'],
            'Last Name': result['lastName'],
            'Middle Name': result['midleName'],
            'Name Suffix': result['nameSuffix'],
            'Mailing Care of Name': '',
            'Mailing Address': result['mailingAddress'],
            'Mailing Unit #': '',
            'Mailing City': result['mailingCity'] ,
            'Mailing State': result['mailingState'] ,
            'Mailing Zip': result['mailingZip'] ,
            'Property Address': result['propertyAddress'],
            'Property Unit #': '',
            'Property City': result['propertyCity'],
            'Property State': 'NV',
            'Property Zip': '',
            'County': 'Clark',
            'Owner Occupied': result['ownerOccupied'],
            'Property Type': result['propertyType'],
            'Total Assessed Value': result['totalAssessedValue'],
            'Last Sale Recording Date': result['lastSaleDate'],
            'Last Sale Amount': result['lastSalePrice'],
            'Est Value': '',
            'yearBuilt': result['yearBuilt'],
            'Est Equity': '',
            'Lien Amount': ''
        };
        try{
            await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
        } catch(e){
            //
        }
       
    }

}