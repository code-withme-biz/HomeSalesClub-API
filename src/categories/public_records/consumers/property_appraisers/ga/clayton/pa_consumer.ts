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
        propertyAppraiserPage: 'https://weba.co.clayton.ga.us/tcmsvr/htdocs/indextax.shtml'
    }

    xpaths = {
        isPAloaded: '//input[@id="qLoca"]'
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

    async getTextByXpathFromPage(page: puppeteer.Page, xPath: string): Promise<string> {
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
  
        let parserName = nameParsingService.newParseName(name_str);
  
        result['full_name'] = parserName.fullName;
        result['first_name'] = parserName.firstName;
        result['last_name'] = parserName.lastName;
        result['middle_name'] = parserName.middleName;
        result['suffix'] = parserName.suffix;
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
            if (!this.decideSearchByV2(document)) {
              return false;
            }
            
            // do everything that needs to be done for each document here
            // parse address
            let address;
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
              address = parser.parseLocation(document.propertyId['Property Address']);
              const parsev2 = this.getAddressV2(document.propertyId);
              if(!this.isEmptyOrSpaces(parsev2.street_address)){
                address = parser.parseLocation(parsev2.street_address);
              }
              if(!address || (!address.number && !address.street)){
                  console.log('Street address and street name is missing!');
                  return false;
              }
              street_addr = ((address.street ? address.street : '') + ' ' + (address.type ? address.type : '')).trim();
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
                await page.waitForSelector('input[id="qLoca"]');
    
                if (this.searchBy === 'name') {
                  const [inputFirstNameHandle] = await page.$x('//input[@id="qNamef"]');
                  const [inputLastNameHandle] = await page.$x('//input[@id="qNamel"]');
                  await inputLastNameHandle.type(last_name, {delay: 100});
                  await inputFirstNameHandle.type(first_name, {delay: 100});
                  await Promise.all([
                    inputFirstNameHandle.type(String.fromCharCode(13), {delay: 150}),
                    page.waitForNavigation()
                  ]);
                }
                else {
                  const inputStreetHandle = await page.$x('//input[@id="qLoca"]');
                  const inputNumberHandle = await page.$x('//input[@id="qLocn"]');
                  // type street
                  await inputStreetHandle[0].type(street_addr, {delay: 100});
                  // type house number
                  if (address.number) {
                    await inputNumberHandle[0].type(address.number, {delay: 100});
                  }
                  // start search
                  await Promise.all([
                    inputStreetHandle[0].type(String.fromCharCode(13), {delay: 150}),
                    page.waitForNavigation()
                  ]);
                }

                const rows = await page.$x('//table/tbody/tr[position()>4]/td/table/tbody/tr');
                if (rows.length == 0) break;

                const datalinks = [];
                if (this.searchBy === 'name') {
                  for (const row of rows) {
                    const {name, link} = await page.evaluate(el => ({name: el.children[1].textContent.trim(), link: el.children[0].children[0].children[0].href}), row);
                    const regexp = new RegExp(owner_name_regexp);
                    if (!regexp.exec(name.toUpperCase())) continue;
                    // console.log(name)
                    datalinks.push(link);
                  }
                }
                else {
                  for (const row of rows) {
                    let addr = await page.evaluate(el => el.children[2].textContent.trim()+' '+ el.children[3].textContent.trim(), row);
                    addr = addr.replace(/\s+/gs, ' ').trim();
                    console.log(addr);
                    let parse_address_result = parser.parseLocation(addr);
                    if (!parse_address_result) continue;
                    if ((parse_address_result.number != address.number) || (parse_address_result.street != address.street)){
                        continue;
                    }
                    const link = await page.evaluate(el => el.children[0].children[0].children[0].href, row);
                    console.log(addr);
                    datalinks.push(link);
                    break;
                  }
                }

                if (datalinks.length === 0) {
                    console.log("No house found");
                    break;
                }

                for (const datalink of datalinks) {
                  await page.goto(datalink, {waitUntil: 'load'});
                  const result = await this.getPropertyInfos(page, address);
                  await this.parseResult(result, document);
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
      let dataFromPropertyAppraisers: any = {};
        dataFromPropertyAppraisers['Full Name'] =  result['owner_names'][0]['full_name'];
        dataFromPropertyAppraisers['First Name'] =  result['owner_names'][0]['first_name'];
        dataFromPropertyAppraisers['Last Name'] =  result['owner_names'][0]['last_name'];
        dataFromPropertyAppraisers['Middle Name'] =  result['owner_names'][0]['middle_name'];
        dataFromPropertyAppraisers['Name Suffix'] =  result['owner_names'][0]['suffix'];
        dataFromPropertyAppraisers['Owner Occupied'] = result['owner_occupied'];
        dataFromPropertyAppraisers['Mailing Care of Name'] = '';
        dataFromPropertyAppraisers['Mailing Address'] = result['mailing_address'];
        dataFromPropertyAppraisers['Property Address'] = result['property_address'];
        dataFromPropertyAppraisers['Property State'] = 'GA';
        if(result['mailing_address_parsed']){
            dataFromPropertyAppraisers['Mailing City'] = result['mailing_address_parsed']['city'] ? result['mailing_address_parsed']['city'] : '';
            dataFromPropertyAppraisers['Mailing State'] = result['mailing_address_parsed']['state'] ? result['mailing_address_parsed']['state'] : '';
            dataFromPropertyAppraisers['Mailing Zip'] = result['mailing_address_parsed']['zip'] ? result['mailing_address_parsed']['zip'] : '';
            dataFromPropertyAppraisers['Mailing Unit #'] = '';
        }
        dataFromPropertyAppraisers['Property Type'] = result['property_type'];
        dataFromPropertyAppraisers['Total Assessed Value'] = result['total_assessed_value'];
        dataFromPropertyAppraisers['Last Sale Recording Date'] = result['last_sale_recording_date'];
        dataFromPropertyAppraisers['Last Sale Amount'] = result['last_sale_amount'];
        dataFromPropertyAppraisers['Est. Remaining balance of Open Loans'] = '';
        dataFromPropertyAppraisers['Est Value'] = result['est_value'];
        dataFromPropertyAppraisers['yearBuilt'] = '';
        dataFromPropertyAppraisers['Est Equity'] = '';
        dataFromPropertyAppraisers['County'] = 'Clayton';
        await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
    }

    async getPropertyInfos(page: puppeteer.Page, address: any): Promise<any> {
      // name
      let owner_names = [];
      const name_addr_xpath = '//*[@id="content"]/table/tbody/tr/td/table[1]/tbody/tr[6]/td[1]';
      const name_addr_str = await this.getTextByXpathFromPage(page, name_addr_xpath);
      let name_addr = name_addr_str.split('&');
      if(name_addr_str.match(/or/gm)){
        name_addr = name_addr_str.split('OR');
      }
      for (let name of name_addr) {
        let owner_name = this.simplifyString(name);
        owner_name = this.simplifyString(owner_name);
        const ownerName = this.parseOwnerName(owner_name);
        owner_names.push(ownerName);
      }

      // property address
      const property_address_xpath = '//*[@id="content"]/table/tbody/tr/td/table[1]/tbody/tr[7]/td[2]';
      let property_address = await this.getTextByXpathFromPage(page, property_address_xpath);
      property_address = property_address.slice(13).replace(/\s+/gs, ' ').trim();
        
      // mailing address
      const street_xpath = '//*[@id="content"]/table/tbody/tr/td/table[1]/tbody/tr[7]/td[1]';
      const city_xpath = '//*[@id="content"]/table/tbody/tr/td/table[1]/tbody/tr[8]/td[1]';
      const street = (await this.getTextByXpathFromPage(page, street_xpath)).replace(/\s+/gs, ' ').trim();
      const city = await this.getTextByXpathFromPage(page, city_xpath);
      const mailing_address = street.trim() + ', ' + city.trim();
      const mailing_address_parsed = parser.parseLocation(mailing_address);

      // owner occupied
      const owner_occupied = (street === property_address);
      
      // property type
      let property_type = '';

      // sales info
      const last_sale_recording_date_xpath = '//*[@id="content"]/table/tbody/tr/td/table[4]/tbody/tr[5]/td[3]';
      const last_sale_amount_xpath = '//*[@id="content"]/table/tbody/tr/td/table[4]/tbody/tr[5]/td[6]';
      const last_sale_recording_date = await this.getTextByXpathFromPage(page, last_sale_recording_date_xpath);
      const last_sale_amount = await this.getTextByXpathFromPage(page, last_sale_amount_xpath);
      
      // assessed value and est. value
      const est_value_xpath = '//*[@id="content"]/table/tbody/tr/td/table[9]/tbody/tr[3]/td[6]';
      const total_assessed_value = '';
      const est_value = await this.getTextByXpathFromPage(page, est_value_xpath);

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
        est_value
      }
    }
}