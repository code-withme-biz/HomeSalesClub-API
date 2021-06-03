import puppeteer from 'puppeteer';
import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';
import { IProperty } from '../../../../../../models/property';
const parser = require('parse-address');

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'https://www.qpublic.net/la/orleans/search.html'
    }

    xpaths = {
        isPAloaded: '//a[@href="search1.html"]'
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
    getAddress(document: IProperty): any {
        // 'Property Address': '162 DOUGLAS HILL RD',
        // 'Property City': 'WEST BALDWIN',
        // County: 'Cumberland',
        // 'Property State': 'ME',
        // 'Property Zip': '04091',
        const full_address = `${document['Property Address']}, ${document['Property City']}, ${document['Property State']} ${document['Property Zip']}`       
        const parsed = parser.parseLocation(full_address);
        
        let street_name = parsed.street.trim();
        let street_full = document['Property Address'];
        let street_with_type = (parsed.number ? parsed.number : '') + ' ' + (parsed.prefix ? parsed.prefix : '') + ' ' + parsed.street + ' ' + (parsed.type ? parsed.type : '');
        street_with_type = street_with_type.trim();

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
            return '';
        }
    }

    async getTextByXpathFromPage(page: puppeteer.Page, xPath: string): Promise<string> {
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
        const results: any = {};

        // owner name
        let owner_full_name = name_str;
        let owner_first_name = '';
        let owner_last_name = '';
        let owner_middle_name = '';

        const owner_class_name = this.discriminateAndRemove(owner_full_name);
        if (owner_class_name.type === 'person') {
            // const owner_temp_name = parseFullName(owner_class_name.name);
            // owner_first_name = owner_temp_name.first ? owner_temp_name.first : '';
            // owner_last_name = owner_temp_name.last ? owner_temp_name.last : '';
            // owner_middle_name = owner_temp_name.middle ? owner_temp_name.middle : '';
            const names = name_str.split(' ');
            console.log('--- ', names)
            owner_first_name = names[1] ? names[1].trim() : '';
            owner_last_name = names[0] ? names[0].trim() : '';
            owner_middle_name = names[2] ? names[2].trim() : '';
            owner_full_name = owner_first_name + ' ' + owner_last_name + ' ' + owner_middle_name;
        }

        results['full_name'] = owner_full_name;
        results['first_name'] = owner_first_name;
        results['last_name'] = owner_last_name;
        results['middle_name'] = owner_middle_name;
        results['suffix'] = this.getSuffix(owner_full_name);
        return results;
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
        const address1_prefix = address1 && address1.prefix===undefined ? '' : address1.prefix.trim().toUpperCase();
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
    async parseAndSave(docsToParse: IOwnerProductProperty): Promise<boolean>   {
        const page = this.browserPages.propertyAppraiserPage;
        if (page === undefined) return false;

        const acceptHandle = await page.$x('//a[@href="search1.html"]');
        let result1 = await this.waitForSuccess(async () => {
            await Promise.all([
                acceptHandle[0].click(),
                page.waitForNavigation()
            ]);
        })
        if (!result1) {
            return false;
        }     
        
        let start = 0;
        let document = docsToParse;
            if (!this.decideSearchByV2(document)) {
              console.log('Insufficient info for Owner and Property');
              return false;
            }
            
            // do everything that needs to be done for each document here
            // parse address
            let address;
            let search_addr = '';
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
                    const searchNameHandle = await page.$x('//a[contains(text(), "Search by Owner Name")]');
                    let result2 = await this.waitForSuccess(async () => {
                        await Promise.all([
                            searchNameHandle[0].click(),
                            page.waitForNavigation({waitUntil: 'networkidle0'})
                        ]);
                    })
                    if (!result2) {
                        return false;
                    }      
                    await page.type('input[name="INPUT"]', owner_name, {delay: 150});
                    let result3 = await this.waitForSuccess(async () => {
                        await Promise.all([
                            page.keyboard.press('Enter'),
                            page.waitForNavigation({waitUntil: 'networkidle0'})
                        ]);
                    })
                    let checkError = await page.$x('//button[@id="proceed-button"]');
                    if(checkError.length > 0){
                        await Promise.all([
                            checkError[0].click(),
                            page.waitForNavigation({waitUntil: 'networkidle0'})
                        ]);
                    }
                    if (!result3) {
                        return false;
                    } 
                    
                    const result_name_handle = await page.$x('//tr[@class="odd"][1]/td[2]');
                    let result_name;
                    if (result_name_handle.length > 0) {
                        result_name = await result_name_handle[0].evaluate(el => el.textContent?.trim());
                        if (result_name === owner_name) {
                            const linkHandle = await page.$x('//tr[@class="odd"][1]/td[1]/a');
                            let result4 = await this.waitForSuccess(async () => {
                                await Promise.all([
                                    linkHandle[0].click(),
                                    page.waitForNavigation()
                                ]);
                            })
                            if (!result4) {
                                return false;
                            }
                            
                        } else {
                            let result5 = await this.waitForSuccess(async () => {
                                await page.goto('http://www.qpublic.net/la/orleans/search1.html', {waitUntil: 'networkidle0'});
                            })
                            if (!result5) {
                                return false;
                            }                            
                            return false;
                        }
                    } else {
                        let result6 = await this.waitForSuccess(async () => {
                            await page.goto('http://www.qpublic.net/la/orleans/search1.html', {waitUntil: 'networkidle0'});
                        })
                        if (!result6) {
                            return false;
                        }                          
                        return false;
                    }
            } else {
                try{
                    address = this.getAddress(document.propertyId);
                    const parsev2 = this.getAddressV2(document.propertyId);
                    if(!this.isEmptyOrSpaces(parsev2.street_address)){
                        address['parsed'] = parser.parseLocation(parsev2.street_address);
                    }
                    if(address['parsed'] && address['parsed']['sec_unit_num']){
                        search_addr = address['street_with_type'] + ' #' + address['parsed']['sec_unit_num']
                    } else {
                        search_addr = address['street_full'];
                    }
                } catch (e){
                    return false;
                }
                console.log(`Looking for address: ${search_addr}`);
                const searchAddrHandle = await page.$x('//a[contains(text(), "Search by Location Address")]');
                let result7 = await this.waitForSuccess(async () => {
                    await Promise.all([
                        searchAddrHandle[0].click(),
                        page.waitForNavigation()
                    ]);
                })
                if (!result7) {
                    return false;
                }
                if(!address.parsed){
                    return false;
                }
                const street_number = address.parsed.number ? address.parsed.number : '';
                const street_name = address.parsed.street ? address.parsed.street : '';
                const street_type = address.parsed.type ? address.parsed.type : '';
                await page.type('input[name="streetNumber"]', street_number, {delay: 150});
                await page.type('input[name="streetName"]', street_name, {delay: 150});
                await page.type('input[name="streetType"]', street_type, {delay: 150});
                let result8 = await this.waitForSuccess(async () => {
                    await Promise.all([
                        page.click('input[name="Address Search"]'),
                        page.waitForNavigation()
                    ])
                })
                if (!result8) {
                    return false;
                }  
                
                const result_addr_handle = await page.$x('//tr[@class="odd"][1]/td[3]');
                let result_addr;
                if (result_addr_handle.length > 0) {
                    result_addr = await result_addr_handle[0].evaluate(el => el.textContent?.trim());
                    if (this.compareAddress(result_addr, search_addr)) {
                        const linkHandle = await page.$x('//tr[@class="odd"][1]/td[1]/a');
                        let result9 = await this.waitForSuccess(async () => {
                            await Promise.all([
                                linkHandle[0].click(),
                                page.waitForNavigation()
                            ]);
                        })
                        if (!result9) {
                            return false;
                        }  
                        
                    } else {
                        let result10 = await this.waitForSuccess(async () => {
                            await page.goto('http://www.qpublic.net/la/orleans/search1.html', {waitUntil: 'networkidle0'});
                        })
                        if (!result10) {
                            return false;
                        }                          
                        return false;    
                    }
                } else {
                    let result11 = await this.waitForSuccess(async () => {
                        await page.goto('http://www.qpublic.net/la/orleans/search1.html', {waitUntil: 'networkidle0'});
                    })
                    if (!result11) {
                        return false;
                    }                       
                    return false;
                }
            }   
            let result;
            try {
                result = await this.getPropertyInfos(page, address); 
                await this.parseResult(result, document);
            } catch (e) {
                console.log('Not found');
            }    
            let result12 = await this.waitForSuccess(async () => {
                await page.goto('http://www.qpublic.net/la/orleans/search1.html', {waitUntil: 'networkidle0'});
            })
            if (!result12) {
                return false;
            }                   
            await this.sleep(2000)
        return true;
    }

    async parseResult(result: any, document: any) {
        const mailing_addr_unit_type = result['mailing_address_parsed']['sec_unit_type'] ? result['mailing_address_parsed']['sec_unit_type'] : '';
        const mailing_addr_unit_num = result['mailing_address_parsed']['sec_unit_num'] ? result['mailing_address_parsed']['sec_unit_num'] : '';
        const mailing_addr_unit = mailing_addr_unit_type + ' ' + mailing_addr_unit_num;
        let dataFromPropertyAppraisers = {
            'Full Name': result['ownerName']['full_name'],
            'First Name': result['ownerName']['first_name'],
            'Last Name': result['ownerName']['last_name'],
            'Middle Name': result['ownerName']['middle_name'],
            'Name Suffix': result['ownerName']['suffix'],
            'Mailing Care of Name': '',
            'Mailing Address': result['mailing_address'],
            'Mailing Unit #': mailing_addr_unit,
            'Mailing City': result['mailing_address_parsed']['city'] ? result['mailing_address_parsed']['city'] : '',
            'Mailing State': result['mailing_address_parsed']['state'] ? result['mailing_address_parsed']['state'] : '',
            'Mailing Zip': result['mailing_address_parsed']['zip'] ? result['mailing_address_parsed']['zip'] : '',
            'Property Address': result['property_address'],
            'Property Unit #': result['property_address_parsed']['unit'] ? result['property_address_parsed']['unit'] : '',
            'Property City': result['property_address_parsed']['city'] ? result['property_address_parsed']['city'] : '',
            'Property State': this.publicRecordProducer.state.toUpperCase(),
            'Property Zip': result['property_address_parsed']['zip'] ? result['property_address_parsed']['zip'] : '',
            'County': this.publicRecordProducer.county,
            'Owner Occupied': result['owner_occupied'],
            'Property Type': result['property_type'],
            'Total Assessed Value': result['total_assessed_value'],
            'Last Sale Recording Date': result['last_sale_recording_date'],
            'Last Sale Amount': result['last_sale_amount'],
            'Est. Remaining balance of Open Loans': '',
            'Est Value': result['est_value'],
            'yearBuilt': '',
            'Est Equity': '',
            'Lien Amount': ''
        };
        try{
            await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
        } catch(e){
            //
        } 
    }

    async getPropertyInfos(page: puppeteer.Page, address: any): Promise<any> {
        // name
        const full_name_xpath = '//table[2]/tbody/tr[2]/td[@class="owner_value"][1]';
        let full_name_handle = await page.$x(full_name_xpath);
        let full_name = await full_name_handle[0].evaluate(el => el.innerHTML);
        full_name = full_name.replace(/\n/g, ' ').split('<br>')[0].replace('&nbsp;', '');
        full_name = this.simplifyString(full_name.replace(/[^a-zA-Z ]/g, ""));
        const ownerName = this.parseOwnerName(full_name);
        
        // property address
        const property_address_xpath = '//table[2]/tbody/tr[4]/td[@class="owner_value"][1]';
        let property_address = await this.getTextByXpathFromPage(page, property_address_xpath);
        let property_address_parsed = parser.parseLocation(property_address);

        // mailing address
        const mailing_address_xpath = '//table[2]/tbody/tr[3]/td[@class="owner_value"][1]';
        let mailing_address = await this.getTextByXpathFromPage(page, mailing_address_xpath);
        const is_valid_address = mailing_address.match(/[a-zA-Z]/g) !== null;
        mailing_address = is_valid_address ? mailing_address : address['full_address'];
        const mailing_address_parsed = parser.parseLocation(mailing_address);

        // owner occupied
        const owner_occupied = this.compareAddress(property_address, mailing_address_parsed);
        
        // sales info
        const last_sale_recording_date_xpath = '//table[4]/tbody/tr[3]/td[1]';
        const last_sale_amount_xpath = '//table[4]/tbody/tr[3]/td[2]';
        const last_sale_recording_date = await this.getTextByXpathFromPage(page, last_sale_recording_date_xpath);
        const last_sale_amount = await this.getTextByXpathFromPage(page, last_sale_amount_xpath);

        // property type
        const property_type_xpath = '//table[2]/tbody/tr[5]/td[@class="owner_value"][1]/font';
        const property_type = await this.getTextByXpathFromPage(page, property_type_xpath);

        // assessed value and est. value
        const total_assessed_value_xpath = '//table[3]/tbody/tr[4]/td[7]';
        const est_value_xpath = '//table[3]/tbody/tr[4]/td[4]';
        const total_assessed_value = await this.getTextByXpathFromPage(page, total_assessed_value_xpath);
        const est_value = await this.getTextByXpathFromPage(page, est_value_xpath);
        return {
            ownerName,
            property_address,
            property_address_parsed,
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

    async waitForSuccess(func: Function): Promise<boolean> {
        let retry_count = 0;
        while (true){
            if (retry_count > 30){
                console.error('Connection/website error for 30 iteration.');
                return false;
            }
            try {
                await func();
                break;
            }
            catch (error) {
                console.log(error);
                retry_count++;
                console.log(`retrying search -- ${retry_count}`);
                await this.randomSleepIn5Sec();
            }
        }
        return true;
  }
}