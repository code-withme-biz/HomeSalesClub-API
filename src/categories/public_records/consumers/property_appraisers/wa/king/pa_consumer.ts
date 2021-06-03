import puppeteer from 'puppeteer';
import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
const parser = require('parse-address');
const nameParsingService = require('../../consumer_dependencies/nameParsingServiceNew');

import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'https://blue.kingcounty.com/Assessor/eRealProperty/default.aspx'
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
    getAddress(document: any): any {
      // 'Property Address': '162 DOUGLAS HILL RD',
      // 'Property City': 'WEST BALDWIN',
      // County: 'Cumberland',
      // 'Property State': 'ME',
      // 'Property Zip': '04091',
      const full_address = `${document['Property Address']}, ${document['Property City']}, ${document['Property State']} ${document['Property Zip']}`
      console.log(full_address);
      const parsed = parser.parseLocation(full_address);
      
      let street_name = parsed.street ? parsed.street.trim() : '';
      let street_full = document['Property Address'];
      let street_with_type = (parsed.number ? parsed.number : '') + ' ' + (parsed.prefix ? parsed.prefix : '') + ' ' + (parsed.street ? parsed.street : '');
      street_with_type = street_with_type.trim();

      return {
        full_address,
        street_name,
        street_with_type,
        street_full,
        parsed
      }
    }

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

      let parserName = nameParsingService.newParseName(name_str);

      result['full_name'] = parserName.fullName;
      result['first_name'] = parserName.firstName;
      result['last_name'] = parserName.lastName;
      result['middle_name'] = parserName.middleName;
      result['suffix'] = parserName.suffix;
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
      const address1_prefix = address1 && address1.prefix===undefined ? '' : address1.prefix.trim().toUpperCase();
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
            
            // do everything that needs to be done for each document here
            // parse address
            let address;
            let search_addr;

            if (this.searchBy === 'name') {
                console.log("By name detected! The site is only supported searched by property address: https://blue.kingcounty.com/Assessor/eRealProperty/default.aspx");
                return false;
            }
            try {
              address = this.getAddress(document.propertyId);
              search_addr = address['street_full'];
              const parsev2 = this.getAddressV2(document.propertyId);
              if(!this.isEmptyOrSpaces(parsev2.street_address)){
                address['parsed'] = parser.parseLocation(parsev2.street_address);
                search_addr = parsev2.street_address;
              }
            } catch (error) {
              return false;
            }
            let retry_count = 0;
            while (true){
              if (retry_count > 3){
                  console.error('Connection/website error for 15 iteration.');
                  return false;
              }
              try {
                await page.goto(this.urls.propertyAppraiserPage, { waitUntil: 'load'});
              } catch (error) {
                await page.reload();
              }
              try {                
                const existAdvertise = await this.checkExistElement(page, 'input#cphContent_checkbox_acknowledge');
                if (existAdvertise) {
                    await page.click('input#cphContent_checkbox_acknowledge');
                }
                await page.waitForSelector('input#cphContent_txtAddress');
                const inputStHandle = await page.$x('//input[@id="cphContent_txtAddress"]');
                const inputCtHandle = await page.$x('//input[@id="cphContent_txtCity"]');
                const inputZipHandle = await page.$x('//input[@id="cphContent_txtZip"]');
                await inputStHandle[0].type(search_addr, {delay: 150});
                if(address.parsed.city){
                    await inputCtHandle[0].type(address.parsed.city, {delay: 150});
                }
                if(address.parsed.zip){
                    await inputZipHandle[0].type(address.parsed.city, {delay: 150})
                }
                await inputZipHandle[0].type(String.fromCharCode(13), {delay: 150});

                // click 'property detail'
                try {
                    await page.waitForSelector('a[id$="_LinkButtonDetail"]');
                    await this.sleep(2000);
                } catch(e){
                    console.log("Not found!");
                    break;
                }
                await Promise.all([
                  page.click('a[id$="_LinkButtonDetail"]'),
                  page.waitForNavigation({waitUntil: 'networkidle0'})
                ]);
                await this.sleep(2000);
                const result = await this.getPropertyInfos(page, address);
                await this.parseResult(result, document);
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
            'Mailing City': result['mailing_address_parsed'] ? result['mailing_address_parsed']['city'] : '',
            'Mailing State': result['mailing_address_parsed'] ? result['mailing_address_parsed']['state'] : '',
            'Mailing Zip': result['mailing_address_parsed'] ? result['mailing_address_parsed']['zip'] : '',
            'Property Address': document.propertyId['Property Address'],
            'Property Unit #': '',
            'Property City': document.propertyId['Property City'] || '',
            'Property State': 'WA',
            'Property Zip': document.propertyId['Property Zip'] || '',
            'County': 'King',
            'Owner Occupied': result['owner_occupied'],
            'Property Type': result['property_type'],
            'Total Assessed Value': result['total_assessed_value'],
            'Last Sale Recording Date': result['last_sale_recording_date'],
            'Last Sale Amount': result['last_sale_amount'],
            'Est. Remaining balance of Open Loans': '',
            'Est Value': result['est_value'],
            'yearBuilt': result['year_built'],
            'Est Equity': '',
            'Lien Amount': ''
        };
        try{
            // console.log(dataFromPropertyAppraisers);
            await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
        } catch(e){
            //
        }
    }

    async getPropertyInfos(page: puppeteer.Page, address: any): Promise<any> {
      // name
      const full_name_selector = 'table[id$="_DetailsViewParcel"] > tbody > tr:nth-child(2) > td:nth-child(2)';
      let full_name = await this.getElementTextContent(page, full_name_selector);
      full_name = full_name.split("+")[0].trim();
      const owner_names = [];
      const owner_name_arr = full_name.split('&').map(str => this.simplifyString(str));
      for (let owner_name_iter of owner_name_arr) {
        if (owner_name_iter === '') break;
        const ownerName = this.parseOwnerName(owner_name_iter);
        owner_names.push(ownerName);
      }
      
      // mailing address
      const mailing_address_selector = 'table[id$="_DetailsViewParcel"] > tbody > tr:nth-child(3) > td:nth-child(2)';
      let mailing_address = await this.getElementTextContent(page, mailing_address_selector);
      const is_valid_address = mailing_address.match(/[a-zA-Z]/g) !== null;
      mailing_address = is_valid_address ? mailing_address : address['full_address'];
      let mailing_address_parsed = parser.parseLocation(mailing_address);
      
      // owner occupied
      const owner_occupied = this.compareAddress(address['parsed'], mailing_address_parsed);

      // sales info
      const last_sale_recording_date_selector = 'table[id$="_GridViewSales"] > tbody > tr:nth-child(2) > td:nth-child(3) > span';
      const last_sale_amount_selector = 'table[id$="_GridViewSales"] > tbody > tr:nth-child(2) > td:nth-child(4)';
      const last_sale_recording_date = await this.getElementTextContent(page, last_sale_recording_date_selector);
      const last_sale_amount = await this.getElementTextContent(page, last_sale_amount_selector);
      
      // property type
      const property_type_selector = 'table[id$="_DetailsViewParcel2"] > tbody > tr:nth-child(3) > td:nth-child(2) > span';
      const property_type = await this.getElementTextContent(page, property_type_selector);
      
      // assessed value and est. value
      const total_assessed_value_selector = 'table[id$="_GridViewTaxRoll"] > tbody > tr:nth-child(2) > td:nth-child(8)';
      const est_value_selector = 'table[id$="_GridViewTaxRoll"] > tbody > tr:nth-child(2) > td:nth-child(8)';
      const total_assessed_value = await this.getElementTextContent(page, total_assessed_value_selector);
      const est_value = await this.getElementTextContent(page, est_value_selector);

      const year_built = await this.getTextContentByXpathFromPage(page, '//td[text()="Year Built"]/parent::tr/td[2]');
      
      return {
        owner_names, 
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