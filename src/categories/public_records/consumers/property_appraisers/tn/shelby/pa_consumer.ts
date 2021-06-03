import puppeteer from 'puppeteer';
import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
var parser = require('parse-address'); 

import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'https://www.assessormelvinburgess.com/propertySearch'
    }

    xpaths = {
        isPAloaded: '//*[@id = "stName"]'
    }
    
    discriminateAndRemove = (name : string) => {
        const companyIdentifiersArray = [ 'GENERAL', 'TRUSTEE', 'TRUSTEES', 'INC', 'ORGANIZATION', 'CORP', 'CORPORATION', 'LLC', 'MOTORS', 'BANK', 'UNITED', 'CO', 'COMPANY', 'FEDERAL', 'MUTUAL', 'ASSOC', 'AGENCY' , 'OF' , 'SECRETARY' , 'DEVELOPMENT' , 'INVESTMENTS', 'HOLDINGS', 'ESTATE', 'LLP', 'LP', 'TRUST', 'LOAN', 'CONDOMINIUM', 'CHURCH', 'CITY', 'CATHOLIC', 'D/B/A', 'COCA COLA', 'LTD', 'CLINIC', 'TODAY', 'PAY', 'CLEANING', 'COSMETIC', 'CLEANERS', 'FURNITURE', 'DECOR', 'FRIDAY HOMES', 'SAVINGS', 'PROPERTY', 'PROTECTION', 'ASSET', 'SERVICES', 'L L C', 'NATIONAL', 'ASSOCIATION', 'MANAGEMENT', 'PARAGON', 'MORTGAGE', 'CHOICE', 'PROPERTIES', 'J T C', 'RESIDENTIAL', 'OPPORTUNITIES', 'FUND', 'LEGACY', 'SERIES', 'HOMES', 'LOAN'];
        const removeFromNamesArray = ['ET', 'AS', 'DECEASED', 'DCSD', 'CP\/RS', 'JT\/RS' ,'JTWROS', 'TEN IN COM' , '- *Joint Tenants', '- *Tenancy', 'LLC' ];
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

    parseSearchAddress = (address : string) =>{
        const addressSuffixArray = ['APT', 'AVE', 'BLVD', 'BLDG', 'CTR', 'CIR', 'CT', 'DR', 'EXPY', 'EXT', 'FT', 'FWY', 'FL', 'HTS', 'HWY', 'IS', 'JCT', 'LN', 'MT', 'PKY', 'PL', 'PO', 'RD', 'RR', 'ST', 'SPG', 'SPGS', 'SQ', 'STE', 'UNIT', 'RM', 'DEPT', '#' , 'TER', 'TPKE' ,'TRL' ,'CV', 'Pkwy' , 'WAY'];
        const addressDirArray = ['N', 'S', 'W', 'E', 'NE', 'NW', 'SE', 'SW'];
        const addressSuffixRegexString = `\\b(?:${addressSuffixArray.join('\\b.*|')})\\b.*`;
        const adddressDirRegexString = `\\b(?:${addressDirArray.join('|')})\\b`;
        const addressSuffixRegex = new RegExp(addressSuffixRegexString , 'i');
        const addressDirRegex = new RegExp(adddressDirRegexString , 'i');

        address = address.replace(addressDirRegex , '')
        address = address.replace(addressSuffixRegex , '')
        const regexAddress = new RegExp(`(?<houseNo>\\d+)?\\b\\s*?(?<street>.*)\\s*`,'gi');
        const match = regexAddress.exec(address);
        if(match == null) return {houseNo : null , street : null};
    
        return match.groups;
    }
    
    parseProperty = (property : string) : any => {
        const regexProperty = new RegExp(`-\\s(?<property>.+)`,'gi');
        const match = regexProperty.exec(property);
        if (match == null) return null;
        return match.groups?.property;
    }
    
    parseAddress = (address : string) : any => {
        const regexAddress = new RegExp(`^.+\\s+(?<city>.*)\\s+(?<state>\\w{2})\\s(?<zip>.+)\\b`,'gi');
        const match = regexAddress.exec(address);
        if (match == null) return {city : null , state : null , zip : null}
        return match.groups;
    }

    parseName = (name : string) : any =>{
        const suffixArray = ['II', 'III', 'IV', 'CPA', 'DDS', 'ESQ', 'JD', 'JR', 'LLD', 'MD', 'PHD', 'RET', 'RN', 'SR', 'DO'];
        const suffixRegexString = `\\b(?:${suffixArray.join('|')})\\b`;
        const middleNameRegexString = `\\b(?:\\w{1})\\b`;
        const suffixRegex = new RegExp(suffixRegexString , 'i');
        const middleNameRegex = new RegExp(middleNameRegexString , 'i');

        let parsedName = this.discriminateAndRemove(name.trim());
        let nameArray : any = [null , null];

        let result : any = {
            fName : null,
            lName : null,
            mName : null,
            suffix : null,
            name : name
        }
        if(parsedName.type == 'person')
        {
            let personName = parsedName['name'];
            result['name'] = parsedName['name'];
            personName = personName.replace(',','');
            const isSuffix = personName.match(suffixRegex);
            if(isSuffix)
            {
                result.suffix = isSuffix[0];
                personName = personName.replace(isSuffix[0] , '');
            }
            const isMiddleName : any = personName.match(middleNameRegex);
            if(isMiddleName)
            {
                result.mName = isMiddleName[0];
                personName = personName.replace(new RegExp(`\\b${isMiddleName[0]}\\b`,'gi') , '');
            }
            personName = personName.trim();
            if(isMiddleName != '')
                nameArray = personName.split(/\b\s+/g);
            if(nameArray.length == 3)
                result.mName = nameArray[2];
            result.fName = nameArray[1];
            result.lName = nameArray[0];
        }
        return result;
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

    // the main parsing function. if read() succeeds, parseAndSave is started().
    // return true after all parsing is complete 

    // docsToParse is the collection of all address objects to parse from mongo.
    // !!! Only mutate document objects with the properties that need to be added!
    // if you need to multiply a document object (in case of multiple owners
    // or multiple properties (2-3, not 30) you can't filter down to one, use this.cloneMongoDocument(document);
    // once all properties from PA have been added to the document, call 
    async parseAndSave(docsToParse: IOwnerProductProperty): Promise<boolean> {

        let total_lookups = 0;
        let successful_lookups = 0;
        let total_successful_lookups = 0;
        const page = this.browserPages.propertyAppraiserPage!;
        await page.setDefaultTimeout(60000);
        let doc = docsToParse;
            try {
                total_lookups++;    
                console.log(doc);
                // do everything that needs to be done for each document here
                let retries = 0;
                while (true) {
                    try {
                        await page.goto('https://www.assessormelvinburgess.com/propertySearch', {waitUntil: 'load'});
                        break;
                    } catch (err) {
                        retries++;
                        if (retries > 3) {
                            console.log('******** website loading failed');
                            return false;
                        }
                        this.randomSleepIn5Sec();
                        console.log(`******** website loading failed, retring... [${retries}]`);
                    }        
                }
                if (!this.decideSearchByV2(doc)) {
                    console.log('Insufficient info for Owner and Property');
                    return false;
                }

                let addressString;
                let searchHouseNo;
                let searchStreet;
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
                }
                else {
                    addressString = doc.propertyId["Property Address"];
                    const parsev2 = this.getAddressV2(doc.propertyId);
                    let result = parser.parseLocation(addressString);
                    if(!this.isEmptyOrSpaces(parsev2.street_address)){
                        result = parser.parseLocation(parsev2.street_address);
                    }
                    if(!result || (!result.number && !result.street)){
                        console.log("Street number and street name is missing!");
                        return false;
                    }
                    searchHouseNo = result.number;
                    searchStreet = result.street;
                    console.log(`Looking for address: ${addressString}`);
                }

                if (this.searchBy === 'name') {
                    if (first_name) {
                        await page.waitForSelector('#firstName');
                        const inputFirstName = (await page.$('#firstName'))!;
                        await inputFirstName.click({clickCount : 3 });
                        await inputFirstName.type(first_name.trim(), {delay: 100});
                    }
                    if (last_name) {
                        await page.waitForSelector('#lastName');
                        const inputLastName = (await page.$('#lastName'))!;
                        await inputLastName.click({clickCount : 3 });
                        await inputLastName.type(last_name.trim(), {delay: 100});
                    }
                    await Promise.all([
                        page.click('#ownerSearch > div:nth-child(2) > form > button'),
                        page.waitForNavigation()
                    ]);
                }
                else {
                    if(searchHouseNo != null)
                    {
                        await page.waitForSelector('#stNumber');
                        const inputStreetNo = (await page.$('#stNumber'))!;
                        await inputStreetNo.click({clickCount : 3 });
                        await inputStreetNo.type(searchHouseNo.trim());
                    }
                    if(searchStreet != null)
                    {
                        const inputStreetName = (await page.$('#stName'))!;
                        await inputStreetName.click({clickCount : 3 });
                        await inputStreetName.type(searchStreet.trim());
                    }
                    await Promise.all([
                        page.click('#addressSearch > div:nth-child(2) > form > button'),
                        page.waitForNavigation()
                    ]);
                }
                
                if(await page.$('#myTable') != null)
                {
                    if (this.searchBy === 'name') {
                        try {
                            let links = [];
                            const rows = await page.$x('//*[@id="myTable"]/tbody/tr');
                            for (const row of rows) {
                                const {name, link} = await page.evaluate(el => ({name: el.children[1].textContent.trim(), link: el.children[3].children[0].href}), row);
                                const regexp = new RegExp(owner_name_regexp);
                                console.log(name, owner_name_regexp);
                                if (!regexp.exec(name.toUpperCase())) continue;
                                links.push(link);
                            }
                            if (links.length === 0) {
                                console.log("no house found");
                                return true;
                            }
                            console.log(`#### ${links.length} results found`);
                            for (let link of links) {
                                await page.goto(link, {waitUntil: 'load'});
                                await page.waitForSelector('#accordionExample');
                                await this.randomSleepIn5Sec();
                                if (await this.processData(page, doc, owner_name_regexp, addressString)) {
                                    total_successful_lookups++;
                                }
                            }
                            successful_lookups++;
                            console.log(`TOTAL: ${total_lookups}, SUCCESS: ${successful_lookups}, TOTAL: ${total_successful_lookups}`);
                        }
                        catch (err) 
                        {
                            console.log("no house found");
                        }
                    }
                    else {
                        try{
                            await page.waitForXPath('//*[@id="myTable"]/tbody/tr/td[normalize-space(text()) = "' +  addressString?.toUpperCase() +'"]/following-sibling::td/a' , {timeout : 5000});
                            await page.click('//*[@id="myTable"]/tbody/tr/td[normalize-space(text()) = "' +  addressString?.toUpperCase() +'"]/following-sibling::td/a');
                            await page.waitForSelector('#accordionExample');
                            if (await this.processData(page, doc, owner_name_regexp, addressString)) {
                                total_successful_lookups++;
                            }
                            successful_lookups++;
                            console.log(`TOTAL: ${total_lookups}, SUCCESS: ${successful_lookups}, TOTAL: ${total_successful_lookups}`);
                            
                        }
                        catch(err)
                        {
                            console.log("no house found");
                        }
                    }
                    return true;
                }
                if (await this.processData(page, doc, owner_name_regexp, addressString)) {
                    total_successful_lookups++;
                    successful_lookups++;
                    console.log(`TOTAL: ${total_lookups}, SUCCESS: ${successful_lookups}, TOTAL: ${total_successful_lookups}`);
                }
                await this.randomSleepIn5Sec();
            }
            catch (err) {
                return false;
            }
        return true;
    }
    async processData(page: puppeteer.Page, doc: IOwnerProductProperty, owner_name_regexp: string='', addressString: string='') {
        try {
            await page.waitForXPath('//tr//td[contains(.//text(), "Owner Name")]/following-sibling::td');
            let ownerNameArray = [];
            let ownerNameXpath = await page.$x('//tr//td[contains(.//text(), "Owner Name")]/following-sibling::td')
            let ownerName = await page.evaluate(td => td.innerText , ownerNameXpath[0]);

            const regexp = new RegExp(owner_name_regexp);
            if (!regexp.exec(ownerName.toUpperCase())) return false;

            let parsedName = this.discriminateAndRemove(ownerName.trim());
            if(parsedName.type == 'person')
            {
                let nameArray = ownerName.split(' & ');
                ownerNameArray.push(this.parseName(nameArray[0].trim()));
                if(nameArray[1] != null)
                {
                    const ownerName1Array = nameArray[1].split(/\b,?\s+\b/);
                    if(ownerName1Array.length < 3)
                        nameArray[1]  = ownerNameArray[0].lName + ' ' + nameArray[1]
                    ownerNameArray.push(this.parseName(nameArray[1]));
                }
            }
            else
                ownerNameArray.push(this.parseName(ownerName.trim()));

            await page.waitForXPath('//tr//td[contains(.//text(), "Property Address")]/following-sibling::td');

            const propertyAddressXpath = await page.$x('//tr//td[contains(.//text(), "Property Address")]/following-sibling::td');
            let propertyAddress = await page.evaluate(td => td.innerText , propertyAddressXpath[0]);
            propertyAddress = propertyAddress.trim();

            const ownerAddressXpath = await page.$x('//tr//td[contains(.//text(), "Owner Address")]/following-sibling::td');
            let ownerAddress = await page.evaluate(td => td.innerText , ownerAddressXpath[0])
            ownerAddress = ownerAddress.trim().replace(/\s+/g ,' ');
            const ownerOccupied = ownerAddress == propertyAddress ? true : false;

            const cityStateZipXpath = await page.$x('//tr//td[contains(.//text(), "City/State/Zip")]/following-sibling::td');
            let cityStateZip = await page.evaluate(td => td.innerText , cityStateZipXpath[0]);
            cityStateZip = cityStateZip.trim().replace(/\s+/g ,' ');
            let result = this.parseAddress(cityStateZip)
            const mailingCity = result.city;
            const mailingState = result.state;  
            const mailingZip = result.zip;

            await page.waitForXPath('//tr//td[contains(.//text(), "Total Assessment")]/following-sibling::td');
            const assessedValueXpath = await page.$x('//tr//td[contains(.//text(), "Total Assessment")]/following-sibling::td');
            let assessedValue = await page.evaluate(td => td.innerText , assessedValueXpath[0]);
            assessedValue = assessedValue.trim();

            await page.waitForXPath('//tr//td[contains(.//text(), "Land Use")]/following-sibling::td');
            const propertyTypeXpath = await page.$x('//tr//td[contains(.//text(), "Land Use")]/following-sibling::td');
            const propertyTypeString = await page.evaluate(td => td.innerText , propertyTypeXpath[0]);
            const propertyType = this.parseProperty(propertyTypeString.trim());
            
            await page.waitForXPath('//*[@id="salesBody"]/tr[1]/td[1]');
            const salesDateXpath = await page.$x('//*[@id="salesBody"]/tr[1]/td[1]');
            let salesDate = await page.evaluate(td => td.innerText , salesDateXpath[0]);
            salesDate = salesDate.trim();

            const salesPriceXpath = await page.$x('//*[@id="salesBody"]/tr[1]/td[2]');
            let salesPrice = await page.evaluate(td => td.innerText , salesPriceXpath[0]);
            salesPrice = salesPrice.trim();

            let dataFromPropertyAppraisers = {
                "Owner Occupied": ownerOccupied,
                "owner_full_name": ownerNameArray[0].name,
                'Full Name': ownerNameArray[0].name,
                "First Name": ownerNameArray[0].fName,
                "Last Name": ownerNameArray[0].lName,
                "Middle Name": ownerNameArray[0].mName,
                "Name Suffix": ownerNameArray[0].suffix,
                "Mailing Care of Name": '',
                "Mailing Address": ownerAddress,
                "Mailing Unit #": '',
                "Mailing City": mailingCity,
                "Mailing State": mailingState,
                "Mailing Zip": mailingZip,
                "Property Type": propertyType,
                "Total Assessed Value": assessedValue,
                "Last Sale Recording Date": salesDate,
                "Last Sale Amount": salesPrice,
                "Est. Remaining balance of Open Loans": '',
                "Est Value": '',
                "yearBuilt": '',
                "Est Equity": '',
                "Lien Amount": '',
                'Property State': 'TN',
                'County': 'shelby',
                'Property Address': propertyAddress,
            };
            try{
                return await this.saveToOwnerProductPropertyV2(doc, dataFromPropertyAppraisers);
            } catch(e){
                //
            }
        } catch (e) {
            return false;
        }
    }
}