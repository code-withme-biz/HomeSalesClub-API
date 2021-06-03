import puppeteer from 'puppeteer';
import AbstractPAConsumer from '../abstract_pa_consumer_updated';
const parser = require('parse-address');
const nameParsingService = require('../consumer_dependencies/nameParsingServiceNew');

import { IPublicRecordProducer } from '../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../models/owner_product_property';

export default abstract class ArkansasPAConsumer extends AbstractPAConsumer {
    abstract county: string;
    abstract pa_url: string;
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'https://www.arcountydata.com/county.asp?county=Benton&directlogin=True'
    }

    xpaths = {
        isPAloaded: '//input[@name="OwnerName"]'
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
        // console.log(`Documents to look up: ${docsToParse.length}.`);
        const page = this.browserPages.propertyAppraiserPage;
        if (page === undefined) return false;
        let document = docsToParse;
        
            if (!this.decideSearchByV2(document)) {
              return false;
            }

            let parsed_addr;
            let first_name = '';
            let last_name = '';
            let owner_name = '';
            let owner_name_regexp = '';

            if (this.searchBy === 'name') {
                const nameInfo = this.getNameInfo(document.ownerId, ",");
                first_name = nameInfo.first_name;
                last_name = nameInfo.last_name;
                owner_name = nameInfo.owner_name;
                owner_name_regexp = nameInfo.owner_name_regexp;
                if (owner_name === '') return false;
                console.log(`Looking for owner: ${owner_name}`);
            } else {
                parsed_addr = parser.parseLocation(document.propertyId['Property Address']);
                const parseaddr = this.getAddressV2(document.propertyId);
                if(!this.isEmptyOrSpaces(parseaddr.street_address)){
                    parsed_addr = parser.parseLocation(parseaddr.street_address);
                }
                if(!parsed_addr || !parsed_addr.number || !parsed_addr.street){
                    console.log("Street number or street name is missing!");
                    return false;
                }
                console.log(`Looking for address: ${document.propertyId['Property Address']}`);
            }

            let retry_count = 0;
            while (true){
              if (retry_count > 15){
                  console.error('Connection/website error for 15 iteration.');
                  return false;
              }
              try {
                await page.goto(this.pa_url, { waitUntil: 'networkidle0'});
              } catch (error) {
                await page.reload();
              }
              try {
                await page.waitForXPath('//input[@id="OwnerName"]');
                if(this.searchBy == 'name'){
                    await page.click('input#OwnerName', {clickCount: 3});
                    await page.keyboard.press('Backspace');
                    await page.type('input#OwnerName', owner_name, {delay: 150});
                } else {
                    await page.click('input#StreetNumber', {clickCount: 3});
                    await page.keyboard.press('Backspace');
                    if(parsed_addr.number){
                        await page.type('input#StreetNumber', parsed_addr.number, {delay: 150});
                    }
                    await page.click('input#StreetName', {clickCount: 3});
                    await page.keyboard.press('Backspace');
                    if(parsed_addr.street){
                        await page.type('input#StreetName', parsed_addr.street, {delay: 150});
                    }
                    if(parsed_addr.prefix){
                      try{
                        await page.select('#siteDirection', parsed_addr.prefix);
                      } catch(e){
                        //
                      }
                    }
                }
                try{
                    let [submitButton] = await page.$x('//input[@id="Search"]');
                    await Promise.all([
                        submitButton.click(),
                        page.waitForNavigation({waitUntil: 'networkidle0'})
                    ]);
                } catch(e){
                    let [submitButton] = await page.$x('//input[@id="Search2"]');
                    await Promise.all([
                        submitButton.click(),
                        page.waitForNavigation({waitUntil: 'networkidle0'})
                    ]);
                }
                let searchResults = await page.$x('//form[@id="parcel_report"]/table/tbody/tr');
                if(searchResults.length < 2){
                    console.log("Not found!");
                    break;
                }
                searchResults.shift();
                const datalinks = [];
                if(this.searchBy == 'name'){
                    for(const row of searchResults){
                        let link;
                        link = await row.evaluate(el => el.children[0].children[0].getAttribute('href'));
                        if(!link || !link?.match(/item/g)){
                            link = await row.evaluate(el => el.children[0].children[1].getAttribute('href'));
                        }
                        link = "https://www.arcountydata.com/" + link;
                        let name = await row.evaluate(el => el.children[1].textContent?.trim());
                        const regexp = new RegExp(owner_name_regexp);
                        if (!regexp.exec(name!.toUpperCase())){
                            continue;
                        }
                        datalinks.push(link);
                    }
                } else {
                    let link = await searchResults[0].evaluate(el => el.children[0].children[0].getAttribute('href'));
                    if(!link || !link?.match(/item/g)){
                        link = await searchResults[0].evaluate(el => el.children[0].children[1].getAttribute('href'));
                    }
                    link = "https://www.arcountydata.com/" + link;
                    datalinks.push(link);
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
          'Mailing Address': result['mailing_address'] || '',
          'Mailing Unit #': '',
          'Mailing City': result['mailing_city'] || '',
          'Mailing State': result['mailing_state'] || '',
          'Mailing Zip': result['mailing_zip'] || '',
          'Property Address': result['property_address'],
          'Property Unit #': '',
          'Property City': result['property_city'] || '',
          'Property State': 'AR',
          'Property Zip': result['property_zip'] || '',
          'County': this.county,
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
      // name
      const full_name_xpath = '//td[text()="Property Address:"]/parent::tr/td[2]/text()[1]';
      let full_name = await this.getTextByXpathFromPage(page, full_name_xpath);
      const owner_names = [];
      full_name = full_name.split("&")[0].trim();
      let parseName = this.parseOwnerName(full_name);
      owner_names.push(parseName);

      // property address
      const property_address_xpath = '//td[text()="Property Address:"]/parent::tr/td[2]/text()[2]';
      const property_address_2_xpath = '//td[text()="Property Address:"]/parent::tr/td[2]/text()[last() - 2]';
      let property_address = await this.getTextByXpathFromPage(page, property_address_xpath);
      property_address = property_address.replace(/\s+/g, ' ');
      let property_address_2 = await this.getTextByXpathFromPage(page, property_address_2_xpath);
      property_address_2 = property_address_2.replace(/\s+/g, ' ');
      if(property_address == property_address_2){
        property_address_2 = await this.getTextByXpathFromPage(page, '//td[text()="Property Address:"]/parent::tr/td[2]/text()[last() - 1]');
      }
      let property_address_2_arr = property_address_2.split(/\s+/g);
      let property_zip: any, property_state: any = '';
      property_zip = property_address_2_arr.pop();
      if(property_zip.length == 2){
        property_state = property_zip;
        property_zip = '';
      } else {
        property_state = property_address_2_arr.pop();
      }
      let property_city = '';
      for (const word of property_address_2_arr){
        property_city += word + " ";
      }
      property_city = property_city.replace(",","").trim();

      console.log('Property Address from web: ', property_address);
      let property_address_parsed = parser.parseLocation(property_address);
      // mailing address
      const mailing_address_xpath = '//td[text()="Mailing Address:"]/parent::tr/td[2]/text()[last() - 1]';
      const mailing_address_2_xpath = '//td[text()="Mailing Address:"]/parent::tr/td[2]/text()[last()]';

      let mailing_address = await this.getTextByXpathFromPage(page, mailing_address_xpath);
      let mailing_address_2 = await this.getTextByXpathFromPage(page, mailing_address_2_xpath);
      if(mailing_address_2 == ''){
        mailing_address = await this.getTextByXpathFromPage(page, '//td[text()="Mailing Address:"]/parent::tr/td[2]/text()[last() - 2]');
        mailing_address_2 = await this.getTextByXpathFromPage(page, '//td[text()="Mailing Address:"]/parent::tr/td[2]/text()[last() - 1]');
      }
      let mailing_address_2_arr = mailing_address_2.split(/\s+/g);
      let mailing_zip = mailing_address_2_arr.pop();
      let mailing_state = mailing_address_2_arr.pop();
      let mailing_city = '';
      for (const word of mailing_address_2_arr){
        mailing_city += word + " ";
      }
      mailing_city = mailing_city.replace(",","").trim();

      const mailing_address_parsed = parser.parseLocation(mailing_address);
      // owner occupied
      const owner_occupied = this.compareAddress(property_address_parsed, mailing_address_parsed);

      try{
        await page.click('a[href="#Sales"]');
      } catch(e){
        //
      }
        // sales info"
      const last_sale_recording_date_xpath = '//th[text()="Sold"]/parent::tr/parent::tbody/tr[2]/td[2]';
      const last_sale_amount_xpath = '//th[text()="Sold"]/parent::tr/parent::tbody/tr[2]/td[3]';
      let last_sale_recording_date = await this.getTextByXpathFromPage(page, last_sale_recording_date_xpath);
      if(last_sale_recording_date == ''){
        last_sale_recording_date = await this.getTextByXpathFromPage(page, '//td[text()="Sold"]/parent::tr/parent::tbody/tr[2]/td[2]');
      }
      let last_sale_amount = await this.getTextByXpathFromPage(page, last_sale_amount_xpath);
      if(last_sale_amount == ''){
        last_sale_recording_date = await this.getTextByXpathFromPage(page, '//td[text()="Sold"]/parent::tr/parent::tbody/tr[2]/td[3]');
      }
      
      try{
        await page.click('a[href="#Land"]');
      } catch(e){
        //
      }
        // property type
       const property_type_xpath = '//th[text()="Land Type"]/parent::tr/parent::tbody/tr[2]/td[1]';
       let property_type = await this.getTextByXpathFromPage(page, property_type_xpath);
       if(property_type == ''){
        property_type = await this.getTextByXpathFromPage(page, '//td[text()="Land Type"]/parent::tr/parent::tbody/tr[2]/td[1]');
       }

      try{
        await page.click('a[href="#Valuation"]');
      } catch(e){
        //
      }
      // assessed value and est. value
      const total_assessed_value_xpath = '//td[contains(., "Total Value")]/parent::tr/td[3]';
      const total_assessed_value = await this.getTextByXpathFromPage(page, total_assessed_value_xpath);
      const est_value_xpath = '//td[contains(., "Total Value")]/parent::tr/td[2]';
      const est_value = await this.getTextByXpathFromPage(page, est_value_xpath);

      const year_built = await this.getTextByXpathFromPage(page, '//td[text()="Year Built:"]/parent::tr/td[2]');

      return {
        owner_names, 
        property_address,
        property_address_parsed,
        mailing_address,
        mailing_city,
        mailing_zip,
        mailing_state,
        property_city,
        property_zip,
        property_state,
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