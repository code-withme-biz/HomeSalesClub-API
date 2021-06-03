import puppeteer from 'puppeteer';
import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
import { IPublicRecordAttributes } from '../../../../../../models/public_record_attributes'
const parser = require('parse-address');
const nameParsingService = require('../../consumer_dependencies/nameParsingServiceNew');

import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';
import { getTextByXpathFromPage } from '../../../../../../services/general_service';

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'https://ims.jocogov.org/locationservices/default.aspx?id='
    }

    xpaths = {
        isPAloaded: '//input[@id="tbSearchID"]'
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
    getAddress(document: IPublicRecordAttributes): any {
      // 'Property Address': '162 DOUGLAS HILL RD',
      // 'Property City': 'WEST BALDWIN',
      // County: 'Cumberland',
      // 'Property State': 'ME',
      // 'Property Zip': '04091',
      const full_address = `${document['Property Address']}, ${document['Property City']}, ${document['Property State']} ${document['Property Zip']}`
      const parsed = parser.parseLocation(full_address);
      
      let street_name = parsed.street.trim();
      let street_full = document['Property Address'];
      let street_with_type = parsed.street + ' ' + parsed.type;

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
            // const address = this.getAddress(document);
            // const street_addr = address['street_full']; 

            let search_value = '';
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
                search_value = owner_name;
            } else {
                search_value = document.propertyId['Property Address'];
                const parseaddr = this.getAddressV2(document.propertyId);
                if(!this.isEmptyOrSpaces(parseaddr.street_address)){
                    search_value = parseaddr.street_address;
                }
                console.log(`Looking for address: ${document.propertyId['Property Address']}`);
            }

            let retry_count = 0;
            while (true){
              if (retry_count > 3){
                  console.error('Connection/website error for 15 iteration.');
                  return false;
              }
              try {
                if(this.searchBy == 'address'){
                    await page.goto(this.urls.propertyAppraiserPage+search_value, { waitUntil: 'networkidle0'});
                } else {
                    await page.goto(this.urls.propertyAppraiserPage, { waitUntil: 'networkidle0'});
                }
              } catch (error) {
                await page.reload();
              }
          
              try {                
                const exist_disclaimer = await this.checkExistElement(page, 'input#btnDisclaimerYes');
                if (exist_disclaimer) {
                  try {
                    const accept_button = await page.$('input#btnDisclaimerYes');
                    if (accept_button)
                      await Promise.all([
                          accept_button.click(),
                          page.waitForNavigation({waitUntil: 'networkidle0'})
                      ]);
                  } catch (error) {
                  }
                }

                if(this.searchBy == 'address'){
                    await page.waitForSelector('table#tblOwnerInfo > tbody > tr:first-child > td:nth-child(2) > span');
                    await this.sleep(5000);
                    // check result
                    const title = await this.getElementTextContent(page, 'span#titleLocation');
                    if (title.indexOf('Could not find') > -1) continue;

                    const result = await this.getPropertyInfos(page);
                    await this.parseResult(result, document);
                } else {
                    await page.type('input#tbSearchID', search_value, {delay: 150});
                    await page.keyboard.press('ArrowDown');
                    try{
                        await page.waitForXPath('//li[@class="ui-menu-item"]', {timeout: 10000});
                    } catch(e){
                        console.log('Not found!');
                        break;
                    }
                    const search_results = await page.$x('//li[@class="ui-menu-item"]');
                    const datalinks = [];
                    for(const row of search_results){
                        let id: any = await row.evaluate(el => el.getAttribute('aria-label'));
                        id = id?.split(':')[1].trim();
                        console.log(id);
                        let link = "https://ims.jocogov.org/locationservices/default.aspx?id=" + id;
                        let name = await row.evaluate(el => el.textContent?.trim());
                        console.log(name);
                        const regexp = new RegExp(owner_name_regexp);
                        if (regexp.exec(name!.toUpperCase())){
                            datalinks.push(link);
                        }
                    }
                    
                    for(const link of datalinks){
                        console.log(link);
                        await page.goto(link, {waitUntil: 'networkidle0'});
                        await page.waitForSelector('table#tblOwnerInfo > tbody > tr:first-child > td:nth-child(2) > span');
                        await this.sleep(5000);
                        const result = await this.getPropertyInfos(page);
                        await this.parseResult(result, document);
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
            'Property City': result['property_city'] || '',
            'Property State': 'KS',
            'Property Zip': result['property_zip'] || '',
            'County': 'Johnson',
            'Owner Occupied': result['owner_occupied'],
            'Property Type': result['property_type'] || '',
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
          await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
        } catch(e){
          //
        }
      }

    async getPropertyInfos(page: puppeteer.Page): Promise<any> {
      // name and address
      const name_addr_selector = 'table#tblOwnerInfo > tbody > tr:first-child > td:nth-child(2) > span';
      const name_and_address_str = await this.getElementHtmlContent(page, name_addr_selector);
      const name_and_address = name_and_address_str.split('<br>');
      console.log(name_and_address);
      // name
      const owner_names = [];
      const names_arr = name_and_address[0].split('<&amp;>');
      for (let index = 0 ; index < names_arr.length ; index++) {
        const owner_name_iter = names_arr[index].trim();
        if (owner_name_iter === '') break;
        const ownerName = this.parseOwnerName(owner_name_iter);
        owner_names.push(ownerName);
      }

      // mailing address
      let mailing_address = name_and_address[1].trim();
      const mailing_address_parsed = parser.parseLocation(mailing_address);

      // property address
      const property_address_selector = 'span#spanSitAddline1';
      const property_address_2_selector = 'span#spanMailCityLine';
      let property_address = await this.getElementTextContent(page, property_address_selector);
      let property_address_2 = await this.getElementTextContent(page, property_address_2_selector);
      let property_address_parsed = parser.parseLocation(property_address);
      let property_address_2_arr = property_address_2.split(/\s+/g);
      let property_zip = property_address_2_arr.pop();
      let property_state = property_address_2_arr.pop();
      let property_city = '';
      for (const word of property_address_2_arr){
        property_city += word + " ";
      }
      property_city = property_city.replace(',','').trim();

      // owner occupied
      let owner_occupied: any = false;
      try{
        owner_occupied = this.compareAddress(property_address_parsed, mailing_address_parsed);
      } catch(e){
        //
      }
      
      // property type
      const property_type_selctor = 'div#specialssquarebox + div > div.squareboxcontent > table > tbody > tr:nth-child(4) > td:nth-child(2) > span';
      const property_type = await this.getElementTextContent(page, property_type_selctor);

      // sales info
      const last_sale_recording_date = ''
      const last_sale_amount = '';
      
      // assessed value and est. value
      const total_assessed_value_selector = 'table.tblaprtaxvalue > tbody > tr:nth-child(2) > td:nth-child(3)';
      const est_value_selector = 'table.tblaprtaxvalue > tbody > tr:nth-child(2) > td:nth-child(2)';
      const total_assessed_value = await this.getElementTextContent(page, total_assessed_value_selector);
      const est_value = await this.getElementTextContent(page, est_value_selector);
      
      // year built
      const year_built_xpath = '//*[contains(text(), "Year Built:")]/following-sibling::td[1]';
      const year_built = await getTextByXpathFromPage(page, year_built_xpath);

      return {
        owner_names, 
        mailing_address,
        mailing_address_parsed,
        property_address,
        property_city,
        property_zip,
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