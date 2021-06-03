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
        propertyAppraiserPage: 'https://ssc.sedgwickcounty.org/propertytax/'
    }

    xpaths = {
        isPAloaded: '//input[@id="ctl00_mainContentPlaceHolder_acceptButton"]'
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
    async parseAndSave(docsToParse: IOwnerProductProperty): Promise<boolean> {
        const page = this.browserPages.propertyAppraiserPage;
        if (page === undefined) return false;
        let document = docsToParse;
            if (!this.decideSearchByV2(document)) {
                return false;
              }
            
            // do everything that needs to be done for each document here
            // parse address
            let parsed_addr;
            let search_addr;

            if (this.searchBy === 'name') {
                console.log("By name detected! The site is only supported searched by property address: https://ssc.sedgwickcounty.org/propertytax/");
                return false;
            }
            parsed_addr = parser.parseLocation(document.propertyId['Property Address']);
            const parsev2 = this.getAddressV2(document.propertyId);
            if(!this.isEmptyOrSpaces(parsev2.street_address)){
                parsed_addr = parser.parseLocation(parsev2.street_address);
            }

            if(!parsed_addr || (!parsed_addr.number && !parsed_addr.street)){
                console.log("Street number & street name is missing!");
                return false;
            }
            search_addr = ((parsed_addr.number ? parsed_addr.number : '') + ' ' + (parsed_addr.street ? parsed_addr.street : '')).trim();

            let retry_count = 0;
            while (true){
              if (retry_count > 15){
                  console.error('Connection/website error for 15 iteration.');
                  return false;
              }
              try {
                await page.goto(this.urls.propertyAppraiserPage, { waitUntil: 'networkidle0'});
              } catch (error) {
                await page.reload();
              }
              try {
                let [tosButton] = await page.$x('//input[@id="ctl00_mainContentPlaceHolder_acceptButton"]');
                if(tosButton){
                    await Promise.all([
                        tosButton.click(),
                        page.waitForNavigation({waitUntil: 'networkidle0'})
                    ]);
                }
                await page.waitForSelector('input#ctl00_mainContentPlaceHolder_keywordsTextBox');
                await page.type('input#ctl00_mainContentPlaceHolder_keywordsTextBox', search_addr, {delay: 150})
                await Promise.all([
                    page.click('input#ctl00_mainContentPlaceHolder_searchButton'),
                    page.waitForNavigation({waitUntil: 'networkidle0'})
                ]);
                let found = await page.$x('//a[@id="ctl00_mainContentPlaceHolder_resultsRepeater_ctl01_situsAddressHyperLink"]');
                if(found.length < 1){
                    console.log("Not found!");
                    break;
                }
                await found[0].click();
                await page.waitForXPath(`//th[text()="Owner"]/parent::tr/td[1]`);
                const result = await this.getPropertyInfos(page, parsed_addr);
                await this.parseResult(result, document);
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
            'Mailing Address': result['mailing_address'],
            'Mailing Unit #': '',
            'Mailing City': result['mailing_city'],
            'Mailing State': result['mailing_state'],
            'Mailing Zip': result['mailing_zip'],
            'Property Address': document.propertyId['Property Address'],
            'Property Unit #': '',
            'Property City': document.propertyId['Property City'] || '',
            'Property State': this.publicRecordProducer.state.toUpperCase(),
            'Property Zip': document.propertyId['Property Zip'] || '',
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
            // console.log(dataFromPropertyAppraisers);
            await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
        } catch(e){
            //
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

    async getPropertyInfos(page: puppeteer.Page, parsed_addr: any): Promise<any> {
        // name
        const full_name_xpath = `//th[text()="Owner"]/parent::tr/td[1]`;
        let full_name = await this.getTextByXpathFromPage(page, full_name_xpath);
        const owner_names = [];
        full_name = full_name.split("&")[0].trim();
        let parseName = this.parseOwnerName(full_name);
        owner_names.push(parseName);
  
        // mailing address
        const mailing_address_full_xpath = '//th[text()="Mailing Address"]/parent::tr/td[1]';
        let mailing_address_full = await this.getTextByXpathFromPage(page, mailing_address_full_xpath);
        const mailing_address_parsed = parser.parseLocation(mailing_address_full);
        let mailing_address, mailing_city, mailing_zip, mailing_state = '';
        if(mailing_address_parsed){
            mailing_address = ((mailing_address_parsed.number ? mailing_address_parsed.number : '') + ' ' + (mailing_address_parsed.street ? mailing_address_parsed.street + ' ' : '') + (mailing_address_parsed.type ? mailing_address_parsed.type : '')).trim();
            mailing_city = mailing_address_parsed.city ? mailing_address_parsed.city : '';
            mailing_zip = mailing_address_parsed.zip ? mailing_address_parsed.zip : '';
            mailing_state = mailing_address_parsed.state ? mailing_address_parsed.state : '';
        }
        // owner occupied
        let owner_occupied;
        try{
          owner_occupied = this.compareAddress(parsed_addr, mailing_address_parsed);
        } catch(e){
          owner_occupied = false;
        }
  
        // sales info"
        const last_sale_recording_date = '';
        const last_sale_amount = '';
  
        // property type
        const property_type_xpath = '//th[text()="Land Use"]/parent::tr/td[1]';
        const property_type = await this.getTextByXpathFromPage(page, property_type_xpath);
  
        // assessed value and est. value
        const total_assessed_value_xpath = '//th[contains(text(), "Appraisal")]/parent::tr/td[1]';
        const total_assessed_value = await this.getTextByXpathFromPage(page, total_assessed_value_xpath);
        const est_value_xpath = '//th[contains(text(), "Assessment")]/parent::tr/td[1]';
        const est_value = await this.getTextByXpathFromPage(page, est_value_xpath);
  
        return {
          owner_names,
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