import puppeteer from 'puppeteer';
import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
const parser = require('parse-address');
const nameParsingService = require('../../consumer_dependencies/nameParsingServiceNew');

import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';
import * as GeneralService from '../../../../../../services/general_service';

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'https://tcproperty.co.thurston.wa.us/propsql/front.asp'
    }

    xpaths = {
        isPAloaded: '//p[contains(@class, "big_left")]'
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
        const url_search = this.urls.propertyAppraiserPage;
        /* XPath & Selector Configurations */
        const accept_tos_xpath = '//input[@value="I Accept"]';
        const street_number_selector = 'input[name="fa"]';
        const last_name_selector = 'input[name="ln"]';
        const first_name_selector = 'input[name="fn"]';
        const street_name_selector = 'input[name="sn"]';
        const search_button_xpath = '//input[@value="Submit"]';

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
              return false;
          }
          try {
            await page.goto(url_search, {waitUntil: 'networkidle0'});
            let accept_tos = await page.$x(accept_tos_xpath);
            if (accept_tos) await accept_tos[0].click();
          } catch (error) {
            await page.reload();
          }
          if (this.searchBy === 'name') {
            await page.waitForSelector(last_name_selector, {visible:true});
            await page.type(last_name_selector, last_name, {delay: 100});
            await page.type(first_name_selector, first_name, {delay: 100});
          }
          else {
            await page.waitForSelector(street_number_selector, {visible:true});
            await page.type(street_number_selector, parsed_addr.number, {delay: 100});
            await page.type(street_name_selector, parsed_addr.street, {delay: 100});
          }
          let search_button = await page.$x(search_button_xpath);
          await search_button[0].click();
          await page.waitForNavigation();

          const search_result_handle = await Promise.race([
            page.waitForXPath('//*[contains(text(), "No records")]'),
            page.waitForXPath('//*[text()="Organization"]/ancestor::table[1]/tbody/tr[position()>1 and position()<21]')
          ]);
          const search_result_text = await search_result_handle.evaluate(el => el.textContent) || '';
          if (search_result_text === '' || search_result_text.indexOf('No records') > -1) {
            console.log('No results found');
            return false;
          }
          const datalinks = [];
          const rows = await page.$x('//*[text()="Organization"]/ancestor::table[1]/tbody/tr[position()>1 and position()<21]');
          for (const row of rows) {
            try{
              let name = await row.evaluate(el => el.children[0].textContent) || '';
              let role = await row.evaluate(el => el.children[1].textContent) || '';
              let address = await row.evaluate(el => el.children[2].textContent) || '';
              let link = await row.evaluate((el:any) => el.children[4].children[1].href)
              if (role === 'Owner') {
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
            } catch(e){
              continue;
            }
          }
          for (let link of datalinks) {
            await page.goto(link, {waitUntil: 'load'});
            const result = await this.getInformation(page);
            if (result) await this.parseResult(result, document);
          }
          break;
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

  async getInformation(page: puppeteer.Page) {
    const owner_names_xpath = '//td[contains(., "Owner:") and contains(@class, "emphatic")]/parent::tr/td[2]';
    const est_value_xpath = '//td[contains(., "Market Value Total") and contains(@class, "emphatic")]/parent::tr/td[2]';
    const property_type_xpath = '//td[contains(., "Property Type:") and contains(@class, "emphatic")]/parent::tr/td[2]';
    const last_sale_date_xpath = '//td[contains(., "Sale Date:") and contains(@class, "emphatic")]/parent::tr/td[2]';
    const last_sale_amount_xpath = '//td[contains(., "Price:") and contains(@class, "emphatic")]/parent::tr/td[2]';

    // Normalize the owner's name
    let owner_names = await GeneralService.getTextByXpathFromPage(page, owner_names_xpath);
    let arr_names = owner_names.split(" & ");
    owner_names = [this.parseOwnerName(arr_names[0])];
    
    // property_Address
    let property_address = await GeneralService.getTextByXpathFromPage(page, '//td[text()="Situs Address:"]/following-sibling::td[1]');
    let property_city = '';
    let property_state = this.publicRecordProducer.state;
    let property_zip = '';

    // mailing_address
    let mailing_address = await GeneralService.getTextByXpathFromPage(page, '//td[text()="Owner:"]/parent::tr[1]/following-sibling::tr[1]/td[2]');
    let mailing_city_state = await GeneralService.getTextByXpathFromPage(page, '//td[text()="Owner:"]/parent::tr[1]/following-sibling::tr[2]/td[2]');
    let mailing_address_parsed = parser.parseLocation(mailing_address + ', ' + mailing_city_state);
    let mailing_zip = '';
    let mailing_state = '';
    let mailing_city = '';
    if(mailing_address_parsed){
      mailing_zip = mailing_address_parsed.zip ? mailing_address_parsed.zip : '';
      mailing_state = mailing_address_parsed.state ? mailing_address_parsed.state : '';
      mailing_city = mailing_address_parsed.city ? mailing_address_parsed.city : '';
    }

    // owner occupied
    let owner_occupied = mailing_address.toUpperCase().replace(/\s/g, '') === property_address.toUpperCase().replace(/\s/g, '');
    
    // property type
    let property_type = await GeneralService.getTextByXpathFromPage(page, property_type_xpath);

    // last sale info
    let last_sale_recording_date = await GeneralService.getTextByXpathFromPage(page, last_sale_date_xpath);
    let last_sale_amount = await GeneralService.getTextByXpathFromPage(page, last_sale_amount_xpath);

    // est value
    let est_value = await GeneralService.getTextByXpathFromPage(page, est_value_xpath);

    // year built
    let year_built = await GeneralService.getTextByXpathFromPage(page, '//td[text()="Year Built"]/following-sibling::td[1]');

    return {
      owner_names,
      property_address,
      property_city,
      property_zip,
      property_state,
      mailing_address,
      mailing_city,
      mailing_zip,
      mailing_state,
      owner_occupied,
      property_type, 
      last_sale_recording_date, 
      last_sale_amount, 
      est_value,
      year_built
    }
  }
}