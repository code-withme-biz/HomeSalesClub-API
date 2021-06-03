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
        propertyAppraiserPage: 'http://www6.richlandcountysc.gov/AssessorSearch/(S(1igobes0rh3are1vkykep3ud))/AssessorSearch.aspx'
    }

    xpaths = {
        isPAloaded: '//input[@id="txtLocation"]'
    }

    constructor(publicRecordProducer: IPublicRecordProducer, ownerProductProperties: IOwnerProductProperty) {
        super();
        this.publicRecordProducer = publicRecordProducer;
        this.ownerProductProperties = ownerProductProperties;
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
    getAddress(document: any): any {
      // 'Property Address': '162 DOUGLAS HILL RD',
      // 'Property City': 'WEST BALDWIN',
      // County: 'Cumberland',
      // 'Property State': 'ME',
      // 'Property Zip': '04091',
      const full_address = `${document['Property Address']}, ${document['Property City']}, ${document['Property State']} ${document['Property Zip']}`
      const parsed = parser.parseLocation(full_address);
      
      let street_name = parsed.street.trim();
      let street_full = document['Property Address'];
      let street_with_type = parsed.street + ' ' + parsed.type;

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
     * get value attribute's value from input
     * @param page 
     * @param selector 
     */
    async getInputValue(page: puppeteer.Page, selector: string): Promise<string> {
      try {
        const existSel = await this.checkExistElement(page, selector);
        if (!existSel) return '';
        const value = await page.$eval(selector, (el:any) => el['value'].trim());
        return value ? value : '';
      } catch (error) {
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
      const address1_number = address1.parsed.number===undefined ? '' : address1.parsed.number.trim().toUpperCase();
      const address2_number = address2.number===undefined ? '' : address2.number.trim().toUpperCase();
      const address1_prefix = address1.parsed.prefix===undefined ? '' : address1.parsed.prefix.trim().toUpperCase();
      const address2_prefix = address2.prefix===undefined ? '' : address2.prefix.trim().toUpperCase();
      const address1_type = address1.parsed.type===undefined ? '' : address1.parsed.type.trim().toUpperCase();
      const address2_type = address2.type===undefined ? '' : address2.type.trim().toUpperCase();
      const address1_street = address1.parsed.street===undefined ? '' : address1.parsed.street.trim().toUpperCase();
      const address2_street = address2.street===undefined ? '' : address2.street.trim().toUpperCase();
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
                search_value = owner_name;
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
                  search_value = ((parsev1.number ? parsev1.number : '') + ' ' + (parsev1.street ? parsev1.street : '')).trim();
                  console.log(`Looking for address: ${document.propertyId['Property Address']}`);
              }

            let retry_count = 0;
            while (true){
              if (retry_count > 3){
                  console.error('Connection/website error for 15 iteration.');
                  return false;
              }
              try {
                await page.goto(this.urls.propertyAppraiserPage, { waitUntil: 'networkidle0'});
              } catch (error) {
                await page.reload();
              }
          
              try {
                // input address
                if(this.searchBy == 'address'){
                    await page.type('input#txtLocation', search_value, {delay: 150});
                } else {
                    await page.type('input#txtPropOwner', search_value, {delay: 150});
                }

                await Promise.all([
                  page.keyboard.press('Enter'),
                  page.waitForNavigation({waitUntil: 'networkidle0'})
                ]);
                
                // check result
                if(this.searchBy == 'address'){
                    const parcel_link = await page.$('table#DataGrid1 > tbody > tr > td:first-child  > a');
                    if (parcel_link) {
                        const link = await page.evaluate(el => el.href, parcel_link);
                        await page.goto(link, {waitUntil: 'load'});
                        const result = await this.getPropertyInfos(page);
                        await this.parseResult(result, document);
                    } else {
                        console.log('Not found!');
                    }
                } else {
                    const search_results = await page.$x('//table[@id="DataGrid1"]/tbody/tr');
                    const datalinks = [];
                    if(search_results.length < 1 ){
                        console.log('Not found!');
                        break;
                    }
                    search_results.shift();
                    for(const row of search_results){
                        try{
                            let link = await row.evaluate(el => el.children[0].children[0].getAttribute('href'));
                            link = "http://www6.richlandcountysc.gov/AssessorSearch/(S(syt32deqy0scis1h2vww2mle))/" + link?.trim();
                            let name = await row.evaluate(el => el.children[4].textContent?.trim());
                            console.log(name);
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
                        } catch (e){
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
          dataFromPropertyAppraisers['yearBuilt'] = '';
          dataFromPropertyAppraisers['Est Equity'] = '';
          dataFromPropertyAppraisers['County'] = 'Richland';
          dataFromPropertyAppraisers['Property State'] = 'SC';
          dataFromPropertyAppraisers['Property Address'] = result['property_address'];
        try {
            await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
        } catch(e){
            //
        }
    }

    async getPropertyInfos(page: puppeteer.Page): Promise<any> {
      // name
      const owner_names = [];
      const owner_name = await this.getInputValue(page, 'input#txtOwner')
      const owner_name_arr = owner_name.split('&');
      for (let owner_name_iter of owner_name_arr) {
        if (owner_name_iter.trim() === '') break;
        const ownerName = this.parseOwnerName(owner_name_iter.trim());
        owner_names.push(ownerName);
      }

      const property_address = await this.getInputValue(page, 'input#txtPropLocation');
      const property_address_parsed = parser.parseLocation(property_address);

      // mailing address
      const address1 = await this.getInputValue(page, 'input#txtAddress1');
      const address2 = await this.getInputValue(page, 'input#txtAddress2');
      const address3 = await this.getInputValue(page, 'input#txtAddress3');
      const addr = address3.trim() != '' ? address3 : (address2.trim() != '' ? address2 : address1);
      const city = await this.getInputValue(page, 'input#txtCity');
      const state_zip = await this.getInputValue(page, 'input#txtState');
      const mailing_address = `${addr}, ${city}, ${state_zip}`;
      const mailing_address_parsed = parser.parseLocation(mailing_address);

      // owner occupied
      let owner_occupied: any = false;
      try{
        owner_occupied = this.compareAddress(property_address_parsed, mailing_address_parsed);
      } catch(e){
          //
      }
      
      // property type
      const property_type = await this.getInputValue(page, 'input#txtZoneCode');

      // sales info
      const last_sale_date_selector = 'table#DataGrid1 > tbody > tr:nth-child(3) > td:nth-child(2)';
      const last_sale_amount_selector = 'table#DataGrid1 > tbody > tr:nth-child(3) > td:nth-child(5)';
      const last_sale_recording_date = await this.getElementTextContent(page, last_sale_date_selector);
      const last_sale_amount = await this.getElementTextContent(page, last_sale_amount_selector);
      
      // assessed value and est. value
      const total_assessed_value = await this.getInputValue(page, 'input#txtTotAssd');
      const est_value = '';

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