import puppeteer from 'puppeteer';
import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
const nameParsingService = require('../../consumer_dependencies/nameParsingServiceNew');
var addressit = require('addressit');
const {parseFullName} = require('parse-full-name');
var parser = require('parse-address');

import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';
import { IProperty } from '../../../../../../models/property';

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'https://mcassessor.maricopa.gov/'
    }

    xpaths = {
        isPAloaded: '//input[@id="search-param"]'
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
     * get textcontent from specified element
     * @param page 
     * @param root 
     * @param selector 
     */
    async getTextByXpathFromPage(page: puppeteer.Page, xPath: string): Promise<string> {
      const [elm] = await page.$x(xPath);
      if (elm == null) {
          return '';
      }
      let text = await page.evaluate(j => j.innerText, elm);
      return text.replace(/\n/g, ' ');
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
    /**
     * Remove spaces, new lines
     * @param text : string
     */
    simplifyString(text: string): string {
      return text.replace(/( +)|(\n)/gs, ' ').trim();
    }

    // the main parsing function. if read() succeeds, parseAndSave is started().
    // return true after all parsing is complete 

    // docsToParse is the collection of all address objects to parse from mongo.
    // !!! Only mutate document objects with the properties that need to be added!
    // if you need to multiply a document object (in case of multiple owners
    // or multiple properties (2-3, not 30) you can't filter down to one, use this.cloneMongoDocument(document);
    // once all properties from PA have been added to the document, call 
    async parseAndSave(docsToParse: IOwnerProductProperty): Promise<boolean>   {
        // console.log(`Documents to look up: ${docsToParse.length}.`);
        const page = this.browserPages.propertyAppraiserPage;
        if (page === undefined) return false;

        // get values of cities option
        const select_cities = await page.$x('//select[@name="district"]/option');
        const option_details = [];
        for (let option_city of select_cities) {
          const option_detail = await page.evaluate(el => ({value: el.value, city: el.textContent.trim().toUpperCase()}), option_city);
          option_details.push(option_detail);
        }
        let document = docsToParse;
        
            if (!this.decideSearchByV2(document)) {
              // console.log('Insufficient info for Owner and Property');
              return false;
            }
            
            // do everything that needs to be done for each document here
            // parse address
            let address;
            let search_addr;
            let first_name = '';
            let last_name = '';
            let owner_name = '';
            let owner_name_regexp = '';

            if (this.searchBy === 'name') {
              const nameInfo = this.getNameInfo(document.ownerId);
              first_name = nameInfo.first_name;
              last_name = nameInfo.last_name;
              owner_name = nameInfo.owner_name;
              owner_name_regexp = nameInfo.owner_name_regexp;
              if (owner_name === '') return false;
              console.log(`Looking for owner: ${owner_name}`);
            }
            else {
                search_addr = document.propertyId['Property Address'];
                address = this.getAddressV2(document.propertyId);
                if(!this.isEmptyOrSpaces(address.street_address)){
                  search_addr = address.street_address;
                }
                console.log(`Looking for address: ${search_addr}`);
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
                await page.waitForSelector('input#search-param');

                const inputHandle = await page.$('input#search-param');
                if (inputHandle) {
                  await inputHandle.type(this.searchBy==='name' ? owner_name : search_addr, {delay: 150});
                  await Promise.all([
                    inputHandle.type(String.fromCharCode(13), {delay: 150}),
                    page.waitForNavigation({waitUntil: 'networkidle0'})
                  ]);

                  let search_result_handle = await Promise.race([
                    page.waitForXPath('//*[@id="rpdata"]//*[contains(text(), "No parcel records found.")]'),
                    page.waitForSelector('tbody#rpdata > tr:nth-child(2n+1) > td:nth-child(2)')
                  ]);
                  let search_result_text = await search_result_handle.evaluate(el => el.textContent) || '';
                  
                  if (search_result_text === '' || search_result_text.indexOf('No parcel') > -1){
                    console.log("Not found!");
                    break;
                  }

                  const rows = await page.$$('tbody#rpdata > tr:nth-child(2n+1)');
                  const datalinks = [];
                  if (this.searchBy === 'name') {
                      for (const row of rows) {
                          const {name, link} = await page.evaluate(el => ({name: el.children[1].textContent.trim(), link: el.children[0].children[0].href}), row);
                          const regexp = new RegExp(owner_name_regexp);
                          if (!regexp.exec(name.toUpperCase())) continue;
                          datalinks.push(link);
                      }
                  }
                  else {
                      let link = await page.evaluate(el => el.children[0].children[0].href, rows[0]);
                      datalinks.push(link);
                  }

                  if (datalinks.length === 0) {
                      console.log("The search results is not reliable! (different from the keyword)");
                      break;
                  }
                  for (let datalink of datalinks) {
                    try{
                      console.log("Processing => ", datalink);
                      await page.goto(datalink, {waitUntil: 'load'});
                      let result = await this.getPropertyInfos(page);
                      await this.parseResult(result, document);
                    } catch (e){
                      // console.log(e);
                      console.log('Error during parse property (possibly property is N/A)');
                      continue;
                    }
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
            await this.randomSleepIn5Sec();
        // }
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
          'Property Address': result['property_address'],
          'Property Unit #': '',
          'Property City': result['property_address_parsed']['city'],
          'Property State': 'AZ',
          'Property Zip': result['property_address_parsed']['zip'],
          'County': 'Maricopa',
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
        await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
      } catch(e){
        //
      }
    }

    async getPropertyInfos(page: puppeteer.Page): Promise<any> {
      // name
      const full_name_xpath = '//a[contains(@data-original-title, "this owner")]';
      const full_name = await this.getTextByXpathFromPage(page, full_name_xpath);
      let owner_name_arr;
      if(full_name.includes('&')){
        owner_name_arr = full_name.split('&').map(str => this.simplifyString(str));
      } else {
        owner_name_arr = full_name.split('/').map(str => this.simplifyString(str));
      }
      
      const owner_names = [this.parseOwnerName(owner_name_arr[0])];
      // property address
      const property_address_xpath = '//*[contains(@class, "ribbon")]/following-sibling::div[1]//a[contains(@data-original-title, "this parcel")]';
      let property_address: any = await this.getTextByXpathFromPage(page, property_address_xpath);
      console.log('Property Address from web: ', property_address);
      let property_address_parsed = parser.parseLocation(property_address);
      property_address = this.getStreetAddress(property_address);
      let property_zip = '';
      let property_state = '';
      let property_city = '';
      if(property_address_parsed){
        property_zip = property_address_parsed.zip ? property_address_parsed.zip : '';
        property_state = property_address_parsed.state ? property_address_parsed.state : '';
        property_city = property_address_parsed.city ? property_address_parsed.city : '';
      }
      // mailing address
      const mailing_address_xpath = '//*[text()="Mailing Address"]/following-sibling::div';
      let mailing_address = await this.getTextByXpathFromPage(page, mailing_address_xpath);
      let mailing_address_parsed = parser.parseLocation(mailing_address);
      mailing_address = this.getStreetAddress(mailing_address);
      let mailing_zip = '';
      let mailing_state = '';
      let mailing_city = '';
      if(mailing_address_parsed){
        mailing_zip = mailing_address_parsed.zip ? mailing_address_parsed.zip : '';
        mailing_state = mailing_address_parsed.state ? mailing_address_parsed.state : '';
        mailing_city = mailing_address_parsed.city ? mailing_address_parsed.city : '';
      }
      // owner occupied
      const owner_occupied = mailing_address && property_address && mailing_address.toUpperCase() === property_address.toUpperCase();
        
      // sales info
      const last_sale_recording_date_xpath = '//*[text()="Sale Date"]/following-sibling::div';
      const last_sale_amount_xpath = '//*[text()="Sale Price"]/following-sibling::div';
      const last_sale_recording_date = await this.getTextByXpathFromPage(page, last_sale_recording_date_xpath);
      const last_sale_amount = await this.getTextByXpathFromPage(page, last_sale_amount_xpath);

      // property type
      const property_type_xpath = '//*[text()="PU Description"]/following-sibling::div[1]';
      const property_type = await this.getTextByXpathFromPage(page, property_type_xpath);
      	
      // assessed value and est. value
      const total_assessed_value_xpath = '//*[text()="Assessed LPV"]/following-sibling::div[1]';
      const est_value_xpath = '//*[contains(text(), "Full Cash Value")]/following-sibling::div[1]';
      const total_assessed_value = await this.getTextByXpathFromPage(page, total_assessed_value_xpath);
      const est_value = await this.getTextByXpathFromPage(page, est_value_xpath);

      const year_built_xpath = '//*[text()="Construction Year"]/following-sibling::div[1]';
      const year_built = await this.getTextByXpathFromPage(page, year_built_xpath);

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
    getStreetAddress(full_address:string): any {
      const parsed = addressit(full_address);
      let street_address = (parsed.number ? parsed.number : '') + ' ' + (parsed.street ? parsed.street : '') + ' ' + (parsed.unit ? '#'+parsed.unit : '');
      street_address = street_address.replace(/\s+/, ' ').trim();
      return street_address;
  }
}