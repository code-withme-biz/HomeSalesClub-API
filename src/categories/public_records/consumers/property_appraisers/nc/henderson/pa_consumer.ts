import puppeteer from 'puppeteer';
import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
import { IPublicRecordAttributes } from '../../../../../../models/public_record_attributes'
const parser = require('parse-address');
const nameParsingService = require('../../consumer_dependencies/nameParsingServiceNew');

import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';
import { IProperty } from '../../../../../../models/property';

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'http://taxinfo.hendersoncountync.gov/CamaPWA/SearchProperty.aspx'
    }

    xpaths = {
        isPAloaded: '//input[@id="ctl00_ContentPlaceHolder1_OwnerTextBox"]'
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
      let text = await page.evaluate(j => j.innerText, elm);
      return text.replace(/\n/g, ' ');
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
            let parsedaddress;
            let search_street;
            let search_number;
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
            }
            else {
                parsedaddress = parser.parseLocation(document.propertyId['Property Address']);
                const parsev2 = this.getAddressV2(document.propertyId);
                if(!this.isEmptyOrSpaces(parsev2.street_address)){
                  parsedaddress = parser.parseLocation(parsev2.street_address);
                }
                if(!parsedaddress){
                  console.log("Street number and street name is missing!");
                  return false;
                }
                if(parsedaddress.street && parsedaddress.number){
                    search_street = parsedaddress.street;
                    search_number = parsedaddress.number;
                } else {
                    console.log("Street number and street name is missing!");
                    return false;
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
                await page.goto(this.urls.propertyAppraiserPage, { waitUntil: 'load'});
              } catch (error) {
                await page.reload();
              }
              try {                
                await page.waitForSelector('input#ctl00_ContentPlaceHolder1_OwnerTextBox');
                if (this.searchBy == 'name'){
                    let inputName = await page.$('input#ctl00_ContentPlaceHolder1_OwnerTextBox');
                    await inputName?.type(owner_name, {delay: 150});
                    await Promise.all([
                        page.click('a#ctl00_ContentPlaceHolder1_OwnerButton'),
                        page.waitForNavigation()
                    ]);
                } else {
                    let search_by_address_tab = await page.$x('//a[@href="#locationaddress"]');
                    await search_by_address_tab[0].click();
                    await this.sleep(500);
                    await page.type('input#ctl00_ContentPlaceHolder1_StreetNumberTextBox', search_number, {delay: 150});
                    await page.type('input#ctl00_ContentPlaceHolder1_StreetNameTextBox', search_street, {delay: 150});
                    await Promise.all([
                        page.click('a#ctl00_ContentPlaceHolder1_AddressButton'),
                        page.waitForNavigation()
                    ]);
                }

                const search_results = await page.$x('//table[@id="ctl00_ContentPlaceHolder1_OwnerSearchResultsGridView" or @id="ctl00_ContentPlaceHolder1_ParcelStreetsGridView"]/tbody/tr');
                if (search_results.length == 0){
                    console.log("Not found!");
                    break;
                }
                const rows = await page.$x('//table[@id="ctl00_ContentPlaceHolder1_OwnerSearchResultsGridView" or @id="ctl00_ContentPlaceHolder1_ParcelStreetsGridView"]/tbody/tr');
                rows.shift();
                const datalinks = [];
                if (this.searchBy === 'name') {
                    for (const row of rows) {
                        try{
                            const {name, link} = await page.evaluate(el => ({name: el.children[2].children[0].textContent.trim(), link: el.children[2].children[0].href}), row);
                            const regexp = new RegExp(owner_name_regexp);
                            if (!regexp.exec(name.toUpperCase())) continue;
                            datalinks.push(link);
                        } catch(e){
                            continue;
                        }
                    }
                } else {
                    try{
                        let link = await page.evaluate(el => el.children[0].children[0].href, rows[0]);
                        datalinks.push(link);
                    } catch(e){
                        //
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
                        await page.goto(datalink, {waitUntil: 'load'});
                        let result = await this.getPropertyInfos(page, parsedaddress);
                        await this.parseResult(result, document);
                    } catch (e){
                        // console.log(e);
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
          'Mailing Address': result['mailing_address'],
          'Mailing Unit #': '',
          'Mailing City': result['mailing_address_parsed'] ? result['mailing_address_parsed']['city'] : '',
          'Mailing State': result['mailing_address_parsed'] ? result['mailing_address_parsed']['state'] : '',
          'Mailing Zip': result['mailing_address_parsed'] ? result['mailing_address_parsed']['zip'] : '',
          'Property Address': result['property_address'],
          'Property Unit #': '',
          'Property City': result['property_address_parsed']['city'],
          'Property State': this.publicRecordProducer.state,
          'Property Zip': result['property_address_parsed']['zip'],
          'County': this.publicRecordProducer.county,
          'Owner Occupied': result['owner_occupied'],
          'Property Type': result['property_type'],
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

    async getPropertyInfos(page: puppeteer.Page, parsedaddress: any): Promise<any> {
      // name
      const full_name_xpath = '//*[@id="ctl00_PageHeader1_DetailsView1"]/tbody/tr/td[1]';
      const full_name = await this.getTextByXpathFromPage(page, full_name_xpath);
      const owner_names = [];
      const owner_name_arr = full_name.split(';').map(str => this.simplifyString(str));
      for (let owner_name_iter of owner_name_arr) {
        if (owner_name_iter === '') break;
        const ownerName = this.parseOwnerName(owner_name_iter);
        owner_names.push(ownerName);
      }

      // property address
      const property_address_xpath = '//*[@id="ctl00_PageHeader1_LocationAddressLabelInfo"]';
      let property_address: any = await this.getTextByXpathFromPage(page, property_address_xpath);
      console.log('Property Address from web: ', property_address);
      let property_address_parsed = parser.parseLocation(property_address);
      // mailing address
      const mailing_address_xpath = '//*[@id="ctl00_PageHeader1_DetailsView4_Mail1"]';
      const mailing_city_xpath = '//*[@id="ctl00_PageHeader1_DetailsView4_City"]';
      const mailing_state_xpath = '//*[@id="ctl00_PageHeader1_DetailsView4_Label1"]';
      const mailing_zip_xpath = '//*[@id="ctl00_PageHeader1_DetailsView4_Label2"]';
      let mailing_address = await this.getTextByXpathFromPage(page, mailing_address_xpath);
      let mailing_city = await this.getTextByXpathFromPage(page, mailing_city_xpath);
      let mailing_state = await this.getTextByXpathFromPage(page, mailing_state_xpath);
      let mailing_zip = await this.getTextByXpathFromPage(page, mailing_zip_xpath);
      const mailing_address_parsed = parser.parseLocation(mailing_address + ", " + mailing_city + " " +  mailing_state + " " + mailing_zip);
      // owner occupied
      const owner_occupied = this.compareAddress(this.searchBy === 'name' ? property_address_parsed : parsedaddress, mailing_address_parsed);
        
      // sales info"
      const last_sale_recording_date_xpath = '//*[@id="ctl00_ContentPlaceHolder1_DetailsView6_Label7"]';
      const last_sale_amount_xpath = '//*[@id="ctl00_ContentPlaceHolder1_DetailsView6_Label8"]';
      const last_sale_recording_date = await this.getTextByXpathFromPage(page, last_sale_recording_date_xpath);
      const last_sale_amount = await this.getTextByXpathFromPage(page, last_sale_amount_xpath);

      // property type
      const property_type_xpath = '//*[@id="ctl00_ContentPlaceHolder1_DetailsView5_Label6"]';
      const property_type = await this.getTextByXpathFromPage(page, property_type_xpath);
      	
      // assessed value and est. value
      const total_assessed_value_xpath = '//*[@id="ctl00_ContentPlaceHolder1_DetailsView10_txtTotalPropValue"]';
      const total_assessed_value = await this.getTextByXpathFromPage(page, total_assessed_value_xpath);
      const est_value = ''

      return {
        owner_names, 
        property_address,
        property_address_parsed,
        mailing_address,
        mailing_address_parsed, 
        owner_occupied,
        property_type, 
        total_assessed_value, 
        last_sale_recording_date, 
        last_sale_amount, 
        est_value
      }
    }
}