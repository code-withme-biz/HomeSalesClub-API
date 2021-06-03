import puppeteer from 'puppeteer';

const nameParsingService = require('../../consumer_dependencies/nameParsingService');
const parseaddress = require('parse-address');
import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
import {IPublicRecordProducer} from "../../../../../../models/public_record_producer";
import {IOwnerProductProperty} from "../../../../../../models/owner_product_property";

/* XPath & Selector Configurations */
const search_by_address_selector = '#rbutAddress';
const serach_by_owner_selector = '#rbutName';
const owner_last_name_selector = '#tboxLastName';
const owner_first_name_selector = '#tboxFirstName';
const street_number_selector = '#tboxAddrNum';
const street_name_selector = '#tboxStreet';
const search_button_selector = '#butFind';
const search_result_table_xpath = '//table[@id="tableData"]';
const search_result_xpath = '//table[@id="tableData"]/tbody/tr[position()>1]';
const owner_names_xpath = '//tr[./td[contains(., "Owner\'s Name:")]]/td[2]/span';
const property_address_xpath = '//tr[./td[contains(., "Taxing Address:")]]/td[2]/span/text()[1]';
const property_address_2_xpath = '//tr[./td[contains(., "Taxing Address:")]]/td[2]/span/text()[last()]';
const mailing_address_xpath = '//tr[./td[contains(., "Mailing Address:")]]/td[2]/span/text()[1]';
const mailing_address_2_xpath = '//tr[./td[contains(., "Mailing Address:")]]/td[2]/span/text()[last()]';
const property_type_code_xpath = '//span[@id="ctl00_MainContent_OwnLeg_labLandUseCode"]';
const total_assessed_value_xpath = '//th[contains(., "Assessed Values")]/ancestor::tbody/tr[6]/td[8]';
const est_value_xpath = '//th[contains(., "Appraised Values")]/ancestor::tbody/tr[6]/td[4]';
const property_info_tab_xpath = '//a[contains(., "Property Information")]';
const effective_year_xpath = '//tr[./td[contains(., "Year Built:")]]/td[4]/span';
const last_sale_date_xpath = '//td[contains(., "Sale Date")]/ancestor::tbody/tr[2]/td[contains(@class, "Data")][1]';
const last_sale_amount_xpath = '//td[contains(., "Sale Price")]/ancestor::tbody/tr[2]/td[contains(@class, "Data")][2]';

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'https://revenue.stlouisco.com/IAS/'
    }

    xpaths = {
        isPAloaded: '//frame[@name="body"]'
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

    discriminateAndRemove(name: string): any {
        const companyIdentifiersArray = ['GENERAL', 'TRUSTEE', 'TRUSTEES', 'INC', 'ORGANIZATION', 'CORP', 'CORPORATION', 'LLC', 'MOTORS', 'BANK', 'UNITED', 'CO', 'COMPANY', 'FEDERAL', 'MUTUAL', 'ASSOC', 'AGENCY', 'OF', 'SECRETARY', 'DEVELOPMENT', 'INVESTMENTS', 'HOLDINGS', 'ESTATE', 'LLP', 'LP', 'TRUST', 'LOAN', 'CONDOMINIUM', 'CHURCH', 'CITY', 'CATHOLIC', 'D/B/A', 'COCA COLA', 'LTD', 'CLINIC', 'TODAY', 'PAY', 'CLEANING', 'COSMETIC', 'CLEANERS', 'FURNITURE', 'DECOR', 'FRIDAY HOMES', 'SAVINGS', 'PROPERTY', 'PROTECTION', 'ASSET', 'SERVICES', 'L L C', 'NATIONAL', 'ASSOCIATION', 'MANAGEMENT', 'PARAGON', 'MORTGAGE', 'CHOICE', 'PROPERTIES', 'J T C', 'RESIDENTIAL', 'OPPORTUNITIES', 'FUND', 'LEGACY', 'SERIES', 'HOMES', 'LOAN'];
        const removeFromNamesArray = ['ET', 'AS', 'DECEASED', 'DCSD', 'CP\/RS', 'JT\/RS', 'esq', 'esquire', 'jr', 'jnr', 'sr', 'snr', '2', 'ii', 'iii', 'iv', 'md', 'phd', 'j.d.', 'll.m.', 'm.d.', 'd.o.', 'd.c.', 'p.c.', 'ph.d.', '&'];
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

    sleep(ms: number): any {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getSuffix(name: string): any {
        const suffixList = ['esq', 'esquire', 'jr', 'jnr', 'sr', 'snr', '2', 'ii', 'iii', 'iv', 'md', 'phd', 'j.d.', 'll.m.', 'm.d.', 'd.o.', 'd.c.', 'p.c.', 'ph.d.'];
        name = name.toLowerCase();
        for (let suffix of suffixList) {
            let regex = new RegExp(' ' + suffix, 'gm');
            if (name.match(regex)) {
                return suffix;
            }
        }
        return '';
    }

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

    async getData(frame_body: puppeteer.Frame, doc: IOwnerProductProperty, property_type_codes: string[], property_type_description: string[]) {
        // await page.waitFor(2000);
        await this.randomSleepIn5Sec()
        await frame_body!.waitForSelector('#divOwnLegData')
        let owner_names = await frame_body!.evaluate(el => el.textContent, (await frame_body!.$x(owner_names_xpath))[0]);
        let property_address = await frame_body!.evaluate(el => el.textContent, (await frame_body!.$x(property_address_xpath))[0]);
        let property_address_2 = await frame_body!.evaluate(el => el.textContent, (await frame_body!.$x(property_address_2_xpath))[0]);
        let mailing_address, mailing_address_2;
        let owner_occupied = false;
        try {
            mailing_address = await frame_body!.evaluate(el => el.textContent, (await frame_body!.$x(mailing_address_xpath))[0]);
            mailing_address_2 = await frame_body!.evaluate(el => el.textContent, (await frame_body!.$x(mailing_address_2_xpath))[0]);
        } catch {
            owner_occupied = true;
            mailing_address = property_address;
            mailing_address_2 = property_address_2;
        }
        let property_type_code = await frame_body!.evaluate(el => el.textContent, (await frame_body!.$x(property_type_code_xpath))[0]);
        let total_assessed_value, est_value;
        try {
            total_assessed_value = await frame_body!.evaluate(el => el.textContent, (await frame_body!.$x(total_assessed_value_xpath))[0]);
        } catch {
            total_assessed_value = '';
        }
        try {
            est_value = await frame_body!.evaluate(el => el.textContent, (await frame_body!.$x(est_value_xpath))[0]);
        } catch {
            est_value = '';
        }

        let property_info_tab = await frame_body!.$x(property_info_tab_xpath);
        await property_info_tab[0].click();
        await frame_body!.waitForNavigation({waitUntil: 'networkidle0'});
        let effective_year, last_sale_date, last_sale_amount;
        try {
            effective_year = await frame_body!.evaluate(el => el.textContent, (await frame_body!.$x(effective_year_xpath))[0]);
        } catch {
            effective_year = '';
        }
        try {
            last_sale_date = await frame_body!.evaluate(el => el.textContent, (await frame_body!.$x(last_sale_date_xpath))[0]);
            if (last_sale_date == 'There is no sales information available for this parcel.'){
                last_sale_date = ''
            }
        } catch {
            last_sale_date = '';
        }
        try {
            last_sale_amount = await frame_body!.evaluate(el => el.textContent, (await frame_body!.$x(last_sale_amount_xpath))[0]);
        } catch {
            last_sale_amount = '';
        }
        

        // Search for property type description
        let property_type = '';
        for (let c = 0; c < property_type_codes.length; c++) {
            let code = property_type_codes[c];
            let desc = property_type_description[c];
            if (code == property_type_code.trim()) {
                property_type = desc;
                break;
            }
        }

        // Normalize the owner's name
        owner_names = owner_names.replace(/\s+\s*\w\/\w$/, '');
        owner_names = owner_names.replace('  ', ' & ')
        const owners_array = nameParsingService.parseOwnersFullNameWithoutComma(owner_names)

        // Normalize the addresses
        let property_address_2_arr = property_address_2.split(", ");
        let property_city = property_address_2_arr[0];
        let property_state_zip = property_address_2_arr[1];
        let property_state_zip_arr = property_state_zip.split(/\s+/g);
        let property_state = property_state_zip_arr[0];
        let property_zip = property_state_zip_arr[1];
        let mailing_address_2_arr = mailing_address_2.split(", ");
        let mailing_city = mailing_address_2_arr[0];
        let mailing_state_zip = mailing_address_2_arr[1];
        let mailing_state_zip_arr = mailing_state_zip.split(/\s+/g);
        let mailing_state = mailing_state_zip_arr[0];
        let mailing_zip = mailing_state_zip_arr[1];

        const result = {
            owners_array,
            owner_occupied: owner_occupied,
            property_address: property_address.trim(),
            property_city: property_city.trim(),
            property_state: property_state.trim(),
            property_zip: property_zip.trim(),
            mailing_address: mailing_address.trim(),
            mailing_city: mailing_city.trim(),
            mailing_state: mailing_state.trim(),
            mailing_zip: mailing_zip.trim(),
            property_type: property_type.trim(),
            total_assessed_value: total_assessed_value.trim(),
            last_sale_recording_date: last_sale_date.trim(),
            last_sale_amount: last_sale_amount.trim(),
            est_value: est_value.trim(),
            effective_year: effective_year.trim()
        }

        await this.parseResult(result, doc);
    }

    // the main parsing function. if read() succeeds, parseAndSave is started().
    // return true after all parsing is complete

    // docsToParse is the collection of all address objects to parse from mongo.
    // !!! Only mutate document objects with the properties that need to be added!
    // if you need to multiply a document object (in case of multiple owners
    // or multiple properties (2-3, not 30) you can't filter down to one, use this.cloneMongoDocument(document);
    // once all properties from PA have been added to the document, call
    async parseAndSave(docsToParse: IOwnerProductProperty): Promise<boolean> {

        const url_search = 'https://revenue.stlouisco.com/IAS/';

        const page = this.browserPages.propertyAppraiserPage!;
        // Note the property code & description
        await page.goto('https://revenue.stlouisco.com/IAS/LandUseCodes.htm', {waitUntil: 'networkidle0'}); // Go to property code & description page
        let property_type_codes = [];
        let property_type_description = [];
        let code_rows = await page.$x('//table/tbody/tr/td[2]');
        let desc_rows = await page.$x('//table/tbody/tr/td[3]');
        for (let c = 0; c < code_rows.length; c++) {
            let code = await page.evaluate(el => el.textContent, code_rows[c]);
            property_type_codes.push(code);
            let desc = await page.evaluate(el => el.textContent, desc_rows[c]);
            property_type_description.push(desc);
        }
        let doc = docsToParse;
            if (!this.decideSearchByV2(doc)) {
                // console.log('Insufficient info for Owner and Property');
                return false;
            }
            let parser_address;
            let first_name = '';
            let last_name = '';
            let owner_name = '';
            let owner_name_regexp = '';

            if (this.searchBy === 'name') {
                const nameInfo = this.getNameInfo(doc.ownerId);
                first_name = nameInfo.first_name;
                last_name = nameInfo.last_name;
                owner_name = nameInfo.owner_name;
                owner_name_regexp = nameInfo.owner_name_regexp;
                if (owner_name === '') return false;
                console.log(`Looking for owner: ${owner_name}`);
            } else {
                parser_address = parseaddress.parseLocation(doc.propertyId['Property Address']);
                const parsev2 = await this.getAddressV2(doc.propertyId);
                if(!this.isEmptyOrSpaces(parsev2.street_address)){
                    parser_address = parseaddress.parseLocation(parsev2.street_address);
                }
                if(!parser_address || !parser_address.number || !parser_address.street){
                    console.log('The street number or name is missing!');
                    return false;
                }
                console.log(`Looking for address: ${doc.propertyId['Property Address']}`);
            }

            await page.goto(url_search, {waitUntil: 'networkidle0'});
            const session = await page.target().createCDPSession();
            await session.send('Page.enable');
            await session.send('Page.setWebLifecycleState', {state: 'active'});
            await page.waitFor(2000);
            let frame_input = page.frames().find(frame => frame.name() === 'SearchInput'); // Find the right frame.
            let frame_result = page.frames().find(frame => frame.name() === 'SearchResults'); // Find the right frame.
            let frame_body = page.frames().find(frame => frame.name() === 'body'); // Find the right frame.
            let retry_count = 0;
            while (true) {
                if (retry_count > 3) {
                    console.error('Connection/website error for 15 iteration.');
                    return false;
                }
                try {
                    await frame_input!.waitForSelector(search_by_address_selector);
                    break;
                } catch (error) {
                    let power = Math.pow(2, retry_count + 1);
                    let duration = (power - 1) * 1001;
                    this.sleep(duration);
                    retry_count += 1;
                    console.error(error);
                    await page.goto(url_search, {waitUntil: 'networkidle0'});
                    await page.waitFor(2000);
                    frame_input = page.frames().find(frame => frame.name() === 'SearchInput'); // Input frame
                    frame_result = page.frames().find(frame => frame.name() === 'SearchResults'); // Result frame
                    frame_body = page.frames().find(frame => frame.name() === 'body'); // Body frame
                }
            }
            if (this.searchBy === 'name') {
                await frame_input!.click(serach_by_owner_selector);
                await frame_input!.waitForSelector(owner_last_name_selector);
                await frame_input!.type(owner_last_name_selector, last_name.toUpperCase());
                await frame_input!.type(owner_first_name_selector, first_name.toUpperCase());
            } else {
                await frame_input!.click(search_by_address_selector);
                await frame_input!.waitForSelector(street_number_selector);
                await frame_input!.type(street_number_selector, parser_address.number);
                await frame_input!.type(street_name_selector, parser_address.street);
            }
            await frame_input!.click(search_button_selector);
            await frame_result!.waitForXPath(search_result_table_xpath);
            await page.waitFor(2000);
            try {
                const rows = await frame_result!.$x(search_result_xpath);
                if (rows.length === 0) {
                    console.log("No house found");
                    return true;
                }
                const ids = [];
                if (this.searchBy === 'name') {
                    for (const row of rows) {
                        const {name} = await frame_result!.evaluate(el => ({name: el.children[4].textContent}), row);
                        const regexp = new RegExp(owner_name_regexp);
                        if (!regexp.exec(name.toUpperCase())) continue;
                        //const [row] = await frame_result!.$x(`//*[contains(text(), "${id}")]`);
                        let frame_body = page.frames().find(frame => frame.name() === 'body'); // Find the right frame.
                        await Promise.all([
                            row.click(),
                            frame_body!.waitForNavigation()
                        ])

                        await this.getData(frame_body!, doc, property_type_codes, property_type_description);

                        await page.waitFor(300);


                    }
                } else {
                    let frame_body = page.frames().find(frame => frame.name() === 'body');
                    await Promise.all([
                        rows[0].click(),
                        frame_body!.waitForNavigation()
                    ])
                    await this.getData(frame_body!, doc, property_type_codes, property_type_description);
                }

            } catch (error) {
                if (this.searchBy === 'name') {
                    console.log(owner_name, "=> Owner not found!");
                } else {
                    console.log(doc.propertyId['Property Address'], "=> Address not found!");
                }
                const client = await page.target().createCDPSession();
                await client.send('Network.clearBrowserCookies');
                await client.send('Network.clearBrowserCache');
                return true;
            }
            const client = await page.target().createCDPSession();
            await client.send('Network.clearBrowserCookies');
            await client.send('Network.clearBrowserCache');

        return true;
    }

    async parseResult(result: any, document: any) {
        const ownersArray = result.owners_array
        for (const owner of ownersArray) {
            let dataFromPropertyAppraisers = {
                'Full Name': owner.fullName,
                'First Name': owner.firstName,
                'Last Name': owner.lastName,
                'Middle Name': owner.middleName,
                'Name Suffix': owner.suffix,
                'Mailing Care of Name': '',
                'Mailing Address': result['mailing_address'],
                'Mailing Unit #': '',
                'Mailing City': result['mailing_city'],
                'Mailing State': result[' mailing_state'],
                'Mailing Zip': result['mailing_zip'],
                'Property Address': result['property_address'],
                'Property Unit #': '',
                'Property City': result['property_city'],
                'Property State': this.publicRecordProducer.state.toUpperCase(),
                'Property Zip': result['property_zip'],
                'County': this.publicRecordProducer.county,
                'Owner Occupied': result['owner_occupied'],
                'Property Type': result['property_type'],
                'Total Assessed Value': result['total_assessed_value'],
                'Last Sale Recording Date': result['last_sale_recording_date'],
                'Last Sale Amount': result['last_sale_amount'],
                'Est Remaining balance of Open Loans': '',
                'Est Value': result['est_value'],
                'yearBuilt': result['effective_year'],
                'Est Equity': '',
                'Lien Amount': ''
            };
            try {
                await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
            } catch (e) {
                continue;
            }
            break;
        }

    }
}