import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
import puppeteer from "puppeteer";
const parser = require('parse-address');
const nameParsingService = require('../../consumer_dependencies/nameParsingServiceNew');
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;


    urls = {
        propertyAppraiserPage: 'http://web.assess.co.polk.ia.us/cgi-bin/web/tt/infoqry.cgi?tt=home/index',
    }

    xpaths = {
        isPAloaded: '//*[@id="straddr__address"]',
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

    async getInnerTextByXpathFromPage(page: puppeteer.Page, xPath: string): Promise<string> {
      const [elm] = await page.$x(xPath);
      if (elm == null) {
          return '';
      }
      let text = await page.evaluate(j => j.innerText, elm);
      return text.trim();
    }

    async getTextByXpathFromPage(page: puppeteer.Page, xPath: string) {
        const [elm] = await page.$x(xPath)
        if (elm == null) {
            return '';
        }
        let text = await page.evaluate(j => j.innerText, elm);
        return text.replace(/\n/g, ' ');
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
        const urlSelector = 'tbody > tr > td:first-child > a';
        let index = 0;
        let document = docsToParse;
            index++;
            console.log('~ @ ~ @ ~ @ ~ @ ~ @ ~ @ ~ @ ~ @ ~ @ ~ @ ~');
        
            if (!this.decideSearchByV2(document)) {
              return false;
            }
            
            let address = '';
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
                    address = document.propertyId["Property Address"];
                    console.log(`Looking for address: ${address}`);
                }

                if (this.searchBy === 'name') {
                    await page.waitForSelector('#oname__lname');
                    await page.focus('#oname__lname');
                    await page.keyboard.type(last_name);
                    await page.focus('#oname__fname');
                    await page.keyboard.type(first_name);
                }
                else {
                    await page.waitForSelector('#straddr__address');
                    await page.focus('#straddr__address');
                    await page.keyboard.type(address);
                }
                await page.click('input[name="submit_form"]');
                await page.waitForSelector('#wrapper');
                const locationPath = await page.evaluate(() => window.location.pathname);

                if (locationPath === '/cgi-bin/web/tt/form.cgi') {
                    await page.waitForSelector(urlSelector, {timeout: 5000});
                    let urls = await this.finderUrl(page, owner_name_regexp);
                    for (let j = 0; j < urls.length; j++) {
                        await page.goto(urls[j], {waitUntil: 'domcontentloaded'});
                        await page.waitForSelector('#wrapper');
                        const result = await this.getPropertyInfos(page);
                        if (result) {
                          await this.parseResult(result, document);
                          if (this.searchBy === 'address') break;
                        }
                    }
                } else {
                    const result = await this.getPropertyInfos(page);
                    if (result)
                      await this.parseResult(result, document);
                }
            } catch (e) {
                if (this.searchBy === 'name')
                    console.log('Owner not found: ', owner_name)
                else
                    console.log('Address not found: ', document.propertyId["Property Address"])
            }
            await page.goto(this.urls.propertyAppraiserPage);
        return true;
    }

    async finderUrl(page: puppeteer.Page, owner_name_regexp: string) {
      const urlSelector = 'tbody > tr > td:first-child > a';
      const nameSelector = 'tbody > tr > td:nth-child(5)';
      let data: any = {};
      let urlArray = [];
      try {
          data = await page.evaluate((urlSelector) => {
              let options = Array.from(document.querySelectorAll(urlSelector));
              let names = Array.from(document.querySelectorAll(nameSelector));
              return {urls: options.map(x => x.href), names};
          }, urlSelector);

          if (this.searchBy === 'name') {
              for (let i = 0 ; i < data.names ; i++) {
                  const name = data.names[i];
                  const regexp = new RegExp(owner_name_regexp);
                  if (!regexp.exec(name.toUpperCase())) continue;
                  urlArray.push(data.urls[i]);
              }
          }
          else {
              urlArray = data.urls;
          }
      } catch (e) {
          console.log(e);
      }
      return urlArray;
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
      const full_name_xpath = '//*[text()="Legal Description and Mailing Address"]/ancestor::table[1]/tbody/tr/td[2]';
      await page.waitForXPath(full_name_xpath, {visible: true});
      let name_mailing_addr: any = await this.getInnerTextByXpathFromPage(page, full_name_xpath);

      const owner_names = [];
      let mailing_address = '';
      let mailing_zip = '';
      let mailing_state = '';
      let mailing_city = '';
      let mailing_address_parsed;
      
      const match = name_mailing_addr.split('\n').filter((s: string) => s.trim()!=='').map((s:string) => s.trim());
      if (match && match[0]) {
        let parseName = this.parseOwnerName(match[0]);
        owner_names.push(parseName);
        if (match[1]) {
          mailing_address = match[1];
          if (match[2]) {
            mailing_address_parsed = parser.parseLocation(mailing_address + ', ' + match[2])
            if(mailing_address_parsed){
              mailing_zip = mailing_address_parsed.zip ? mailing_address_parsed.zip : '';
              mailing_state = mailing_address_parsed.state ? mailing_address_parsed.state : '';
              mailing_city = mailing_address_parsed.city ? mailing_address_parsed.city : '';
            }
          }
        }
      } else {
        return null;
      }

      // property address
      const property_address_full_xpath = '//*[text()="Address"]/following-sibling::td[1]';
      let property_address = await this.getTextByXpathFromPage(page, property_address_full_xpath);
      let property_address_parsed = parser.parseLocation(property_address);
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

      // sales info"
      const last_sale_recording_date_xpath = '//*[text()="Sale Date"]/ancestor::table[1]/tbody/tr[1]/td[3]';
      const last_sale_amount_xpath = '//*[text()="Sale Date"]/ancestor::table[1]/tbody/tr[1]/td[4]';
      const last_sale_recording_date = await this.getTextByXpathFromPage(page, last_sale_recording_date_xpath);
      const last_sale_amount = await this.getTextByXpathFromPage(page, last_sale_amount_xpath);

      // property type
      let property_type = await this.getTextByXpathFromPage(page, '//caption[contains(text(), "Current Values")]/following-sibling::tbody/tr[1]/td[2]');
      if (property_type == 'Total Value'){
        property_type = await this.getTextByXpathFromPage(page, '//caption[contains(text(), "Current Values")]/following-sibling::tbody/tr[3]/td[2]');
      }
      // assessed value and est. value
      const est_value = await this.getTextByXpathFromPage(page, '//caption[contains(text(), "Current Values")]/following-sibling::tbody/tr[1]/td[6]');
      const total_assessed_value = await this.getTextByXpathFromPage(page, '//caption[contains(text(), "Historical Values")]/following-sibling::tbody/tr[1]/td[7]');
      const year_built = await this.getTextByXpathFromPage(page, '//th[contains(text(), "Year Built")]/following-sibling::td[1]');

      return {
        owner_names, 
        property_address,
        property_city,
        property_state,
        property_zip,
        property_address_parsed,
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
}

