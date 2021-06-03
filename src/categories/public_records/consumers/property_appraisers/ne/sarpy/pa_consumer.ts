import puppeteer from 'puppeteer';
import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
const parser = require('parse-address');
const nameParsingService = require('../../consumer_dependencies/nameParsingServiceNew');
var addressit = require('addressit');
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';
import { IProperty } from '../../../../../../models/property';

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'https://apps.sarpy.com/sarpyproperty/'
    }

    xpaths = {
        isPAloaded: '//*[@value="Submit"]'
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
     * getTextByXpathFromPage
     * @param page 
     * @param xPath 
     */
    async getTextByXpathFromPage(page: puppeteer.Page, xPath: string): Promise<string> {
      const [elm] = await page.$x(xPath);
      if (elm == null) {
          return '';
      }
      let text = await page.evaluate(j => j.textContent, elm) || '';
      text = text.replace(/\s+|\n/gm, ' ').trim();
      return text;
    }

    async getInnerTextByXpathFromPage(page: puppeteer.Page, xPath: string): Promise<string> {
      const [elm] = await page.$x(xPath);
      if (elm == null) {
          return '';
      }
      let text = await page.evaluate(j => j.innerText, elm);
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
        let index = 0;
        let document = docsToParse;
            index++;
            console.log('~ @ ~ @ ~ @ ~ @ ~ @ ~ @ ~ @ ~ @ ~ @ ~ @ ~');
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
              const nameInfo = this.getNameInfo(document.ownerId, ",");
              first_name = nameInfo.first_name;
              last_name = nameInfo.last_name;
              owner_name = nameInfo.owner_name;
              owner_name_regexp = nameInfo.owner_name_regexp;
              if (owner_name === '') return false;
              console.log(`Looking for owner: ${owner_name}`);
              search_value = owner_name;
            }
            else {
                search_value = document.propertyId['Property Address'];
                const parseaddr = this.getAddressV2(document.propertyId);
                if(!this.isEmptyOrSpaces(parseaddr.street_address)){
                    search_value = parseaddr.street_address;
                }
                search_value = search_value.toUpperCase();
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
                await page.goto(this.urls.propertyAppraiserPage, { waitUntil: 'load'});
              } catch (error) {
                await page.reload();
              }
              try {
                if (this.searchBy === 'name') {
                  await page.click('input#MainContent_SimpleControl2_txtName', {clickCount: 3, delay: 150});
                  await page.type('input#MainContent_SimpleControl2_txtName', search_value, {delay: 150});
                } else {
                  await page.click('input#MainContent_SimpleControl2_txtAddress', {clickCount: 3, delay: 150});
                  await page.type('input#MainContent_SimpleControl2_txtAddress', search_value, {delay: 150});
                }

                let buttonSearch = await page.$x('//input[@value="Submit"]');
                await Promise.all([
                  buttonSearch[0].click(),
                  page.waitForNavigation()
                ]);
                
                const [hasResult] = await page.$x('//*[text()="View Details"]/ancestor::table[1]/tbody/tr');
                if (!hasResult) {
                  console.log('*** No Results Found!');
                  break;
                }
                                
                const links = [];
                if(this.searchBy == 'name'){
                  const rows = await page.$x('//*[text()="View Details"]/ancestor::table[1]/tbody/tr');
                  for(const row of rows){
                    try{
                      let name = await row.evaluate(el => el.children[5].textContent?.trim()) || '';
                      const regexp = new RegExp(owner_name_regexp);
                      if (regexp.exec(name.toUpperCase())){
                          let link = await row.evaluate(el => el.children[3].children[1].getAttribute('href')) || '';
                          links.push(link);
                      }
                    } catch(e){
                        console.log(e);
                    }
                  }
                } else {
                  const rows = await page.$x(`//*[text()="View Details"]/ancestor::table[1]/tbody/tr/td[contains(translate(text(), 'abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'), "${search_value}")]/parent::tr[1]`);
                  for (const row of rows) {
                    let link = await row.evaluate(el => el.children[3].children[1].getAttribute('href')) || '';
                    links.push(link);
                  }
                }
                console.log(links)
                if (links.length === 0) {
                  console.log('*** No Results Found!');
                  break;
                }
                for (const link of links) {
                  await page.goto(`https://apps.sarpy.com/sarpyproperty/${link}`, {waitUntil: 'load'});
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
          'Property State': this.publicRecordProducer.state,
          'Property Zip': result['property_zip'] || '',
          'County': this.publicRecordProducer.county,
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
      console.log(dataFromPropertyAppraisers);
      try{
        await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
      } catch(e){
        //
      }
    }

    async getPropertyInfos(page: puppeteer.Page): Promise<any> {
      // name
      const full_name_xpath = '//*[contains(text(), "Owner:")]/following-sibling::td[1]';
      await page.waitForXPath(full_name_xpath, {visible: true});
      let full_name: any = await this.getTextByXpathFromPage(page, full_name_xpath);
      full_name = full_name.split('&').map((s:string)=>s.trim()).filter((s:string)=>s!=='')[0];
      full_name = full_name.replace(/\W|\s+/g, ' ').trim();
      let parseName = this.parseOwnerName(full_name);
      const owner_names = [parseName];

      // property address
      const property_address_xpath = '//*[contains(text(), "Location:")]/following-sibling::td[1]';
      let property_address = await this.getTextByXpathFromPage(page, property_address_xpath);
      property_address = property_address.replace(/\W|\s+/g, ' ').trim();
      let property_state = this.publicRecordProducer.state;
      let property_city = '';
      let property_zip = '';
      
      // mailing address
      const mailing_address_full_xpath = '//*[contains(text(), "Mail Address:")]/following-sibling::td[1]';
      let mailing_full_address: any = await this.getInnerTextByXpathFromPage(page, mailing_address_full_xpath);
      mailing_full_address = mailing_full_address.split('\n').map((s:string)=>s.trim()).filter((s:string)=>s!=='');
      let mailing_address = mailing_full_address[0];
      let mailing_address_parsed = parser.parseLocation(mailing_full_address.join(' '));
      let mailing_zip = '';
      let mailing_state = '';
      let mailing_city = '';
      if(mailing_address_parsed){
        mailing_zip = mailing_address_parsed.zip ? mailing_address_parsed.zip : '';
        mailing_state = mailing_address_parsed.state ? mailing_address_parsed.state : '';
        mailing_city = mailing_address_parsed.city ? mailing_address_parsed.city : '';
      }

      // owner occupied
      let owner_occupied = mailing_address === property_address;

      // sales info"
      const last_sale_recording_date_xpath = '//*[@id="SalesControl_SalesTable"]/tbody/tr[2]/td[1]';
      const last_sale_recording_date = await this.getTextByXpathFromPage(page, last_sale_recording_date_xpath);
      const last_sale_amount_xpath = '//*[@id="SalesControl_SalesTable"]/tbody/tr[2]/td[4]'
      const last_sale_amount = await this.getTextByXpathFromPage(page, last_sale_amount_xpath);

      // property type
      const property_type_xpath = '//td[text()="Primary Description:"]/following-sibling::*[1]';
      const property_type = await this.getTextByXpathFromPage(page, property_type_xpath);

      // assessed value and est. value
      const total_assessed_value_xpath = '//*[contains(text(), "Total Value")]/ancestor::table[1]/tbody/tr[2]/td[5]';
      const total_assessed_value = await this.getTextByXpathFromPage(page, total_assessed_value_xpath);
      const est_value_xpath = '//*[contains(text(), "Total Value")]/ancestor::table[1]/tbody/tr[2]/td[2]'
      const est_value = await this.getTextByXpathFromPage(page, est_value_xpath);

      return {
        owner_names, 
        property_address,
        property_city,
        property_state,
        property_zip,
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