import puppeteer from 'puppeteer';
const parseaddress = require('parse-address');
import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
import { IPublicRecordAttributes } from '../../../../../../models/public_record_attributes'

import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'http://assessments.milwaukee.gov/search.asp'
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

    sleep(ms: number) : any {
        return new Promise(resolve => setTimeout(resolve, ms));
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

    waitForIFrameLoad(page: any, iframeSelector: any, timeout = 10000) {
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

    // the main parsing function. if read() succeeds, parseAndSave is started().
    // return true after all parsing is complete 

    // docsToParse is the collection of all address objects to parse from mongo.
    // !!! Only mutate document objects with the properties that need to be added!
    // if you need to multiply a document object (in case of multiple owners
    // or multiple properties (2-3, not 30) you can't filter down to one, use this.cloneMongoDocument(document);
    // once all properties from PA have been added to the document, call 
    async parseAndSave(docsToParse: IOwnerProductProperty): Promise<boolean> {

        /* XPath & Selector Configurations */
        const street_number_input_selector = '#SearchStreetNumber';
        const street_name_input_selector = '#SearchStreetName';
        const search_button_selector = '#cmdGo';
        const search_result_button_selector = '//a[contains(.,"Taxkey")]/ancestor::table/tbody/tr[1]/td[1]';
        const owner_names_xpath = '//b[contains(.,"Owner")]/ancestor::tr/td[2]/font/b/font';
        const mailing_address_xpath = '//b[contains(.,"Address")]/ancestor::tr/td[2]/font/b/font';
        const mailing_city_xpath = '//font[contains(.,"City")]/ancestor::tr/td[4]/font/b/font';
        const mailing_state_xpath = '//font[contains(.,"State")]/ancestor::tr/td[4]/font/b/font';
        const mailing_zip_xpath = '//font[contains(.,"Zip")]/ancestor::tr/td[4]/font/b/font';
        const assessment_tab_xpath = '//a[contains(., "Previous Assessment")]';
        const sale_history_tab_xpath = '//a[contains(., "Sale Owner History")]';
        const property_type_xpath = '//font[contains(., "Narrative Description")]/ancestor::tbody//strong[contains(.,"property contains")]/font[2]';
        const total_assessed_value_xpath = '//th[contains(., "Total")]/ancestor::table/tbody/tr[1]/td[7]';
        const last_sale_date_xpath = '//th[contains(., "Sale Date")]/ancestor::table/tbody/tr[1]/td[1]';
        const last_sale_amount_xpath = '//th[contains(., "Sale Price")]/ancestor::table/tbody/tr[1]/td[2]';
        const property_address_xpath = '//b[contains(.,"Location")]/ancestor::td/b/font';

        const getNewPageWhenLoaded =  async () => {
            return new Promise(x =>
                this.browser?.on('targetcreated', async target => {
                    if (target.type() === 'page') {
                        const newPage = await target.page();
                        const newPagePromise = new Promise(y =>
                            newPage.once('domcontentloaded', () => y(newPage))
                        );
                        const isPageLoaded = await newPage.evaluate(
                            () => document.readyState
                        );
                        return isPageLoaded.match('complete|interactive')
                            ? x(newPage)
                            : x(newPagePromise);
                    }
                })
            );
        };

        const page = this.browserPages.propertyAppraiserPage!;
        const url_search = 'http://assessments.milwaukee.gov/search.asp';
        let doc = docsToParse;
            if (!this.decideSearchByV2(doc)) {
                return false;
            }
            // do everything that needs to be done for each doc here
            let search_value = '';
            let address_input = '';
            let first_name = '';
            let last_name = '';
            let owner_name = '';
            let owner_name_regexp = '';

            if (this.searchBy === 'name') {
                const nameInfo = this.getNameInfo(doc.ownerId);
                first_name = nameInfo.first_name;
                last_name = nameInfo.last_name;
                owner_name = (nameInfo.first_name + ' ' + nameInfo.last_name).trim();
                owner_name_regexp = nameInfo.owner_name_regexp;
                if (owner_name === '') return false;
                console.log(`Looking for owner: ${owner_name}`);
                search_value = owner_name;
              } else {
                  search_value = doc.propertyId['Property Address'];
                  const parseaddr = this.getAddressV2(doc.propertyId);
                  if(!this.isEmptyOrSpaces(parseaddr.street_address)){
                      search_value = parseaddr.street_address;
                  }
                  search_value = search_value.toUpperCase();
                  address_input = search_value;
                  console.log(`Looking for address: ${doc.propertyId['Property Address']}`);
            }
            await page.goto(url_search, {waitUntil: 'networkidle0'});
            await page.waitFor(1000);
            const frame: any = await page.frames().find(frame => frame.name() === 'middle'); // Find the right frame.
            await frame.waitForSelector(street_number_input_selector);
            if(this.searchBy == 'address'){
                let parse_address = parseaddress.parseLocation(address_input);
                if(!parse_address || !parse_address.number || !parse_address.street){
                    console.log('The street name or number is missing!');
                    return false;
                }
                await frame.type(street_number_input_selector, parse_address.number);
                await frame.type(street_name_input_selector, parse_address.street);
            } else {
                await frame.type('#SearchOwner', owner_name, {delay: 150});
            }
            await frame.click(search_button_selector);
            const frame2: any = await page.frames().find(frame => frame.name() === 'bottom'); // Find the right frame.
            await frame2.waitForNavigation();
            try{
                if(this.searchBy == 'name'){
                    let [nameSelector] = await frame2.$$('#T1 > tbody > tr > td:nth-child(3)');
                    let name = await nameSelector.evaluate((el: any) => el.textContent.trim());
                    console.log(name);
                    const regexp = new RegExp(owner_name_regexp);
                      if (regexp.exec(name.toUpperCase())){
                        await frame2.click('#T1 > tbody > tr > td:nth-child(1) > a');
                    }
                } else {
                    await frame2.click('#T1 > tbody > tr > td:nth-child(1) > a');
                }
            } catch(e) {
                console.log(e);
                console.log(search_value, "=> Address not found!");
                const client = await page.target().createCDPSession();
                await client.send('Network.clearBrowserCookies');
                await client.send('Network.clearBrowserCache');
                return true;
            }
            await this.waitForIFrameLoad(page, 'html > frameset > frame:nth-child(3)');
            await page.waitFor(2000);
            const frame3: any = await page.frames().find(frame => frame.name() === 'bottom'); // Find the right frame.
            const frame4: any = await page.frames().find(frame => frame.name() === 'middle'); // Find the right frame.

            await frame3.waitForXPath(owner_names_xpath, {visible:true});
            let owner_names = await frame3.evaluate((el: any) => el.textContent, (await frame3.$x(owner_names_xpath))[0]);
            let mailing_address, mailing_city, mailing_state, mailing_zip, property_type, property_address;
            try{
                mailing_address = await frame3.evaluate((el: any) => el.textContent, (await frame3.$x(mailing_address_xpath))[0]);
            } catch {
                mailing_address = '';
            }
            try{
                mailing_city = await frame3.evaluate((el: any) => el.textContent, (await frame3.$x(mailing_city_xpath))[0]);
            } catch {
                mailing_city = '';
            }
            try{
                mailing_state = await frame3.evaluate((el: any) => el.textContent, (await frame3.$x(mailing_state_xpath))[0]);
            } catch {
                mailing_state = '';
            }
            try{
                mailing_zip = await frame3.evaluate((el: any) => el.textContent, (await frame3.$x(mailing_zip_xpath))[0]);
            } catch {
                mailing_zip = '';
            }
            try{
                property_type = await frame3.evaluate((el: any) => el.textContent, (await frame3.$x(property_type_xpath))[0]);
            } catch {
                property_type = '';
            }
            try{
                property_address = await frame3.evaluate((el: any) => el.textContent, (await frame3.$x(property_address_xpath))[0]);
            } catch {
                property_address = '';
            }
            let assessment_tab = await frame4.$x(assessment_tab_xpath);

            await assessment_tab[0].click();
            await page.waitFor(2000);
            // const newPagePromise = getNewPageWhenLoaded();
            // const newPage1 = await newPagePromise;
            let pages: any = await this.browser?.pages();
            await pages[2].waitForXPath('//font[contains(., "Total")]');

            let total_assessed_value, last_sale_amount, last_sale_date;
            try{
                total_assessed_value = await pages[2].evaluate((el: any) => el.textContent, (await pages[2].$x(total_assessed_value_xpath))[0]);
            } catch {
                total_assessed_value = '';
            }
            await pages[2].close();
            let sale_history_tab = await frame4.$x(sale_history_tab_xpath);
            await sale_history_tab[0].click();
            // const newPagePromise2 = getNewPageWhenLoaded();
            // const newPage2 = await newPagePromise2;
            await page.waitFor(2000);
            pages = await this.browser?.pages();
            await pages[2].waitForXPath('//font[contains(., "Sale Date")]', {visible: true});
            try{
                last_sale_amount = await pages[2].evaluate((el: any) => el.textContent, (await pages[2].$x(last_sale_amount_xpath))[0]);
            } catch {
                last_sale_amount = '';
            }
            try{
                last_sale_date = await pages[2].evaluate((el: any) => el.textContent, (await pages[2].$x(last_sale_date_xpath))[0]);
            } catch {
                last_sale_date = '';
            }
            await pages[2].close();

            /* Normalize the name */
            let owner_fullname_1, owner_first_1, owner_last_1, owner_middle_1, owner_suffix_1;
            owner_suffix_1 = this.getSuffix(owner_names.trim());
            let name_and_type_1 = this.discriminateAndRemove(owner_names.trim());
            owner_fullname_1 = name_and_type_1.name;

            if (name_and_type_1.type == 'person'){
                let owner_1_array = name_and_type_1.name.trim().split(/\s+/g);
                owner_first_1 = owner_1_array ? owner_1_array.shift() : '';
                owner_last_1 = owner_1_array ? owner_1_array.pop() : '';
                owner_middle_1 = owner_1_array ? owner_1_array.shift() : '';
            } else {
                owner_suffix_1 = '';
            }

            // Owner Occupied
            let owner_occupied = false;
            if(mailing_state.trim() == 'WI'){
                let arr_property_address = address_input.toLowerCase().split(" ");
                let arr_mailing_address = mailing_address.trim().toLowerCase().split(" ");
                let count_matches = 0;
                for(let val1 of arr_property_address){
                    for(let val2 of arr_mailing_address){
                        if (val1 == val2){
                            count_matches += 1;
                        }
                    }
                }
                if(arr_property_address[0] == arr_mailing_address[0] && count_matches >= 2){
                    owner_occupied = true;
                }
            }

            if(mailing_zip[mailing_zip.length - 1] == '-'){
                mailing_zip = mailing_zip.replace("-","");
            }
            let dataFromPropertyAppraisers: any = {};
            dataFromPropertyAppraisers['Owner Occupied'] = owner_occupied;
            dataFromPropertyAppraisers['Full Name'] = owner_fullname_1 ? owner_fullname_1.trim() : '';
            dataFromPropertyAppraisers['First Name'] = owner_first_1 ? owner_first_1 : '';
            dataFromPropertyAppraisers['Last Name'] = owner_last_1 ? owner_last_1 : '';
            dataFromPropertyAppraisers['Middle Name'] = owner_middle_1 ? owner_middle_1 : '';
            dataFromPropertyAppraisers['Name Suffix'] = owner_suffix_1 ? owner_suffix_1 : '';
            dataFromPropertyAppraisers['Mailing Care of Name'] = '';
            dataFromPropertyAppraisers['Mailing Address'] = mailing_address.trim();
            dataFromPropertyAppraisers['Mailing Unit #'] = '';
            dataFromPropertyAppraisers['Mailing City'] = mailing_city.trim();
            dataFromPropertyAppraisers['Mailing State'] = mailing_state.trim();
            dataFromPropertyAppraisers['Mailing Zip'] = mailing_zip.trim();
            dataFromPropertyAppraisers['Property Type'] = property_type.trim();
            dataFromPropertyAppraisers['Total Assessed Value'] = total_assessed_value.trim();
            dataFromPropertyAppraisers['Last Sale Recording Date'] = last_sale_date.trim();
            dataFromPropertyAppraisers['Last Sale Amount'] = last_sale_amount.trim();
            dataFromPropertyAppraisers['Est. Remaining balance of Open Loans'] = '';
            dataFromPropertyAppraisers['Est Value'] = '';
            dataFromPropertyAppraisers['yearBuilt'] = '';
            dataFromPropertyAppraisers['Est Equity'] = '';
            dataFromPropertyAppraisers['Lien Amount'] = '';
            dataFromPropertyAppraisers['County'] = this.publicRecordProducer.county;
            dataFromPropertyAppraisers['Property State'] = this.publicRecordProducer.state.toUpperCase();
            dataFromPropertyAppraisers['Property Address'] = property_address.trim();
            try{
                await this.saveToOwnerProductPropertyV2(doc, dataFromPropertyAppraisers);
            } catch(e){
            //
            }

            const client = await page.target().createCDPSession();
            await client.send('Network.clearBrowserCookies');
            await client.send('Network.clearBrowserCache');
        return true;
    }
}