import puppeteer from 'puppeteer';
import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
const parser = require('parse-address');
const nameParsingService = require('../../consumer_dependencies/nameParsingServiceNew');

import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';
import AddressService from '../../../../../../services/address_service';

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'https://www.webgis.net/nc/rockingham/'
    }

    xpaths = {
        isPAloaded: '//input[@id="searchParcelOwner"]'
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
        if (page === undefined) return false;
        let document = docsToParse;
            if (!this.decideSearchByV2(document)) {
              return false;
            }

            

            // do everything that needs to be done for each document here
            // parse address
            let search_value = '';
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
                search_value = document.propertyId['Property Address'];
                const parseaddr = this.getAddressV2(document.propertyId);
                if(!this.isEmptyOrSpaces(parseaddr.street_address)){
                    search_value = parseaddr.street_address;
                }
                search_value = search_value.toUpperCase();
                console.log(`Looking for address: ${document.propertyId['Property Address']}`);
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
                await page.waitForSelector('input#searchParcelOwner');
                if (this.searchBy == 'name'){
                    await page.type('input#searchParcelOwner', search_value, {delay: 150});
                } else {
                    await page.select('select#setSearch', 'Address');
                    await this.sleep(1000);
                    await page.type('input#searchAddress', search_value, {delay: 150});
                }
                await page.keyboard.press('Enter');
                await Promise.race([
                    page.waitForXPath('//div[@role="row"]'),
                    page.waitForXPath('//div[text()="No records found."]')
                ]);

                const search_results = await page.$x('//div[@role="row"]');
                if(search_results.length < 2){
                    console.log("Not found!");
                    break;
                }
                const datalinks: any = [];
                search_results.shift();
                if(this.searchBy == 'name'){
                    for(const row of search_results){
                        let link = await row.evaluate(el => el.children[0].children[0].children[0].textContent?.trim());
                        link = "https://www.webgis.net/nc/rockingham/PropertyCard.php?pid=" + link?.trim();
                        let name1 = await row.evaluate(el => el.children[0].children[0].children[1].textContent?.trim());
                        let name2 = await row.evaluate(el => el.children[0].children[0].children[2].textContent?.trim());
                        let name = (name1 + ' & ' + name2).trim();
                        const regexp = new RegExp(owner_name_regexp);
                        if (regexp.exec(name!.toUpperCase())){
                            datalinks.push(link);
                        }
                    }
                } else {
                    for(const row of search_results){
                        let address = await row.evaluate(el => el.children[0].children[0].children[1].textContent?.trim()) || '';
                        let source = await row.evaluate(el => el.children[0].children[0].children[2].textContent?.trim()) || '';

                        if(this.compareStreetAddress(address, search_value) && source == 'Structure'){
                            await row.click();
                            await page.waitForXPath('//span[text()="Parcel Number:"]/following-sibling::span[1]');
                            let link = await this.getTextByXpathFromPage(page, '//span[text()="Parcel Number:"]/following-sibling::span[1]');
                            if(link != ''){
                                link = "https://www.webgis.net/nc/rockingham/PropertyCard.php?pid=" + link?.trim();
                                datalinks.push(link);
                                break;
                            }
                        }
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
          'yearBuilt': '',
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
      let source = await this.getTextByXpathFromPage(page, '//pre[@class="page1"]');
      // name
      let full_name, property_address, property_city, mailing_address, mailing_address_2, mailing_city, mailing_zip, mailing_state, last_sale_amount, last_sale_recording_date, est_value, total_assessed_value, property_type = '';
      let regex = /(.*?)\s+PARCEL ID/gm;
      let i = 0;
      let m;
      while ((m = regex.exec(source)) !== null) {
        // This is necessary to avoid infinite loops with zero-width matches
        if (m.index === regex.lastIndex) {
            regex.lastIndex++;
        }
        
        // The result can be accessed through the `m`-variable.
        if(i == 0){
            full_name = m[1].trim();
            break;
        }
        i++;
      }
      const owner_names = [];
      full_name = full_name?.split("&")[0].trim();
      let parseName = this.parseOwnerName(full_name!);
      owner_names.push(parseName);

      // property address
      
      regex = /LOCATION\.\.\.\s+(.*)/gm;
      i = 0;
      while ((m = regex.exec(source)) !== null) {
        // This is necessary to avoid infinite loops with zero-width matches
        if (m.index === regex.lastIndex) {
            regex.lastIndex++;
        }
        
        // The result can be accessed through the `m`-variable.
        if(i == 0){
            property_address = m[1].trim();
            break;
        }
        i++;
      }
      property_address = property_address?.replace(/\s+/, ' ');
      let property_address_parsed = parser.parseLocation(property_address);

      // mailing address
      let mailing_address_full = '';
      regex = /(.*?)\s+PLAT BOOK\/PAGE/gm;
      i = 0;
      while ((m = regex.exec(source)) !== null) {
        // This is necessary to avoid infinite loops with zero-width matches
        if (m.index === regex.lastIndex) {
            regex.lastIndex++;
        }
        
        // The result can be accessed through the `m`-variable.
        if(i == 0){
            mailing_address = m[1].trim();
            break;
        }
        i++;
      }
      mailing_address_full += mailing_address?.replace(/\s+/g, ' ') + ', ';

      regex = /(.*?)\s+NBRHOOD/gm;
      i = 0;
      while ((m = regex.exec(source)) !== null) {
        // This is necessary to avoid infinite loops with zero-width matches
        if (m.index === regex.lastIndex) {
            regex.lastIndex++;
        }
        
        // The result can be accessed through the `m`-variable.
        if(i == 0){
            mailing_address_2 = m[1].trim();
            break;
        }
        i++;
      }
      mailing_address_full += mailing_address_2?.replace(/\s+/g, ' ');

      let mailing_address_full_parsed = AddressService.getParsedAddress(mailing_address_full);
      console.log('mailing address:', mailing_address_full_parsed);
      mailing_address = mailing_address_full_parsed?.street_address;
      mailing_city = mailing_address_full_parsed?.city;
      mailing_zip = mailing_address_full_parsed?.zip;
      mailing_state = mailing_address_full_parsed?.state;

      const mailing_address_parsed = parser.parseLocation(mailing_address);

      // owner occupied
      let owner_occupied;
      try{
        owner_occupied = this.compareAddress(property_address_parsed, mailing_address_parsed);
      } catch(e){
        owner_occupied = false;
      }

      // sales info"
      regex = /DEED NAME\n\n.*?(\d+\/\d+\/\d+)/gm;
      i = 0;
      while ((m = regex.exec(source)) !== null) {
        // This is necessary to avoid infinite loops with zero-width matches
        if (m.index === regex.lastIndex) {
            regex.lastIndex++;
        }
        
        // The result can be accessed through the `m`-variable.
        if(i == 0){
            last_sale_recording_date = m[1].trim();
            break;
        }
        i++;
      }

      regex = /DEED NAME\n\n.*?([0-9,]+),([0-9,]+)/gm;
      i = 0;
      let str1, str2 = '';
      while ((m = regex.exec(source)) !== null) {
        // This is necessary to avoid infinite loops with zero-width matches
        if (m.index === regex.lastIndex) {
            regex.lastIndex++;
        }
        
        // The result can be accessed through the `m`-variable.
        if(i == 0){
            str1 = m[1].trim();
            str2 = m[2].trim();
            break;
        }
        i++;
      }
      last_sale_amount = (str1 + str2).trim();
      if(last_sale_amount == 'undefined'){
        last_sale_amount = '';
      }

      // property type
      regex = /DESCRIPTION\s+(.*)/gm;
      i = 0;
      while ((m = regex.exec(source)) !== null) {
        // This is necessary to avoid infinite loops with zero-width matches
        if (m.index === regex.lastIndex) {
            regex.lastIndex++;
        }
        
        // The result can be accessed through the `m`-variable.
        if(i == 0){
            property_type = m[1].trim();
            break;
        }
        i++;
      }

      // assessed value and est. value
      regex = /FMV\.+\s+\S+\s+\S+\s+\S+\s+(.*)/gm;
      i = 0;
      while ((m = regex.exec(source)) !== null) {
        // This is necessary to avoid infinite loops with zero-width matches
        if (m.index === regex.lastIndex) {
            regex.lastIndex++;
        }
        
        // The result can be accessed through the `m`-variable.
        if(i == 2){
            est_value = m[1].trim();
            break;
        }
        i++;
      }
      return {
        owner_names, 
        property_address,
        property_city,
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
        est_value
      }
    }
}