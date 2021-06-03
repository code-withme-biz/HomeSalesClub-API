import puppeteer from 'puppeteer';
import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
const parser = require('parse-address');
const nameParsingService = require('../../consumer_dependencies/nameParsingServiceNew');
var addressit = require('addressit');
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';
import { truncate } from 'fs';

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'http://www.sumterpa.com/GIS/',
    }

    xpaths = {
        isPAloaded: '//iframe[@id="S_Main"]'
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
    async getTextByXpathFromPage(page: puppeteer.Page | puppeteer.Frame, xPath: string): Promise<string> {
      const [elm] = await page.$x(xPath);
      if (elm == null) {
          return '';
      }
      let text = await page.evaluate(j => j.textContent, elm) || '';
      text = text.replace(/\s+|\n/gm, ' ').trim();
      return text;
    }

    async getInnerTextByXpathFromPage(page: puppeteer.Page | puppeteer.Frame, xPath: string): Promise<string> {
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
        const mainpage = this.browserPages.propertyAppraiserPage;
        if (mainpage === undefined) return false;
        
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
                const parseaddr1 = parser.parseLocation(search_value);
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
              let page;
              let tabmenu;
              try {
                const client = await mainpage.target().createCDPSession();
                await client.send('Network.clearBrowserCookies');
                await mainpage.goto(this.urls.propertyAppraiserPage, { waitUntil: 'load'});  
                await mainpage.waitForXPath('//iframe[@id="S_Main"]');
                let [iframe] = await mainpage.$x('//iframe[@id="S_Main"]');
                page = await iframe.contentFrame();
                let [iframe1] = await mainpage.$x('//iframe[@id="S_Top"]');
                tabmenu = await iframe1.contentFrame();
                if (!page || !tabmenu) break;

                await page.waitForXPath('//*[contains(@value, "I agree")]');
                const [agreeButton] = await page.$x('//*[contains(@value, "I agree")]');
                await agreeButton.click();
              } catch (error) {
                await mainpage.reload();
              }
              if (!page || !tabmenu) break;
              
              try {
                if (this.searchBy === 'name') {
                  await page.type('input[name="OwnerName"]', search_value, {delay: 150});
                } else {
                  await page.type('input[name="StreetName"]', search_value, {delay: 150});
                }

                let [buttonSearch] = await page.$x('//*[@name="button_Search"]');
                await buttonSearch.click();
                await this.sleep(2000);
                const tabHandle = await Promise.race([
                  tabmenu.waitForXPath('//*[contains(@src, "2_on.gif")]'),
                  tabmenu.waitForXPath('//*[contains(@src, "3_on.gif")]')
                ]);
                let tabIndex = await tabmenu.evaluate(el => el.getAttribute('name'), tabHandle);
                tabIndex = parseInt(tabIndex.slice(3));
                console.log('tabIndex = ', tabIndex);
                if (tabIndex === 3) {
                  console.log('~~~~ PARCEL')
                  let result = await this.getPropertyInfos(page);
                  if (result) await this.parseResult(result, document);
                  break;
                } else {
                  const [noResult] = await page.$x('//*[contains(text(), "No Matching Records")]');
                  if (noResult) {
                    console.log('*** No Results Found!');
                    break;
                  }
                  console.log('~~~~ LIST')
                  const rows = await page.$x('//*[text()="Parcel ID"]/ancestor::table[1]/tbody/tr[position()>1]');
                  for(const row of rows) {
                    try {
                      let name = await row.evaluate(el => el.children[2].textContent?.trim()) || '';
                      let address = await row.evaluate(el => el.children[3].textContent?.trim()) || ''; 
                      console.log(name, address);
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
                        await page.evaluate(el => el.children[1].children[0].children[0].click(), row);
                        await tabmenu.waitForXPath(`//img[@name="tab3"][contains(@src, "_on.gif")]`);
                        await this.sleep(1000);
                        let result = await this.getPropertyInfos(page);
                        if (result) await this.parseResult(result, document);
                        await tabmenu.click(`a[href="javascript:SearchMenu('2');"]`);
                        await tabmenu.waitForXPath(`//img[@name="tab2"][contains(@src, "_on.gif")]`);
                        await this.sleep(1000);
                        if (this.searchBy === 'address') break;
                      }
                    } catch (e) {
                      console.log(e);
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
      const full_name_xpath = '//td[*[text()="Owner\'s Name"]]/following-sibling::td[1]'
      let full_name = await this.getTextByXpathFromPage(page, full_name_xpath);
      full_name = full_name.split('&')[0].trim();
      full_name = full_name.replace(/\W|\s+/g, ' ').trim();
      let parseName = this.parseOwnerName(full_name);
      const owner_names = [parseName];
            
      // mailing address
      const mailing_address_xpath = '//td[*[text()="Mail Address"]]/following-sibling::td[1]';
      let mailing_address = await this.getTextByXpathFromPage(page, mailing_address_xpath);
      let mailing_address_parsed = parser.parseLocation(mailing_address);
      mailing_address = this.getStreetAddress(mailing_address);
      mailing_address = mailing_address.replace(/\s+/g, ' ').trim();
      let mailing_zip = '';
      let mailing_state = '';
      let mailing_city = '';
      if(mailing_address_parsed){
        mailing_zip = mailing_address_parsed.zip ? mailing_address_parsed.zip : '';
        mailing_state = mailing_address_parsed.state ? mailing_address_parsed.state : '';
        mailing_city = mailing_address_parsed.city ? mailing_address_parsed.city : '';
      }

      // property address
      const property_address_xpath = '//td[*[text()="Site Address"]]/following-sibling::td[1]';
      let property_address = await this.getTextByXpathFromPage(page, property_address_xpath);
      let property_address_parsed = parser.parseLocation(property_address);
      property_address = this.getStreetAddress(property_address);
      property_address = property_address.replace(/\s+/g, ' ').trim();
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
      const property_type_xpath = '//td[*[contains(text(), "Use Desc.")]]/following-sibling::td[1]';
      const property_type = await this.getTextByXpathFromPage(page, property_type_xpath);

      // sales info"
      const last_sale_recording_date_xpath = '//*[text()="Sale Date"]/ancestor::table[1]/tbody/tr[2]/td[1]';
      const last_sale_recording_date = await this.getTextByXpathFromPage(page, last_sale_recording_date_xpath);
      const last_sale_amount_xpath = '//*[text()="Sale Date"]/ancestor::table[1]/tbody/tr[2]/td[5]'
      const last_sale_amount = await this.getTextByXpathFromPage(page, last_sale_amount_xpath);

      // assessed value and est. value
      const total_assessed_value_xpath = '//*[contains(text(), "Assessed  Value")]/ancestor::td[1]/following-sibling::td[1]';
      const total_assessed_value = await this.getTextByXpathFromPage(page, total_assessed_value_xpath);
      const est_value_xpath = '//*[contains(text(), "Market Value")]/ancestor::td[1]/following-sibling::td[1]';
      const est_value = await this.getTextByXpathFromPage(page, est_value_xpath);
                                  
      // yearBuilt
      const year_built_xpath = '//*[text()="Year Built"]/ancestor::td[1]/following-sibling::td[1]';
      const year_built = await this.getTextByXpathFromPage(page, year_built_xpath);
        
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