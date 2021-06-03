import puppeteer from 'puppeteer';
import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
import { IPublicRecordAttributes } from '../../../../../../models/public_record_attributes'
import axios from 'axios';
const parser = require('parse-address');
const {parseFullName} = require('parse-full-name');

import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';
import { IProperty } from '../../../../../../models/property';

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'http://www.padctn.org/prc/ajaxcalls/simplesearch.php'
    }

    xpaths = {
        isPAloaded: '//body'
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

    /**
     * check if element exists
     * @param page 
     * @param selector 
     */
    async checkExistElement(page: puppeteer.Page, selector: string): Promise<Boolean> {
      const exist = await page.$(selector).then(res => res !== null);
      return exist;
    }

    /**
     * get textcontent from specified element
     * @param page 
     * @param root 
     * @param selector 
     */
    async getElementTextContent(page: puppeteer.Page, selector: string): Promise<string> {
      try {
        const existSel = await this.checkExistElement(page, selector);
        if (!existSel) return '';
        let content = await page.$eval(selector, el => el.textContent)
        return content ? content.trim() : '';
      } catch (error) {
        console.log(error)
        return '';
      }
    }
    /**
     * get innerHTML from specified element
     * @param page 
     * @param root 
     * @param selector 
     */
    async getElementHtmlContent(page: puppeteer.Page, selector: string): Promise<string> {
      try {
        const existSel = await this.checkExistElement(page, selector);
        if (!existSel) return '';
        const content = await page.$eval(selector, el => el.innerHTML)
        return content ? content : '';
      } catch (error) {
        console.log(error)
        return '';
      }
    }

    /**
     * analysis name
     * @param name 
     */
    discriminateAndRemove(name: string) : any {
      const companyIdentifiersArray = [ 'GENERAL', 'TRUSTEE', 'TRUSTEES', 'INC', 'ORGANIZATION', 'CORP', 'CORPORATION', 'LLC', 'MOTORS', 'BANK', 'UNITED', 'CO', 'COMPANY', 'FEDERAL', 'MUTUAL', 'ASSOC', 'AGENCY' , 'OF' , 'SECRETARY' , 'DEVELOPMENT' , 'INVESTMENTS', 'HOLDINGS', 'ESTATE', 'LLP', 'LP', 'TRUST', 'LOAN', 'CONDOMINIUM', 'CHURCH', 'CITY', 'CATHOLIC', 'D/B/A', 'COCA COLA', 'LTD', 'CLINIC', 'TODAY', 'PAY', 'CLEANING', 'COSMETIC', 'CLEANERS', 'FURNITURE', 'DECOR', 'FRIDAY HOMES', 'SAVINGS', 'PROPERTY', 'PROTECTION', 'ASSET', 'SERVICES', 'L L C', 'NATIONAL', 'ASSOCIATION', 'MANAGEMENT', 'PARAGON', 'MORTGAGE', 'CHOICE', 'PROPERTIES', 'J T C', 'RESIDENTIAL', 'OPPORTUNITIES', 'FUND', 'LEGACY', 'SERIES', 'HOMES', 'LOAN'];
      const removeFromNamesArray = ['ET', 'AS', 'DECEASED', 'DCSD', 'CP\/RS', 'JT\/RS', 'esq','esquire','jr','jnr','sr','snr','2','ii','iii','iv','md','phd','j.d.','ll.m.','m.d.','d.o.','d.c.','p.c.','ph.d.', '&'];
      const companyRegexString = `\\b(?:${companyIdentifiersArray.join('|')})\\b`;
      const removeFromNameRegexString = `^(.*?)\\b(?:${removeFromNamesArray.join('|')})\\b.*?$`;
      const companyRegex = new RegExp(companyRegexString, 'i');
      const removeFromNamesRegex = new RegExp(removeFromNameRegexString, 'i');
      let isCompanyName = name.match(companyRegex);
      if (isCompanyName) {
          return {
              type: 'company',
              name: name
          }
      }
      
      let cleanName = name.match(removeFromNamesRegex);
      if (cleanName) {
          name = cleanName[1];
      }
      return {
          type: 'person',
          name: name
      }
    }

    /**
     * Parse owner names
     * @param name_str : string
     * @param address : string
     */
    parseOwnerName(name_str: string): any[] {
      const result: any = {};

      // owner name
      let owner_full_name = name_str;
      let owner_first_name = '';
      let owner_last_name = '';
      let owner_middle_name = '';

      const owner_class_name = this.discriminateAndRemove(owner_full_name);
      if (owner_class_name.type === 'person') {
        const owner_temp_name = parseFullName(owner_class_name.name);
        owner_first_name = owner_temp_name.first ? owner_temp_name.first : '';
        owner_last_name = owner_temp_name.last ? owner_temp_name.last : '';
        owner_middle_name = owner_temp_name.middle ? owner_temp_name.middle : '';
      }

      result['full_name'] = owner_full_name;
      result['first_name'] = owner_first_name;
      result['last_name'] = owner_last_name;
      result['middle_name'] = owner_middle_name;
      result['suffix'] = this.getSuffix(owner_full_name);
      return result;
    }

    getSuffix(name: string) : any {
      const suffixList = ['esq','esquire','jr','jnr','sr','snr','2','ii','iii','iv','md','phd','j.d.','ll.m.','m.d.','d.o.','d.c.','p.c.','ph.d.'];
      name = name.toLowerCase();
      for(let suffix of suffixList){
          let regex = new RegExp(' '+suffix, 'gm');
          if (name.match(regex)){
              return suffix;
          }
      }
      return '';
    }
    /**
     * Remove spaces, new lines
     * @param text : string
     */
    simplifyString(text: string): string {
      return text.replace(/( +)|(\n)/gs, ' ').trim();
    }

    /**
     * Compare 2 addresses
     * @param address1 
     * @param address2 
     */
    compareAddress(address1: any, address2: any): Boolean {
      const address1_number = address1.number===undefined ? '' : address1.number.trim().toUpperCase();
      const address2_number = address2 ? (address2.number===undefined ? '' : address2.number.trim().toUpperCase()) : '';
      const address1_prefix = address2 && address1.prefix===undefined ? '' : address1.prefix.trim().toUpperCase();
      const address2_prefix = address2 ? (address2.prefix===undefined ? '' : address2.prefix.trim().toUpperCase()) : '';
      const address1_type = address1.type===undefined ? '' : address1.type.trim().toUpperCase();
      const address2_type = address2 ? (address2.type===undefined ? '' : address2.type.trim().toUpperCase()) : '';
      const address1_street = address1.street===undefined ? '' : address1.street.trim().toUpperCase();
      const address2_street = address2 ? (address2.street===undefined ? '' : address2.street.trim().toUpperCase()) : '';

      return  (address1_number === address2_number) &&
              (address1_prefix === address2_prefix) &&
              (address1_type === address2_type) &&
              (address1_street === address2_street);
    }

    getAddress(document: IProperty): any {
      // 'Property Address': '162 DOUGLAS HILL RD',
      // 'Property City': 'WEST BALDWIN',
      // County: 'Cumberland',
      // 'Property State': 'ME',
      // 'Property Zip': '04091',
      const full_address = `${document['Property Address']}, ${document['Property City']}, ${document['Property State']} ${document['Property Zip']}`
      const parsed = parser.parseLocation(full_address);
      
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
        const page = this.browserPages.propertyAppraiserPage;
        if (page === undefined) return false;
        page.setDefaultTimeout(60000);
        let document = docsToParse;
            if (!this.decideSearchByV2(document)) {
              return false;
            }
            
            // do everything that needs to be done for each document here
            // parse address
            let address;
            let owner_name = '';
            let owner_name_regexp = '';
            if(this.searchBy == 'address'){
                address = this.getAddress(document.propertyId);
                const parsedaddr = this.getAddressV2(document.propertyId);
                if(!this.isEmptyOrSpaces(parsedaddr.street_address)){
                  address['parsed'] = parser.parseLocation(parsedaddr.street_address);
                }
                console.log("Looking for address:", document.propertyId['Property Address'])
            } else {
                let nameInfo = this.getNameInfo(document.ownerId, ',');
                owner_name = nameInfo.owner_name;
                owner_name_regexp = nameInfo.owner_name_regexp;
                console.log("Looking for owner:", owner_name);
            }

            let retry_count = 0;
            while (true){
              if (retry_count > 3){
                  console.error('Connection/website error for 15 iteration.');
                  return false;
              }
          
              try {
                let api_response;
                if(this.searchBy == 'address'){
                  let data: any = {
                    pageNo: "1",
                    searchNumber: address.parsed.number ? address.parsed.number : '',
                    searchTerm: address.parsed.street,
                    searchType: "address"
                    };
                  data = JSON.stringify(data);
                  api_response = await axios.post(this.urls.propertyAppraiserPage, data);
                } else {
                  let data: any = {
                    pageNo: "1",
                    searchNumber: '',
                    searchTerm: owner_name,
                    searchType: "owner"
                    };
                  data = JSON.stringify(data);
                  api_response = await axios.post(this.urls.propertyAppraiserPage, data);
                }
                if (api_response.status === 200) {
                  // console.log(api_response.data);
                  let datalinks = [];
                  if (api_response.data.searchResults.length > 0) {
                    if(this.searchBy == 'address'){
                        const searchResult = api_response.data.searchResults[0];
                        const account_number = searchResult.AccountNumber;
                        const detail_link = `http://www.padctn.org/prc/property/${account_number}/card/1`;
                        datalinks.push(detail_link);
                    } else {
                        for(const searchResult of api_response.data.searchResults){
                            const name = searchResult.Owner;
                            const account_number = searchResult.AccountNumber;
                            const detail_link = `http://www.padctn.org/prc/property/${account_number}/card/1`;
                            const regexp = new RegExp(owner_name_regexp);
                            if (!regexp.exec(name.toUpperCase())) continue;
                            datalinks.push(detail_link);
                        }
                    }
                  }
                  if(datalinks.length > 0){
                    for (const datalink of datalinks){
                        await page.goto(datalink, {waitUntil: 'load'});
                        const result = await this.getPropertyInfos(page);
                        this.parseResult(result, document);
                    }
                  } else {
                    console.log("Not found!");
                  }
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
            'Mailing Address': result['mailing_address'] || '',
            'Mailing Unit #': '',
            'Mailing City': result['mailing_address_parsed'] ? result['mailing_address_parsed']['city'] : '',
            'Mailing State': result['mailing_address_parsed'] ? result['mailing_address_parsed']['state'] : '',
            'Mailing Zip': result['mailing_address_parsed'] ? result['mailing_address_parsed']['zip'] : '',
            'Property Address': result['property_address'],
            'Property Unit #': '',
            'Property City': result['property_address_parsed'] ? result['property_address_parsed']['city'] : '',
            'Property State': 'TN',
            'Property Zip': result['property_address_parsed'] ? result['property_address_parsed']['zip'] : '',
            'County': 'davidson',
            'Owner Occupied': result['owner_occupied'] || '',
            'Property Type': result['property_type'] || '',
            'Total Assessed Value': result['total_assessed_value'] || '',
            'Last Sale Recording Date': result['last_sale_recording_date'] || '',
            'Last Sale Amount': result['last_sale_amount'] || '',
            'Est. Remaining balance of Open Loans': '',
            'Est Value': result['est_value'] || '',
            'yearBuilt': result['year_built'],
            'Est Equity': '',
            'Lien Amount': ''
        };
        try{
          await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
        } catch(e){
            console.log(e);
          //
        }
    }

    async getPropertyInfos(page: puppeteer.Page): Promise<any> {
      // name
      let owner_names = [];
      const fullnames_selector = 'div#propertyOverview > ul > li:nth-child(3)';
      const fullnames_str = await this.getElementTextContent(page, fullnames_selector);
      const fullnames = fullnames_str.slice('Current Owner:'.length+1).split('&');
      for (let fullname of fullnames) {
        let owner_name = this.simplifyString(fullname);
        const ownerName = this.parseOwnerName(owner_name);
        owner_names.push(ownerName);
      } 

      // property address
      let property_address = await this.getTextContentByXpathFromPage(page, '//div[@id="propertyOverview"]//li[contains(., "Location:")]');
      property_address = property_address.replace(/Location:\s+/g, "").trim();
      let parsedpropertyaddr = parser.parseLocation(property_address);
      // mailing address
      const mailing_address_selector = 'div#propertyOverview > div:nth-of-type(4) > ul > li:first-child';
      let mailing_address = await this.getElementTextContent(page, mailing_address_selector);
      mailing_address = mailing_address.slice('Mailing Address: '.length+1).trim();
      const mailing_address_parsed = parser.parseLocation(mailing_address);

      // owner occupied
      const owner_occupied = this.compareAddress(parsedpropertyaddr, mailing_address_parsed);
      
      // property type
      const property_type_selector = 'section#content > div:first-child > div:nth-of-type(4) > div:nth-child(2) > div > div:first-child > ul > li:first-child';
      let property_type = await this.getElementTextContent(page, property_type_selector);
      property_type = property_type.slice('Property Type:'.length+1).trim();

      // sales info
      const last_sale_recording_date_selector = 'div#propertyOverview > div:nth-of-type(4) > ul > li:nth-child(6)';
      const last_sale_amount_selector = 'div#propertyOverview > div:nth-of-type(4) > ul > li:nth-child(7)';
      let last_sale_recording_date = await this.getElementTextContent(page, last_sale_recording_date_selector);
      last_sale_recording_date = last_sale_recording_date.slice('Sale Date:'.length+1).trim();
      let last_sale_amount = await this.getElementTextContent(page, last_sale_amount_selector);
      last_sale_amount = last_sale_amount.slice('Sale Price:'.length+1).trim();

      // assessed value and est. value
      const total_assessed_value_selector = 'section#content > div:first-child > div:nth-of-type(4) > div:first-child > ul > li:nth-child(6)';
      const est_value_selector = 'section#content > div:first-child > div:nth-of-type(4) > div:first-child > ul > li:nth-child(5)';
      let total_assessed_value = await this.getElementTextContent(page, total_assessed_value_selector);
      total_assessed_value = total_assessed_value.slice('Assessed Value:'.length+1).trim();
      let est_value = await this.getElementTextContent(page, est_value_selector);
      est_value = est_value.slice('Total Appraisal Value:'.length+1).trim();

      const year_built = await this.getTextContentByXpathFromPage(page, '//strong[text()="Year Built:"]/parent::li/text()');

      return {
        owner_names,
        property_address,
        mailing_address,
        mailing_address_parsed, 
        owner_occupied,
        property_type, 
        total_assessed_value, 
        last_sale_recording_date, 
        last_sale_amount, 
        est_value,
        year_built
      }
    }
}