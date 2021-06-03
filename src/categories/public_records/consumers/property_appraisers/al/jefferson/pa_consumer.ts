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
        propertyAppraiserPage: 'https://eringcapture.jccal.org/caportal/CA_PropertyTaxSearch.aspx'
    }

    xpaths = {
        isPAloaded: '//*[@id="Search"]'
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
        await page.waitForSelector('input#SearchText', {visible: true});

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
                await page.goto(this.urls.propertyAppraiserPage, { waitUntil: 'networkidle0'});
              } catch (error) {
                await page.reload();
              }
              try {
                const [input_handle] = await page.$x('//*[@id="SearchText"]');
                await page.evaluate(el => el.value = '', input_handle)
                await input_handle.type(search_value, {delay: 150});
                if (this.searchBy === 'name') {
                  const [option_handle] = await page.$x('//*[@id="SearchByName"]');
                  await page.evaluate(el => el.click(), option_handle);
                } else {
                  const [option_handle] = await page.$x('//*[@id="SearchByAddress"]');
                  await page.evaluate(el => el.click(), option_handle);
                }

                let [buttonSearch] = await page.$x('//*[@id="Search"]');
                await Promise.all([
                  page.evaluate(el => el.click(), buttonSearch),
                  page.waitForNavigation()
                ]);
                
                const [noResult] = await page.$x('//*[contains(text(), "No Records Found")]');
                if (noResult) {
                  console.log('*** No Results Found!');
                  break;
                }

                const rows = await page.$x('//*[@id="BodyTable"]/tbody/tr//table/tbody');
                const legends = await page.$x('//*[@id="BodyTable"]/tbody/tr/td/fieldset/legend/span')
                let index = 0;
                for (const row of rows) {
                  let flag = false;
                  let name = await page.evaluate(el => el.children[0].children[2].textContent, row);
                  name = name.replace(/\n|\s+/gm, ' ').trim();
                  let address = await page.evaluate(el => el.children[1].children[2].textContent, row);
                  address = address.replace(/\n|\s+/gm, ' ').trim();
                  if(this.searchBy == 'name') {
                    const regexp = new RegExp(owner_name_regexp);
                    if (regexp.exec(name.toUpperCase())){
                      flag = true;
                    }
                  } else {
                    flag = true;
                  }
                  if (flag) {
                    let parcel_no = await legends[index].evaluate(el => el.textContent) || '';
                    parcel_no = parcel_no.replace(/\s+|\n/gm, ' ').trim();
                    let property_type = await page.evaluate(el => el.children[2].children[2].textContent, row) || '';
                    property_type = property_type.replace('\n','').replace(/\s+/g,' ').trim();
                    let detailPage = await this.browser?.newPage()!;
                    await detailPage.goto(`https://eringcapture.jccal.org/caportal/CA_PropertyTaxParcelInfo.aspx?ParcelNo=${parcel_no}&TaxYear=2020`, {waitUntil: 'load'});
                    let result = await this.getPropertyInfos(detailPage, property_type);
                    if (result) await this.parseResult(result, document);
                    await detailPage.close();
                    if (this.searchBy === 'address') break;
                  }
                  index++;
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

    async parseResult(result: any, document: any) {
      let dataFromPropertyAppraisers = {
          'Full Name': result['owner_name']['full_name'],
          'First Name': result['owner_name']['first_name'],
          'Last Name': result['owner_name']['last_name'],
          'Middle Name': result['owner_name']['middle_name'],
          'Name Suffix': result['owner_name']['suffix'],
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

    async getPropertyInfos(page: puppeteer.Page, property_type: string): Promise<any> {
      await page.waitForXPath('//*[@id="Iframe2"]');
      const [iframe1] = await page.$x('//*[@id="Iframe2"]');
      const page1 = await iframe1.contentFrame();
      await page.waitForXPath('//*[@id="Iframe1"]');
      const [iframe2] = await page.$x('//*[@id="Iframe1"]');
      const page2 = await iframe2.contentFrame();
      if (!page1 || !page2) return null;

      // name
      const full_name_xpath = '//td[*[contains(text(), "OWNER:")]]/following-sibling::td[1]';
      await page1.waitForXPath(full_name_xpath, {visible: true});
      let full_name: any = await this.getTextByXpathFromPage(page1, full_name_xpath);
      full_name = full_name.split('&').map((s:string)=>s.trim()).filter((s:string)=>s!=='')[0];
      full_name = full_name.replace(/\W|\s+/g, ' ').trim();
      let owner_name = this.parseOwnerName(full_name);

      // property address
      const property_full_address_xpath = '//td[*[contains(text(), "LOCATION:")]]/following-sibling::td[1]';
      let property_full_address = await this.getTextByXpathFromPage(page1, property_full_address_xpath);
      let property_address = this.getStreetAddress(property_full_address);
      let property_address_parsed = parser.parseLocation(property_full_address);
      let property_zip = '';
      let property_state = '';
      let property_city = '';
      if(property_address_parsed){
        property_zip = property_address_parsed.zip ? property_address_parsed.zip : '';
        property_state = property_address_parsed.state ? property_address_parsed.state : '';
        property_city = property_address_parsed.city ? property_address_parsed.city : '';
      }
      
      // mailing address
      const mailing_address_full_xpath = '//td[*[contains(text(), "ADDRESS:")]]/following-sibling::td[1]';
      let mailing_full_address: any = await this.getTextByXpathFromPage(page1, mailing_address_full_xpath);
      let mailing_address = this.getStreetAddress(mailing_full_address);;
      let mailing_address_parsed = parser.parseLocation(mailing_full_address);
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

      // assessed value and est. value
      const total_assessed_value_xpath = '//td[contains(text(), "ASSD. VALUE:")]';
      let total_assessed_value = await this.getTextByXpathFromPage(page2, total_assessed_value_xpath);
      total_assessed_value = total_assessed_value.slice(14);
      const est_value_xpath = '//td[contains(text(), "TOTAL MARKET VALUE")]/following-sibling::td[1]';
      const est_value = await this.getTextByXpathFromPage(page2, est_value_xpath);

      // sales
      await Promise.all([
        page1.click('#Sales'),
        page2.waitForNavigation()
      ]);
      const last_sale_recording_date_xpath = '//*[text()="Sale Date"]/ancestor::table[1]/tbody/tr[3]/td[1]';
      const last_sale_recording_date = await this.getTextByXpathFromPage(page2, last_sale_recording_date_xpath);
      const last_sale_amount_xpath = '//*[text()="Sale Date"]/ancestor::table[1]/tbody/tr[3]/td[2]'
      const last_sale_amount = await this.getTextByXpathFromPage(page2, last_sale_amount_xpath);

      // year built
      await Promise.all([
        page1.click('#Buildings'),
        page2.waitForNavigation()
      ]);
      const year_built_xpath = '//td[contains(text(), "Built")]/following-sibling::td[1]';
      const year_built = await this.getTextByXpathFromPage(page2, year_built_xpath);
      
      return {
        owner_name, 
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