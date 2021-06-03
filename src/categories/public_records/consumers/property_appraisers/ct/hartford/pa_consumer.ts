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
        propertyAppraiserPage: 'http://assessor1.hartford.gov/default.asp'
    }

    xpaths = {
        isPAloaded: '//frame[@name="top"]'
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
      let street_with_type = ((parsed.prefix ? parsed.prefix : '') + ' ' + parsed.street + ' ' + (parsed.type ? parsed.type : '')).trim();

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
  
        let parserName = nameParsingService.newParseName(name_str);
  
        result['full_name'] = parserName.fullName;
        result['first_name'] = parserName.firstName;
        result['last_name'] = parserName.lastName;
        result['middle_name'] = parserName.middleName;
        result['suffix'] = parserName.suffix;
        return result;
    }

    waitForIFrameLoad(page: any, iframeSelector: any, timeout = 10000){
      // if pageFunction returns a promise, $eval will wait for its resolution
     return page.$eval(
      iframeSelector,
       (el: any, timeout: any) => {
         const p = new Promise((resolve, reject) => {
           el.onload = () => {
             resolve()
           }
           setTimeout(() => {
             reject(new Error("Waiting for iframe load has timed out"))
           }, timeout)
         })
         return p
       },
       timeout,
     )
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
        // console.log(`Documents to look up: ${docsToParse.length}.`);
        const page = this.browserPages.propertyAppraiserPage;
        if (page === undefined) return false;
        page.setDefaultTimeout(60000);
        let document = docsToParse;
        
            if (!this.decideSearchByV2(document)) {
                return false;
              }
              
            // do everything that needs to be done for each document here
            // parse address
            let parsed_addr;
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
                  parsed_addr = parser.parseLocation(document.propertyId['Property Address']);
                  const parseaddr = this.getAddressV2(document.propertyId);
                  if(!this.isEmptyOrSpaces(parseaddr.street_address) && !parseaddr.street_address.match(/CT/g)){
                      parsed_addr = parser.parseLocation(parseaddr.street_address);
                  }
                  if(!parsed_addr || (!parsed_addr.number && !parsed_addr.street)){
                      console.log("Street name and number is missing!");
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
                const client = await page.target().createCDPSession();
                await client.send('Network.clearBrowserCookies');
                await client.send('Network.clearBrowserCache');
                await page.goto(this.urls.propertyAppraiserPage, { waitUntil: 'networkidle0'});
              } catch (error) {
                await page.reload();
              }
          
              try {
                await this.sleep(2000);
                const frame: any = await page.frames().find(frame => frame.name() === 'middle'); // Find the right frame.
                // input address
                if(this.searchBy == 'address'){
                    const street_number_input_selector = '#SearchStreetNumber';
                    const street_name_input_selector = '#SearchStreetName';
                    if (parsed_addr.street)
                    await frame.type(street_name_input_selector, parsed_addr.street);
                    if (parsed_addr.number)
                    await frame.type(street_number_input_selector, parsed_addr.number);
                } else {
                    await frame.type('input#SearchOwner', owner_name, {delay: 150});
                }

                await page.keyboard.press('Enter');
                await page.waitFor(100000);
                const frame2: any = await page.frames().find(frame => frame.name() === 'bottom');

                // check result
                const tables = await frame2.$$('#T1 > tbody > tr');
                if (tables.length < 1) {
                    console.log('Not found!');
                    break;
                }
                if(this.searchBy == 'address'){
                    await frame2.click('#T1 > tbody > tr > td:nth-child(1) > a');
                    await this.waitForIFrameLoad(page, 'html > frameset > frame:nth-child(3)');
                    await page.waitFor(2000);
                    const result = await this.getPropertyInfos(page);
                    await this.parseResult(result, document);
                } else {
                  const datalinks = [];
                  for(const row of tables){
                    try{
                        let link = await row.evaluate((el: any) => el.children[0].children[0].getAttribute('href'));
                        link = "http://assessor1.hartford.gov/" + link;
                        let name = await row.evaluate((el: any) => el.children[2].children[0].textContent?.trim());
                        // console.log(name);
                        const regexp = new RegExp(owner_name_regexp);
                        if (regexp.exec(name!.toUpperCase())){
                            datalinks.push(link);
                        }
                    } catch(e){
                        continue;
                    }
                  }
                  for (let datalink of datalinks) {
                    try{
                        console.log("Processing => ", datalink);
                        await page.goto(datalink, {waitUntil: 'networkidle0'});
                        let result = await this.getPropertyInfos(page);
                        await this.parseResult(result, document);
                        if (this.searchBy === 'address') break;
                    } catch (e){
                        console.log(e);
                        console.log('Error during parse property (possibly property is N/A)');
                        continue;
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
        // }
        return true;
    }

    async parseResult(result: any, document: IOwnerProductProperty) {
      let dataFromPropertyAppraiser: any = {};
          dataFromPropertyAppraiser['Full Name'] = result['owner_names'][0]['full_name'];
          dataFromPropertyAppraiser['First Name'] = result['owner_names'][0]['first_name'];
          dataFromPropertyAppraiser['Last Name'] = result['owner_names'][0]['last_name'];
          dataFromPropertyAppraiser['Middle Name'] = result['owner_names'][0]['middle_name'];
          dataFromPropertyAppraiser['Name Suffix'] = result['owner_names'][0]['suffix'];
          dataFromPropertyAppraiser['Owner Occupied'] = result['owner_occupied'];
          dataFromPropertyAppraiser['Mailing Care of Name'] = '';
          dataFromPropertyAppraiser['Mailing Address'] = result['mailing_address'];
          dataFromPropertyAppraiser['Mailing City'] = result['mailing_city'];
          dataFromPropertyAppraiser['Mailing State'] = result['mailing_state'];
          dataFromPropertyAppraiser['Mailing Zip'] = result['mailing_zip'];
          dataFromPropertyAppraiser['Mailing Unit #'] = '';
          dataFromPropertyAppraiser['Property Type'] = result['property_type'];
          dataFromPropertyAppraiser['Total Assessed Value'] = result['total_assessed_value'];
          dataFromPropertyAppraiser['Last Sale Recording Date'] = result['last_sale_recording_date'];
          dataFromPropertyAppraiser['Last Sale Amount'] = result['last_sale_amount'];
          dataFromPropertyAppraiser['Est. Remaining balance of Open Loans'] = '';
          dataFromPropertyAppraiser['Est Value'] = result['est_value'];
          dataFromPropertyAppraiser['yearBuilt'] = '';
          dataFromPropertyAppraiser['Est Equity'] = '';
          dataFromPropertyAppraiser['County'] = 'hartford';
          dataFromPropertyAppraiser['Property State'] = 'CT';
          dataFromPropertyAppraiser['Property Address'] = result['property_address'];
          console.log(dataFromPropertyAppraiser);
          try{
            await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraiser);
          } catch(e){

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

    async getPropertyInfos(page: puppeteer.Page): Promise<any> {
      const frame3: any = await page.frames().find(frame => frame.name() === 'bottom'); // Find the right frame.
      const frame4: any = await page.frames().find(frame => frame.name() === 'middle'); // Find the right frame.
      await frame3.waitForXPath('//b[contains(.,"Owner")]/ancestor::tr/td[2]/font/b/font', {visible:true});
      // name
      let owner_names = [];
      const fullnames_str = await frame3.evaluate((el: any) => el.textContent, (await frame3.$x('//b[contains(.,"Owner")]/ancestor::tr/td[2]/font/b/font'))[0]);
      const fullnames = fullnames_str.split('&');
      for (let fullname of fullnames) {
        let owner_name = this.simplifyString(fullname);
        const ownerName = this.parseOwnerName(owner_name);
        owner_names.push(ownerName);
      } 

      // property address
      const property_address_xpath = '//b[contains(.,"Location")]/ancestor::td/b/font';
      let property_address = await this.getTextByXpathFromPage(frame3, property_address_xpath);
      let property_address_parsed = parser.parseLocation(property_address);

      // mailing address
      const mailing_address_xpath = '//b[contains(.,"Address")]/ancestor::tr/td[2]/font/b/font';
      const mailing_city_xpath = '//font[contains(.,"City")]/ancestor::tr/td[4]/font/b/font';
      const mailing_state_xpath = '//font[contains(.,"State")]/ancestor::tr/td[4]/font/b/font';
      const mailing_zip_xpath = '//font[contains(.,"Zip")]/ancestor::tr/td[4]/font/b/font';
      let mailing_address = await this.getTextByXpathFromPage(frame3, mailing_address_xpath);
      let mailing_zip = await this.getTextByXpathFromPage(frame3, mailing_zip_xpath);
      let mailing_state = await this.getTextByXpathFromPage(frame3, mailing_state_xpath);
      let mailing_city = await this.getTextByXpathFromPage(frame3, mailing_city_xpath);

      const mailing_address_parsed = parser.parseLocation(mailing_address);

      // owner occupied
      let owner_occupied;
      try{
        owner_occupied = this.compareAddress(property_address_parsed, mailing_address_parsed);
      } catch(e){
        owner_occupied = false;
      }

      // property type
      const property_type_xpath = '//font[contains(., "Narrative Description")]/ancestor::tbody//strong[contains(.,"property contains")]/font[2]';
      const property_type = await this.getTextByXpathFromPage(frame3, property_type_xpath);

      const assessment_tab_xpath = '//a[contains(., "Previous Assessment")]';
      let assessment_tab = await frame4.$x(assessment_tab_xpath);

      await assessment_tab[0].click();
      await page.waitFor(2000);
      let pages: any = await this.browser?.pages();
      await pages[2].waitForXPath('//font[contains(., "Total")]');

      // assessed value and est. value
      const total_assessed_value_xpath = '//th[contains(., "Total")]/ancestor::table/tbody/tr[1]/td[7]';
      const total_assessed_value = await this.getTextByXpathFromPage(pages[2], total_assessed_value_xpath);
      const est_value = '';
      await pages[2].close();

      const sales_tab_xpath = '//a[contains(., "Sales")]';
      let sales_tab = await frame4.$x(sales_tab_xpath);

      await sales_tab[0].click();
      await page.waitFor(2000);
      pages = await this.browser?.pages();
      await pages[2].waitForXPath('//font[contains(., "Sale Date")]');

      // sales info"
      const last_sale_recording_date_xpath = '//th[contains(., "Sale Date")]/ancestor::table/tbody/tr[1]/td[1]';
      const last_sale_amount_xpath = '//th[contains(., "Sale Price")]/ancestor::table/tbody/tr[1]/td[2]';
      const last_sale_recording_date = await this.getTextByXpathFromPage(pages[2], last_sale_recording_date_xpath);
      const last_sale_amount = await this.getTextByXpathFromPage(pages[2], last_sale_amount_xpath);
      await pages[2].close();

      return {
        owner_names,
        property_address,
        mailing_address,
        mailing_address_parsed,
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
}