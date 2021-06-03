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
        propertyAppraiserPageOwner: 'https://www.citruspa.org/_web/search/commonsearch.aspx?mode=owner',
        propertyAppraiserPageAddress: 'https://www.citruspa.org/_web/search/commonsearch.aspx?mode=address'
    }

    xpaths = {
        isPAloaded: '//*[@class="AkandaCopyright"]'
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
          await this.browserPages.propertyAppraiserPage.goto(this.urls.propertyAppraiserPageAddress, { waitUntil: 'load' });
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
    async parseAndSave(docsToParse: IOwnerProductProperty): Promise<boolean>   {
        const page = this.browserPages.propertyAppraiserPage;
        if (page === undefined) return false;
        let document = docsToParse;
            if (!this.decideSearchByV2(document)) {
              return false;
            }
            
            // do everything that needs to be done for each document here
            // parse address
            let first_name = '';
            let last_name = '';
            let owner_name = '';
            let owner_name_regexp = '';
            let parsed_addr;
            let search_value = '';

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
                search_value = document.propertyId['Property Address'];
                const parseaddr = this.getAddressV2(document.propertyId);
                parsed_addr = parser.parseLocation(document.propertyId['Property Address']);
                if(!this.isEmptyOrSpaces(parseaddr.street_address)){
                    parsed_addr = parser.parseLocation(parseaddr.street_address);
                    search_value = parseaddr.street_address;
                }
                if(!parsed_addr || !parsed_addr.street || !parsed_addr.number){
                    console.log('The street number and name is missing!');
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
                if (this.searchBy === 'name')
                  await page.goto(this.urls.propertyAppraiserPageOwner, { waitUntil: 'networkidle0'});  
                else
                  await page.goto(this.urls.propertyAppraiserPageAddress, { waitUntil: 'networkidle0'});
                
                // disclaimer
                const [btAgree] = await page.$x('//*[@id="btAgree"]');
                if (btAgree) {
                  await Promise.all([
                    btAgree.click(),
                    page.waitForNavigation({waitUntil: 'networkidle0'})
                  ]);
                }
                await page.waitForXPath('//*[@id="btSearch"]');
              } catch (error) {
                await page.reload();
              }
              try {
                if (this.searchBy === 'name') {
                  await page.type('input#inpOwner', owner_name, {delay: 150});
                } else {
                  if(parsed_addr.number){
                    await page.type('input[name="inpNumber"]', parsed_addr.number, {delay: 150});
                  }
                  if(parsed_addr.street){
                    await page.type('input[name="inpStreet"]', parsed_addr.street, {delay: 150});
                  }
                  if(parsed_addr.prefix){
                    try{
                        await page.select('select[name="inpAdrdir"]', parsed_addr.prefix);
                    } catch(e){

                    }
                  }
                }

                let [buttonSearch] = await page.$x('//*[@id="btSearch"]');
                await Promise.all([
                  buttonSearch.click(),
                  page.waitForNavigation({waitUntil: 'networkidle0'})
                ]);
                const [hasResult] = await page.$x('//*[@id="searchResults"]/tbody/tr[position()>2]');
                if (!hasResult) {
                  let [found] = await page.$x('//td[text()="Mailing Address"]/parent::tr/td[2]/text()[1]');
                  if(found){
                    let result = await this.getPropertyInfos(page);
                    if (result) await this.parseResult(result, document);
                  } else {
                    console.log('Not found!');
                  }
                  break;
                }
                                
                let rows = await page.$x('//*[@id="searchResults"]/tbody/tr[position()>2]');
                for(let i = 0; i < rows.length; i++) {
                    const row = rows[i];
                    let name = await row.evaluate(el => el.children[3].children[0].textContent?.trim()) || '';
                    let address = await row.evaluate(el => el.children[4].children[0].textContent?.trim()) || ''; 
                    if(this.searchBy == 'name') {
                      const regexp = new RegExp(owner_name_regexp);
                      if (regexp.exec(name.toUpperCase())){
                        await Promise.all([
                          row.click(),
                          page.waitForNavigation()
                        ]);
                        let result = await this.getPropertyInfos(page);
                        if (result) await this.parseResult(result, document);
                        let [backButton] = await page.$x('//span[text()="Return to Search Results"]');
                        await Promise.all([
                            backButton.click(),
                            page.waitForNavigation()
                        ]);
                        rows = await page.$x('//*[@id="searchResults"]/tbody/tr[position()>2]');
                      }
                    } else {
                      if(this.compareStreetAddress(address, search_value)){
                        await Promise.all([
                          row.click(),
                          page.waitForNavigation()
                        ]);
                        let result = await this.getPropertyInfos(page);
                        if (result) await this.parseResult(result, document);
                        break;
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
      // name
      const full_name_xpath = '//td[text()="Name"]/parent::tr/td[2]';
      let full_name = await this.getTextByXpathFromPage(page, full_name_xpath);
      const owner_names = [];
      full_name = full_name.split("&")[0].trim();
      let parseName = this.parseOwnerName(full_name);
      owner_names.push(parseName);

      // property address
      const property_address_xpath = '//tr[@id="datalet_header_row"]/td/table/tbody/tr[3]/td[2]';
      let property_address = await this.getTextByXpathFromPage(page, property_address_xpath);
      let property_address_arr = property_address.split(',');
      property_address = property_address_arr[0].trim();
      let property_city = property_address_arr[1].trim();
      const property_address_parsed = parser.parseLocation(property_address);
      
      // mailing address
      const mailing_address_xpath = '//td[text()="Mailing Address"]/parent::tr/td[2]';
      let mailing_address = await this.getTextByXpathFromPage(page, mailing_address_xpath);
      const mailing_address_parsed = parser.parseLocation(mailing_address);
      const mailing_address_2_xpath = '//td[text()="Mailing Address"]/parent::tr/following::*[1]/td[2]';
      let mailing_address_2 = await this.getTextByXpathFromPage(page, mailing_address_2_xpath);
      let mailing_address_2_arr = mailing_address_2.split(/\s+/g);
      let mailing_zip = mailing_address_2_arr.pop();
      let mailing_state = mailing_address_2_arr.pop();
      let mailing_city = '';
      for (const word of mailing_address_2_arr){
        mailing_city += word + " ";
      }
      mailing_city = mailing_city.trim();
      // owner occupied
      let owner_occupied;
      try{
        owner_occupied = this.compareAddress(property_address_parsed, mailing_address_parsed);
      } catch(e){
        owner_occupied = false;
      }

      // property type
      const property_type_xpath = '//td[text()="PC Code"]/parent::tr/td[2]';
      const property_type = await this.getTextByXpathFromPage(page, property_type_xpath);

      // assessed value and est. value
      const total_assessed_value_xpath = '//table[@id="Value History and Tax Amount"]/tbody/tr[2]/td[5]';
      const total_assessed_value = await this.getTextByXpathFromPage(page, total_assessed_value_xpath);
      const est_value_xpath = '//table[@id="Value History and Tax Amount"]/tbody/tr[2]/td[4]';
      const est_value = await this.getTextByXpathFromPage(page, est_value_xpath);

      // sales info"
      const last_sale_recording_date_xpath = '//table[@id="Sales"]/tbody/tr[2]/td[1]';
      const last_sale_recording_date = await this.getTextByXpathFromPage(page, last_sale_recording_date_xpath);
      const last_sale_amount_xpath = '//table[@id="Sales"]/tbody/tr[2]/td[2]';
      const last_sale_amount = await this.getTextByXpathFromPage(page, last_sale_amount_xpath);

      return {
        owner_names, 
        property_address,
        property_city,
        mailing_address,
        mailing_city,
        mailing_state,
        mailing_zip,
        owner_occupied,
        property_type, 
        total_assessed_value, 
        last_sale_recording_date, 
        last_sale_amount, 
        est_value
      }
    }

}