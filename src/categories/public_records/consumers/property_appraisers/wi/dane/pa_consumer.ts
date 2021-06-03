import puppeteer from 'puppeteer';
import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
const parser = require('parse-address');
const nameParsingService = require('../../consumer_dependencies/nameParsingServiceNew');

import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';
import * as GeneralService from '../../../../../../services/general_service';
import AddressService from '../../../../../../services/address_service';

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'https://accessdane.countyofdane.com/'
    }

    xpaths = {
        isPAloaded: '//input[@id="btnAddress"]'
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

    /**
     * Remove spaces, new lines
     * @param text : string
     */
    simplifyString(text: string): string {
      return text.replace(/( +)|(\n)/gs, ' ').trim();
    }
    /**
     * Parse owner names
     * @param name_str : string
     * @param address : string
     */
    parseOwnerName(name_str: string): any[] {
      const result: any = {};

      let parserName = nameParsingService.newParseName(name_str);

      result['full_name'] = parserName.fullName;
      result['first_name'] = parserName.firstName;
      result['last_name'] = parserName.lastName;
      result['middle_name'] = parserName.middleName;
      result['suffix'] = parserName.suffix;
      return result;
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
      if (page === undefined) return false;

      let document = docsToParse;
      if (!this.decideSearchByV2(document)) {
          return false;
      }
      
      // do everything that needs to be done for each document here
      // parse address
      let parsed_addr;
      let search_addr;
      let first_name = '';
      let last_name = '';
      let owner_name = '';
      let owner_name_regexp = '';

      if (this.searchBy === 'name') {
        const nameInfo = this.getNameInfo(document.ownerId, ',');
        first_name = nameInfo.first_name;
        last_name = nameInfo.last_name;
        owner_name = nameInfo.owner_name;
        owner_name_regexp = nameInfo.owner_name_regexp;
        if (owner_name === '') return false;
        console.log(`Looking for owner: ${owner_name}`);
      } else {
        parsed_addr = parser.parseLocation(document.propertyId['Property Address']);
        search_addr = document.propertyId['Property Address'];
        const parsev2 = this.getAddressV2(document.propertyId);
        if(!this.isEmptyOrSpaces(parsev2.street_address)){
            parsed_addr = parser.parseLocation(parsev2.street_address);
            search_addr = parsev2.street_address;
        }
        if(!parsed_addr || !parsed_addr.number || !parsed_addr.street){
            console.log("Street number or street name is missing!");
            return false;
        }
        console.log(`Looking for property: ${search_addr}`);
      }
      // do everything that needs to be done for each document here

      let retry_count = 0;
      while (true){
        if (retry_count > 3){
            console.error('Connection/website error for 15 iteration.');
            await this.browser?.close();
            return false;
        }
        try {
          await GeneralService.clearPage(page);
          await page.goto(this.urls.propertyAppraiserPage, { waitUntil: 'load'});
        } catch (error) {
          await page.reload();
        }
        try {                
          if (this.searchBy === 'name') {
            await page.waitForSelector('button[id="btnOwner"]');
            await page.click('button[id="btnOwner"]');
            await page.type('input#inputQuickSearch', owner_name, {delay: 100});
          }
          else {
            await page.waitForSelector('button[id="btnAddress"]');
            await page.click('button[id="btnAddress"]');
            await page.type('input#inputQuickSearch', search_addr, {delay: 100});
          }
          await Promise.all([
            page.click('input[value="Search"]'),
            page.waitForNavigation()
          ]);

          // fetch data
          const page_title = await page.title();
          switch (page_title.trim()) {
            case "Parcel Not Found":
              break;
            case "Land Records Search":
              const datalinks = [];
              const rows = await page.$x('//*[text()="Organization"]/ancestor::table[1]/tbody/tr[position()>1 and position()<21]');
              for (const row of rows) {
                let link = await row.evaluate((el:any) => el.children[0].children[0].children[0].href)
                let name = await row.evaluate(el => el.children[2].textContent) || '';
                let address = await row.evaluate(el => el.children[3].textContent) || '';
                address = this.simplifyString(address);
                if(this.searchBy == 'name'){
                  const regexp = new RegExp(owner_name_regexp);
                  if (regexp.exec(name!.toUpperCase())){
                      datalinks.push(link);
                  }
                } else {
                  if(this.compareStreetAddress(address, search_addr)){
                    datalinks.push(link);
                    break;
                  }
                }
              }
              for (let link of datalinks) {
                await page.goto(link, {waitUntil: 'load'});
                const result = await this.getPropertyInfos(page);
                if (result) await this.parseResult(result, document);
              }
              break;
            default:
              const result = await this.getPropertyInfos(page);
              if (result) await this.parseResult(result, document);
          }
          break;                    
        } catch (error) {
          console.log(error);
          console.log('retrying... ', retry_count);
          retry_count++;
          await page.waitFor(1000);
        }    
      }
      return true;
    }

    async parseResult(result: any, document: any) {
      let dataFromPropertyAppraisers = {
          'Full Name': result['owner_names'][0]['full_name'],
          'First Name': result['owner_names'][0]['first_name'],
          'Last Name': result['owner_names'][0]['last_name'],
          'Middle Name': result['owner_names'][0]['middle_name'],
          'Name Suffix': result['owner_names'][0]['suffix'],
          'Mailing Care of Name': '',
          'Mailing Address': result['mailing_address'],
          'Mailing Unit #': '',
          'Mailing City': result['mailing_city'],
          'Mailing State': result['mailing_state'],
          'Mailing Zip': result['mailing_zip'],
          'Property Address': result['property_address'],
          'Property Unit #': '',
          'Property City': result['property_city'] || '',
          'Property State': this.publicRecordProducer.state.toUpperCase(),
          'Property Zip': result['property_zip'] || '',
          'County': this.publicRecordProducer.county,
          'Owner Occupied': result['owner_occupied'],
          'Property Type': result['property_type'],
          'Total Assessed Value': result['total_assessed_value'] || '',
          'Last Sale Recording Date': result['last_sale_recording_date'],
          'Last Sale Amount': result['last_sale_amount'],
          'Est. Remaining balance of Open Loans': '',
          'Est Value': result['est_value'],
          'yearBuilt': result['year_built'],
          'Est Equity': '',
          'Lien Amount': ''
      };
      
      try{
          await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
      } catch(e){

      }
    }

    async getPropertyInfos(page: puppeteer.Page): Promise<any> {
      // name
      let owner_name = await GeneralService.getTextByXpathFromPage(page, '//*[@id="parcelSummary"]//td[contains(text(), "Owner Name")]/following-sibling::td[1]/ul/li[1]');
      owner_name = this.parseOwnerName(owner_name);
      let owner_names = [owner_name];

      // property address
      const property_address_xpath = '//*[@id="parcelSummary"]//td[text()="Primary Address"]/following-sibling::td[1]';
      let property_address = await GeneralService.getTextByXpathFromPage(page, property_address_xpath);
      let property_city = '';
      let property_state = this.publicRecordProducer.state;
      let property_zip = '';

      // mailing address
      const mailing_address_xpath = '//*[@id="parcelSummary"]//td[text()="Billing Address"]/following-sibling::td[1]/ul';
      let mailing_address = await GeneralService.getTextByXpathFromPage(page, mailing_address_xpath);
      mailing_address = this.simplifyString(mailing_address);
      const mailing_address_parsed = AddressService.getParsedAddress(mailing_address);
      mailing_address = mailing_address_parsed?.street_address;
      let mailing_city = mailing_address_parsed?.city;
      let mailing_state = mailing_address_parsed?.state;
      let mailing_zip = mailing_address_parsed?.zip;

      // owner occupied
      const owner_occupied = this.compareStreetAddress(mailing_address, property_address)
      
      // property type
      const property_type_xpath = '//*[@id="assessmentSummary"]//td[text()="Valuation Classification"]/following-sibling::td[1]';
      let property_type = await GeneralService.getTextByXpathFromPage(page, property_type_xpath);

      // sales info
      const last_sale_recording_date = '';
      const last_sale_amount = '';
      
      // assessed value and est. value
      const total_assessed_value_xpath = '//*[@class="taxDetailTable"]/table/tbody/tr[2]/td[3]';
      const est_value_xpath = '//*[@id="assessmentSummary"]//td[text()="Total Value"]/following-sibling::td[1]';
      const total_assessed_value = await GeneralService.getTextByXpathFromPage(page, total_assessed_value_xpath);
      const est_value = await GeneralService.getTextByXpathFromPage(page, est_value_xpath);;
      
      return {
        owner_names, 
        mailing_address,
        mailing_city, 
        mailing_state,
        mailing_zip,
        property_address,
        property_city,
        property_state,
        property_zip,
        owner_occupied,
        property_type, 
        total_assessed_value, 
        last_sale_recording_date, 
        last_sale_amount, 
        est_value
      }
    }
}