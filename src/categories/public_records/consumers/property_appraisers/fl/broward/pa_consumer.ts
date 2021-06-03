import puppeteer from 'puppeteer';
const axios = require("axios");
const parseAddress = require('parse-address');
const { parseFullName } = require('parse-full-name');
import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
import { IPublicRecordAttributes } from '../../../../../../models/public_record_attributes'
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';
import { IProperty } from '../../../../../../models/property';


export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'https://web.bcpa.net/bcpaclient/#/Record-Search'
    }

    xpaths = {
        isPAloaded: '//*[@id="propertysearch"]'
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
    getAddress(document: IProperty): any {
        // 'Property Address': '162 DOUGLAS HILL RD',
        // 'Property City': 'WEST BALDWIN',
        // County: 'Cumberland',
        // 'Property State': 'ME',
        // 'Property Zip': '04091',
        const full_address = `${document['Property Address']}, ${document['Property City']}, ${document['Property State']} ${document['Property Zip']}`
        const parsed = parseAddress.parseLocation(full_address);

        let street_name = parsed.street.trim();
        let street_full = document['Property Address'];
        let street_with_type = (parsed.number ? parsed.number : '') + ' ' + (parsed.prefix ? parsed.prefix : '') + ' ' + parsed.street;
        street_with_type = street_with_type.trim();

        return {
            full_address,
            street_name,
            street_with_type,
            street_full,
            parsed
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

        function parseName(name: string) {
            let result;
            const companyIdentifiersArray = [
                'GENERAL', 'TRUSTEE', 'TRUSTEES', 'INC', 'ORGANIZATION',
                'CORP', 'CORPORATION', 'LLC', 'MOTORS', 'BANK', 'UNITED',
                'CO', 'COMPANY', 'FEDERAL', 'MUTUAL', 'ASSOC', 'AGENCY',
                'PARTNERSHIP', 'CHURCH', 'CITY', 'TRUST', 'SECRETARY',
                'DEVELOPMENT', 'INVESTMENT', 'ESTATE', 'LLP', 'LP', 'HOLDINGS',
                'LOAN', 'CONDOMINIUM', 'CATHOLIC', 'INVESTMENTS', 'D/B/A', 'COCA COLA',
                'LTD', 'CLINIC', 'TODAY', 'PAY', 'CLEANING', 'COSMETIC', 'CLEANERS',
                'FURNITURE', 'DECOR', 'FRIDAY HOMES', 'MIDLAND', 'SAVINGS', 'PROPERTY',
                'ASSET', 'PROTECTION', 'SERVICES', 'TRS', 'ET AL', 'L L C', 'NATIONAL',
                'ASSOCIATION', 'MANAGMENT', 'PARAGON', 'MORTGAGE', 'CHOICE', 'PROPERTIES',
                'J T C', 'RESIDENTIAL', 'OPPORTUNITIES', 'FUND', 'LEGACY', 'SERIES',
                'HOMES', 'LOAN', 'FAM', 'PRAYER'
            ];
            const suffixNamesArray = ['I', 'II', 'III', 'IV', 'V', 'ESQ', 'JR', 'SR'];
            const suffixNamesRegex = new RegExp(`\\b(?:${suffixNamesArray.join('|')})\\b`, 'i');

            const companyRegexString = `\\b(?:${companyIdentifiersArray.join('|')})\\b`;
            const companyRegex = new RegExp(companyRegexString, 'i');

            if (name.match(companyRegex)) {
                result = {
                    firstName: '',
                    lastName: '',
                    middleName: '',
                    fullName: name.trim(),
                    suffix: ''
                };
                return result;
            } try {
                const suffix = name.match(suffixNamesRegex);
                name = name.replace(suffixNamesRegex, '');
                name = name.replace(/\s+/g, ' ');
                let ownersNameSplited = name.split(',');
                const defaultLastName = ownersNameSplited[0].trim();
                let firstNameParser = ownersNameSplited[1].trim().split(/\s+/g);
                const firstName = firstNameParser[0].trim();
                firstNameParser.shift();
                const middleName = firstNameParser.join(' ');
                const fullName = `${defaultLastName}, ${firstName} ${middleName} ${suffix ? suffix[0] : ''}`;
                result = {
                    firstName,
                    lastName: defaultLastName,
                    middleName,
                    fullName: fullName.trim(),
                    nameSuffix: suffix ? suffix[0] : ''
                };
            }
            catch (e) {

            }
            if (!result) {
                result = {
                    firstName: '',
                    lastName: '',
                    middleName: '',
                    fullName: name.trim(),
                    nameSuffix: ''
                };
            }
            return result;
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
            return [parseName(name)];
        }


        //--------------------------name separation stuff ends here---------------------------------//

        let apiUrl = "https://web.bcpa.net/bcpaclient/search.aspx/GetData";
        let document = docsToParse;
        
            // let docToSave: any = await this.getLineItemObject(document);
            if (!this.decideSearchByV2(document)) {
                console.log('Insufficient info for Owner and Property');
                return false;
            }
            
            // do everything that needs to be done for each document here
            let search_value = "";
            let owner_name_regexp = '';
            if (this.searchBy === 'name') {
                const nameInfo = this.getNameInfo(document.ownerId);
                let owner_name = nameInfo.owner_name;
                owner_name_regexp = nameInfo.owner_name_regexp;
                if (owner_name === '') return false;
                search_value = owner_name;
                console.log('Looking for owner : ' + search_value)
            }
            else {
                search_value = document.propertyId['Property Address'];
                const parsedaddr = this.getAddressV2(document.propertyId);
                if(this.isEmptyOrSpaces(parsedaddr.street_address)){
                    search_value = parsedaddr.street_address;
                }
                console.log('Looking for address : ' + search_value)
            }
            let docToSave: any = {};
            await axios
                .post(apiUrl, {
                    value: search_value,
                    cities: "",
                    orderBy: "NAME",
                    pageNumber: "1",
                    pageCount: "5000",
                    arrayOfValues: "",
                    selectedFromList: "false",
                    totalCount: "Y"
                })
                .then(async (res: any) => {
                    if (res.data.length == 0) {
                        console.log("Error ! couldnt find this Address ! ")

                    } else {


                        let arrayOfResults = res.data.d.resultListk__BackingField;
                        let foundResult = false;
                        for (let i = 0; i < arrayOfResults.length; i++) {
                            let element = arrayOfResults[i];
                            if (element.ownerName1) {
                                if (this.searchBy === 'name') {
                                    const regexp = new RegExp(owner_name_regexp);
                                    if (!regexp.exec(element.ownerName1.toUpperCase())) continue;
                                }
                                let discriminateResult = discriminateAndRemove(element.ownerName1.replace('%', ''));
                                if (discriminateResult.type == 'person') {
                                    let separatedNamesArray = checkForMultipleNamesAndNormalize(discriminateResult.name);
                                    for (let separatedNameObj of separatedNamesArray) {
                                        docToSave["Full Name"] = separatedNameObj.fullName;
                                        docToSave["First Name"] = separatedNameObj.firstName;
                                        docToSave["Last Name"] = separatedNameObj.lastName;
                                        docToSave["Middle Name"] = separatedNameObj.middleName;
                                        docToSave["Name Suffix"] = separatedNameObj.nameSuffix;
                                    }
                                } else {
                                    docToSave["Full Name"] = element.ownerName1;
                                }
                            }





                            //property address
                            if (element.siteAddress1 && element.siteAddress2) {
                                let address = parseAddress.parseLocation(element.siteAddress1 + " " + element.siteAddress2);
                                docToSave["Property Address"] = element.siteAddress1;
                                docToSave["Property City"] = address.city;
                                docToSave["Property State"] = "FL";
                                docToSave["Property Zip"] = address.zip;
                            }







                            await axios
                                .post("https://web.bcpa.net/bcpaclient/search.aspx/getParcelInformation", {
                                    folioNumber: element.folioNumber,
                                    taxyear: new Date().getFullYear(),
                                    action: "CURRENT",
                                    use: ""
                                })
                                .then((fullRes: any) => {
                                    console.log();
                                    fullRes.data.d.parcelInfok__BackingField.forEach(async (element: any) => {

                                        //Total Assessed Value
                                        if (element.sohValue) {
                                            docToSave["Total Assessed Value"] = element.sohValue;
                                        }


                                        //Mailing Address
                                        if (element.mailingAddress1 && element.mailingAddress2) {
                                            let address = parseAddress.parseLocation(element.mailingAddress1 + " " + element.mailingAddress2);
                                            docToSave["Mailing Address"] = element.mailingAddress1 + " " + element.mailingAddress2;
                                            docToSave["Mailing City"] = address.city;
                                            docToSave["Mailing State"] = address.state;
                                            docToSave["Mailing Zip"] = address.zip;
                                        }

                                        //Last Sale Recording Date
                                        if (element.saleDate1) {
                                            docToSave["Last Sale Recording Date"] = element.saleDate1;
                                        }
                                        //Last Sale Recording Date 
                                        if (element.stampAmount1) {
                                            docToSave["Last Sale Amount"] = element.stampAmount1;
                                        }

                                        //Property Type 
                                        if (element.useCode) {
                                            docToSave["Property Type"] = element.useCode;
                                        }      //Est Value 
                                        if (element.justValue) {
                                            docToSave["Est Value"] = element.justValue;
                                        }

                                        //owner occupied
                                        let ownerOccupied;
                                        if (docToSave["Mailing Address"] != "" && docToSave["Property Address"]) {
                                            //clean up addresses from new lines then compare
                                            if (
                                                docToSave["Mailing Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase().includes(docToSave["Property Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase()) ||
                                                docToSave["Mailing Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase() == docToSave["Property Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase() ||
                                                docToSave["Property Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase().includes(docToSave["Mailing Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase())
                                            ) {
                                                ownerOccupied = true;
                                            } else {
                                                ownerOccupied = false;
                                            }
                                            docToSave["Owner Occupied"] = ownerOccupied;
                                        }
                                        docToSave["County"] = "Broward";

                                        await this.saveToOwnerProductPropertyV2(document, docToSave);

                                        console.log('              ----------------                  ')
                                        console.log('\n');
                                    });
                                });
                            foundResult = true;
                            if (this.searchBy === 'address') break;
                        }
                        if (!foundResult) {
                            console.log("Not found!");
                        }

                    }


                })
                .catch((error: any) => {
                    console.log(error);
                });


            await this.randomSleepIn5Sec();
        // }
        return true;
    }

}