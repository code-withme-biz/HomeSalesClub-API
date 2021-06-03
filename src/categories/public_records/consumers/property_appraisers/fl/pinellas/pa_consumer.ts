import puppeteer from 'puppeteer';
import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
import { IPublicRecordAttributes } from '../../../../../../models/public_record_attributes'
import { result } from 'lodash';
import {IPublicRecordProducer} from "../../../../../../models/public_record_producer";
import {IOwnerProductProperty} from "../../../../../../models/owner_product_property";
import { Iot } from 'aws-sdk';
const parser = require('parse-address');
const {parseFullName} = require('parse-full-name');

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;


    urls = {
        propertyAppraiserPage: 'https://www.pcpao.org/searchbyAddress.php',
        searchByNamePage: 'https://www.pcpao.org/searchbyNAME.php'
    }

    xpaths = {
        isPAloaded: '//button[@name="buttonName"]'
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
    async checkExistElement(page: puppeteer.Frame | puppeteer.Page, selector: string): Promise<Boolean> {
      const exist = await page.$(selector).then(res => res !== null);
      return exist;
    }

    /**
     * get textcontent from specified element
     * @param page
     * @param root
     * @param selector
     */
    async getElementTextContent(page: puppeteer.Frame | puppeteer.Page, selector: string): Promise<string> {
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
    async getElementHtmlContent(page: puppeteer.Frame | puppeteer.Page, selector: string): Promise<string> {
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

    async getTextByXpathFromPage(page: puppeteer.Frame | puppeteer.Page, xPath: string): Promise<string> {
      const [elm] = await page.$x(xPath);
      if (elm == null) {
          return '';
      }
      let text = await page.evaluate(j => j.innerText, elm);
      return text.replace(/\n/g, ' ');
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
      const address2_number = address2.number===undefined ? '' : address2.number.trim().toUpperCase();
      const address1_prefix = address1.prefix===undefined ? '' : address1.prefix.trim().toUpperCase();
      const address2_prefix = address2.prefix===undefined ? '' : address2.prefix.trim().toUpperCase();
      const address1_type = address1.type===undefined ? '' : address1.type.trim().toUpperCase();
      const address2_type = address2.type===undefined ? '' : address2.type.trim().toUpperCase();
      const address1_street = address1.street===undefined ? '' : address1.street.trim().toUpperCase();
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
            // let docToSave: any = await this.getLineItemObject(document);
            if (!this.decideSearchByV2(document)) {
                   console.log('Insufficient info for Owner and Property');
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

            try {
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
                const parseaddr = this.getAddressV2(document.propertyId);
                if(!this.isEmptyOrSpaces(parseaddr.street_address)){
                  street_addr = parseaddr.street_address;
                }
                console.log(`Looking for address: ${street_addr}`);
              }
            } catch (error) {
              return false;
            }

            let retry_count = 0;
            while (true){
              if (retry_count > 3){
                  console.error('Connection/website error for 15 iteration.');
                  return false;
              }
              try {
                const url = this.searchBy === 'name' ?
                  `https://www.pcpao.org/query_name.php?Text1=${owner_name}&nR=1000` :
                  `https://www.pcpao.org/query_address.php?Addr2=${street_addr}`;
                await page.goto(url, { waitUntil: 'load'});
              } catch (error) {
                await page.reload();
              }
          
              try {
                const button_agree = await page.$('button[name="buttonName"]');
                if (button_agree) {
                  await Promise.all([
                    button_agree.click(),
                    page.waitForNavigation()
                  ]);
                }
                
                // check result
                let [result_handle] = await page.$x('//*[text()="Ownership"]/parent::tr/following-sibling::tr/td[2]');
                if(!result_handle && this.searchBy == "name"){
                  //// Optimize search by Name
                  try {
                    const url = `https://www.pcpao.org/query_name.php?Text1=${document.ownerId['Full Name']}&nR=1000`
                    await page.goto(url, { waitUntil: 'load'});
                    const button_agree = await page.$('button[name="buttonName"]');
                    if (button_agree) {
                      await Promise.all([
                        button_agree.click(),
                        page.waitForNavigation()
                      ]);
                    }
                    [result_handle] = await page.$x('//*[text()="Ownership"]/parent::tr/following-sibling::tr/td[2]');
                  } catch (error) {
                    await page.reload();
                  }
                }
                if (result_handle) {
                  const rows = await page.$x('//*[text()="Ownership"]/parent::tr/parent::tbody/tr[position()>1]');
                  const datalinks = [];
                  if (this.searchBy === 'name') {
                    // console.log(rows.length)
                    for (const row of rows) {
                      const {name, link} = await page.evaluate(el => ({name: el.children[0].textContent, link: el.children[1].children[0].href}), row);
                      // console.log("LINK : ",link);
                      const regexp = new RegExp(owner_name_regexp);
                      if (!regexp.exec(name.toUpperCase())) continue;
                      // console.log(name)
                      datalinks.push(link);
                    }
                  }
                  else {
                    let link = await result_handle.evaluate(el => el.children[0].getAttribute('href'));
                    link = "https://www.pcpao.org/" + link;
                    // console.log("LINK : ",link);
                    datalinks.push(link);
                  }

                  for (const datalink of datalinks) {
                    console.log(datalink);
                    await page.goto(datalink, {waitUntil: 'load'});
                    const button_agree = await page.$('button[name="buttonName"]');
                    if (button_agree) {
                      await Promise.all([
                        button_agree.click(),
                        page.waitForNavigation()
                      ]);
                    }
                    const body_frame = await page.$('frame[name="bodyFrame"]');
                    if (body_frame) {
                      const body_frame_content = await body_frame.contentFrame();
                      if (body_frame_content) {
                        const result = await this.getPropertyInfos(body_frame_content, address);
                        this.parseResult(result, document);
                      }
                    }
                  }
                }
                else {
                  console.log('No result found');
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
      // for (let index = 0; index < result['owner_names'].length ; index++) {
      const owner_name = result['owner_names'][0];
        // if (index == 0) {
      dataFromPropertyAppraisers['Full Name'] = owner_name['full_name'];
      dataFromPropertyAppraisers['First Name'] = owner_name['first_name'];
      dataFromPropertyAppraisers['Last Name'] = owner_name['last_name'];
      dataFromPropertyAppraisers['Middle Name'] = owner_name['middle_name'];
      dataFromPropertyAppraisers['Name Suffix'] = owner_name['suffix'];
      dataFromPropertyAppraisers['Owner Occupied'] = result['owner_occupied'];
      dataFromPropertyAppraisers['Mailing Care of Name'] = '';
      dataFromPropertyAppraisers['Mailing Address'] = result['mailing_address'];
      // if (this.searchBy === 'name') {
      dataFromPropertyAppraisers['Property Address'] = result['property_address'];
      dataFromPropertyAppraisers['Property City'] = result['property_city'];
      dataFromPropertyAppraisers['Property State'] = 'FL';
      dataFromPropertyAppraisers['Property Zip'] = result['property_zip'];
      // }
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
      dataFromPropertyAppraisers['County'] = 'Pinellas';
      await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
    }

    async getPropertyInfos(page: puppeteer.Frame | puppeteer.Page, address: any): Promise<any> {
      // name and mailing address
      const name_and_address_str = await this.getElementHtmlContent(page, 'body > table:nth-child(2) > tbody > tr:first-child > td > table > tbody > tr:nth-child(3) > td > table > tbody > tr:nth-child(2) > td:first-child');
      const name_and_addres = name_and_address_str.split("<br>");
      name_and_addres.splice(name_and_addres.length-1, 1);

      // name
      const owner_names = [];
      for (let index = 0 ; index < name_and_addres.length-2 ; index++) {
        const owner_name_iter = name_and_addres[index].trim();
        if (owner_name_iter === '') break;
        const ownerName = this.parseOwnerName(owner_name_iter);
        owner_names.push(ownerName);
      }

      // mailing address
      const mailing_address = name_and_addres.splice(name_and_addres.length-2, 2).join(', ');
      const mailing_address_parsed = parser.parseLocation(mailing_address);

      // property address
      const property_address_xpath = '//*[starts-with(text(), "Site Address")]/parent::tr/following-sibling::tr/td[2]';
      let property_address: any = await this.getTextByXpathFromPage(page, property_address_xpath);
      property_address = property_address.replace(/\n|\s+/gm, ' ').trim();
      const property_address_parsed = parser.parseLocation(property_address);
      property_address =
        ((property_address_parsed['number'] ? property_address_parsed['number'] + ' ' : '') +
        (property_address_parsed['prefix'] ? property_address_parsed['prefix'] + ' ' : '') +
        (property_address_parsed['street'] ? property_address_parsed['street'] + ' ' : '') +
        (property_address_parsed['type'] ? property_address_parsed['type'] : '')).trim();
      const property_city = property_address_parsed['city'] || '';
      const property_state = property_address_parsed['state'] || '';
      const property_zip = property_address_parsed['zip'] || '';

      // owner occupied
      const owner_occupied = this.compareAddress(mailing_address_parsed, address ? address : property_address_parsed);
      
      // property type
      const property_type_selector = 'body > table:nth-child(2) > tbody > tr:first-child > td > table > tbody > tr:nth-child(4) > td > table > tbody > tr > td:first-child';
      let property_type = await this.getElementTextContent(page, property_type_selector);
      property_type = property_type.slice(property_type.indexOf('(')+1, property_type.length-1);

      // sales info
      const last_sale_recording_date_selector = 'body > table:nth-child(2) > tbody > tr:nth-child(5) > td:nth-child(2) > table > tbody > tr:nth-child(3) > td:first-child';
      const last_sale_amount_selector = 'body > table:nth-child(2) > tbody > tr:nth-child(5) > td:nth-child(2) > table > tbody > tr:nth-child(3) > td:nth-child(3)';
      const last_sale_recording_date = await this.getElementTextContent(page, last_sale_recording_date_selector);
      const last_sale_amount = await this.getElementTextContent(page, last_sale_amount_selector);
      
      // assessed value and est. value
      const total_assessed_value_selector = 'body > table:nth-child(2) > tbody > tr:nth-child(3) > td > table > tbody > tr:nth-child(2) > td > table:nth-child(2) > tbody > tr:nth-child(3) > td:nth-child(4) > b';
      const est_value_selector = 'body > table:nth-child(2) > tbody > tr:nth-child(3) > td > table > tbody > tr:nth-child(2) > td > table:nth-child(2) > tbody > tr:nth-child(3) > td:nth-child(3) > b';
      const total_assessed_value = await this.getElementTextContent(page, total_assessed_value_selector);
      const est_value = await this.getElementTextContent(page, est_value_selector);


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
        est_value
      }
    }
}