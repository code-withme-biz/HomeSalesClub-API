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
        propertyAppraiserPage: 'https://pat.bhamaps.com/?appId=af5297dfe1684ab7bd3c315382dca67c'
    }

    xpaths = {
        isPAloaded: '//li[@class="basic-search"]'
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

    async getTextByXpathFromPage(page: puppeteer.Page, xPath: string): Promise<string> {
      const [elm] = await page.$x(xPath);
      if (elm == null) {
          return '';
      }
      let text = await page.evaluate(j => j.textContent, elm);
      return text.trim();
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

    compareAddress(address1: any, address2: any): Boolean {
        const address1_number = address1.number === undefined ? '' : address1.number.trim().toUpperCase();
        const address2_number = address2 ? (address2.number === undefined ? '' : address2.number.trim().toUpperCase()) : '';
        const address1_prefix = address1 && address1.prefix === undefined ? '' : address1.prefix.trim().toUpperCase();
        const address2_prefix = address2 ? (address2.prefix === undefined ? '' : address2.prefix.trim().toUpperCase()) : '';
        const address1_type = address1.type === undefined ? '' : address1.type.trim().toUpperCase();
        const address2_type = address2 ? (address2.type === undefined ? '' : address2.type.trim().toUpperCase()) : '';
        const address1_street = address1.street === undefined ? '' : address1.street.trim().toUpperCase();
        const address2_street = address2 ? (address2.street === undefined ? '' : address2.street.trim().toUpperCase()) : '';

        return (address1_number === address2_number) &&
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
    async parseAndSave(docsToParse: IOwnerProductProperty): Promise<boolean>   {
        const page = this.browserPages.propertyAppraiserPage;
        page?.setDefaultTimeout(150000);
        if (page === undefined) return false;
        let document = docsToParse;
            if (!this.decideSearchByV2(document)) {
              return false;
            }
            
            // do everything that needs to be done for each document here
            // parse address
            let search_value = '';
            let parsed_addr;
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
              search_value = owner_name;
            }
            else {
                parsed_addr = parser.parseLocation(document.propertyId['Property Address']);
                const parseaddr = this.getAddressV2(document.propertyId);
                if(!this.isEmptyOrSpaces(parseaddr.street_address)){
                    parsed_addr = parser.parseLocation(parseaddr.street_address);
                }
                if(!parsed_addr || !parsed_addr.number || !parsed_addr.street){
                    console.log("Street name or number is missing!");
                    return false;
                }
                search_value = ((parsed_addr.number ? parsed_addr.number : '') + ' ' + (parsed_addr.street ? parsed_addr.street : '')).trim();
                console.log(`Looking for address: ${document.propertyId['Property Address']}`);
            }
            let retry_count = 0;
            while (true){
              if (retry_count > 3){
                  console.error('Connection/website error for 15 iteration.');
                  return false;
              }
              try {
                await page.goto(this.urls.propertyAppraiserPage, { waitUntil: 'networkidle0'});
              } catch (error) {
                await page.reload();
              }
              try {
                await page.waitForXPath('//li[@class="basic-search"]');
                let [basicSearch] = await page.$x('//li[@class="basic-search"]');
                await basicSearch.click();
                await page.waitForSelector('input[name="Address"]');
                if(this.searchBy == 'name'){
                    await page.type('input[name="Own1"]', search_value, {delay: 150});
                } else {
                    await page.type('input[name="Address"]', search_value, {delay: 150});
                }
                await page.keyboard.press('Enter');
                try{
                    await page.waitForXPath('//a[@class="view-report-link"]', {timeout: 10000});
                } catch(e){
                    console.log('Not found!');
                    break;
                }
                const search_results = await page.$x('//div[contains(@class, "-row-")]');
                const datalinks: any = [];
                if(this.searchBy == 'name'){
                    for(const row of search_results){
                        const {name, link} = await page.evaluate(el => ({name: el.children[0].children[1].children[1].children[1].textContent.trim(), link: el.children[0].children[2].children[0].href}), row);
                        const regexp = new RegExp(owner_name_regexp);
                        if (regexp.exec(name!.toUpperCase())){
                            datalinks.push(link);
                        }
                    }
                } else {
                    const {address, link} = await page.evaluate(el => ({address: el.children[0].children[1].children[2].children[1].textContent.trim(), link: el.children[0].children[2].children[0].href}), search_results[0]);
                    if(this.compareStreetAddress(address, search_value)){
                      datalinks.push(link);
                    }
                }
                if (datalinks.length === 0) {
                    console.log("The search results is not reliable! (different from the keyword)");
                    break;
                }
                console.log(datalinks);
                for (let datalink of datalinks) {
                    try{
                        console.log("Processing => ", datalink);
                        await page.goto(datalink, {waitUntil: 'networkidle0'});
                        let result = await this.getPropertyInfos(page);
                        await this.parseResult(result, document);
                    } catch (e){
                        console.log(e);
                        console.log('Error during parse property (possibly property is N/A)');
                        continue;
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
          'Mailing City': result['mailing_city'] || '',
          'Mailing State': result['mailing_state'] || '',
          'Mailing Zip': result['mailing_zip'] || '',
          'Property Address': result['property_address'],
          'Property Unit #': '',
          'Property City': result['property_city'] || '',
          'Property State': this.publicRecordProducer.state.toUpperCase(),
          'Property Zip': result['property_zip'] || '',
          'County': this.publicRecordProducer.county,
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
        // console.log(dataFromPropertyAppraisers);
        await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
      } catch(e){
        //
      }
    }

    async getPropertyInfos(page: puppeteer.Page): Promise<any> {
      await page.waitForXPath('//b[text()="Owner Name:"]/parent::div/span[1]');
      // name
      const full_name_xpath = '//b[text()="Owner Name:"]/parent::div/span[1]';
      let full_name = await this.getTextByXpathFromPage(page, full_name_xpath);
      const owner_names = [];
      full_name = full_name.split("&")[0].trim();
      let parseName = this.parseOwnerName(full_name);
      owner_names.push(parseName);

      // property address
      const property_address_full_xpath = '//b[text()="Property Address:"]/parent::div/span[1]';
      let property_address_full = await this.getTextByXpathFromPage(page, property_address_full_xpath);
      property_address_full = property_address_full.replace(/\s+/g, ' ');
      let property_full_arr = property_address_full.split(',');
      let property_address = property_full_arr[0].trim();
      let property_2_arr = property_full_arr[1].trim().split(/\s+/);
      let property_zip = property_2_arr.pop();
      let property_city = '';
      for (const word of property_2_arr){
        property_city += word + " ";
      }
      property_city = property_city.replace(',','').trim();
      

      // mailing address
      const mailing_address_xpath = '//b[text()="Mailing Address:"]/parent::div/span[1]';
      const mailing_address_2_xpath = '//b[text()="City State Zip:"]/parent::div/span[1]';
      let mailing_address = await this.getTextByXpathFromPage(page, mailing_address_xpath);
      let mailing_address_2 = await this.getTextByXpathFromPage(page, mailing_address_2_xpath);
      let mailing_address_2_arr = mailing_address_2.split(/\s+/g);
      let mailing_zip = mailing_address_2_arr.pop();
      let mailing_state = mailing_address_2_arr.pop();
      let mailing_city = '';
      for (const word of mailing_address_2_arr){
        mailing_city += word + " ";
      }
      mailing_city = mailing_city.trim();

      const property_address_parsed = parser.parseLocation(property_address);
      const mailing_address_parsed = parser.parseLocation(mailing_address);
      // owner occupied
      let owner_occupied;
      try{
        owner_occupied = this.compareAddress(property_address_parsed, mailing_address_parsed);
      } catch(e){
        owner_occupied = false;
      }

      // property type
      const property_type_xpath = '//b[text()="Land Use:"]/parent::div/span[2]';
      const property_type = await this.getTextByXpathFromPage(page, property_type_xpath);

      // assessed value and est. value
      const total_assessed_value_xpath = '//th[text()="Total Value:"]/parent::tr/td[2]';
      const total_assessed_value = await this.getTextByXpathFromPage(page, total_assessed_value_xpath);
      const est_value_xpath = '//th[text()="Total Value:"]/parent::tr/td[1]';
      const est_value = await this.getTextByXpathFromPage(page, est_value_xpath);

      // sales info"
      let [salesTab] = await page.$x('//a[text()="Sales"]');
      await salesTab.click();
      await this.sleep(1000);

      const last_sale_recording_date_xpath = '//th[text()="Sale Date"]/ancestor::table/tbody/tr[1]/td[1]';
      const last_sale_amount_xpath = '//th[text()="Sale Date"]/ancestor::table/tbody/tr[1]/td[2]';
      let last_sale_recording_date = await this.getTextByXpathFromPage(page, last_sale_recording_date_xpath);
      last_sale_recording_date = last_sale_recording_date.split(/\s+/g)[0].trim();
      const last_sale_amount = await this.getTextByXpathFromPage(page, last_sale_amount_xpath);

      // residential tab
      let [resTab] = await page.$x('//a[text()="Residential"]');
      await resTab.click();
      await this.sleep(1000);

      const year_built = await this.getTextByXpathFromPage(page, '//b[text()="Year Built:"]/parent::div/span[1]');

      return {
        owner_names, 
        property_address,
        property_city,
        property_zip,
        property_address_parsed,
        mailing_address,
        mailing_city,
        mailing_zip,
        mailing_state,
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