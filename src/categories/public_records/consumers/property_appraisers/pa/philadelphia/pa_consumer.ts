const parseAddress = require('parse-address');
const axios = require("axios");
import puppeteer from 'puppeteer';
import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';
const nameParsingService = require('../../consumer_dependencies/nameParsingServiceNew');

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'https://property.phila.gov/'
    }

    xpaths = {
        isPAloaded: '//*[@id="application"]'
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
        //-------------------name seperation stuff goes here-------------------//

        const companyIdentifiersArray = ['GENERAL', 'TRUST', 'TRUSTEE', 'TRUSTEES', 'INC', 'ORGANIZATION', 'CORP', 'CORPORATION', 'LLC', 'MOTORS', 'BANK', 'UNITED', 'CO', 'COMPANY', 'FEDERAL', 'MUTUAL', 'ASSOC', 'AGENCY', 'PA', 'P A', '\\d\\d+', 'TR', 'S A', 'FIRM', 'PORTFOLIO', 'LEGAL', 'MANAGEMENT', 'COUNTY', 'CWSAMS', 'LP', 'CITY', 'INDUSTRIAL', 'IND', 'PARK', 'HABITAT', 'HOLDINGS', 'MOUNT', 'MISSIONARY', 'PUBLIC', 'LAND', 'CHURCH\\s*OF'];
        const removeFromNamesArray = ['ET', 'AS', 'DECEASED', 'DCSD', 'CP\/RS', 'JT\/RS', 'JTRS', 'TRS', 'C\/O', '\\(BEN\\)', 'EST OF', 'EST', 'LE(?=\\s*$)', 'H\/E', 'ETAL', 'ET AL'];
        const suffixNamesArray = ['I', 'II', 'III', 'IV', 'V', 'ESQ', 'JR', 'SR']

        const companyRegexString = `\\b(?:${companyIdentifiersArray.join('|')})\\b`;
        const removeFromNameRegexString = `^(.*?)(?:\\b|\\s+)(?:${removeFromNamesArray.join('|')})(?:\\b(.*?))?$`;

        const discriminateAndRemove = (name: any) => {
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
                }
                else if (cleanName[2].trim()) {
                    name = cleanName[2];
                }
            }
            return {
                type: 'person',
                name: name
            }
        }

        const normalizeNames = (fullName: any) => {
            let parserName = nameParsingService.newParseName(fullName);
            return parserName
        }

        const checkForMultipleNamesAndNormalize = (name: any) => {
            let results = [];
            let lastNameBkup = '';

            let multipleNames = name.match(/^(.*?)\s*&\s*(.*?)$/);
            while (multipleNames) {
                let secondName = '';
                if (multipleNames[1].trim()) {
                    let normalized = normalizeNames(multipleNames[1])
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
                    let normalized = normalizeNames(secondName);
                    if ((!normalized.hasOwnProperty('lastName') || !normalized.lastName) && lastNameBkup) {
                        normalized['lastName'] = lastNameBkup;
                    }
                    results.push(normalized);
                }
            }

            if (results.length) {
                return results;
            }
            return [normalizeNames(name)];
        }
        //--------------------------name separation stuff ends here---------------------------------//















        let apiUrl = `https://phl.carto.com/api/v2/sql?q= select * from opa_properties_public_pde+where parcel_number = `;
        let document = docsToParse;
            if (!this.decideSearchByV2(document)) {
                return false;
            }
            
            if (this.searchBy === 'name') {
                console.log("Searched by name detected! The site is only supported searched by property address: https://property.phila.gov/");
                return false;
            }

            let address = document.propertyId["Property Address"];
            const parsev2 = this.getAddressV2(document.propertyId);
            if(!this.isEmptyOrSpaces(parsev2.street_address)){
                address = parsev2.street_address;
            }
            console.log('------------------Looking for address : ' + address + "--------------------")


            let parcelNumber = null;
            let searchAPI = `https://api.phila.gov/ais_ps/v1/addresses/` + address;
            let dataFromPropertyAppraisers: any = {};

            dataFromPropertyAppraisers["Property Address"] = address;
            dataFromPropertyAppraisers["County"] = 'Philadelphia';
            dataFromPropertyAppraisers["Property State"] = 'PA';
            //get the parcel number of the address 
            await axios
                .get(searchAPI)
                .then(async (res: any) => {
                    parcelNumber = res.data.features[0].properties.opa_account_num
                    if (parcelNumber) {
                        // console.log('parcel_number :' + parcelNumber)
                    } else {
                        console.log('couldnt find address')
                    }
                })
                .catch((error: any) => {
                    if (error.response.data.message) {
                        console.log('message:' + error.response.data.message)
                    } else {
                        console.log(error);
                    }
                });

            //if the address have no parcel number skip it
            if (!parcelNumber) {
                console.log("no parcel number found for this address, skiping ..")
                return true;
            }

            //if the parcel number was grabed successfully 
            await axios
                .get(apiUrl + `'` + parcelNumber + `'`)
                .then(async (res: any) => {
                    res = res.data.rows[0];
                    if (res) {
                        //owner name 1
                        let secondaryOwnersNamesArray = [];
                        try {
                            // console.log('owner Name 1: ' + res.owner_1)
                            if (res.owner_1 && res.owner_1.trim() != '') {
                                let ownerName = discriminateAndRemove(res.owner_1);
                                if (ownerName.type == 'person') {
                                    let discriminateResult = discriminateAndRemove(res.owner_1);
                                    if (discriminateResult.type == 'person') {
                                        let separatedNamesArray = checkForMultipleNamesAndNormalize(discriminateResult.name);

                                        for (let i = 0; i < separatedNamesArray.length; i++) {
                                            let separatedNameObj = separatedNamesArray[i];
                                            if (i == 0) {
                                                dataFromPropertyAppraisers["Full Name"] = separatedNameObj.fullName.trim();
                                                dataFromPropertyAppraisers["First Name"] = separatedNameObj.firstName.trim();
                                                dataFromPropertyAppraisers["Last Name"] = separatedNameObj.lastName.trim();
                                                dataFromPropertyAppraisers["Middle Name"] = separatedNameObj.middleName.trim();
                                                dataFromPropertyAppraisers["Name Suffix"] = separatedNameObj.suffix.trim();
                                            }
                                            else {
                                                secondaryOwnersNamesArray.push(separatedNamesArray[i]);
                                            }

                                        }
                                    } else {
                                        dataFromPropertyAppraisers["Full Name"] = discriminateResult.name;
                                    }
                                }
                            }
                        } catch (error) {
                            console.log('Error in owner name 1 :');
                            console.log(error);
                        }


                        //owner name 2
                        try {
                            // console.log('owner Name 2: ' + res.owner_2)
                            if (res.owner_2 && res.owner_1.trim() != '') {
                                let discriminateResult = discriminateAndRemove(res.owner_2);
                                if (discriminateResult.type == 'person') {
                                    let separatedNamesArray = checkForMultipleNamesAndNormalize(discriminateResult.name);

                                    for (let i = 0; i < separatedNamesArray.length; i++) {
                                        secondaryOwnersNamesArray.push(separatedNamesArray[i]);
                                    }
                                } else {
                                    dataFromPropertyAppraisers["Full Name"] = discriminateResult.name;
                                }
                            }
                        } catch (error) {
                            console.log('Error in owner name 2 :');
                            console.log(error);
                        }





                        //property type
                        try {
                            // console.log('property type: ' + res.category_code_description)
                            if (res.category_code_description && res.category_code_description.trim() != '') {
                                dataFromPropertyAppraisers["Property Type"] = res.category_code_description;
                            }
                        } catch (error) {
                            console.log('Error in property type :');
                            console.log(error);
                        }




                        //mailing address
                        try {
                            //if address not separated separate the full address 
                            if (!res.mailing_city_state && !res.mailing_street && !res.mailing_zip) {
                                // console.log('mailing address : ' + res.location)
                                if (res.location && res.location.trim() != '') {
                                    dataFromPropertyAppraisers["Mailing Address"] = res.location;
                                    //add mailing city, state and zip
                                    let maillingAddress_separated = parseAddress.parseLocation(res.location.trim());
                                    if (maillingAddress_separated.city) {
                                        dataFromPropertyAppraisers["Mailing City"] = maillingAddress_separated.city;
                                    }
                                    if (maillingAddress_separated.state) {
                                        dataFromPropertyAppraisers["Mailing State"] = maillingAddress_separated.state;
                                    }
                                    if (maillingAddress_separated.zip) {
                                        dataFromPropertyAppraisers["Mailing Zip"] = maillingAddress_separated.zip;
                                    }
                                }
                            }



                            //if mailing address already seperated add the separated parts 
                            else {
                                //full mailing address
                                if (res.location)
                                    dataFromPropertyAppraisers["Mailing Address"] = res.location;


                                // console.log('mailing_city_state : ' + res.mailing_city_state)
                                if (res.mailing_city_state && res.mailing_city_state.trim() != '') {

                                    //mailing city
                                    if (res.mailing_city_state.split(' ')[0])
                                        dataFromPropertyAppraisers["Mailing City"] = res.mailing_city_state.split(' ')[0];


                                    //mailing state
                                    if (res.mailing_city_state.split(' ')[1])
                                        dataFromPropertyAppraisers["Mailing State"] = res.mailing_city_state.split(' ')[1];


                                }


                                //mailing zip
                                // console.log('mailing_zip: ' + res.mailing_zip)
                                if (res.mailing_zip && res.mailing_zip.trim() != '') {
                                    dataFromPropertyAppraisers["Mailing Zip"] = res.mailing_zip;
                                }

                            }

                        } catch (error) {
                            console.log('Error in mailing address :');
                            console.log(error);
                        }




                        //last sale date
                        try {
                            // console.log('sale date: ' + res.sale_date)
                            if (res.sale_date && res.sale_date.trim() != '') {
                                dataFromPropertyAppraisers["Last Sale Recording Date"] = res.sale_date;
                            }
                        } catch (error) {
                            console.log('Error in last sale date :');
                            console.log(error);
                        }



                        //last sale price
                        try {

                            if (res.sale_price) {
                                dataFromPropertyAppraisers["Last Sale Amount"] = res.sale_price;
                            }
                        } catch (error) {
                            console.log('Error in last sale price  :');
                            console.log(error);
                        }




                        //est value 
                        try {
                            // console.log('est value : ' + res.market_value)
                            if (res.market_value) {
                                dataFromPropertyAppraisers["Est Value"] = res.market_value;
                            }

                        } catch (error) {
                            console.log('Error in est value :');
                            console.log(error);
                        }


                        //owner occupied
                        try {
                            let ownerOccupied;
                            if (dataFromPropertyAppraisers["Mailing Address"] != "" && dataFromPropertyAppraisers["Property Address"]) {
                                //normalize addresses then compare
                                if (
                                    dataFromPropertyAppraisers["Mailing Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase().includes(dataFromPropertyAppraisers["Property Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase()) ||
                                    dataFromPropertyAppraisers["Mailing Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase() == dataFromPropertyAppraisers["Property Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase() ||
                                    dataFromPropertyAppraisers["Property Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase().includes(dataFromPropertyAppraisers["Mailing Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase())
                                ) {
                                    ownerOccupied = true;
                                } else {
                                    ownerOccupied = false;
                                }
                                dataFromPropertyAppraisers["Owner Occupied"] = ownerOccupied;
                            }

                        } catch (error) {
                            console.log("Owner Occupied ERROR : ")
                            console.log(error);
                        }
                        try {
                            await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
                        } catch(e){
                            //
                        }
                    }
                })
                .catch((error: any) => {
                    if (error && error.response && error.response.data && error.response.data.message) {
                        console.log('message:' + error.response.data.message)
                    } else {
                        console.log(error);
                    }
                });

        return true;
    }

}