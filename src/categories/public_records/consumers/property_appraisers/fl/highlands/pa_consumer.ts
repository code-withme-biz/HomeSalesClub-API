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
        propertyAppraiserPageOwner: 'https://www.hcpao.org/Search#owner',
        propertyAppraiserPageAddress: 'https://www.hcpao.org/Search#address'
    }

    xpaths = {
        isPAloaded: '//*[@name="SearchMode"]'
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
          await this.browserPages.propertyAppraiserPage.goto(this.urls.propertyAppraiserPageOwner, { waitUntil: 'load' });
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
        // console.log(`Documents to look up: ${docsToParse.length}.`);
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
                address_house = parseaddr1.number;
                address_street = parseaddr1.street;
                if (!address_house || !address_street) return false;
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
                if (this.searchBy === 'name')
                  await page.goto(this.urls.propertyAppraiserPageOwner, { waitUntil: 'load'});  
                else
                  await page.goto(this.urls.propertyAppraiserPageAddress, { waitUntil: 'load'});
                await page.waitForXPath('//*[@id="SearchMode"]');
              } catch (error) {
                await page.reload();
              }
              try {
                if (this.searchBy === 'name') {
                  await page.click('input#RealEstateOwnerName', {clickCount: 3});
                  await page.keyboard.press('Backspace');
                  await page.type('input#RealEstateOwnerName', search_value, {delay: 150});
                } else {
                  await page.click('input#RealEstateStreetNumber', {clickCount: 3});
                  await page.keyboard.press('Backspace');
                  await page.type('input#RealEstateStreetNumber', address_house, {delay: 150});
                  await page.click('input#RealEstateStreetName', {clickCount: 3});
                  await page.keyboard.press('Backspace');
                  await page.type('input#RealEstateStreetName', address_street, {delay: 150});
                }
                let divid = this.searchBy === 'name' ? 'owner' : 'address';
                let [buttonSearch] = await page.$x(`//*[@id="${divid}"]//*[@name="SearchMode"]`);
                await Promise.all([
                  buttonSearch.click(),
                  page.waitForNavigation()
                ]);
                await page.waitForXPath('//*[contains(text(), "records.")]');
                const [noResult] = await page.$x('//*[contains(text(), "Returned 0 records.")]');
                if (noResult) {
                  console.log('*** No Results Found!');
                  const [returnMainPage] = await page.$x('//a[contains(text(), "return to search")]');
                  await Promise.all([
                    returnMainPage.click(),
                    page.waitForNavigation()
                  ]);
                  break;
                }
                                
                const rows = await page.$x('//*[text()="Parcel ID"]/ancestor::table[1]/tbody/tr');
                for(const row of rows) {
                  let name = await row.evaluate(el => el.children[2].textContent?.trim()) || '';
                  let address = await row.evaluate(el => el.children[3].textContent?.trim()) || ''; 
                  let flag = false;
                  if(this.searchBy == 'name') {
                    const regexp = new RegExp(owner_name_regexp);
                    if (regexp.exec(name.toUpperCase())){
                      flag = true;
                    }
                  } else {
                    if(this.compareStreetAddress(address, search_value)){
                      flag = true
                    }
                  }
                  if (flag) {
                    let link = await row.evaluate(el => el.children[1].children[0].getAttribute('href')) || '';
                    let detailPage = await this.browser?.newPage()!;
                    await detailPage.goto(`https://www.hcpao.org${link}`, {waitUntil: 'load'});
                    let result = await this.getPropertyInfos(detailPage);
                    if (result) await this.parseResult(result, document);
                    await detailPage.close();
                    if (this.searchBy === 'address') break;
                  }
                }
                const [returnMainPage] = await page.$x('//a[contains(text(), "return to search")]');
                await Promise.all([
                  returnMainPage.click(),
                  page.waitForNavigation()
                ]);
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

    async getPropertyInfos(page: puppeteer.Page): Promise<any> {
      // name
      const full_name_xpath = '//b[contains(., "Owners:")]/following-sibling::text()[1]';
      await page.waitForXPath(full_name_xpath, {visible: true});
      let full_name: any = await this.getTextByXpathFromPage(page, full_name_xpath);
      console.log('full_name = ', full_name)
      full_name = full_name.split('+')[0];
      full_name = full_name.replace(/\W|\s+/g, ' ').trim();
      let parseName = this.parseOwnerName(full_name);
      const owner_names = [parseName];

      // property address
      const property_address_xpath = '//h2/following-sibling::div[1]/div[1]/p/text()[1]';
      const property_city_zip_xpath = '//h2/following-sibling::div[1]/div[1]/p/text()[2]';
      let property_address = await this.getTextByXpathFromPage(page, property_address_xpath);
      let property_city_zip = await this.getTextByXpathFromPage(page, property_city_zip_xpath);
      let property_zip = '';
      let property_state = '';
      let property_city = '';
      const property_address_parsed = parser.parseLocation(property_address + ' ' + property_city_zip);
      if(property_address_parsed){
        property_zip = property_address_parsed.zip ? property_address_parsed.zip : '';
        property_state = property_address_parsed.state ? property_address_parsed.state : '';
        property_city = property_address_parsed.city ? property_address_parsed.city : '';
      }
      
      // mailing address
      const mailing_address_xpath = '//b[contains(., "Mailing Address")]/following-sibling::text()[1]';
      const mailing_city_zip_xpath = '//b[contains(., "Mailing Address")]/following-sibling::text()[2]';
      let mailing_address = await this.getTextByXpathFromPage(page, mailing_address_xpath);
      let mailing_city_zip = await this.getTextByXpathFromPage(page, mailing_city_zip_xpath);
      let mailing_zip = '';
      let mailing_state = '';
      let mailing_city = '';
      const mailing_address_parsed = parser.parseLocation(mailing_address + ' ' + mailing_city_zip);
      if(mailing_address_parsed){
        mailing_zip = mailing_address_parsed.zip ? mailing_address_parsed.zip : '';
        mailing_state = mailing_address_parsed.state ? mailing_address_parsed.state : '';
        mailing_city = mailing_address_parsed.city ? mailing_address_parsed.city : '';
      }

      // owner occupied
      let owner_occupied = mailing_address === property_address;

      // property type
      const property_type_xpath = '//*[contains(text(), "DOR Code")]/following-sibling::a[1]';
      const property_type = await this.getTextByXpathFromPage(page, property_type_xpath);

      // sales info"
      const last_sale_recording_date_xpath = '//*[text()="Official Record"]/ancestor::table[1]/tbody/tr[1]/td[4]';
      const last_sale_recording_date = await this.getTextByXpathFromPage(page, last_sale_recording_date_xpath);
      const last_sale_amount_xpath = '//*[text()="Official Record"]/ancestor::table[1]/tbody/tr[1]/td[9]'
      const last_sale_amount = await this.getTextByXpathFromPage(page, last_sale_amount_xpath);

      // assessed value and est. value
      const total_assessed_value_xpath = '//*[contains(text(), "Total Assessed Value")]/following-sibling::td[1]';
      const total_assessed_value = await this.getTextByXpathFromPage(page, total_assessed_value_xpath);
      const est_value_xpath = '//*[contains(text(), "Total Just Value")]/following-sibling::td[1]'
      const est_value = await this.getTextByXpathFromPage(page, est_value_xpath);

      const year_built = await this.getTextByXpathFromPage(page, '//th[text()="EffectiveArea"]/ancestor::table/tbody/tr[1]/td[7]');

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