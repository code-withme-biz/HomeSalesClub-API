import puppeteer from 'puppeteer';
import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
const parser = require('parse-address');
// const {parseFullName} = require('parse-full-name');
const nameParsingService = require('../../consumer_dependencies/nameParsingServiceNew');

import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'https://qpublic.schneidercorp.com/Application.aspx?AppID=1081&LayerID=26490&PageTypeID=2&PageID=10768'
    }

    xpaths = {
        isPAloaded: '//input[@name="ctlBodyPane$ctl01$ctl01$txtAddressExact"]'
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
     * check if element exists
     * @param page 
     * @param selector 
     */
    async checkExistElement(page: puppeteer.Page, selector: string): Promise<Boolean> {
      const exist = await page.$(selector).then(res => res !== null);
      return exist;
    }

    /**
     * get textContent from specified element
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

    async getTextByXpathFromPage(page: puppeteer.Page, xPath: string): Promise<string> {
      const [elm] = await page.$x(xPath);
      if (elm == null) {
          return '';
      }
      let text = await page.evaluate(j => j.textContent, elm);
      return text.trim();
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
        // console.log(`Documents to look up: ${docsToParse.length}.`);
        const page = this.browserPages.propertyAppraiserPage;
        if (page === undefined) return false;
        let document = docsToParse;
        
            // let docToSave: any = await this.getLineItemObject(document);
            if (!this.decideSearchByV2(document)) {
                console.log('Insufficient info for Owner and Property');
                return false;
            }
            
            // do everything that needs to be done for each document here
            // parse address
            // let address;
            let street_addr = '';
            
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
              console.log(`Looking for Owner: ${owner_name}`);
            }
            else {
              let parsev1 = parser.parseLocation(document.propertyId['Property Address']);
              const parsev2 = this.getAddressV2(document.propertyId);
              if(!this.isEmptyOrSpaces(parsev2.street_address)){
                parsev1 = parser.parseLocation(parsev2.street_address);
              }
              if(!parsev1 || (!parsev1.number && !parsev1.street)){
                console.log('The street number and name is missing!');
                return false;
              }
              if(parsev1.number){
                while(parsev1.number[0] == '0'){
                  let arr = parsev1.number.split('');
                  arr.shift();
                  parsev1.number = arr.join('');
                }
              }
              street_addr = ((parsev1.number ? parsev1.number : '') + ' ' + (parsev1.prefix ? parsev1.prefix : '') + ' ' + (parsev1.street ? parsev1.street : '') + ' ' + (parsev1.type ? parsev1.type : '')).trim();
              console.log(`Looking for Address: ${street_addr}`);
            }

            let retry_count = 0;
            while (true){
              if (retry_count > 3){
                  console.error('Connection/website error for 15 iteration.');
                  return false;
              }
              try {
                await page.goto(this.urls.propertyAppraiserPage, { waitUntil: 'networkidle2'});
              } catch (error) {
                await page.reload();
              }
          
              try {                
                const agree_button_xpath = '//a[text()="Agree"]';
                const agree_button_handle = await page.$x(agree_button_xpath);
                if (agree_button_handle && agree_button_handle.length > 0) {
                  await agree_button_handle[0].click();
                }

                if (this.searchBy === 'name') {
                  const inputHandle = await page.$('input[id$="_txtName"]');
                  if (!inputHandle) break;
                  await inputHandle.type(owner_name, {delay: 150});
                  await Promise.all([
                    inputHandle.type(String.fromCharCode(13), {delay: 150}),
                    page.waitForNavigation()
                  ]);
                  const rows = await page.$x('//table[contains(@id, "_gvwParcelResults")]/tbody/tr');
                  if (rows.length === 0) {
                    console.log("No results found");
                    break;
                  }
                  let index = 0;
                  const datalinks = [];
                  for (const row of rows) {
                    let name = await page.evaluate(el => el.children[3].textContent, row);
                    name = name.replace(/\n|\s+/gm, ' ').trim();
                    const regexp = new RegExp(owner_name_regexp);
                    if (regexp.exec(name.toUpperCase())) {
                      const datalink = await page.evaluate(el => el.children[1].children[0].href, row);
                      datalinks.push(datalink);
                    }
                    index++;
                  }

                  for (const datalink of datalinks) {
                    await page.goto(datalink, {waitUntil: 'load'});
                    const result = await this.getPropertyInfos(page);
                    await this.parseResult(result, document);
                  }
                }
                else {
                  const inputHandle = await page.$('input[id$="_txtAddressExact"]');
                  console.log(await inputHandle?.evaluate(el => el.textContent));
                  if (!inputHandle) break;
                  await page.$eval('#ctlBodyPane_ctl01_ctl01_txtAddressExact', (el:any, value:any) => el.value = value, street_addr); // Send keys
                  await Promise.all([
                    inputHandle.type(String.fromCharCode(13), {delay: 150}),
                    page.waitForNavigation({waitUntil: 'networkidle0'})
                  ]);
                  let checkFound = await page.$('span[id$="_lblOwnerAddress"]');
                  if(!checkFound){
                    console.log('Not found!');
                    break;
                  }
                  const result = await this.getPropertyInfos(page);
                  await this.parseResult(result, document);
                }               
                  
                break;                    
              } catch (error) {
                console.log(error);
                console.log('retrying... ', retry_count);
                retry_count++;
                await page.waitFor(Math.ceil(Math.random()*5000)+5000);
              }    
            }           
            await page.waitFor(Math.ceil(Math.random()*5000)+5000);            
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
        'Property City': result['property_city'],
        'Property State': 'FL',
        'Property Zip': result['property_zip'],
        'County': 'Alachua',
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
      // name and addr
      const owner_names = [];
      const name_addr_selector = 'span[id$="_lblOwnerAddress"]';
      let name_addr: any = await this.getElementTextContent(page, name_addr_selector);
      name_addr = name_addr.split('\n').filter((e: string) => e.trim() !== '');

      // property address
      const property_address_xpath = '//span[@id="ctlBodyPane_ctl00_ctl01_lblLocationAddress"]';
      const property_address_2_xpath = '//span[@id="ctlBodyPane_ctl00_ctl01_lblCityStZip"]';
      let property_address = await this.getTextByXpathFromPage(page, property_address_xpath);
      let property_address_parsed = parser.parseLocation(property_address);
      let property_address_2 = await this.getTextByXpathFromPage(page, property_address_2_xpath);
      let property_address_2_arr = property_address_2.split(/\s+/g);
      let property_zip = property_address_2_arr.pop();
      let property_state = property_address_2_arr.pop();
      let property_city = '';
      for (const word of property_address_2_arr){
        property_city += word + " ";
      }
      property_city = property_city.trim();

      // mailing address
      let mailing_address = name_addr.splice(name_addr.length-2).join(' ').replace(/\s+/gm, ' ');
      const mailing_address_parsed = parser.parseLocation(mailing_address);

      // name
      for (const name of name_addr) {
        const owner_name_arr = name.split('&');
        for (let owner_name_iter of owner_name_arr) {
          if (owner_name_iter.trim() === '') break;
          const ownerName = this.parseOwnerName(owner_name_iter.trim());
          owner_names.push(ownerName);
        }
      }

      // owner occupied
      let owner_occupied: any = false;
      if(property_address_parsed != null){
        owner_occupied = this.compareAddress(property_address_parsed, mailing_address_parsed);
      }
      // property type
      const property_type_xpath = '//*[text()="Type"]/ancestor::tr[1]/td';
      let property_type = await this.getTextContentByXpathFromPage(page, property_type_xpath);
      property_type = property_type.replace(/^.+- /g, '').trim();

      // sales info
      const last_sale_recording_date_xpath = '//th[text()="Sale Date"]/parent::tr/parent::thead/following-sibling::tbody/tr[1]/td[1]';
      const last_sale_amount_xpath = '//th[text()="Sale Date"]/parent::tr/parent::thead/following-sibling::tbody/tr[1]/td[2]';
      const last_sale_recording_date = await this.getTextContentByXpathFromPage(page, last_sale_recording_date_xpath);
      const last_sale_amount = await this.getTextContentByXpathFromPage(page, last_sale_amount_xpath);

      // assessed value and est. value
      const total_assessed_value_xpath = '//th[text()="Assessed Value"]/following-sibling::td';
      const est_value_xpath = '//th[text()="Improvement Value"]/following-sibling::td';
      const total_assessed_value = await this.getTextContentByXpathFromPage(page, total_assessed_value_xpath);
      const est_value = await this.getTextContentByXpathFromPage(page, est_value_xpath);

      // year built
      const year_built_xpath = '//*[text()="Actual Year Built"]/parent::th[1]/following-sibling::td[1]';
      const year_built = await this.getTextContentByXpathFromPage(page, year_built_xpath);

      return {
        owner_names, 
        property_address,
        property_city,
        property_state,
        property_zip,
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