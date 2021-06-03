import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
import {IPublicRecordAttributes} from '../../../../../../models/public_record_attributes'
import puppeteer from "puppeteer";
import _ from 'lodash'

const parser = require('parse-address');
const getPdfData = require("../../consumer_dependencies/pdfProcess");
const nameParsingService = require('../../consumer_dependencies/nameParsingService')
const addressService = require('../../consumer_dependencies/addressService')

import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';
import { getTextByXpathFromPage } from '../../../../../../services/general_service';

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'http://appr.wycokck.org/appraisal/publicaccess/PropertySearch.aspx?PropertySearchType=3',
        searchByNamePage: 'http://appr.wycokck.org/appraisal/publicaccess/PropertySearch.aspx?PropertySearchType=2'
    }

    xpaths = {
        isPAloaded: '//*[@id="StreetNumber"]',
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

    async finderIds(page: puppeteer.Page, owner_name_regexp: string) {
        const idRegexString = '(\\d+)';
        const idSelector = 'body > table > tbody > tr:last-child > td:last-child > table > tbody > tr:last-child > td > table > tbody > tr > td:first-child > label';
        const nameSelector = 'body > table > tbody > tr:last-child > td:last-child > table > tbody > tr:last-child > td > table > tbody > tr > td:nth-child(2)';

        let dataOwnerIds = await page.evaluate(async ({idRegexString, idSelector, nameSelector}: any) => {
            let options = Array.from(document.querySelectorAll(idSelector));
            let names = Array.from(document.querySelectorAll(nameSelector));
            let ids: { single: any, multiple: any } = {
                single: [],
                multiple: [],
            };
            for (let i = 0; i < options.length; i++) {
                let x: any = options[i];
                const name = names[i].textContent;
                const idRegex = new RegExp(idRegexString, 'g');
                const match: any = x.onclick.toString().match(idRegex);
                if (match[0] !== '1') {
                    ids.multiple.push({id: match[2]});
                } else {
                    ids.single.push({propertyId: match[2], propertyOwnerId: match[1], name});
                }
            }
            return ids
        }, {idRegexString, idSelector, nameSelector});

        let idsOwnerArray = [...dataOwnerIds.single];

        if (dataOwnerIds.multiple.length) {
            for (let i = 0; i < dataOwnerIds.multiple.length; i++) {
                const multipleIds = await this.getMultipleOwnersIds(page, dataOwnerIds.multiple[i]);
                idsOwnerArray.push(...multipleIds);
            }
        }
        if (this.searchBy === 'name') {
            idsOwnerArray = idsOwnerArray.filter(x => {
                const regexp = new RegExp(owner_name_regexp);
                return regexp.exec(x.name.toUpperCase());
            });
        }
        return _.uniqWith(idsOwnerArray, _.isEqual);
    }

    async getMultipleOwnersIds(page: puppeteer.Page, propertyId: string) {
        const idRegexString = '(\\d+)';
        const idMultipleSelector = 'body > table > tbody > tr > td > table > tbody > tr:nth-child(4) > td > table > tbody > tr > td:first-child > label';

        await page.goto(`http://appr.wycokck.org/appraisal/publicaccess/SelectPropertyOwner.aspx?PropertyID=${propertyId}&TaxYear=2020&dbKeyAuth=Appraisal&NodeID=11`, {waitUntil: 'domcontentloaded'});
        return await page.evaluate(async ({idRegexString, idMultipleSelector}) => {
            let options = Array.from(document.querySelectorAll(idMultipleSelector));
            return options.map(x => {
                const idRegex = new RegExp(idRegexString, 'g');
                const match = x.onclick.toString().match(idRegex);
                const name = x.textContent;
                return {propertyId: match[0], propertyOwnerId: match[1], name}
            })
        }, {idRegexString, idMultipleSelector});
    }

    async parsePage(page: puppeteer.Page, propertyAddress: string, id: any) {
        const propClassRegex = new RegExp(/(?<label>Prop Class:\s+\|)(?<value>.*?)\|/g);
        const estPriceRegex = new RegExp(/(?<label>Total Market Land Value\s+\|)(?<value>.+)/g)
        const urlDatasheetSelector = '//a[contains(text(), "Datasheet")]'

        await page.goto(`http://appr.wycokck.org/appraisal/publicaccess/PropertyDetail.aspx?PropertyID=${id.propertyId}&dbKeyAuth=Appraisal&TaxYear=${new Date().getFullYear()}&NodeID=11&PropertyOwnerID=${id.propertyOwnerId}`);
        await page.waitForSelector('.ssPageTitle');
        const rawOwnerName = await this.getOrdinalTableText(page, 'Owner Name');
        const processedNamesArray = nameParsingService.parseOwnersFullName(rawOwnerName);
        let address = await this.getAddress(page, 'Owner Address');
        const {state, city, zip} = addressService.parsingDelimitedAddress(address);
        address = address.replace(/\n/g, ' ')

        let propertyCity = '';
        let propertyZip = '';
        if (this.searchBy === 'name') {
            propertyAddress = await this.getPropertyAddress(page, 'Property Address:');
            const {state, city, zip} = addressService.parsingDelimitedAddress(propertyAddress);
            propertyAddress = propertyAddress.replace(/\n|\s+/gm, ' ').trim();
            propertyCity = city;
            propertyZip = zip;
        }
        const grossAssessedValue = await this.getBreakdownTableText(page);
        const ownerOccupied = addressService.comparisonAddresses(address, propertyAddress);
        await page.waitForXPath(urlDatasheetSelector);
        const [urlDatasheetElement] = await page.$x(urlDatasheetSelector);
        const urlDatasheet = await page.evaluate((el) => {
            return el.href
        }, urlDatasheetElement);

        const property = {
            propertyType: propClassRegex,
            estimationValue: estPriceRegex,
        };
        const {propertyType, estimationValue} = await getPdfData.pdfProcessor(urlDatasheet, property);

              
        // year built
        const year_built_xpath = '//*[contains(text(), "Year Built:")]/following-sibling::td[1]';
        const year_built = await getTextByXpathFromPage(page, year_built_xpath);

        return {
            'owner_names': processedNamesArray,
            'Unit#': '',
            'Property Address': propertyAddress,
            'Property City': propertyCity,
            'Property State': 'Kansas',
            'Property Zip': propertyZip,
            'County': 'Wyandotte',
            'Owner Occupied': ownerOccupied,
            'Mailing Care of Name': '',
            'Mailing Address': address,
            'Mailing Unit #': '',
            'Mailing City': city,
            'Mailing State': state,
            'Mailing Zip': zip,
            'Property Type': propertyType ? propertyType : '',
            'Total Assessed Value': grossAssessedValue ? grossAssessedValue : '',
            'Last Sale Recoding Date': '',
            'Last Sale Amount': '',
            'Est. Value': estimationValue,
            'year_built': year_built,
            'Est. Equity': '',
        };
    }

    async getOrdinalTableText(page: puppeteer.Page, label: string) {
        const selector = `//*[@valign="top"]//td[contains(text(), "${label}")]/following-sibling::td[1]`;
        const [elm] = await page.$x(selector);
        if (elm == null) {
            return '';
        }
        let text = await page.evaluate(j => j.innerText, elm);
        return text.replace(/\n/g, ' ');


    };

    async getAddress(page: puppeteer.Page, label: string) {
        const selector = `//*[@valign="top"]//td[contains(text(), "${label}")]/following-sibling::td[1]`;
        const [elm] = await page.$x(selector);
        if (elm == null) {
            return '';
        }
        return await page.evaluate(j => j.innerText, elm);
    };

    async getPropertyAddress(page: puppeteer.Page, label: string) {
        const selector = `//*[text()="${label}"]/following-sibling::td`;
        const [elm] = await page.$x(selector);
        if (elm == null) {
            return '';
        }
        return await page.evaluate(j => j.innerText, elm);
    }

    async getBreakdownTableText(page: puppeteer.Page) {
        const selector = `//*[@class="ssDetailData"]/table/tbody/tr[3]/td[1]/table/tbody/tr/td[3]`;
        const [elm] = await page.$x(selector);
        if (elm == null) {
            return '';
        }
        let text = await page.evaluate(j => j.innerText, elm);
        return text.replace(/\n/g, ' ');
    };

    parseAddress(fullAddress: string) {
        try {
            const splitedAddress = fullAddress.split('\n')
            const match = /^(.*?)\s*,\s*([A-Z]{2})\s*([\d\-]+)$/.exec(splitedAddress![1])
            const normalizeZip = /^(\d{5})/.exec(match![3])![1]
            return {city: match![1], zip: normalizeZip, state: match![2]};
        } catch (e) {
            return {city: '', zip: '', state: ''};
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
              
            try {
                const url = this.searchBy==='name' ? this.urls.searchByNamePage : this.urls.propertyAppraiserPage;
                await page.goto(url);

                let first_name = '';
                let last_name = '';
                let owner_name = '';
                let owner_name_regexp = '';
                let addr_value = '';
    
                if (this.searchBy === 'name') {
                    const nameInfo = this.getNameInfo(document.ownerId);
                    first_name = nameInfo.first_name;
                    last_name = nameInfo.last_name;
                    owner_name = nameInfo.owner_name;
                    owner_name_regexp = nameInfo.owner_name_regexp;
                    if (owner_name === '') return false;
                    console.log(`Looking for owner: ${owner_name}`);

                    await page.focus('#NameLast');
                    await page.keyboard.type(last_name);
                    await page.focus('#NameFirst');
                    await page.keyboard.type(first_name);
                }
                else {
                    let searchAddress = parser.parseLocation(document.propertyId["Property Address"]);
                    addr_value = document.propertyId["Property Address"];
                    const parsev2 = this.getAddressV2(document.propertyId);
                    if(!this.isEmptyOrSpaces(parsev2.street_address)){
                        searchAddress = parser.parseLocation(parsev2.street_address);
                        addr_value = parsev2.street_address
                    }
                    if(!searchAddress || !searchAddress.street || !searchAddress.number){
                        console.log('The street number or name is missing!');
                    }
                    searchAddress.street = searchAddress.street.replace(/\b(?:N|S|W|E|East|West|North|South)\b/gi, '');
                    searchAddress.street.trim()
                    console.log(`Looking for address: ${document.propertyId["Property Address"]}`);

                    await page.waitForSelector('#StreetNumber');
                    await page.focus('#StreetNumber');
                    await page.keyboard.type(searchAddress.number);
                    await page.focus('#StreetName');
                    await page.keyboard.type(searchAddress.street);
                    await page.click('#cbxExact')
                    await page.focus('#City');
                    await page.keyboard.type(document.propertyId["Property City"]);
                    await page.focus('#ZipCode');
                    await page.keyboard.type(document.propertyId["Property Zip"]);
                }
                await page.click('#SearchSubmit')
                
                try {
                    await page.waitForSelector('.ssMessageCountTitle', {timeout: 10000})
                    let ids = await this.finderIds(page, owner_name_regexp)
                    if (ids.length < 4) {
                        for (let j = 0; j < ids.length; j++) {
                            const result = await this.parsePage(page, addr_value, ids[j]);
                            let dataFromPropertyAppraisers: any = {};
                            dataFromPropertyAppraisers['Full Name'] = result['owner_names'][0]['fullName'];
                            dataFromPropertyAppraisers['First Name'] = result['owner_names'][0]['firstName'];
                            dataFromPropertyAppraisers['Last Name'] = result['owner_names'][0]['lastName'];
                            dataFromPropertyAppraisers['Middle Name'] = result['owner_names'][0]['middleName'];
                            dataFromPropertyAppraisers['Name Suffix'] = result['owner_names'][0]['suffix'];
                            dataFromPropertyAppraisers['Owner Occupied'] = result['Owner Occupied'];
                            dataFromPropertyAppraisers['Property Address'] = result['Property Address'];
                            dataFromPropertyAppraisers['Property City'] = result['Property City'];
                            dataFromPropertyAppraisers['Property State'] = this.publicRecordProducer.state.toUpperCase();
                            dataFromPropertyAppraisers['Property Zip'] = result['Mailing Zip'];    
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
                            dataFromPropertyAppraisers['yearBuilt'] = result['year_built'];
                            dataFromPropertyAppraisers['Est Equity'] = '';
                            dataFromPropertyAppraisers['County'] = this.publicRecordProducer.county;
                            try{
                                await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
                                if (this.searchBy === 'address') break;
                            } catch(e){

                            }
                        }
                    } else console.log('Many matches found!')
                } catch (error) {
                }
            } catch (e) {
                console.log('Not found!');
            }
        return true;
    }
}