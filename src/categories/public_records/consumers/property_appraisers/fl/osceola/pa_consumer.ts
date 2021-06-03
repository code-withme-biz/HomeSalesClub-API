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
        propertyAppraiserPage: 'https://ira.property-appraiser.org/PropertySearch/'
    }

    xpaths = {
        isPAloaded: '//*[@id="btnSearch"]'
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
     * getTextByXpathFromPage
     * @param page 
     * @param xPath 
     */
    async getTextByXpathFromPage(page: puppeteer.Page, xPath: string): Promise<string> {
      const [elm] = await page.$x(xPath);
      if (elm == null) {
          return '';
      }
      let text = await page.evaluate(j => j.textContent, elm) || '';
      text = text.replace(/\s+|\n/gm, ' ').trim();
      return text;
    }

    async getInnerTextByXpathFromPage(page: puppeteer.Page, xPath: string): Promise<string> {
      const [elm] = await page.$x(xPath);
      if (elm == null) {
          return '';
      }
      let text = await page.evaluate(j => j.innerText, elm);
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
        let index = 0;
        
        
          let document = docsToParse;

            index++;
            console.log('~ @ ~ @ ~ @ ~ @ ~ @ ~ @ ~ @ ~ @ ~ @ ~ @ ~');
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
              const nameInfo = this.getNameInfo(document.ownerId, ",");
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
                const client = await page.target().createCDPSession();
                await client.send('Network.clearBrowserCookies');
                await page.goto(this.urls.propertyAppraiserPage, { waitUntil: 'load'});
              } catch (error) {
                await page.reload();
              }
              try {
                await page.waitForSelector('input#txtAddress');
                if (this.searchBy == 'name'){
                    await page.click('input#txtOwnerName', {clickCount: 3, delay: 150});
                    await page.type('input#txtOwnerName', search_value, {delay: 150});
                } else {
                    const [addressInput] = await page.$x('//*[@id="txtAddress"]');
                    await addressInput.click({clickCount: 3});
                    await addressInput.press('Backspace');
                    await addressInput.type(search_value, {delay: 150});
                    await addressInput.press('Escape');
                }
                let buttonSearch = await page.$x('//button[@id="btnSearch"]');
                await Promise.all([
                    buttonSearch[0].click(),
                    page.waitForSelector('.ajax-working', {visible: true}),
                    page.waitForSelector('.ajax-working', {hidden: true}),
                ]);
                await this.sleep(1000);
                await Promise.race([
                  page.waitForXPath('//*[contains(text(), "The search did not return any results")]'),
                  page.waitForXPath('//table[@id="search-result-table"]/tbody/tr')
                ]);
                const [noresult] = await page.$x('//*[contains(text(), "The search did not return any results")]');
                if (noresult) {
                  console.log('*** No Results Found!');
                  break;
                }
                if(this.searchBy == 'name'){
                  while (true) {
                    const rows = await page.$x('//table[@id="search-result-table"]/tbody/tr');
                    for(const row of rows){
                      try{
                        let name = await row.evaluate(el => el.children[1].textContent?.trim()) || '';
                        console.log(name);
                        const regexp = new RegExp(owner_name_regexp);
                        if (regexp.exec(name.toUpperCase())){
                            await this.getData(page, row, document);
                        }
                      } catch(e){
                          console.log(e);
                      }
                    }
                    const [hasnext] = await page.$x('//*[@title="Next page"]/parent::li[1]');
                    if (hasnext) {
                      await hasnext.click();
                      await page.waitForSelector('.ajax-working', {visible: true});
                      await page.waitForSelector('.ajax-working', {hidden: true});
                    } else {
                      break;
                    }
                  }
                } else {
                  // while (true) {
                    const rows = await page.$x(`//table[@id="search-result-table"]/tbody/tr/td[contains(text(), "${search_value}")]/parent::tr[1]`);
                    for (const row of rows) {
                      await this.getData(page, row, document);
                      if (this.searchBy === 'address') break;
                    }
                    // const [hasnext] = await page.$x('//*[@title="Next page"]/parent::li[1]');
                    // if (hasnext) {
                    //   await hasnext.click();
                    //   await page.waitForSelector('.ajax-working', {visible: true});
                    //   await page.waitForSelector('.ajax-working', {hidden: true});
                    // } else {
                    //   break;
                    // }
                  // }
                }
                break;
              } catch (error) {
                console.log(error);
                console.log('retrying... ', retry_count);
                retry_count++;
                await page.waitFor(1000);
              } 
            }
        // }
        return true;
    }

    async getData(page: puppeteer.Page, row: puppeteer.ElementHandle<Element>, document: IOwnerProductProperty) {
      await row.click();
      await page.waitForXPath('//*[@data-contentid="#parcelResult"][@class="current"]');
      await page.waitForSelector('.ajax-working', {visible: true});
      await page.waitForSelector('.ajax-working', {hidden: true});
      await this.sleep(500);
      let result = await this.getPropertyInfos(page);
      await this.parseResult(result, document);
      await page.click('li[data-contentid="#searchResults"]');
      await this.sleep(500);
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
          'Property State': this.publicRecordProducer.state,
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
      console.log(dataFromPropertyAppraisers);
      try{
        await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
      } catch(e){
        //
      }
    }

    async getPropertyInfos(page: puppeteer.Page): Promise<any> {
      // name
      const full_name_xpath = '//*[text()="Owner Name"]/following-sibling::td[1]';
      await page.waitForXPath(full_name_xpath, {visible: true});
      let full_name: any = await this.getInnerTextByXpathFromPage(page, full_name_xpath);
      const owner_names = [];
      full_name = full_name.split("\n");
      full_name = full_name.filter((name:string) => name.trim() !== '');
      full_name = full_name[0].trim();
      let parseName = this.parseOwnerName(full_name);
      owner_names.push(parseName);

      // property address
      const property_address_full_xpath = '//*[text()="Physical Address"]/following-sibling::td[1]';
      let property_address = await this.getTextByXpathFromPage(page, property_address_full_xpath);
      let property_address_parsed = parser.parseLocation(property_address);
      let property_zip = '';
      let property_state = '';
      let property_city = '';
      if(property_address_parsed){
        property_zip = property_address_parsed.zip ? property_address_parsed.zip : '';
        property_state = property_address_parsed.state ? property_address_parsed.state : '';
        property_city = property_address_parsed.city ? property_address_parsed.city : '';
      }

      // mailing address
      const mailing_address_full_xpath = '//*[text()="Mailing Address"]/following-sibling::td[1]';
      let mailing_address = await this.getTextByXpathFromPage(page, mailing_address_full_xpath);
      let mailing_address_parsed = parser.parseLocation(mailing_address);
      let mailing_zip = '';
      let mailing_state = '';
      let mailing_city = '';
      if(mailing_address_parsed){
        mailing_zip = mailing_address_parsed.zip ? mailing_address_parsed.zip : '';
        mailing_state = mailing_address_parsed.state ? mailing_address_parsed.state : '';
        mailing_city = mailing_address_parsed.city ? mailing_address_parsed.city : '';
      }

      // owner occupied
      let owner_occupied = mailing_address === property_address;

      // sales info"
      const last_sale_recording_date_xpath = '//*[text()="ORB-Pg"]/ancestor::table[1]/tbody/tr[1]/td[4]';
      const last_sale_amount_xpath = '//*[text()="ORB-Pg"]/ancestor::table[1]/tbody/tr[1]/td[3]';
      const last_sale_recording_date = await this.getTextByXpathFromPage(page, last_sale_recording_date_xpath);
      const last_sale_amount = await this.getTextByXpathFromPage(page, last_sale_amount_xpath);

      // property type
      const property_type_xpath = '//*[text()="Land Description"]/ancestor::table[1]/tbody/tr[1]/td[1]';
      const property_type = await this.getTextByXpathFromPage(page, property_type_xpath);

      // assessed value and est. value
      const total_assessed_value_xpath = '//*[text()="Assessed*"]/following-sibling::td[1]';
      const total_assessed_value = await this.getTextByXpathFromPage(page, total_assessed_value_xpath);
      const est_value_xpath = '//*[text()="Assessed(estimated)"]/following-sibling::td[1]'
      const est_value = await this.getTextByXpathFromPage(page, est_value_xpath);
      
      // yearBuilt
      const year_built_xpath = '//th[text()="Year Built"]/following-sibling::td[1]';
      const year_built = await this.getTextByXpathFromPage(page, year_built_xpath);
      
      return {
        owner_names, 
        property_address,
        property_city,
        property_state,
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