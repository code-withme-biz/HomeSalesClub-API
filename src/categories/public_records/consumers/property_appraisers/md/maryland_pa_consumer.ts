import puppeteer from 'puppeteer';
import AbstractPAConsumer from '../abstract_pa_consumer_updated';
const parser = require('parse-address');
const nameParsingService = require('../consumer_dependencies/nameParsingServiceNew');

import { IPublicRecordProducer } from '../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../models/owner_product_property';

export default abstract class MarylandPAConsumer extends AbstractPAConsumer {
    abstract county: string;
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'https://sdat.dat.maryland.gov/RealProperty/Pages/default.aspx'
    }

    xpaths = {
        isPAloaded: '//select[@id="MainContent_MainContent_cphMainContentArea_ucSearchType_wzrdRealPropertySearch_ucSearchType_ddlCounty"]'
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
            
            if(this.searchBy === 'name'){
                console.log("PA's site doesn't support searching by name: https://sdat.dat.maryland.gov/RealProperty/Pages/default.aspx");
                return false;
            }
            // do everything that needs to be done for each document here
            // parse address

            let search_value = document.propertyId['Property Address'];
            let parsed_address = parser.parseLocation(document.propertyId['Property Address']);
            const parseaddr = this.getAddressV2(document.propertyId);
            if(!this.isEmptyOrSpaces(parseaddr.street_address)){
                search_value = parseaddr.street_address;
                parsed_address = parser.parseLocation(parseaddr.street_address);
            }
            if(!parsed_address || !parsed_address.street){
                console.log("Street name is missing!");
                return false;
            }
            console.log(`Looking for address: ${document.propertyId['Property Address']}`);

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
                await page.waitForSelector('select#MainContent_MainContent_cphMainContentArea_ucSearchType_wzrdRealPropertySearch_ucSearchType_ddlCounty');
                let option = (await page.$x('//select[@id="MainContent_MainContent_cphMainContentArea_ucSearchType_wzrdRealPropertySearch_ucSearchType_ddlCounty"]/option[contains(., "' + this.county.toUpperCase() + ' COUNTY")]'))[0];
                let optionVal: any = await (await option.getProperty('value')).jsonValue();
                await page.select('select#MainContent_MainContent_cphMainContentArea_ucSearchType_wzrdRealPropertySearch_ucSearchType_ddlCounty', optionVal);
                await page.select('select#MainContent_MainContent_cphMainContentArea_ucSearchType_wzrdRealPropertySearch_ucSearchType_ddlSearchType', '01');
                await page.click('input#MainContent_MainContent_cphMainContentArea_ucSearchType_wzrdRealPropertySearch_StartNavigationTemplateContainerID_btnContinue');
                await page.waitForSelector('input#MainContent_MainContent_cphMainContentArea_ucSearchType_wzrdRealPropertySearch_ucEnterData_txtStreenNumber');
                await this.sleep(3000);
                if(parsed_address.number){
                    await page.type('input#MainContent_MainContent_cphMainContentArea_ucSearchType_wzrdRealPropertySearch_ucEnterData_txtStreenNumber', parsed_address.number);
                }
                await page.type('input#MainContent_MainContent_cphMainContentArea_ucSearchType_wzrdRealPropertySearch_ucEnterData_txtStreetName', parsed_address.street);
                await page.click('input#MainContent_MainContent_cphMainContentArea_ucSearchType_wzrdRealPropertySearch_StepNavigationTemplateContainerID_btnStepNextButton');
                await Promise.race([
                    page.waitForXPath('//table[@id="MainContent_MainContent_cphMainContentArea_ucSearchType_wzrdRealPropertySearch_ucSearchResult_gv_SearchResult"]'),
                    page.waitForXPath('//table[@id="MainContent_MainContent_cphMainContentArea_ucSearchType_wzrdRealPropertySearch_ucDetailsSearch_dlstDetaisSearch"]'),
                    page.waitForXPath('//span[@id="MainContent_MainContent_cphMainContentArea_ucSearchType_lblErr"]')
                ]);
                await this.sleep(3000);
                let checkNotFound = await page.$x('//span[@id="MainContent_MainContent_cphMainContentArea_ucSearchType_lblErr"]');
                if(checkNotFound.length > 0){
                    console.log("Not found!");
                    break;
                }
                let firstLinkInRows = await page.$x('//a[@id="MainContent_MainContent_cphMainContentArea_ucSearchType_wzrdRealPropertySearch_ucSearchResult_gv_SearchResult_lnkDetails_0"]');
                if(firstLinkInRows.length > 0){
                    await firstLinkInRows[0].click();
                    await page.waitForXPath('//table[@id="MainContent_MainContent_cphMainContentArea_ucSearchType_wzrdRealPropertySearch_ucDetailsSearch_dlstDetaisSearch"]', {visible: true});
                }
                try{
                    await this.sleep(3000);
                    console.log("Processing => ", page.url());
                    let result = await this.getPropertyInfos(page);
                    await this.parseResult(result, document);
                } catch (e){
                    console.log(e);
                    console.log('Error during parse property (possibly property is N/A)');
                    continue;
                }
                break;                    
              } catch (error) {
                console.log(error);
                console.log('retrying... ', retry_count);
                retry_count++;
                await this.sleep(1000);
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
          'Property State': 'MD',
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
      const full_name_xpath = '//span[@id="MainContent_MainContent_cphMainContentArea_ucSearchType_wzrdRealPropertySearch_ucDetailsSearch_dlstDetaisSearch_lblOwnerName_0"]';
      let full_name = await this.getTextByXpathFromPage(page, full_name_xpath);
      const owner_names = [];
      full_name = full_name.split("&")[0].trim();
      let parseName = this.parseOwnerName(full_name);
      owner_names.push(parseName);

      // property address
      const property_address_xpath = '//span[@id="MainContent_MainContent_cphMainContentArea_ucSearchType_wzrdRealPropertySearch_ucDetailsSearch_dlstDetaisSearch_lblPremisesAddress_0"]/text()[1]';
      const property_address_2_xpath = '//span[@id="MainContent_MainContent_cphMainContentArea_ucSearchType_wzrdRealPropertySearch_ucDetailsSearch_dlstDetaisSearch_lblPremisesAddress_0"]/text()[last() - 1]';
      let property_address = await this.getTextByXpathFromPage(page, property_address_xpath);
      let property_address_2 = await this.getTextByXpathFromPage(page, property_address_2_xpath);
      let property_address_2_arr = property_address_2.split(/\s+/g);
      let property_zip = property_address_2_arr.pop();
      let property_state = "MD";
      let property_city = '';
      for (const word of property_address_2_arr){
        property_city += word;
      }
      property_city = property_city.trim();
      console.log('Property Address from web: ', property_address);
      let property_address_parsed = parser.parseLocation(property_address);
      // mailing address
      const mailing_address_xpath = '//span[@id="MainContent_MainContent_cphMainContentArea_ucSearchType_wzrdRealPropertySearch_ucDetailsSearch_dlstDetaisSearch_lblMailingAddress_0"]/text()[1]';
      const mailing_address_2_xpath = '//span[@id="MainContent_MainContent_cphMainContentArea_ucSearchType_wzrdRealPropertySearch_ucDetailsSearch_dlstDetaisSearch_lblMailingAddress_0"]/text()[last()]';

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

      const mailing_address_parsed = parser.parseLocation(mailing_address);
      // owner occupied
      const owner_occupied = this.compareAddress(property_address_parsed, mailing_address_parsed);
        
      // sales info"
      const last_sale_recording_date_xpath = '//span[@id="MainContent_MainContent_cphMainContentArea_ucSearchType_wzrdRealPropertySearch_ucDetailsSearch_dlstDetaisSearch_Label39_0"]';
      const last_sale_amount_xpath = '//span[@id="MainContent_MainContent_cphMainContentArea_ucSearchType_wzrdRealPropertySearch_ucDetailsSearch_dlstDetaisSearch_Label40_0"]';
      const last_sale_recording_date = await this.getTextByXpathFromPage(page, last_sale_recording_date_xpath);
      const last_sale_amount = await this.getTextByXpathFromPage(page, last_sale_amount_xpath);

      // property type
      const property_type_xpath = '//span[@id="MainContent_MainContent_cphMainContentArea_ucSearchType_wzrdRealPropertySearch_ucDetailsSearch_dlstDetaisSearch_lblUse_0"]';
      const property_type = await this.getTextByXpathFromPage(page, property_type_xpath);
      	
      // assessed value and est. value
      const total_assessed_value_xpath = '//span[@id="MainContent_MainContent_cphMainContentArea_ucSearchType_wzrdRealPropertySearch_ucDetailsSearch_dlstDetaisSearch_lblBaseTotalNow_0"]';
      const total_assessed_value = await this.getTextByXpathFromPage(page, total_assessed_value_xpath);
      const est_value = ''
    
      // year built
      const year_built_xpath = '//*[text()="Primary Structure Built"]/ancestor::tbody[1]/tr[2]/td[1]';
      const year_built = await this.getTextByXpathFromPage(page, year_built_xpath);

      return {
        owner_names, 
        property_address,
        property_address_parsed,
        mailing_address,
        mailing_city,
        mailing_zip,
        mailing_state,
        property_city,
        property_state,
        property_zip,
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