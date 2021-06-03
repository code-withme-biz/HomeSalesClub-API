import puppeteer from 'puppeteer';
const axios = require("axios");
import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
import { IPublicRecordAttributes } from '../../../../../../models/public_record_attributes'

import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';
import { IProperty } from '../../../../../../models/property';

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'https://gis.hcpafl.org/propertysearch/#/nav/Basic%20Search'
    }

    xpaths = {
        isPAloaded: '//*[@id="content"]'
    }

    constructor(publicRecordProducer: IPublicRecordProducer, ownerProductProperties: IOwnerProductProperty, browser: puppeteer.Browser, page: puppeteer.Page) {
        super();
        this.publicRecordProducer = publicRecordProducer;
        this.ownerProductProperties = ownerProductProperties;
        this.browser = browser;
        this.browserPages.propertyAppraiserPage = page;
    }

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

    readDocsToParse(): IOwnerProductProperty {
        return this.ownerProductProperties;
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

    // the main parsing function. if read() succeeds, parseAndSave is started().
    // return true after all parsing is complete 

    // docsToParse is the collection of all address objects to parse from mongo.
    // !!! Only mutate document objects with the properties that need to be added!
    // if you need to multiply a document object (in case of multiple owners
    // or multiple properties (2-3, not 30) you can't filter down to one, use this.cloneMongoDocument(document);
    // once all properties from PA have been added to the document, call 
    async parseAndSave(docsToParse: IOwnerProductProperty): Promise<boolean> {
        // console.log(`Documents to look up: ${docsToParse.length}.`);
        //-------------------name seperation stuff goes here-------------------//

        const companyIdentifiersArray = ['GENERAL', 'TRUSTEE', 'TRUSTEES', 'INC', "INCORPORATED", 'ORGANIZATION', 'CORP', 'CORPORATION', 'LLC', 'MOTORS', 'BANK', 'UNITED', 'CO', 'COMPANY', 'FEDERAL', 'MUTUAL', 'ASSOC', 'AGENCY', 'PA', 'P A', '\\d\\d+', 'TR', 'S A', 'FIRM', 'PORTFOLIO', 'LEGAL', 'OF', 'COUNTY', 'CDD', 'REFERENCE', 'REBUILDING', 'TOGETHER'];
        const removeFromNamesArray = ['ET', 'AS', 'DECEASED', 'DCSD', 'CP\/RS', 'JT\/RS', 'JTRS', 'TRS', 'C\/O', '\\(BEN\\)', 'EST OF'];
        const suffixNamesArray = ['I', 'II', 'III', 'IV', 'V', 'ESQ', 'JR', 'SR']

        const companyRegexString = `\\b(?:${companyIdentifiersArray.join('|')})\\b`;
        const removeFromNameRegexString = `(.*?)(?:\\b|\\s+)(?:${removeFromNamesArray.join('|')})(?:\\b(.*?))?$`;

        const discriminateAndRemove = (name:any) => {
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
            const normalizeNameRegexString = `^\\s*((?:DE\\s+|VAN\\s+)?[^\\s]+)\\s+([^\\s]+)(?:\\s+((?!${suffixNamesArray.join('|')}).*?))?(?:\\s+((?:${suffixNamesArray.join('|')})))?\\s*$`;
            const normalizeNameRegex = new RegExp(normalizeNameRegexString, 'i');

            let normalizedNameMatch = fullName.match(normalizeNameRegex);
            if (normalizedNameMatch) {
                let firstName = normalizedNameMatch[2];
                let middleName = normalizedNameMatch[3] || '';
                let lastName = normalizedNameMatch[1];
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

        //--------------------------name separation stuff ends here---------------------------------//
        let document = docsToParse;
        
            // let docToSave: any = await this.getLineItemObject(document);
            if (!this.decideSearchByV2(document)) {
                   console.log('Insufficient info for Owner and Property');
                    return false;
            }
            
            // do everything that needs to be done for each document here
            let addressToLookFor;
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
                addressToLookFor = document.propertyId['Property Address'];
                const parseaddr = this.getAddressV2(document.propertyId);
                if(!this.isEmptyOrSpaces(parseaddr.street_address)){
                    addressToLookFor = parseaddr.street_address;
                }
                console.log(`Looking for address: ${addressToLookFor}`);
            }

            console.log('--------------------------------------------')
            let apiUrl = '';
            let dataFromPropertyAppraisers: any = {};
            if (this.searchBy === 'name')
                apiUrl = `https://gis.hcpafl.org/CommonServices/property/search/AdvancedSearch?owner=${owner_name}&pagesize=80&page=1`;
            else
                apiUrl = "https://gis.hcpafl.org/CommonServices/property/search/BasicSearch?address=" + addressToLookFor;

            await axios
                .get(apiUrl)
                .then(async (res: any) => {
                    if (res.data.length == 0) {
                        console.log("Error ! couldnt find this Address ! ")
                    }
                    else {
                        let arrayOfResults = res.data;
                        for (let index = 0; index < arrayOfResults.length; index++) {
                            let element = arrayOfResults[index];
                            if (this.searchBy === 'name') {
                                const regexp = new RegExp(owner_name_regexp);
                                if (!regexp.exec(element.owner.toUpperCase())) continue;
                            }
                            await axios
                                .get("https://gis.hcpafl.org/CommonServices/property/search//ParcelData?pin=" + element.pin)
                                .then(async (res: any) => {



                                    //Site full Address
                                    let siteAddress = res.data.siteAddress;
                                    if (siteAddress) {
                                        dataFromPropertyAppraisers["Property Address"] = siteAddress;
                                        dataFromPropertyAppraisers['County'] = 'Hillsborough';
                                        dataFromPropertyAppraisers['Property State'] = 'FL';
                                    }




                                    //last sale date and price 
                                    let salesHistory = res.data.salesHistory;
                                    dataFromPropertyAppraisers["Last Sale Amount"] = salesHistory[0].salePrice;
                                    dataFromPropertyAppraisers["Last Sale Recording Date"] = salesHistory[0].saleDate;



                                    //assessed value
                                    let valueInfo = res.data.valueSummary;
                                    if (valueInfo[0] && valueInfo[0].assessedVal) {
                                        dataFromPropertyAppraisers["Total Assessed Value"] = valueInfo[0].assessedVal;
                                    }


                                    //mailling 
                                    let maillingInfo = res.data.mailingAddress;
                                    if (maillingInfo) {
                                        //mailing address
                                        if (maillingInfo.addr1) {
                                            dataFromPropertyAppraisers["Mailing Address"] = maillingInfo.addr1
                                        }
                                        //city
                                        if (maillingInfo.city) {
                                            dataFromPropertyAppraisers["Mailing City"] = maillingInfo.city
                                        }
                                        //state
                                        if (maillingInfo.state) {
                                            dataFromPropertyAppraisers["Mailing State"] = maillingInfo.state
                                        }
                                        //zip
                                        if (maillingInfo.zip) {
                                            dataFromPropertyAppraisers["Mailing Zip"] = maillingInfo.zip
                                        }

                                    }




                                    //land use 
                                    let landUse = res.data.landUse;
                                    if (landUse && landUse.description) {
                                        dataFromPropertyAppraisers["Property Type"] = landUse.description;
                                    }




                                    //owner occupied
                                    let ownerOccupied;
                                    if (dataFromPropertyAppraisers["Mailing Address"] != "" && dataFromPropertyAppraisers["Property Address"]) {
                                        //clean up addresses from new lines then compare
                                        if (
                                            dataFromPropertyAppraisers["Mailing Address"].replace(/(\r\n|\n|\r)/gm, "").includes(dataFromPropertyAppraisers["Property Address"].replace(/(\r\n|\n|\r)/gm, "")) ||
                                            dataFromPropertyAppraisers["Mailing Address"].replace(/(\r\n|\n|\r)/gm, "") == dataFromPropertyAppraisers["Property Address"].replace(/(\r\n|\n|\r)/gm, "") ||
                                            dataFromPropertyAppraisers["Property Address"].replace(/(\r\n|\n|\r)/gm, "").includes(dataFromPropertyAppraisers["Mailing Address"].replace(/(\r\n|\n|\r)/gm, ""))
                                        ) {
                                            ownerOccupied = true;
                                        } else {
                                            ownerOccupied = false;
                                        }
                                        dataFromPropertyAppraisers["Owner Occupied"] = ownerOccupied;
                                    }


                                    if (res.data.buildings && res.data.buildings[0])
                                        dataFromPropertyAppraisers["year_built"] = res.data.buildings[0].yearBuilt;





                                    let ownersNamesArray = [];
                                    //Owner Name
                                    let unprocessedOwnerName = res.data.owner;
                                    if (unprocessedOwnerName) {
                                        //remove spaces
                                        unprocessedOwnerName = unprocessedOwnerName.trim();

                                        //split by (;)
                                        ownersNamesArray = unprocessedOwnerName.split(";");

                                        //remove empty names
                                        ownersNamesArray = ownersNamesArray.filter(function (el: any) {
                                            return (el != null && el.trim() != "");
                                        });


                                        //name separation for the first one
                                        if (ownersNamesArray[0]) {
                                            //seperate the name name if its a person
                                            let discriminateResult = discriminateAndRemove(ownersNamesArray[0]);
                                            if (discriminateResult.type == 'person') {
                                                let separatedNameObj = normalizeNames(discriminateResult.name);
                                                dataFromPropertyAppraisers["Full Name"] = separatedNameObj.fullName;
                                                dataFromPropertyAppraisers["First Name"] = separatedNameObj.firstName;
                                                dataFromPropertyAppraisers["Last Name"] = separatedNameObj.lastName;
                                                dataFromPropertyAppraisers["Middle Name"] = separatedNameObj.middleName;
                                                dataFromPropertyAppraisers["Name Suffix"] = separatedNameObj.nameSuffix;

                                            } else {
                                                dataFromPropertyAppraisers["Full Name"] = ownersNamesArray[0];
                                            }
                                        }

                                    }


                                    //mark the document as processed first to be cloned as processed
                                    // console.log('main doc')
                                    // await this.saveToLineItem(docToSave);
                                    // await this.saveToOwnerProductProperty(docToSave);
                                    await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
                   


                                    //case of two names (we will look for the second mailing address)
                                    // if (ownersNamesArray.length == 2) {

                                    //     let newDoc = await this.cloneDocument(docToSave);
                                    //     //seperate the name name if its a person
                                    //     let discriminateResult = discriminateAndRemove(ownersNamesArray[1]);
                                    //     if (discriminateResult.type == 'person') {
                                    //         let separatedNameObj = normalizeNames(discriminateResult.name);
                                    //         newDoc["Full Name"] = separatedNameObj.fullName;
                                    //         newDoc["First Name"] = separatedNameObj.firstName;
                                    //         newDoc["Last Name"] = separatedNameObj.lastName;
                                    //         newDoc["Middle Name"] = separatedNameObj.middleName;
                                    //         newDoc["Name Suffix"] = separatedNameObj.nameSuffix;

                                    //     } else {
                                    //         newDoc["Full Name"] = ownersNamesArray[1];
                                    //     }

                                    //     //add address if exists 
                                    //     if (maillingInfo && maillingInfo.addr2 && maillingInfo.addr2.trim() != "") {
                                    //         newDoc["Mailing Address"] = maillingInfo.addr2;




                                    //         //owner occupied
                                    //         let ownerOccupied;
                                    //         if (docToSave["Mailing Address"] != "" && docToSave["Property Address"]) {
                                    //             //clean up addresses from new lines then compare
                                    //             if (
                                    //                 newDoc["Mailing Address"].replace(/(\r\n|\n|\r)/gm, "").includes(newDoc["Property Address"].replace(/(\r\n|\n|\r)/gm, "")) ||
                                    //                 newDoc["Mailing Address"].replace(/(\r\n|\n|\r)/gm, "") == newDoc["Property Address"].replace(/(\r\n|\n|\r)/gm, "") ||
                                    //                 newDoc["Property Address"].replace(/(\r\n|\n|\r)/gm, "").includes(newDoc["Mailing Address"].replace(/(\r\n|\n|\r)/gm, ""))
                                    //             ) {
                                    //                 ownerOccupied = true;
                                    //             } else {
                                    //                 ownerOccupied = false;
                                    //             }
                                    //             newDoc["Owner Occupied"] = ownerOccupied;

                                    //         }

                                    //     }
                                    //     //save the doc
                                    //     await this.saveToLineItem(newDoc);
                                    //     await this.saveToOwnerProductProperty(newDoc);
                                    // }



                                    //case of more than two names 
                                    // if (ownersNamesArray.length > 2 && ownersNamesArray.length < 4) {
                                    //     //remove the first name because it was added the the main doc 
                                    //     ownersNamesArray.shift();
                                    //     //loop through the names array and add them one by one 
                                    //     ownersNamesArray.forEach(async (name: any) => {
                                    //         //new doc 
                                    //         let newDoc = await this.cloneMongoDocument(docToSave);

                                    //         //seperate the name name if its a person
                                    //         let discriminateResult = discriminateAndRemove(name);
                                    //         if (discriminateResult.type == 'person') {
                                    //             let separatedNameObj = normalizeNames(discriminateResult.name);
                                    //             newDoc["Full Name"] = separatedNameObj.fullName;
                                    //             newDoc["First Name"] = separatedNameObj.firstName;
                                    //             newDoc["Last Name"] = separatedNameObj.lastName;
                                    //             newDoc["Middle Name"] = separatedNameObj.middleName;
                                    //             newDoc["Name Suffix"] = separatedNameObj.nameSuffix;

                                    //         } else {
                                    //             newDoc["Full Name"] = name;
                                    //         }
                                    //         //save the doc
                                    //         console.log(newDoc);
                                    //         await this.saveToLineItem(newDoc);
                                    //         await this.saveToOwnerProductProperty(newDoc);
                                    //     });

                                    // }




                                })
                                .catch((error: any) => {
                                    console.log(error)
                                });
                            // break;
                            if (this.searchBy === 'address') break;
                        }

                    }


                })
                .catch((error: any) => {
                    console.log(error);
                })
            console.log('--------------------------------------------')
            await this.randomSleepIn5Sec();
        // }
        return true;
    }

}