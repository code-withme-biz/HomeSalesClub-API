import puppeteer from 'puppeteer';
import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
import { IPublicRecordAttributes } from '../../../../../../models/public_record_attributes'
import axios from 'axios';
const parser = require('parse-address');
const {parseFullName} = require('parse-full-name');

const parseAddress = require('parse-address');
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';
import { IProperty } from '../../../../../../models/property';

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'https://myplace.cuyahogacounty.us/'
    }

    xpaths = {
        isPAloaded: '//input[@id="Address"]'
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

    // use this to initialize the browser and go to a specific url.
    // setParamsForPage is needed (mainly for AWS), do not remove or modify it please.
    // return true when page is usable, false if an unexpected error is encountered.
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
     * analysis name
     * @param name 
     */
    discriminateAndRemove(name: string) : any {
      const companyIdentifiersArray = [ 'GENERAL', 'TRUSTEE', 'TRUSTEES', 'INC', 'ORGANIZATION', 'CORP', 'CORPORATION', 'LLC', 'MOTORS', 'BANK', 'UNITED', 'CO', 'COMPANY', 'FEDERAL', 'MUTUAL', 'ASSOC', 'AGENCY' , 'OF' , 'SECRETARY' , 'DEVELOPMENT' , 'INVESTMENTS', 'HOLDINGS', 'ESTATE', 'LLP', 'LP', 'TRUST', 'LOAN', 'CONDOMINIUM', 'CHURCH', 'CITY', 'CATHOLIC', 'D/B/A', 'COCA COLA', 'LTD', 'CLINIC', 'TODAY', 'PAY', 'CLEANING', 'COSMETIC', 'CLEANERS', 'FURNITURE', 'DECOR', 'FRIDAY HOMES', 'SAVINGS', 'PROPERTY', 'PROTECTION', 'ASSET', 'SERVICES', 'L L C', 'NATIONAL', 'ASSOCIATION', 'MANAGEMENT', 'PARAGON', 'MORTGAGE', 'CHOICE', 'PROPERTIES', 'J T C', 'RESIDENTIAL', 'OPPORTUNITIES', 'FUND', 'LEGACY', 'SERIES', 'HOMES', 'LOAN'];
      const removeFromNamesArray = ['ET', 'AS', 'DECEASED', 'DCSD', 'CP\/RS', 'JT\/RS', 'esq','esquire','jr','jnr','sr','snr','2','ii','iii','iv','md','phd','j.d.','ll.m.','m.d.','d.o.','d.c.','p.c.','ph.d.', '&'];
      const companyRegexString = `\\b(?:${companyIdentifiersArray.join('|')})\\b`;
      const removeFromNameRegexString = `^(.*?)\\b(?:${removeFromNamesArray.join('|')})\\b.*?$`;
      const companyRegex = new RegExp(companyRegexString, 'i');
      const removeFromNamesRegex = new RegExp(removeFromNameRegexString, 'i');
      let isCompanyName = name.match(companyRegex);
      if (isCompanyName) {
          return {
              type: 'company',
              name: name
          }
      }
      
      let cleanName = name.match(removeFromNamesRegex);
      if (cleanName) {
          name = cleanName[1];
      }
      return {
          type: 'person',
          name: name
      }
    }

    /**
     * Parse owner names
     * @param name_str : string
     * @param address : string
     */
    parseOwnerName(name_str: string): any[] {
      const result: any = {};

      // owner name
      let owner_full_name = name_str;
      let owner_first_name = '';
      let owner_last_name = '';
      let owner_middle_name = '';

      const owner_class_name = this.discriminateAndRemove(owner_full_name);
      if (owner_class_name.type === 'person') {
        const owner_temp_name = parseFullName(owner_class_name.name);
        owner_first_name = owner_temp_name.first ? owner_temp_name.first : '';
        owner_last_name = owner_temp_name.last ? owner_temp_name.last : '';
        owner_middle_name = owner_temp_name.middle ? owner_temp_name.middle : '';
      }

      result['full_name'] = owner_full_name;
      result['first_name'] = owner_first_name;
      result['last_name'] = owner_last_name;
      result['middle_name'] = owner_middle_name;
      result['suffix'] = this.getSuffix(owner_full_name);
      return result;
    }

    getSuffix(name: string) : any {
      const suffixList = ['esq','esquire','jr','jnr','sr','snr','2','ii','iii','iv','md','phd','j.d.','ll.m.','m.d.','d.o.','d.c.','p.c.','ph.d.'];
      name = name.toLowerCase();
      for(let suffix of suffixList){
          let regex = new RegExp(' '+suffix, 'gm');
          if (name.match(regex)){
              return suffix;
          }
      }
      return '';
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
            // do everything that needs to be done for each document here
            if (!this.decideSearchByV2(document)) {
                return false;
            }
            
            let search_value;
            // let street_addr = address['street_full'];
            if(this.searchBy == 'name'){
                search_value = document.ownerId['Full Name'];
            } else if (this.searchBy == 'address'){
                search_value = document.propertyId['Property Address'];
                const parseaddr = this.getAddressV2(document.propertyId);
                if(!this.isEmptyOrSpaces(parseaddr.street_address)){
                    search_value = parseaddr.street_address;
                }
            } else {
                return false;
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
                await page.waitForSelector('input[id="Address"]');
                if(this.searchBy == 'address'){
                    await page.click('input[id="Address"]');
                }
                // input address
                const inputAddrHandle = await page.$x('//input[@id="txtData"]');
                await inputAddrHandle[0].type(search_value);
                await Promise.all([
                  page.click('input[id="btnSearch"]'),
                  page.waitForNavigation()
                ]);
                await this.sleep(2000);
                const isResult = await this.checkExistElement(page, 'ul#AddressInfo > li:first-child > p.notFoundMessage');
                if (isResult) break;
                let resultLinks = await page.$x('//*[@id="AddressInfo"]/li/a[contains(@onclick, "selectParcel")]');
                if(resultLinks.length > 0){
                    for(let i = 0; i < resultLinks.length; i++){
                        let resultLink = await page.$x('//a[@id="'+i+'"]');
                        await resultLink[0].focus();
                        await page.keyboard.press('Enter');
                        try {
                            await page.waitForSelector('button#btnGeneralInfo', {visible: true});
                        } catch (error) {
                            continue;
                        }
                        await this.sleep(2000);
                        await Promise.all([
                            page.click('button#btnGeneralInfo'),
                            page.waitForNavigation()
                        ]);
                        if(this.searchBy == 'name'){
                            const owner_name_selector = 'div#viewPropertyHeader > ul > li:nth-child(2)';
                            let owner_name_get = await this.getElementTextContent(page, owner_name_selector);
                            let owner_name_regexp = `${search_value.toUpperCase().split(' ').join(',?(\\s+)?(\\w+)?(\\s+)?')}|${search_value.toUpperCase().split(' ').reverse().join(',?(\\s+)?(\\w+)?(\\s+)?')}`;
                            const regexp = new RegExp(owner_name_regexp);
                            if (!regexp.exec(owner_name_get.toUpperCase())) {
                                await page.goBack();
                                await page.goBack();
                                await this.sleep(2000);
                                continue;
                            }
                        }
                        const result = await this.getPropertyInfos(page);
                        if(!result){
                            await page.goBack();
                            await page.goBack();
                            await this.sleep(2000);
                            continue;
                        }
                        this.parseResult(result, document);
                        if (this.searchBy === 'address') break;
                        await page.goBack();
                        await page.goBack();
                        await this.sleep(2000);
                    }
                } else {
                    await Promise.all([
                        page.click('button#btnGeneralInfo'),
                        page.waitForNavigation()
                    ]);
                    if(this.searchBy == 'name'){
                        const owner_name_selector = 'div#viewPropertyHeader > ul > li:nth-child(2)';
                        let owner_name_get = await this.getElementTextContent(page, owner_name_selector);
                        let owner_name_regexp = `${search_value.toUpperCase().split(' ').join(',?(\\s+)?(\\w+)?(\\s+)?')}|${search_value.toUpperCase().split(' ').reverse().join(',?(\\s+)?(\\w+)?(\\s+)?')}`;
                        const regexp = new RegExp(owner_name_regexp);
                        if (!regexp.exec(owner_name_get.toUpperCase())) {
                            break;
                        }
                    }
                    const result = await this.getPropertyInfos(page);
                    this.parseResult(result, document);
                    await this.sleep(2000);
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

    async parseResult(result: any, document: IOwnerProductProperty) {
        try{
            let dataFromPropertyAppraisers = {
                'Full Name': result['owner_names'][0]['full_name'],
                'First Name': result['owner_names'][0]['first_name'],
                'Last Name': result['owner_names'][0]['last_name'],
                'Middle Name': result['owner_names'][0]['middle_name'],
                'Name Suffix': result['owner_names'][0]['suffix'],
                'Mailing Care of Name': '',
                'Mailing Address': '',
                'Mailing Unit #': '',
                'Mailing City': '',
                'Mailing State': '',
                'Mailing Zip': '',
                'Property Address': result['property_address'] || '',
                'Property Unit #': '',
                'Property City': result['property_city'] || '',
                'Property State': 'OH',
                'Property Zip': result['property_zip'] || '',
                'County': 'cuyahoga',
                'Owner Occupied': false,
                'Property Type': result['property_type'] || '',
                'Total Assessed Value': result['total_assessed_value'] || '',
                'Last Sale Recording Date': result['last_sale_recording_date'] || '',
                'Last Sale Amount': result['last_sale_amount'] || '',
                'Est. Remaining balance of Open Loans': '',
                'Est Value': result['est_value'] || '',
                'yearBuilt': '',
                'Est Equity': '',
                'Lien Amount': ''
            }
            await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
        } catch(e){
            //
        }
    //   for (let index = 0; index < result['owner_names'].length ; index++) {
    //     const owner_name = result['owner_names'][index];
    //     if (index == 0) {
    //       document['Full Name'] = owner_name['full_name'];
    //       document['First Name'] = owner_name['first_name'];
    //       document['Last Name'] = owner_name['last_name'];
    //       document['Middle Name'] = owner_name['middle_name'];
    //       document['Name Suffix'] = owner_name['suffix'];
    //       document['Owner Occupied'] = result['owner_occupied'];
    //       document['Mailing Care of Name'] = '';
    //       document['Mailing Address'] = result['mailing_address'];
    //       if (result['mailing_address_parsed']) {
    //         document['Mailing City'] = result['mailing_address_parsed']['city'];
    //         document['Mailing State'] = result['mailing_address_parsed']['state'];
    //         document['Mailing Zip'] = result['mailing_address_parsed']['zip'];
    //       }
    //       document['Mailing Unit #'] = '';
    //       document['Property Type'] = result['property_type'];
    //       document['Total Assessed Value'] = result['total_assessed_value'];
    //       document['Last Sale Recording Date'] = result['last_sale_recording_date'];
    //       document['Last Sale Amount'] = result['last_sale_amount'];
    //       document['Est. Remaining balance of Open Loans'] = '';
    //       document['Est Value'] = result['est_value'];
    //       document['yearBuilt'] = '';
    //       document['Est Equity'] = '';
    
    //       console.log(document);
    //       await document.save();
    //     }
    //   }   
    }

    async getPropertyInfos(page: puppeteer.Page): Promise<any> {

      try{
          let addressHandle = await page.$x('//*[@id="viewPropertyHeader"]/ul/li[3]');
        let property_address = await addressHandle[0].evaluate(el => el.textContent?.trim());
        let cityAndZipHandle = await page.$x('//*[@id="viewPropertyHeader"]/ul/li[4]');
        let cityAndZip = await cityAndZipHandle[0].evaluate(el => el.textContent?.trim());
        let property_city = cityAndZip?.split(',').shift();
        let property_zip = cityAndZip?.split(/\s+/).pop();
        // name
        let owner_names = [];
        const owner_name_selector = 'div#viewPropertyHeader > ul > li:nth-child(2)';
        let owner_name = await this.getElementTextContent(page, owner_name_selector);
        console.log(owner_name);
        if(owner_name.includes('&')){
            owner_name = owner_name.split('&')[0].trim();
        } else if(owner_name.includes('AND')){
            owner_name = owner_name.split('AND')[0].trim();
        }
        owner_name = this.simplifyString(owner_name);
        const ownerName = this.parseOwnerName(owner_name);
        owner_names.push(ownerName);
        console.log(ownerName);
        
        //   // mailing address
        //   const street_selector = 'div#viewPropertyHeader > ul > li:nth-child(3)';
        //   const city_selector = 'div#viewPropertyHeader > ul > li:nth-child(4)';
        //   const street = await this.getElementTextContent(page, street_selector);
        //   const city = await this.getElementTextContent(page, city_selector);
        //   const mailing_address = this.simplifyString(street + ', ' + city);
        //   const mailing_address_parsed = parser.parseLocation(mailing_address);
        
        // owner occupied
        const owner_occupied = false;
        
        // property type
        const property_type_selector = 'div#mapData > div:nth-child(2) > div:nth-child(2) > div:nth-child(2) > div:nth-child(4)';
        let property_type = await this.getElementTextContent(page, property_type_selector);
        property_type = this.simplifyString(property_type);
        
        // assessed value and est. value
        await Promise.all([
            page.click('button[id="btnPropertyCardInfo"]'),
            page.waitForNavigation()
        ]);
        const total_assessed_value_selector = 'table.PropertyCardValueTable:first-of-type > tbody > tr:nth-child(4) > td:nth-child(5)';
        const est_value_selector = 'table.PropertyCardValueTable:first-of-type > tbody > tr:nth-child(4) > td:nth-child(2)';
        const total_assessed_value = await this.getElementTextContent(page, total_assessed_value_selector);
        const est_value = await this.getElementTextContent(page, est_value_selector);
        
        // sales info
        const last_sale_recording_date_selector = 'table.PropertyCardSalesTable > tbody > tr:nth-child(2) > td:first-child';
        const last_sale_amount_selector = 'table.PropertyCardSalesTable > tbody > tr:nth-child(2) > td:nth-child(4)'
        const last_sale_recording_date = await this.getElementTextContent(page, last_sale_recording_date_selector);
        const last_sale_amount = await this.getElementTextContent(page, last_sale_amount_selector);
        
        return {
            owner_names, 
            property_address,
            property_city,
            property_zip,
            owner_occupied,
            property_type, 
            total_assessed_value, 
            last_sale_recording_date, 
            last_sale_amount, 
            est_value
        }
    } catch(e){
        return false;
    }
    }
}