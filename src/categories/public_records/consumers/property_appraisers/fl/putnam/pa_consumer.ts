import puppeteer from 'puppeteer';
import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
const parser = require('parse-address');
const nameParsingService = require('../../consumer_dependencies/nameParsingServiceNew');
var addressit = require('addressit');
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'https://apps.putnam-fl.com/pa/simplesearch/main.php',
    }

    xpaths = {
        isPAloaded: '//frame[@name="left"]'
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
     * getTextByXpathFromPage
     * @param page 
     * @param xPath 
     */
    async getTextByXpathFromPage(page: puppeteer.Frame, xPath: string): Promise<string> {
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
            let address_house = '';
            let address_street = '';

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
                search_value = document.propertyId['Property Address'];
                const parseaddr = this.getAddressV2(document.propertyId);
                const parseaddr1 = parser.parseLocation(search_value);
                if(!this.isEmptyOrSpaces(parseaddr.street_address)){
                    search_value = parseaddr.street_address;
                }
                address_house = parseaddr1.number;
                address_street = parseaddr1.street;
                search_value = search_value.toUpperCase();
                console.log(`Looking for address: ${document.propertyId['Property Address']}`);
            }

            let retry_count = 0;
            while (true){
              if (retry_count > 3){
                  console.error('Connection/website error for 15 iteration.');
                  return false;
              }
              let lFrame;
              try {
                const client = await page.target().createCDPSession();
                await client.send('Network.clearBrowserCookies');
                await page.goto(this.urls.propertyAppraiserPage, { waitUntil: 'load'});
                await page.waitForSelector('frame[name="left"]');
                const [iframe1] = await page.$$('frame[name="left"]');
                lFrame = await iframe1.contentFrame();
                if (!lFrame) break;
                await lFrame.waitForXPath('//*[@class="myButton"][text()="Search"]');
              } catch (error) {
                await page.reload();
              }
              if (!lFrame) break;
              try {
                if (this.searchBy === 'name') {
                  await lFrame.type('input#sname', search_value, {delay: 150});
                } else {
                  await lFrame.type('input#addr', search_value, {delay: 150});
                }

                let [buttonSearch] = await lFrame.$x('//*[@class="myButton"][text()="Search"]');
                await buttonSearch.click();
                
                await Promise.race([
                  lFrame.waitForXPath('//*[contains(text(), "Please scroll down")]'),
                  lFrame.waitForXPath('//*[contains(text(), "NOTHING FOUND")]')
                ]);
                const [noResult] = await lFrame.$x('//*[contains(text(), "NOTHING FOUND")]');
                if (noResult) {
                  console.log('*** No Results Found!');
                  break;
                }
                                
                const rows = await lFrame.$x('//table[contains(@class, "table1")]/tbody');
                for(const row of rows) {
                  let parcel_id = await row.evaluate(el => el.children[0].textContent?.trim()) || '';
                  let name = await row.evaluate(el => el.children[1].textContent?.trim()) || '';
                  let address = await row.evaluate(el => el.children[2].textContent?.trim()) || ''; 
                  let flag = false;
                  if(this.searchBy == 'name') {
                    const regexp = new RegExp(owner_name_regexp);
                    if (regexp.exec(name.toUpperCase())){
                      flag = true;
                    }
                  } else {
                    if(this.compareStreetAddress(address, search_value)){
                      flag = true;
                    }
                  }
                  if (flag) {
                    try{
                      const [parcel_button] = await row.$x('//tr[1]/td[1]/a[1]');
                      await parcel_button.click();
                      await this.sleep(3000);
                      await page.waitForSelector('frame[name="main"]');
                      const [iframe] = await page.$$('frame[name="main"]');
                      let rFrame = await iframe.contentFrame();
                      if (!rFrame) break;
                      await rFrame.waitForXPath(`//*[contains(text(), "Parcel: ${parcel_id}")]`);
                      await rFrame.waitForXPath('//*[contains(text(), "Requesting content")]', {visible: true});
                      await rFrame.waitForXPath('//*[contains(text(), "Requesting content")]', {hidden: true});
                      let result = await this.getPropertyInfos(rFrame);
                      if (result) await this.parseResult(result, document);
                      if (this.searchBy === 'address') break;
                    } catch(e){
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
          'yearBuilt': result['year_built'],
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

    async getPropertyInfos(page: puppeteer.Frame): Promise<any> {
      // name
      const owner_names = [];
      const onwer_name_xpath = '//*[@id="countrydivcontainer"]/table/tbody/tr[1]/td[1]';
      let owner_name: any = await this.getTextByXpathFromPage(page, onwer_name_xpath);
      owner_name = owner_name.split('+')[0];
      owner_name = owner_name.replace(/\W|\s+/g, ' ').trim();
      owner_name = this.parseOwnerName(owner_name.trim());
      owner_names.push(owner_name);

      // mailing address
      const mailing_address_xpath = '//*[@id="countrydivcontainer"]/table/tbody/tr[2]/td[1]/text()[last()]';
      let mailing_address = await this.getTextByXpathFromPage(page, mailing_address_xpath);
      const mailing_address_parsed = parser.parseLocation(mailing_address);
      mailing_address = this.getStreetAddress(mailing_address);
      let mailing_zip = '';
      let mailing_state = '';
      let mailing_city = '';
      if(mailing_address_parsed){
        mailing_zip = mailing_address_parsed.zip ? mailing_address_parsed.zip : '';
        mailing_state = mailing_address_parsed.state ? mailing_address_parsed.state : '';
        mailing_city = mailing_address_parsed.city ? mailing_address_parsed.city : '';
      }

      // property address
      const property_address_xpath = '//*[@id="countrydivcontainer"]/p[1]/table/tbody/tr[2]/td/text()[1]';
      let property_address = await this.getTextByXpathFromPage(page, property_address_xpath);
      const property_address_parsed = parser.parseLocation(property_address);
      property_address = this.getStreetAddress(property_address);
      let property_zip = '';
      let property_state = '';
      let property_city = '';
      if(property_address_parsed){
        property_zip = property_address_parsed.zip ? property_address_parsed.zip : '';
        property_state = property_address_parsed.state ? property_address_parsed.state : '';
        property_city = property_address_parsed.city ? property_address_parsed.city : '';
      }
      
      // owner occupied
      let owner_occupied = mailing_address === property_address;

      // property type
      const property_type_xpath = '//*[contains(text(), "Property Use:")]/following-sibling::td[1]';
      const property_type = await this.getTextByXpathFromPage(page, property_type_xpath);

      const total_assessed_value_xpath = '//td[contains(text(), "Just Value of Land:")]/following-sibling::td[1]';
      const total_assessed_value = await this.getTextByXpathFromPage(page, total_assessed_value_xpath);
      const est_value_xpath = '//td[contains(text(), "Market Value:")]/following-sibling::td[1]';
      const est_value = await this.getTextByXpathFromPage(page, est_value_xpath);

      // sales info"
      const [salesbutton] = await page.$x('//a[contains(text(), "Sales")]/parent::li[1]');
      await salesbutton.click();
      await page.waitForXPath('//*[contains(text(), "Requesting content")]', {visible: true});
      await page.waitForXPath('//*[contains(text(), "Requesting content")]', {hidden: true});
      await this.sleep(1000);
      const last_sale_recording_date_xpath = '//td[contains(text(), "Sale Date")]/ancestor::table[1]/tbody/tr[3]/td[3]';
      const last_sale_recording_date = await this.getTextByXpathFromPage(page, last_sale_recording_date_xpath);
      const last_sale_amount_xpath = '//td[contains(text(), "Sale Date")]/ancestor::table[1]/tbody/tr[3]/td[5]'
      const last_sale_amount = await this.getTextByXpathFromPage(page, last_sale_amount_xpath);

      const [improvbutton] = await page.$x('//a[contains(text(), "Improvements")]/parent::li[1]');
      let year_built = '';
      if(improvbutton){
        await improvbutton.click();
        await page.waitForXPath('//*[contains(text(), "Requesting content")]', {visible: true});
        await page.waitForXPath('//*[contains(text(), "Requesting content")]', {hidden: true});
        await this.sleep(1000);
        year_built = await this.getTextByXpathFromPage(page, '//td[text()="Actual Year Built"]/parent::tr/td[2]');
      }

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
        est_value,
        year_built
      }
    }

    getStreetAddress(full_address:string): any {
      const parsed = addressit(full_address);
      let street_address = (parsed.number ? parsed.number : '') + ' ' + (parsed.street ? parsed.street : '') + ' ' + (parsed.unit ? '#'+parsed.unit : '');
      street_address = street_address.replace(/\s+/, ' ').trim();
      return street_address;
    }
}