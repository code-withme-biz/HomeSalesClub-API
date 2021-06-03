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
        propertyAppraiserPage: 'https://multcoproptax.com/Property-Search',
    }

    xpaths = {
        isPAloaded: '//*[@id="dnn_ctr410_MultnomahGuestView_SearchTextBox"]',
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

    async finderId(page: puppeteer.Page, address: any) {
        let ids = [];
        const {number, street} = address
        try {
            ids = await page.evaluate(({number, street}) => {
                // @ts-ignore
                const elementData = JSON.parse(document.getElementById('dnn_ctr410_MultnomahGuestView_SearchResultJson').value);
                let arrayFilterMatchData = elementData.ResultList.filter((data: { SitusAddress: string; }) => {
                    const reg = new RegExp(`\\b(?<number>${number})\\b.*(?<street>${street})`, 'i');
                    const match = reg.exec(data.SitusAddress);
                    return !!(match && match.groups && match.groups.number && match.groups.street);
                })
                return arrayFilterMatchData.map((e: { OwnerQuickRefID: any; }) => e.OwnerQuickRefID);
            }, {number, street});
        } catch (e) {
            console.log(e);
        }
        return ids;
    }

    async parsePage(page: puppeteer.Page, propertyAddress: string) {
        await page.waitForXPath('//*[contains(@id, "OwnersLabel")]');
        const rawOwnerName = await this.getTextByXpathFromPage(page, '//*[contains(@id, "OwnersLabel")]');
        const processedNamesArray = nameParsingService.parseOwnersFullName(rawOwnerName);
        let address: string = await this.getAddress(page, '//*[contains(@id, "MailingAddress")]');
        const addressMatch = address.match(/\n/g)
        if (addressMatch!.length > 1) {
            address = address.replace(/^.*\n/, '')
            address.trim()
        }
        const {state, city, zip} = addressService.parsingDelimitedAddress(address);
        address = address.replace(/\n/g, ' ')
        const isOwnerOccupied = addressService.comparisonAddresses(address, propertyAddress);
        const propertyType = await this.getTextByXpathFromPage(page, '//*[contains(@id, "PropertyUse")]');
        const grossAssessedValue = await this.getTextByXpathFromPage(page, '//*[contains(@id, "ValueHistoryDataRP")]//tr[not(@class="tableHeaders")][1]/td[last()]');
        const lastSaleDate = await this.getTextByXpathFromPage(page, '//*[contains(@id, "SalesHistoryData")]//tr[not(@class="tableHeaders")][1]/td[last()-1]');
        const lastSaleAmount = await this.getTextByXpathFromPage(page, '//*[contains(@id, "SalesHistoryData")]//tr[not(@class="tableHeaders")][1]/td[last()]');
        return {
            'owner_names': processedNamesArray,
            'Unit#': '',
            'Property City': '',
            'Property State': 'OR',
            'Property Zip': '',
            'County': 'Multnomah',
            'Owner Occupied': isOwnerOccupied,
            'Mailing Care of Name': '',
            'Mailing Address': address,
            'Mailing Unit #': '',
            'Mailing City': city,
            'Mailing State': state,
            'Mailing Zip': zip,
            'Property Type': propertyType,
            'Total Assessed Value': grossAssessedValue ? grossAssessedValue : '',
            'Last Sale Recoding Date': lastSaleDate,
            'Last Sale Amount': lastSaleAmount,
            'Est. Value': '',
            'yearBuilt': '',
            'Est. Equity': '',
        };
    }


    async getAddress(page: puppeteer.Page, xPath: string) {
        const [elm] = await page.$x(xPath);
        if (elm == null) {
            return '';
        }
        return await page.evaluate(j => j.textContent, elm);
    };

    async getTextByXpathFromPage(page: puppeteer.Page, xPath: string) {
        const [elm] = await page.$x(xPath)
        if (elm == null) {
            return null;
        }
        let text = await page.evaluate(j => j.innerText, elm);
        return text.replace(/\n/g, ' ');
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
            if (!this.decideSearchByV2(document)) {
                return false;
              }
            
            if (this.searchBy === 'name') {
                console.log("By name detected! The site is only supported searched by property address: https://multcoproptax.com/Property-Search");
                return false;
            }
            try {
                let address = parser.parseLocation(document.propertyId["Property Address"]);
                let searchAddress = document.propertyId["Property Address"].replace(/\b(?:#|Apt)\b/gi, 'UNIT');
                const parsev2 = this.getAddressV2(document.propertyId);
                if(!this.isEmptyOrSpaces(parsev2.street_address)){
                    address = parser.parseLocation(parsev2.street_address);
                    searchAddress = parsev2.street_address.replace(/\b(?:#|Apt)\b/gi, 'UNIT');
                }
                if(!address || (!address.number && !address.street)){
                    console.log("Street number & street name is missing!");
                    return false;
                }
                await page.goto('https://multcoproptax.com/Property-Search');
                await page.waitForSelector('#dnn_ctr410_MultnomahGuestView_SearchTextBox');
                await page.focus('#dnn_ctr410_MultnomahGuestView_SearchTextBox');
                await page.keyboard.type(searchAddress);
                await page.click('#SearchButtonDiv');
                await page.waitForSelector('#grid');
                try {
                    let ids = await this.finderId(page, address)
                    const [elem] = await page.$x(`//*[contains(text(), "${ids[0]}")]`);
                    await elem.click();
                    const result = await this.parsePage(page, document.propertyId["Property Address"]);
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
                    dataFromPropertyAppraisers['County'] = 'multnomah';
                    dataFromPropertyAppraisers['Property State'] = 'OR';
                    dataFromPropertyAppraisers['Property Address'] = document.propertyId['Property Address'];
                    try{
                        await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
                    } catch(e){
                        //
                    }
                    await page.goBack();
                    await page.waitForSelector('#grid');
                } catch (error) {
                    console.log(error)
                }
            } catch (e) {
                console.log('Address not found: ', document.propertyId["Property Address"])
            }
        return true;
    }
}