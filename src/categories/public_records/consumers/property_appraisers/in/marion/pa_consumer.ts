import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
import {IPublicRecordAttributes} from '../../../../../../models/public_record_attributes';
import puppeteer from "puppeteer";
const nameParsingService = require('../../consumer_dependencies/nameParsingService');
const parser = require('parse-address');
const getPdfData = require("../../consumer_dependencies/pdfProcess");

import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'http://maps.indy.gov/AssessorPropertyCards/',
    }

    xpaths = {
        isPAloaded: '//*[@id="dojox_mobile_Button_0"]',
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
      

    async getTextByXpathFromPage(page: puppeteer.Page, xPath: string) {
        const [elm] = await page.$x(xPath)
        if (elm == null) {
            return null;
        }
        let text = await page.evaluate(j => j.innerText, elm);
        return text.replace(/\n/g, ' ');
    }

    async parsePage(page: puppeteer.Page, parcelNumber: string) {
        const propertyAddressAfter = new RegExp(/^Property Address$/);
        const propStreetRegex = new RegExp(/^(?<label>.*?)\s+\|\s+(?<value>.*?)$/);
        const propCityAndStateRegex = new RegExp(/^(?<value>.*?)\s+\|/);
        const propZipRegex = new RegExp(/^(?<label>.*?)\s+\|\s+(?<value>.*?)$/)
        const startNumber = new RegExp(/^(?!\D).+/);
        const numberAndStreetRegexBefore = new RegExp(/^Legal$/);
        const numberRegex = new RegExp(/^(?<value>.*?)\s+\|/);
        const conditionStreetRegex = new RegExp(/Alt Parcel/gi);
        const streetRegexFullLine = new RegExp(/^(?<label>.*?)\s+\|(?<value>.*?)$/);
        const streetRegex = new RegExp(/^(?<label>.*?)\s+\|(?<value>.*)\s+\|\s+(?<label2>.*?)\s+\|\s+(?<label3>Alt\s+Parcel)/);
        const cityAndStateRegex = new RegExp(/^(?<value>.*?)\|/);
        const zipRegex = new RegExp(/^(?<label>.*?)\|(?<value>.*?)\|/);
        const grossAssessedValueRegexBefore = new RegExp(/Total Assessed Value:/);
        const grossAssessedValueRegex = new RegExp(/^(?<value>.*?)\|/);
        const propertyTypeRegexBefore = new RegExp(/Sketch/);
        const propertyTypeRegex = new RegExp(/.*\|(?<value>.*)\|\s+(?<label>Parcel Number)$/);
        const yearBuildRegexBefore = new RegExp(/Efftv/);
        const yearBuildRegex = new RegExp(/\b(?<firstMatch>18\d\d|19\d\d|20\d\d)\b\s+\|\s+\b(?<value>18\d\d|19\d\d|20\d\d)\b/);
        const emptyRegex = new RegExp('');
        let ownerOccupiedRegex;

        const rawOwnerName = await this.getTextByXpathFromPage(page, '//*[@class="resultTextDiv"]/*[contains(text(), "Owner:")]');
        const processedNamesArray = nameParsingService.parseOwnersFullName(rawOwnerName.replace('Owner: ', ''));
        const urlDatasheet = `http://maps.indy.gov/AssessorPropertyCards/handler/proxy.ashx?http%3A//maps.indy.gov/AssessorPropertyCards.Reports.Service/Service.svc/PropertyCard/${parcelNumber}`;

        const property = {
            propertyAddrNumber: {
                regexTest: propertyAddressAfter,
                countNextLine: -2,
                regexValue: {
                    condition: startNumber,
                    conditionIsTrue: numberRegex,
                    conditionIsFalse: emptyRegex
                }
            },
            propertyAddrStreet: {
                regexTest: propertyAddressAfter,
                countNextLine: -2,
                regexValue: {
                    condition: startNumber,
                    conditionIsTrue: propStreetRegex,
                    conditionIsFalse: emptyRegex
                }
            },
            propertyAddrCityAndState: {
                regexTest: propertyAddressAfter,
                countNextLine: -1,
                regexValue: propCityAndStateRegex
            },
            propertyAddrZip: {
                regexTest: propertyAddressAfter,
                countNextLine: -1,
                regexValue: propZipRegex
            },
            mailNumber: {
                regexTest: numberAndStreetRegexBefore,
                countNextLine: 1,
                regexValue: numberRegex,
            },
            mailStreet: {
                regexTest: numberAndStreetRegexBefore,
                countNextLine: 1,
                regexValue: {
                    condition: conditionStreetRegex,
                    conditionIsTrue: streetRegex,
                    conditionIsFalse: streetRegexFullLine,
                },
            },
            mailCityAndState: {
                regexTest: numberAndStreetRegexBefore,
                countNextLine: 2,
                regexValue: cityAndStateRegex,
            },
            mailZip: {
                regexTest: numberAndStreetRegexBefore,
                countNextLine: 2,
                regexValue: zipRegex,
            },
            grossAssessedValue: {
                regexTest: grossAssessedValueRegexBefore,
                countNextLine: 1,
                regexValue: grossAssessedValueRegex,
            },
            propertyType: {
                regexTest: propertyTypeRegexBefore,
                countNextLine: -1,
                regexValue: propertyTypeRegex,
            },
            yearBuild: {
                regexTest: yearBuildRegexBefore,
                countNextLine: 3,
                regexValue: yearBuildRegex,
            }
        };
        let {
            propertyAddrNumber, 
            propertyAddrStreet,
            propertyAddrCityAndState,
            propertyAddrZip,
            mailNumber,
            mailStreet,
            mailCityAndState,
            mailZip,
            grossAssessedValue,
            propertyType,
            yearBuild
        } = await getPdfData.pdfProcessor(urlDatasheet, property);
        propertyAddrStreet = propertyAddrStreet.replace(/\|\s/g, '').trim();
        propertyAddrStreet = propertyAddrStreet.replace(/(.*\d+)(\s+)(\w\w.*)/,'$1$3');
        propertyAddrStreet = propertyAddrStreet.replace(/  +/g,' ').trim();
        let [propCity, propState] = propertyAddrCityAndState.split(',');
        propCity = propCity.trim();
        propState = propState.trim();
        let propertyAddress = `${propertyAddrNumber} ${propertyAddrStreet}`;
        ownerOccupiedRegex = new RegExp(propertyAddress || '', 'i');
        console.log(propertyAddress, propCity, propState, propertyAddrZip);

        mailStreet = mailStreet.replace(/\|\s/g, '').trim();
        mailStreet = mailStreet.replace(/(.*\d+)(\s+)(\w\w.*)/,'$1$3');
        mailStreet = mailStreet.replace(/  +/g,' ');
        const isOwnerOccupied = ownerOccupiedRegex.test(`${mailNumber} ${mailStreet}`);
        mailZip = mailZip.replace(/-.*/, '');
        const fullMailAddress = `${mailNumber} ${mailStreet} ${mailCityAndState} ${mailZip}`;
        const [city, state] = mailCityAndState.split(',');
        return {
            'owner_names': processedNamesArray,
            'Unit#': '',
            'Property Address': propertyAddress,
            'Property City': propCity,
            'Property State': 'IN',
            'Property Zip': propertyAddrZip,
            'County': 'Marion',
            'Owner Occupied': isOwnerOccupied,
            'Mailing Care of Name': '',
            'Mailing Address': fullMailAddress,
            'Mailing Unit #': '',
            'Mailing City': city,
            'Mailing State': state ? state.trim() : '',
            'Mailing Zip': mailZip,
            'Property Type': propertyType,
            'Total Assessed Value': grossAssessedValue,
            'Last Sale Recoding Date': '',
            'Last Sale Amount': '',
            'Est. Value': '',
            'yearBuilt': yearBuild,
            'Est. Equity': '',
        };
    }

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
        const page = this.browserPages.propertyAppraiserPage;
        if (page === undefined) return false;
        let document = docsToParse;

            if (!this.decideSearchByV2(document)) {
                return false;
            }
            

            let address = '';
            let first_name = '';
            let last_name = '';
            let owner_name = '';
            let owner_name_regexp = '';

            if (this.searchBy === 'name') {
                const nameInfo = this.getNameInfo(document.ownerId, ",");
                first_name = nameInfo.first_name;
                last_name = nameInfo.last_name;
                owner_name = nameInfo.owner_name;
                owner_name_regexp = nameInfo.owner_name_regexp;
                if (owner_name === '') return false;
                console.log(`Looking for owner: ${owner_name}`);
            }
            else {
                address = document.propertyId['Property Address'];
                const parsev2 = this.getAddressV2(document.propertyId);
                if(!this.isEmptyOrSpaces(parsev2.street_address)){
                    address = parsev2.street_address;
                }
                console.log(`Looking for address: ${address}`);
            }
            try {
                await page.goto('http://maps.indy.gov/AssessorPropertyCards/');
                await page.waitForSelector('#dojox_mobile_Button_0');
                await page.click('#dojox_mobile_Button_0');
                if (this.searchBy === 'name') {
                    await page.waitForSelector('#OwnerNameListItem');
                    await page.click('#OwnerNameListItem');
                    await page.waitForSelector('#ownerNameTextBox');
                    await page.focus('#ownerNameTextBox');
                }
                else {
                    await page.waitForSelector('#AddressListItem');
                    await page.click('#AddressListItem');
                    await page.waitForSelector('#geocoder');
                    await page.focus('#geocoder');
                }
                await page.keyboard.type(this.searchBy==='name' ? owner_name : address, {delay: 150});
                await this.sleep(1000);
                const parcel_numbers = [];
                if (this.searchBy === 'name') {
                    await page.click('#ownerNameButton');
                    await page.waitForSelector('#searchResultsView');
                    const [no_results] = await page.$x('//*[text()="No Results Found"]');
                    if (no_results) {
                        console.log('No owner found');
                        return true;
                    }
                    const rows = await page.$x('//*[contains(text(), "Owner:")]/parent::*[@class="resultTextDiv"][1]');
                    console.log(rows.length);
                    for (const row of rows) {
                        let {parcel_number, name} = await page.evaluate(el => ({name: el.children[3].textContent, parcel_number: el.children[0].textContent}), row);
                        name = name.replace("Owner: ", "");
                        console.log(name)
                        parcel_number = parcel_number.replace("Parcel Number: ", "");
                        const regexp = new RegExp(owner_name_regexp);
                        if (!regexp.exec(name.toUpperCase())) continue;
                        parcel_numbers.push(parcel_number);
                    }
                }
                else {
                    await page.waitForSelector('#addressResultsList > li > .mblListItemRightIcon', {timeout: 6000});
                    const [addressElement] = await page.$x('//*[@id="addressResultsList"]/li[1]');
                    await addressElement.click();
                    await page.waitForSelector('.resultTextDiv');
                    let parcel_number = await this.getTextByXpathFromPage(page, '//*[@class="resultTextDiv"]/*[contains(text(), "Parcel Number:")]');
                    parcel_number = parcel_number.replace('Parcel Number: ', '');
                    parcel_numbers.push(parcel_number);
                }

                for (const parcel_number of parcel_numbers) {
                    const result = await this.parsePage(page, parcel_number);
                    console.log(result);
                    for (let i = 0; i < result['owner_names'].length; i++) {
                        const owner_name = result['owner_names'][i];
                        if (i == 0) {
                            let dataFromPropertyAppraisers: any = {};
                            dataFromPropertyAppraisers['Full Name'] = owner_name['fullName'];
                            dataFromPropertyAppraisers['First Name'] = owner_name['firstName'];
                            dataFromPropertyAppraisers['Last Name'] = owner_name['lastName'];
                            dataFromPropertyAppraisers['Middle Name'] = owner_name['middleName'];
                            dataFromPropertyAppraisers['Name Suffix'] = owner_name['suffix'];
                            dataFromPropertyAppraisers['Owner Occupied'] = result['Owner Occupied'];
                            dataFromPropertyAppraisers['Property Address'] = result['Property Address'];
                            dataFromPropertyAppraisers['County'] = 'marion';
                            dataFromPropertyAppraisers['Property City'] = result['Property City'];
                            dataFromPropertyAppraisers['Property State'] = "IN";
                            dataFromPropertyAppraisers['Property Zip'] = result['Property Zip'];
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
                            dataFromPropertyAppraisers['yearBuilt'] = result['yearBuilt'];
                            dataFromPropertyAppraisers['Est Equity'] = '';
                            await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
                        }
                        break;
                    }
                }
            } catch (e) {
                console.log(e);
                if (this.searchBy === 'name')
                    console.log('Owner not found: ', owner_name)
                else
                    console.log('Address not found: ', document.propertyId["Property Address"])
            }
        return true;
    }
}