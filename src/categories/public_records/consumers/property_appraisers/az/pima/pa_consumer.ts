import puppeteer from 'puppeteer';
import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
const parser = require('parse-address');
const {parseFullName} = require('parse-full-name');

import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';
import { IProperty } from '../../../../../../models/property';

const DIRECTION: any = {
  N: 'string:North',
  W: 'string:West',
  S: 'string:South',
  E: 'string:East'
};

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'https://www.asr.pima.gov/Parcel/Search'
    }

    xpaths = {
        isPAloaded: '//*[contains(@id, "searchPills")]/ul/li[@heading="Address"]'
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
          if (retries > 15) {
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

    /**
     * check if element exists
     * @param page 
     * @param selector 
     */
    async checkExistElement(page: puppeteer.Page, selector: string): Promise<boolean> {
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
      const address1_number = address1 ? address1.number===undefined ? '' : address1.number.trim().toUpperCase() : '';
      const address2_number = address2 ? (address2.number===undefined ? '' : address2.number.trim().toUpperCase()) : '';
      const address1_prefix = address1 ? address1.prefix===undefined ? '' : address1.prefix.trim().toUpperCase() : '';
      const address2_prefix = address2 ? (address2.prefix===undefined ? '' : address2.prefix.trim().toUpperCase()) : '';
      const address1_type = address1 ? address1.type===undefined ? '' : address1.type.trim().toUpperCase() : '';
      const address2_type = address2 ? (address2.type===undefined ? '' : address2.type.trim().toUpperCase()) : '';
      const address1_street = address1 ? address1.street===undefined ? '' : address1.street.trim().toUpperCase() : '';
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
        // console.log(`Documents to look up: ${docsToParse.length}.`);
        const page = this.browserPages.propertyAppraiserPage;
        if (page === undefined) return false;
        page.setDefaultTimeout(60000);

        // get values of cities option
        const select_cities = await page.$x('//select[@name="district"]/option');
        const option_details = [];
        for (let option_city of select_cities) {
          const option_detail = await page.evaluate(el => ({value: el.value, city: el.textContent.trim().toUpperCase()}), option_city);
          option_details.push(option_detail);
        }

        let total_lookups = 0;
        let successful_lookups = 0;
        let total_saved = 0;
        let doc = docsToParse;
        // for (let doc of docsToParse) {
            if (!this.decideSearchByV2(doc)) {
              // console.log('Insufficient info for Owner and Property');
              return false;
            }
            total_lookups++;
                      
            // do everything that needs to be done for each document here
            // parse address
            let address;
            let search_addr = '';
            let first_name = '';
            let last_name = '';
            let owner_name = '';
            let owner_name_regexp = '';
            if (this.searchBy === 'name') {
              const nameInfo = this.getNameInfo(doc.ownerId);
              first_name = nameInfo.first_name;
              last_name = nameInfo.last_name;
              owner_name = nameInfo.owner_name;
              owner_name_regexp = nameInfo.owner_name_regexp;
              console.log(owner_name);
              if (owner_name === '') return false;
              console.log(`Looking for owner: ${owner_name}`);
            }
            else {
              try{
                address = this.getAddress(doc.propertyId);
                search_addr = address['street_full'];
                const parsedaddr = this.getAddressV2(doc.propertyId);
                if(!this.isEmptyOrSpaces(parsedaddr.street_address)){
                  address['parsed'] = parser.parseLocation(parsedaddr.street_address);
                  search_addr = parsedaddr.street_address;
                }
                console.log(`Looking for address: ${search_addr}`);
              } catch(e){
                return false;
              }
            }

            let retry_count = 0;
            while (true){
              if (retry_count > 15){
                  console.error('Connection/website error for 15 iteration.');
                  return false;
              }
              let retries = 0;
              while (true) {
                  try {
                      await page.goto(this.urls.propertyAppraiserPage, {waitUntil: 'networkidle0'});
                      break;
                  } catch (err) {
                      retries++;
                      if (retries > 3) {
                          console.log('******** website loading failed');
                          return false;
                      }
                      this.randomSleepIn5Sec();
                      console.log(`******** website loading failed, retring... [${retries}]`);
                  }        
              }
              await this.sleep(3000);
              // choose owner or address tab
              if (this.searchBy === 'name') {
                const ownerTabHandle = await page.$('#searchPills > ul > li[heading="Property Owner"]');
                await ownerTabHandle?.click();
              }
              else {
                const addressTabHandle = await page.$('#searchPills > ul > li[heading="Address"]');
                addressTabHandle?.click();
              }
              
              try {                
                if (this.searchBy === 'name') {
                  const nameInputHandle = await page.$('input#taxPayerInput');
                  await nameInputHandle?.type(owner_name, {delay: 150});
                  await nameInputHandle?.type(String.fromCharCode(13), {delay: 150});
                  try {
                    const elemHandle = await Promise.race([
                      page.waitForXPath('//label[contains(text(), "yielded too many records")]', {visible: true}),
                      page.waitForXPath('//label[contains(text(), "No records found")]', {visible: true}),
                      page.waitForXPath('//*[@id="searchResultsModal"]//*[contains(text(), "Search Results")]', {visible: true}),
                      page.waitForXPath('//*[text()="Parcel Number:"]')
                    ]);
                    const text = await page.evaluate(el => el.textContent, elemHandle);
                    if (text.indexOf("yielded too many records") > -1 || text.indexOf("No records found") > -1) {
                      console.log('Not found');
                      break;  
                    }
                    else if (text.indexOf("Search Results") > -1) {
                      const rows = await page.$x('//*[@id="searchResultsModal"]//table/tbody/tr');
                      const parcelIds = [];
                      for (const row of rows) {
                          const {name, parcelId} = await page.evaluate(el => ({name: el.children[1].textContent.trim(), parcelId: el.children[0].textContent.trim()}), row);
                          const regexp = new RegExp(owner_name_regexp);
                          if (!regexp.exec(name.toUpperCase())) continue;
                          console.log(name)
                          parcelIds.push(parcelId);
                      }
                      if (parcelIds.length > 0) {
                        for (const parcelId of parcelIds) {
                          const [row] = await page.$x(`//*[@id="searchResultsModal"]//table/tbody/tr[./td[contains(text(), "${parcelId}")]]`);
                          await Promise.all([
                            row.click(),
                            page.waitForNavigation()
                          ]);
                          await this.sleep(3000);
                          const result = await this.getPropertyInfos(page, address);
                          if (await this.parseResult(result, doc)) total_saved++;
                          await page.goBack();
                          await page.waitForXPath('//*[@id="searchResultsModal"]//*[contains(text(), "Search Results")]', {visible: true});
                        }
                        successful_lookups++;
                        console.log(`TOTAL: ${total_lookups}, SUCCESS: ${successful_lookups}, TOTAL SAVED: ${total_saved}`);
                      } else {
                        console.log('Not Found');
                      }
                    }
                    else {
                      await this.sleep(3000);
                      const result = await this.getPropertyInfos(page, address);
                      if (await this.parseResult(result, doc)) {
                        total_saved++;
                        successful_lookups++;
                      }
                      console.log(`TOTAL: ${total_lookups}, SUCCESS: ${successful_lookups}, TOTAL SAVED: ${total_saved}`);
                    }
                  } catch (error) {
                    console.log('Not found');
                    break;
                  }
                }
                else {
                  // console.log(address);
                  const address1Handle = await page.$('input#address1');
                  const strNameHandle = await page.$('input#strName');
                  if (address.parsed.number){
                    await address1Handle?.click({clickCount: 3});
                    await address1Handle?.type(address.parsed.number, {delay: 150});
                  }
                  if (address.parsed.prefix)
                    await page.select('select#selectedDirection', DIRECTION[address.parsed.prefix]);
  
                  let existDropdown = false;
                  if (!strNameHandle) break;

                  let tryType = 0;
                  let streetFound = true;
                  while (!existDropdown) {
                    if(tryType > 3){
                      streetFound = false;
                      break;
                    }
                    await strNameHandle.click({clickCount: address.parsed.street.length});
                    await strNameHandle.press('Backspace');
                    await strNameHandle.type(address.parsed.street, {delay: 150});
                    if(address.parsed.type){
                      if(address.parsed.type.match(/ave/i)){
                        await strNameHandle.type(" av", {delay: 150});
                      } else {
                        await strNameHandle.type(" "+address.parsed.type, {delay: 150});
                      }
                    }
                    await this.sleep(1000);
                    existDropdown = await this.checkExistElement(page, 'ul[id ^= "typeahead-"] > li:first-child');
                    tryType += 1;
                  }

                  if(!streetFound){
                    console.log("Street name is not found!");
                    break;
                  }

                  await page.click('ul[id ^= "typeahead-"] > li:first-child');
                  try {
                    await Promise.all([
                      strNameHandle.type(String.fromCharCode(13), {delay: 150}),
                      page.waitForNavigation()
                    ]);
                    await this.sleep(1000);
                  } catch (error) {
                    console.log("Not found!");
                    break;      
                  }
                  const result = await this.getPropertyInfos(page, address);
                  if (await this.parseResult(result, doc)) {
                    total_saved++;
                    successful_lookups++;
                  }
                }               
                console.log(`TOTAL: ${total_lookups}, SUCCESS: ${successful_lookups}, TOTAL SAVED: ${total_saved}`);
                break;                    
              } catch (error) {
                console.log(error);
                console.log('retrying... ', retry_count);
                retry_count++;
                await this.sleep(1000);
              }    
            }                       
        // }
        return true;
    }

    async parseResult(result: any, document: IOwnerProductProperty) {
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
        'Property Address': result['property_address'],
        'Property Unit #': '',
        'Property City': result['property_address_parsed']['city'],
        'Property State': 'AZ',
        'Property Zip': result['property_address_parsed']['zip'],
        'County': 'Pima',
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
        return await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
      } catch(e){
        return false;
      }
    }

    async getPropertyInfos(page: puppeteer.Page, address: any): Promise<any> {
      // extract informations
      const owner_info_selector = 'div#TaxpyrLegal > table > tbody > tr > td';
      const ownerInfoStr = await this.getElementHtmlContent(page, owner_info_selector);
      const ownerInfos = ownerInfoStr.replace(/(\s+)|(<span.*>.*<\/span>)/g, ' ').split('<br>');
      const full_name = ownerInfos[0].trim();
      const owner_names = [];
      const owner_name_arr = full_name.split('&amp;').map(str => this.simplifyString(str));
      for (let owner_name_iter of owner_name_arr) {
        if (owner_name_iter === '') break;
        const ownerName = this.parseOwnerName(owner_name_iter);
        owner_names.push(ownerName);
      }

      // property address
      const prop_addr_cols = await page.$x('//*[text()="Property Address"]/ancestor::table[1]/tbody/tr[1]/td');
      prop_addr_cols.pop();
      let property_address = '';
      for (const col of prop_addr_cols) {
        property_address += (await page.evaluate(el => el.textContent.trim(), col)) + ' ';
      }
      property_address = property_address.replace(/\s+/gs, ' ').trim();
      console.log(property_address);
      const property_address_parsed = parser.parseLocation(property_address);

      // mailing address
      const mailing_address = this.simplifyString(ownerInfos.filter(data => data.trim() !== '').slice(1).join(', '));
      const mailing_address_parsed = parser.parseLocation(mailing_address);

      // owner occupied
      const owner_occupied = mailing_address_parsed ? this.compareAddress(this.searchBy === 'name' ? property_address_parsed : address['parsed'], mailing_address_parsed) : false;
      
      // property type,  total assessed value, est value
      const existResdChr = await this.checkExistElement(page, 'div#ResdChr > table > tbody > tr');
      let property_type = '';
      let total_assessed_value = '';
      if (existResdChr) {
        property_type = await this.getElementTextContent(page, 'div#ResdChr > table > tbody > tr td:nth-child(4)');
        total_assessed_value = await this.getElementTextContent(page, 'div#ResdChr > table > tbody tr:nth-child(12) td:nth-child(4)');
      }
      let est_value = total_assessed_value;

      // sale info
      const existSalesInfo = await this.checkExistElement(page, 'div#SalesInfo > table > tbody > tr');
      let last_sale_recording_date = '';
      let last_sale_amount = '';
      if (existSalesInfo) {
        last_sale_recording_date = await this.getElementTextContent(page, 'div#SalesInfo > table > tbody > tr td:nth-child(3)');
        last_sale_amount = await this.getElementTextContent(page, 'div#SalesInfo > table > tbody > tr td:nth-child(5)');
      }

      const year_built = await this.getTextContentByXpathFromPage(page, '//div[@id="CommChr"]/table[2]/tbody/tr[last()]/td[2]');

      return {
        owner_names, 
        property_address,
        property_address_parsed,
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