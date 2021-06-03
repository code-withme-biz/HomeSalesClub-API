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
        propertyAppraiserPage: 'http://www.gwinnettassessor.manatron.com/IWantTo/PropertyGISSearch.aspx'
    }

    xpaths = {
        isPAloaded: '//input[@id="fldSearchFor"]'
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
     * convert address to required infos
     * @param document : IPublicRecordAttributes 
     *  full_address:  1527 N 23rd St, Lincoln, NE 68503
        street_name:   23rd St
        street_full:   1527 N 23rd St
        parsed
            number:     1527
            prefix:     N
            street:     23rd
            type:     St
            city:       Lincoln
            state:      NE
            zip:        68503
     */
    getAddress(document: IPublicRecordAttributes): any {
      // 'Property Address': '162 DOUGLAS HILL RD',
      // 'Property City': 'WEST BALDWIN',
      // County: 'Cumberland',
      // 'Property State': 'ME',
      // 'Property Zip': '04091',
      const full_address = `${document['Property Address']}, ${document['Property City']}, ${document['Property State']} ${document['Property Zip']}`
      const parsed = parser.parseLocation(full_address);
      
      let street_name = parsed.street.trim();
      let street_full = document['Property Address'];
      let street_with_type = (parsed.street + ' ' + (parsed.type ? parsed.type : '')).trim();

      return {
        full_address,
        street_name,
        street_with_type,
        street_full,
        parsed
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

    async getTextByXpathFromPage(page: puppeteer.Page, xPath: string) {
      const [elm] = await page.$x(xPath);
      if (elm == null) {
          return '';
      }
      let text = await page.evaluate(j => j.innerText, elm);
      return text.replace(/\n/g, ' ');
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
        
        const page = this.browserPages.propertyAppraiserPage;
        if (page === undefined) return false;
        page.setDefaultTimeout(60000);
        let document = docsToParse;
            if (!this.decideSearchByV2(document)) {
                return false;
              }
            
            // do everything that needs to be done for each document here
            // parse address
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
              console.log(`Looking for owner: ${owner_name}`);
            }
            else {
              street_addr = document.propertyId['Property Address'];
              const parsev2 = this.getAddressV2(document.propertyId);
              if(!this.isEmptyOrSpaces(parsev2.street_address)){
                street_addr = parsev2.street_address;
              }
              console.log(`Looking for address: ${street_addr}`);
            }

            let retry_count = 0;
            while (true){
              if (retry_count > 15){
                  console.error('Connection/website error for 15 iteration.');
                  return false;
              }
              try {
                await page.goto(this.urls.propertyAppraiserPage, { waitUntil: 'load'});
              } catch (error) {
                await page.reload();
              }
              try {                
                const inputHandle = await page.$x('//input[@id="fldSearchFor"]');
                await inputHandle[0].type(this.searchBy==='name' ? owner_name : street_addr, {delay: 100});
                await Promise.all([
                  inputHandle[0].type(String.fromCharCode(13), {delay: 150}),
                  page.waitForNavigation()
                ]);
                
                // check result
                const existResult = await this.checkExistElement(page, 'div.search-result');
                if (existResult) {
                  const rows = await page.$x('//ul[contains(@class, "description")]');
                  const datalinks = [];
                  if (this.searchBy === 'name') {
                      for (const row of rows) {
                          let {name, link} = await page.evaluate(el => ({name: el.children[0].textContent, link: el.children[0].children[0].href}), row);
                          const regexp = new RegExp(owner_name_regexp);
                          name = name.replace(/\n|\s+/, ' ').trim();
                          if (!regexp.exec(name.toUpperCase())) continue;
                          datalinks.push(link);
                      }
                  }
                  else {
                      let link = await page.evaluate(el => el.children[0].children[0].href, rows[0]);
                      datalinks.push(link);
                  }

                  for (const datalink of datalinks) {
                    await page.goto(datalink, {waitUntil: 'load'});
                    const result = await this.getPropertyInfos(page);
                    this.parseResult(result, document);
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

    async parseResult(result: any, document: IOwnerProductProperty) {
        let dataFromPropertyAppraisers: any = {};
        dataFromPropertyAppraisers['Full Name'] = result['owner_names'][0]['full_name'];
        dataFromPropertyAppraisers['First Name'] = result['owner_names'][0]['first_name'];
        dataFromPropertyAppraisers['Last Name'] = result['owner_names'][0]['last_name'];
        dataFromPropertyAppraisers['Middle Name'] = result['owner_names'][0]['middle_name'];
        dataFromPropertyAppraisers['Name Suffix'] = result['owner_names'][0]['suffix'];
        dataFromPropertyAppraisers['Owner Occupied'] = result['owner_occupied'];
        dataFromPropertyAppraisers['Property Address'] = result['property_address'];
        dataFromPropertyAppraisers['Property State'] = 'GA';
        dataFromPropertyAppraisers['County'] = 'Gwinnett';
        dataFromPropertyAppraisers['Mailing Care of Name'] = '';
        dataFromPropertyAppraisers['Mailing Address'] = result['mailing_address'];
        if (result['mailing_address_parsed']) {
            dataFromPropertyAppraisers['Mailing City'] = result['mailing_address_parsed']['city'];
            dataFromPropertyAppraisers['Mailing State'] = result['mailing_address_parsed']['state'];
            dataFromPropertyAppraisers['Mailing Zip'] = result['mailing_address_parsed']['zip'];
        }
        dataFromPropertyAppraisers['Mailing Unit #'] = '';
        dataFromPropertyAppraisers['Property Type'] = result['property_type'];
        dataFromPropertyAppraisers['Total Assessed Value'] = result['total_assessed_value'];
        dataFromPropertyAppraisers['Last Sale Recording Date'] = result['last_sale_recording_date'];
        dataFromPropertyAppraisers['Last Sale Amount'] = result['last_sale_amount'];
        dataFromPropertyAppraisers['Est. Remaining balance of Open Loans'] = '';
        dataFromPropertyAppraisers['Est Value'] = result['est_value'];
        dataFromPropertyAppraisers['yearBuilt'] = result['year_built'];
        dataFromPropertyAppraisers['Est Equity'] = '';
        console.log(dataFromPropertyAppraisers);
        try {
            await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
        } catch(e){
            //
        }
    }

    async getPropertyInfos(page: puppeteer.Page): Promise<any> {
      // name
      const name_addr_selector = 'table.generalinfo > tbody > tr:first-child > td:first-child';
      const name_addr_str = await this.getElementHtmlContent(page, name_addr_selector);
      const name_addr = name_addr_str.split('<br>');

      let owner_names = [];
      let fullnames = this.simplifyString(name_addr[0]).split('&amp;');
      for (let fullname of fullnames) {
        let owner_name = this.simplifyString(fullname);
        const ownerName = this.parseOwnerName(owner_name);
        owner_names.push(ownerName);
      } 

      // property address
      const property_address_xpath = '//*[text()="Address"]/parent::tr[1]/td[1]';
      let property_address = await this.getTextByXpathFromPage(page, property_address_xpath);
      property_address = property_address.replace(/\s+/gm, ' ').trim();

      // mailing address
      let mailing_address = this.simplifyString(name_addr.slice(1).join(' '));
      const mailing_address_parsed = parser.parseLocation(mailing_address);

      // owner occupied
      const owner_occupied = mailing_address.indexOf(property_address) > -1;
      
      // property type
      const property_type_selector = 'table.generalinfo > tbody > tr:nth-child(5) > td:nth-child(2)';
      let property_type = await this.getElementHtmlContent(page, property_type_selector);
      property_type = property_type.trim();

      // sales info
      const last_sale_recording_date_selector = 'div#lxT1696 > table > tbody > tr:nth-child(2) > td:nth-child(3)';
      const last_sale_amount_selector = 'div#lxT1696 > table > tbody > tr:nth-child(2) > td:nth-child(9)';
      const last_sale_recording_date = await this.getElementTextContent(page, last_sale_recording_date_selector);
      const last_sale_amount = await this.getElementTextContent(page, last_sale_amount_selector);
      
      // assessed value and est. value
      const total_assessed_value_selector = 'table#ValueHistory > tbody > tr:nth-child(9) > td:nth-child(2)';
      const total_assessed_value = await this.getElementTextContent(page, total_assessed_value_selector);
      const est_value = '';
          
      // year built
      const year_built_xpath = '//th[text()="Year Built"]/following-sibling::td[1]';
      const year_built = await this.getTextByXpathFromPage(page, year_built_xpath);

      return {
        owner_names, 
        property_address,
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