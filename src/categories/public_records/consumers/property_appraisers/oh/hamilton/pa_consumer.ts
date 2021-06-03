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
        propertyAppraiserPage: 'https://wedge1.hcauditor.org/'
    }

    xpaths = {
        isPAloaded: '//span[@class="ui-button-text"]'
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
      const parsed = parser.parseLocation(full_address);
      
      let street_name = parsed.street.trim();
      let street_full = document['Property Address'];
      let street_with_type = (parsed.street + ' ' + (parsed.type ? parsed.type : '')).trim();

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
            if (this.searchBy == 'address'){
              address = this.getAddress(document.propertyId);
              const parseaddr = this.getAddressV2(document.propertyId)
              if(!this.isEmptyOrSpaces(parseaddr.street_address)){
                address['parsed'] = parser.parseLocation(parseaddr.street_address);
              }
              console.log(`Looking for address: ${document.propertyId['Property Address']}`);
            } else {
              const nameInfo = this.getNameInfo(document.ownerId);
              owner_name = nameInfo.owner_name;
              owner_name_regexp = nameInfo.owner_name_regexp;
              if (owner_name === '') return false;
              console.log(`Looking for owner: ${owner_name}`);
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
                await page.waitForSelector('button[type="submit"]');
                if(this.searchBy == 'address'){
                  const inputStNumHandle = await page.$x('//input[@id="house_number_low"]');
                  const inputStreetHandle = await page.$x('//input[@id="street_name"]');
                  if (address.parsed.number) {
                    await inputStNumHandle[0].type(address.parsed.number, {delay: 100});
                  }
                  await inputStreetHandle[0].type(address.parsed.street, {delay: 100});
                  await Promise.all([
                    inputStreetHandle[0].type(String.fromCharCode(13), {delay: 150}),
                    page.waitForNavigation()
                  ]);
                } else {
                  await page.click('input#search_radio_name');
                  let inputNameHandle = await page.$x('//input[@id="owner_name"]');
                  await inputNameHandle[0].type(owner_name, {delay: 100});
                  await Promise.all([
                    inputNameHandle[0].type(String.fromCharCode(13), {delay: 150}),
                    page.waitForNavigation()
                  ]);
                }
                await this.sleep(3000);
                let datalinks = [];
                const isResultList = await page.$x('//table[@id="search-results"]/tbody/tr');
                if (isResultList.length > 0) {
                  if(this.searchBy == 'address'){
                    try{
                      const search_result = await page.$('table#search-results > tbody > tr > td:first-child');
                      if (search_result) {
                        const parcel_number = await page.evaluate(el => el.textContent.trim(), search_result);
                        const URL_DETAIL = `https://wedge1.hcauditor.org/view/re/${parcel_number}/2019/summary`;
                        datalinks.push(URL_DETAIL);
                      }
                    } catch(e){
                      continue;
                    }
                  } else {
                    const resultrows = await page.$x('//table[@id="search-results"]/tbody/tr');
                    for(let row = 0; row < resultrows.length; row++){
                      try{
                        const parcel_number = await this.getTextContentByXpathFromPage(page, '//table[@id="search-results"]/tbody/tr['+row+']/td[1]');
                        const name = await this.getTextContentByXpathFromPage(page, '//table[@id="search-results"]/tbody/tr['+row+']/td[2]');
                        const URL_DETAIL = `https://wedge1.hcauditor.org/view/re/${parcel_number}/2019/summary`;
                        const regexp = new RegExp(owner_name_regexp);
                        if (!regexp.exec(name!.toUpperCase())) continue;
                        datalinks.push(URL_DETAIL);
                      } catch(e){
                        console.log(e);
                        continue;
                      }
                    }
                  }
                }
                console.log(datalinks);
                if(datalinks.length > 0){
                  for (const datalink of datalinks){
                      console.log(datalink);
                      await page.goto(datalink, {waitUntil: 'load'});
                      const result = await this.getPropertyInfos(page);
                      await this.parseResult(result, document);
                  }
                } else {
                  let check2 = await page.$x('//table[@summary="Property Information"]');
                  if (check2.length > 0){
                    const result = await this.getPropertyInfos(page);
                    await this.parseResult(result, document);
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
          'Property State': 'OH',
          'Property Zip': result['property_address_parsed'] ? result['property_address_parsed']['zip'] : '',
          'County': 'hamilton',
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
      const name_addr_selector = 'table#property_information > tbody > tr:nth-child(3) > td:first-child > div:nth-child(2)';
      const name_addr_str = await this.getElementTextContent(page, name_addr_selector);
      const name_addr = name_addr_str.split('\n');

      let owner_names = [];
      let owner_name = this.simplifyString(name_addr[0]);
      owner_name = this.simplifyString(owner_name);
      const ownerName = this.parseOwnerName(owner_name);
      owner_names.push(ownerName);

      let property_address = await this.getTextContentByXpathFromPage(page, '//div[@style="width:25%;"]');
      property_address = property_address.replace(/Address\s+/g, "").trim();
      let parsedpropaddr = parser.parseLocation(property_address);
      // mailing address
      const mailing_name_address_selector = 'table#property_information > tbody > tr:nth-child(3) > td:nth-child(2) > div:nth-child(2)';
      const mailing_name_address_str = await this.getElementTextContent(page, mailing_name_address_selector);
      const mailing_name_address = mailing_name_address_str.split('\n');
      const mailing_address = this.simplifyString(mailing_name_address.slice(1).join(' '));
      const mailing_address_parsed = parser.parseLocation(mailing_address);

      // owner occupied
      const owner_occupied = this.compareAddress(parsedpropaddr, mailing_address_parsed);
      
      // property type
      const property_type_selector = 'table#property_information > tbody > tr:nth-child(2) > td:nth-child(2) > div:nth-child(2)';
      let property_type = await this.getElementTextContent(page, property_type_selector);
      property_type = this.simplifyString(property_type);
      if (property_type.indexOf('-') > -1) {
        property_type = property_type.slice(property_type.indexOf('-')+1).trim();
      }

      // sales info
      const last_sale_recording_date_selector = 'div#property_overview_wrapper > table:first-child > tbody > tr:nth-child(6) > td:nth-child(2)';
      const last_sale_amount_selector = 'div#property_overview_wrapper > table:first-child > tbody > tr:nth-child(7) > td:nth-child(2)';
      const last_sale_recording_date = await this.getElementTextContent(page, last_sale_recording_date_selector);
      const last_sale_amount = await this.getElementTextContent(page, last_sale_amount_selector);
      
      // assessed value and est. value
      const total_assessed_value_selector = 'table#property_information > tbody > tr:nth-child(4) > td:first-child > div:nth-child(2)';
      const est_value_selector = 'div#property_overview_wrapper > table:nth-child(2) > tbody > tr:nth-child(14) > td:nth-child(2)';
      const total_assessed_value = await this.getElementTextContent(page, total_assessed_value_selector);
      const est_value = await this.getElementTextContent(page, est_value_selector);

      const year_built = await this.getTextContentByXpathFromPage(page, '//td[text()="Year Built"]/parent::tr/td[2]');
      
      return {
        owner_names, 
        mailing_address,
        property_address,
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