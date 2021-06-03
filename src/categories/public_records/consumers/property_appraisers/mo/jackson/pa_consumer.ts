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
        propertyAppraiserPage: 'https://ascendweb.jacksongov.org/ascend/(k5tug455xmvqn455y331fwbb)/search.aspx'
    }

    xpaths = {
        isPAloaded: '//input[@id="mSearchControl_mStreetAddress"]'
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
              search_value = owner_name+'*';
            }
            else {
                let parsev1 = parser.parseLocation(document.propertyId['Property Address']);
                const parseaddr = this.getAddressV2(document.propertyId);
                if(!this.isEmptyOrSpaces(parseaddr.street_address)){
                    parsev1 = parser.parseLocation(parseaddr.street_address);
                }
                if(!parsev1 || (!parsev1.number && !parsev1.street)){
                    console.log("Street name and number is missing!");
                    return false;
                }
                search_value = ((parsev1.number ? parsev1.number : '') + ' ' + (parsev1.street ? '*'+parsev1.street+'*' : '')).trim();
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
                await page.waitForSelector('input#mSearchControl_mName');
                if (this.searchBy == 'name'){
                    await page.type('input#mSearchControl_mName', search_value, {delay: 150});
                } else {
                    await page.type('input#mSearchControl_mStreetAddress', search_value, {delay: 150});
                }
                let buttonSearch = await page.$x('//input[@id="mSearchControl_mSubmit"]');
                await Promise.all([
                    buttonSearch[0].click(),
                    page.waitForNavigation({waitUntil: 'networkidle0'})
                ]);
                let notFound = await page.$x('//td[contains(text(), "No Values Found")]');
                if(notFound.length > 0){
                    console.log('Not found!');
                    break;
                }
                const search_results = await page.$x('//table[@id="mResultscontrol_mGrid_RealDataGrid"]/tbody/tr');
                search_results.shift();
                if(this.searchBy == 'name'){
                    let ind = 2;
                    for(const row of search_results){
                        if(ind > 6){
                          break;
                        }
                        let name = await this.getTextContentByXpathFromPage(page, '//table[@id="mResultscontrol_mGrid_RealDataGrid"]/tbody/tr['+ind+']/td[2]');
                        name = name.trim();
                        const regexp = new RegExp(owner_name_regexp);
                        if (!regexp.exec(name!.toUpperCase())){
                            ind++;
                            continue;
                        }
                        console.log(name);
                        let button = await page.$x('//table[@id="mResultscontrol_mGrid_RealDataGrid"]/tbody/tr['+ind+']/td[1]/a');
                        await button[0].click();
                        await page.waitForSelector('span#mParcelnumbersitusaddress_mSitusAddress');
                        await this.sleep(1000);
                        let result = await this.getPropertyInfos(page);
                        if (result) await this.parseResult(result, document);
                        await page.click('a#mMainHeader_mCrumbTrail_crumbLink_1');
                        await page.waitForXPath('//table[@id="mResultscontrol_mGrid_RealDataGrid"]/tbody/tr', {visible: true});
                        await this.sleep(3000);
                        ind++;
                    }
                } else {
                    let button = await page.$x('//table[@id="mResultscontrol_mGrid_RealDataGrid"]/tbody/tr[2]/td[1]/a');
                    await button[0].click();
                    await page.waitForSelector('span#mParcelnumbersitusaddress_mSitusAddress');
                    await this.sleep(1000);
                    let result = await this.getPropertyInfos(page);
                    if (result) await this.parseResult(result, document);
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
          'Property State': 'MO',
          'Property Zip': result['property_zip'] || '',
          'County': 'Jackson',
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
      const full_name_xpath = '//td[contains(text(), "Owner")]/parent::tr/td[3]';
      let full_name = await this.getTextByXpathFromPage(page, full_name_xpath);
      const owner_names = [];
      full_name = full_name.split("&")[0].trim();
      let parseName = this.parseOwnerName(full_name);
      owner_names.push(parseName);

      // property address
      const property_address_full_xpath = '//span[@id="mParcelnumbersitusaddress_mSitusAddress"]';
      const property_address_full = await this.getTextByXpathFromPage(page, property_address_full_xpath);
      const property_address_full_arr = property_address_full.split(',');
      let property_address = property_address_full_arr[0].trim();
      if(property_address.match(/unknown/gi) || property_address.match(/no\s+address/gi)){
        console.log('Property address is unknown, skip this property...');
        return false
      }
      let property_address_parsed = parser.parseLocation(property_address);
      let property_zip, property_city;
      try{
        property_zip = property_address_full_arr[2].split(/\s+/g)[2].trim();
        property_city = property_address_full_arr[1].trim();
      } catch(e){
        property_zip = '';
        property_city = '';
      }

      // mailing address
      const mailing_address_full_xpath = '//td[contains(text(), "Owner")]/parent::tr/td[4]';
      const mailing_address_full = await this.getTextByXpathFromPage(page, mailing_address_full_xpath);
      const mailing_address_full_arr = mailing_address_full.split(',');
      let mailing_address = mailing_address_full_arr[0].trim();
      let mailing_address_parsed = parser.parseLocation(mailing_address);

      let mailing_zip, mailing_state, mailing_city;
      try{
        mailing_zip = mailing_address_full_arr[2].split(/\s+/g)[2].trim();
        mailing_state = mailing_address_full_arr[2].split(/\s+/g)[1].trim();
        mailing_city = mailing_address_full_arr[1].trim();
      } catch(e){
        mailing_zip = '';
        mailing_state = '';
        mailing_city = '';
      }

      // owner occupied
      let owner_occupied;
      try{
        owner_occupied = this.compareAddress(property_address_parsed, mailing_address_parsed);
      } catch(e){
        owner_occupied = false;
      }

      // sales info"
      const last_sale_recording_date = '';
      const last_sale_amount = '';

      // property type
      const property_type_xpath = '//td[contains(text(), "Property Category")]/parent::tr/td[2]';
      const property_type = await this.getTextByXpathFromPage(page, property_type_xpath);

      // assessed value and est. value
      const total_assessed_value_xpath = '//td[contains(text(), "Assessed Value Total")]/parent::tr/td[2]';
      const total_assessed_value = await this.getTextByXpathFromPage(page, total_assessed_value_xpath);
      const est_value = '';

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
        est_value
      }
    }
}