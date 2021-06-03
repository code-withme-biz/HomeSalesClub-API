import puppeteer from 'puppeteer';
import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
import { IPublicRecordAttributes } from '../../../../../../models/public_record_attributes'
const parser = require('parse-address');
const nameParsingService = require('../../consumer_dependencies/nameParsingServiceNew');

import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'https://www.epcad.org/Search'
    }

    xpaths = {
        isPAloaded: '//input[@id="Keywords"]'
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

        const currentYear = new Date().getFullYear()

        let search_addr = '';

        let first_name = '';
        let last_name = '';
        let owner_name = '';
        let owner_name_regexp = '';
        
        if (this.searchBy === 'address') {
          search_addr = document.propertyId['Property Address'];
          const parsev2 = this.getAddressV2(document.propertyId);
          if(!this.isEmptyOrSpaces(parsev2.street_address)){
            search_addr = parsev2.street_address
          }

          await page.goto(`${this.urls.propertyAppraiserPage}?Keywords=${search_addr}&Year=` + currentYear, { waitUntil: 'load'});
        } else {
          const nameInfo = this.getNameInfo(document.ownerId);

          first_name = nameInfo.first_name;
          last_name = nameInfo.last_name;
          owner_name = nameInfo.owner_name;
          owner_name_regexp = nameInfo.owner_name_regexp;
        
          if (owner_name === '') return false;
  
          await page.goto(`${this.urls.propertyAppraiserPage}?Keywords=${owner_name}&Year=` + currentYear + `&Page=0&PageSize=100`, { waitUntil: 'load'});
        }
                     
        const isResult = await this.checkExistElement(page, 'table > tbody');
        if (!isResult){
            console.log('Not found!');
            return true;
        }

        // get detail links
        const detaillinks = [];
        if (this.searchBy === 'name') {
          const name_handles = await page.$x('//strong[text()="Name:"]/parent::div/following-sibling::div');
          const link_handles = await page.$x('//strong[text()="Appraised Value:"]/parent::div/div/a');
          let index = 0;
          for (let name_handle of name_handles) {
            const owner_name_get = await page.evaluate(el => el.textContent, name_handle);
            const regexp = new RegExp(owner_name_regexp);
            console.log(owner_name_get, owner_name);
            if (regexp.exec(owner_name_get.toUpperCase())) {
              const detaillink = await page.evaluate(el => el.href, link_handles[index]);
              detaillinks.push(detaillink);
              index++;
            }
          }
        }
        else {
          const detailHandle = await page.$('a[href^="/Search/Details"]');
          if (detailHandle) {
            const detaillink = await page.evaluate(el => el.href, detailHandle);
            detaillinks.push(detaillink);
          }
        }
        for (let detaillink of detaillinks) {
          await Promise.all([
            page.goto(detaillink, {waitUntil:'load'}),
            page.waitForNavigation()
          ]);
          const result = await this.getPropertyInfos(page);
          await this.parseResult(result, document);
        }
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
            'Mailing City': result['mailing_address_parsed']?result['mailing_address_parsed']['city']:'',
            'Mailing State': result['mailing_address_parsed']?result['mailing_address_parsed']['state']:'',
            'Mailing Zip': result['mailing_address_parsed']?result['mailing_address_parsed']['zip']:'',
            'Property Address': result['property_address_full'],
            'Property Unit #': '',
            'Property City': '',
            'Property State': 'TX',
            'Property Zip': '',
            'County': 'El Paso',
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
          console.log(dataFromPropertyAppraisers);
          await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers); 
    }

    async getPropertyInfos(page: puppeteer.Page): Promise<any> {
      // name
      const full_name_selector = 'div#property > div:first-child > div:nth-child(4) > div > div:nth-child(3)';
      const full_name = await this.getElementTextContent(page, full_name_selector);
      const owner_names = [];
      const owner_name_arr = full_name.split('&').map(str => this.simplifyString(str));
      for (let owner_name_iter of owner_name_arr) {
        if (owner_name_iter === '') break;
        const ownerName = this.parseOwnerName(owner_name_iter);
        owner_names.push(ownerName);
      }
      // property address
      let property_address = '';
      let property_state = '';
      const property_address_handle = await page.$x('//strong[text()="Address:"]/parent::div/div[2]');
      const property_address_full = await page.evaluate(el => el.innerText, property_address_handle[0]);
      const property_address_parsed = parser.parseLocation(property_address_full);

      // mailing address
      const mailing_address_selector = 'div#property > div:first-child > div:nth-child(4) > div > div:nth-child(9)';
      const mailing_address = (await this.getElementTextContent(page, mailing_address_selector)).replace(/\n|\s+/gs, ' ').trim();
      const mailing_address_parsed = parser.parseLocation(mailing_address);

      // owner occupied
      const owner_occupied = this.compareAddress(property_address_parsed, mailing_address_parsed);

      // property type
      const property_type_selector = 'div#property > div:first-child > div:nth-child(2) > div > div:nth-child(3)';
      const property_type = await this.getElementTextContent(page, property_type_selector);
      
      // sales info
      await page.click('div#detail-tabs >  ul > li:nth-child(6)');
      await page.click('div#detail-tabs >  ul > li:nth-child(6) > ul > li:nth-child(2)');
      const last_sale_recording_date_selector = 'div#deed table > tbody > tr:first-child > td:nth-child(2)';
      const last_sale_recording_date = await this.getElementTextContent(page, last_sale_recording_date_selector);
      const last_sale_amount = '';
      
      // assessed value and est. value
      await page.click('div#detail-tabs >  ul > li:nth-child(6)');
      await page.click('div#detail-tabs >  ul > li:nth-child(6) > ul > li:first-child');
      const year_trs = await page.$x('//div[@id="roll-value"]//table/tbody/tr/td[1]');
      let total_assessed_value = '';
      let est_value = '';
      for (let i = 0 ; i < year_trs.length ; i++) {
        const year_tr = year_trs[i];
        const year = await page.evaluate(el => el.textContent, year_tr);
        if (year.trim() == 2020) {
          const total_assessed_value_selector = `div#roll-value table > tbody > tr:nth-child(${i+1}) > td:nth-child(7)`;
          const est_value_selector = `div#roll-value table > tbody > tr:nth-child(${i+1}) > td:nth-child(5)`;
          total_assessed_value = await this.getElementTextContent(page, total_assessed_value_selector)
          est_value = await this.getElementTextContent(page, est_value_selector)
          break;
        }
      }

      await page.click('div#detail-tabs >  ul > li:nth-child(4)');
      const year_built = await this.getTextContentByXpathFromPage(page, '//th[text()="Year Built:"]/ancestor::table/tbody/tr/td[5][not(text()="0")]');

      return {
        owner_names, 
        property_address,
        property_state,
        property_address_full,
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