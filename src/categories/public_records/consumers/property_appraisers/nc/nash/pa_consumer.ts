import puppeteer from 'puppeteer';
import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
const parser = require('parse-address');
const nameParsingService = require('../../consumer_dependencies/nameParsingServiceNew');
var addressit = require('addressit');
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPageOwner: 'https://taxdata.nashcountync.gov/search/commonsearch.aspx?mode=OWNER',
        propertyAppraiserPageAddress: 'https://taxdata.nashcountync.gov/search/commonsearch.aspx?mode=ADDRESS'
    }

    xpaths = {
        isPAloaded: '//*[@id="inpNumber"]'
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
                const parseaddr = this.getAddressV2(document.propertyId);
                parsed_addr = parser.parseLocation(document.propertyId['Property Address']);
                if(!this.isEmptyOrSpaces(parseaddr.street_address)){
                    parsed_addr = parser.parseLocation(parseaddr.street_address);
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
                  await page.goto(this.urls.propertyAppraiserPageOwner);  
                else
                  await page.goto(this.urls.propertyAppraiserPageAddress);
                
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
                  await this.sleep(1000);
                  if(parsed_addr.street){
                    await page.type('input[name="inpStreet"]', parsed_addr.street, {delay: 150});
                  }
                  await this.sleep(1000);
                  if(parsed_addr.sec_unit_num){
                    await page.type('input[name="inpUnit"]', parsed_addr.sec_unit_num, {delay: 150});
                  }
                  if(parsed_addr.prefix){
                    try{
                      await page.select('select[name="inpAdrdir"]', parsed_addr.prefix);
                    } catch(e){
                      //
                    }
                  }
                }

                let [buttonSearch] = await page.$x('//*[@id="btSearch"]');
                await Promise.all([
                  buttonSearch.click(),
                  page.waitForNavigation()
                ]);
                const [hasResult] = await page.$x('//*[@id="searchResults"]/tbody/tr[position()>2]');
                if (!hasResult) {
                  let [found] = await page.$x('//td[contains(., "Owner 1")]/following-sibling::td[1]');
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
                  let name = await row.evaluate(el => el.children[1].children[0].textContent?.trim()) || '';
                  if(this.searchBy == 'name') {
                    const regexp = new RegExp(owner_name_regexp);
                    if (regexp.exec(name.toUpperCase())){
                      await Promise.all([
                        row.click(),
                        page.waitForNavigation({waitUntil: 'networkidle0'})
                      ]);
                      try{
                        let result = await this.getPropertyInfos(page);
                        if (result) await this.parseResult(result, document);
                      } catch(e){
                        console.log(e);
                      }
                      let [backButton] = await page.$x('//span[text()="Return to Search Results"]');
                      await Promise.all([
                          backButton.click(),
                          page.waitForNavigation()
                      ]);
                      rows = await page.$x('//*[@id="searchResults"]/tbody/tr[position()>2]');
                    }
                  } else {
                    await Promise.all([
                      row.click(),
                      page.waitForNavigation()
                    ]);
                    try{
                        let result = await this.getPropertyInfos(page);
                        if (result) await this.parseResult(result, document);
                        break;
                    } catch(e){
                        console.log(e);
                        console.log('Not found!');
                    }
                    break;
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
      const full_name_xpath = '//td[contains(., "Owner 1")]/following-sibling::td[1]';
      let full_name: any = await this.getTextByXpathFromPage(page, full_name_xpath);
      full_name = full_name.split('&').map((s:string)=>s.trim()).filter((s:string)=>s!=='')[0];
      full_name = full_name.replace(/\W|\s+/g, ' ').trim();
      let parseName = this.parseOwnerName(full_name);
      const owner_names = [parseName];

      // property address
      const property_address_xpath = '//td[contains(., "Physical Address")]/following-sibling::td[1]';
      let property_address = await this.getTextByXpathFromPage(page, property_address_xpath);
      property_address = property_address.replace(/\W|\s+/g, ' ').trim();
      const property_address_parsed = parser.parseLocation(property_address);
      
      // mailing address
      const mailing_address_xpath = '//td[contains(., "Mailing Address")]/following-sibling::td[1]';
      const mailing_address_2_xpath = '//td[contains(., "City/State/Zip")]/following-sibling::td[1]';

      let mailing_address = await this.getTextByXpathFromPage(page, mailing_address_xpath);
      let mailing_address_2 = await this.getTextByXpathFromPage(page, mailing_address_2_xpath);
      let mailing_address_2_arr = mailing_address_2.split('/');
      let mailing_zip = mailing_address_2_arr.pop();
      let mailing_state = mailing_address_2_arr.pop();
      let mailing_city = mailing_address_2_arr.pop();
      const mailing_address_parsed = parser.parseLocation(mailing_address);

      let owner_occupied;
      try{
        owner_occupied = this.compareAddress(property_address_parsed, mailing_address_parsed);
      } catch(e){
        owner_occupied = false;
      }

      // property type
      const property_type_xpath = '//td[contains(., "Land Use Code")]/following-sibling::td[1]';
      const property_type = await this.getTextByXpathFromPage(page, property_type_xpath);

      let salesTab = await page.$x('//a[contains(., "Sales")]');
      await Promise.all([
        salesTab[0].click(),
        page.waitForNavigation()
      ])
      // sales info"
      const last_sale_recording_date_xpath = '//table[@id="Sales"]/tbody/tr[2]/td[1]';
      const last_sale_recording_date = await this.getTextByXpathFromPage(page, last_sale_recording_date_xpath);
      const last_sale_amount_xpath = '//table[@id="Sales"]/tbody/tr[2]/td[2]';
      const last_sale_amount = await this.getTextByXpathFromPage(page, last_sale_amount_xpath);

      let valueTab = await page.$x('//a[contains(., "Values")]');
      await Promise.all([
        valueTab[0].click(),
        page.waitForNavigation()
      ])
      // assessed value and est. value
      const total_assessed_value = await this.getTextByXpathFromPage(page, '//td[contains(., "Total Taxable Value")]/following-sibling::td[1]');
      const est_value_xpath = '//td[contains(., "Total Value")]/following-sibling::td[1]';
      const est_value = await this.getTextByXpathFromPage(page, est_value_xpath);

      return {
        owner_names, 
        property_address,
        mailing_address,
        mailing_zip,
        mailing_state,
        mailing_city,
        owner_occupied,
        property_type, 
        total_assessed_value, 
        last_sale_recording_date, 
        last_sale_amount, 
        est_value
      }
    }

    getStreetAddress(full_address:string): any {
      const parsed = addressit(full_address);
      let street_address = (parsed.number ? parsed.number : '') + ' ' + (parsed.street ? parsed.street : '') + ' ' + (parsed.unit ? '#'+parsed.unit : '');
      street_address = street_address.replace(/\s+/, ' ').trim();
      return street_address;
    }
}