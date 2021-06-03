import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
import { IPublicRecordAttributes } from '../../../../../../models/public_record_attributes'
var parser = require('parse-address'); 

import puppeteer from 'puppeteer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'http://icare.co.lucas.oh.us/LucasCare/search/commonsearch.aspx?mode=address'
    }

    xpaths = {
        isPAloaded: '//*[@id = "inpNumber"]'
    }
    
    discriminateAndRemove = (name : string) => {
        const companyIdentifiersArray = [ 'GENERAL', 'TRUSTEE', 'TRUSTEES', 'INC', 'ORGANIZATION', 'CORP', 'CORPORATION', 'LLC', 'MOTORS', 'BANK', 'UNITED', 'CO', 'COMPANY', 'FEDERAL', 'MUTUAL', 'ASSOC', 'AGENCY' , 'OF' , 'SECRETARY' , 'DEVELOPMENT' , 'INVESTMENTS', 'HOLDINGS', 'ESTATE', 'LLP', 'LP', 'TRUST', 'LOAN', 'CONDOMINIUM', 'CHURCH', 'CITY', 'CATHOLIC', 'D/B/A', 'COCA COLA', 'LTD', 'CLINIC', 'TODAY', 'PAY', 'CLEANING', 'COSMETIC', 'CLEANERS', 'FURNITURE', 'DECOR', 'FRIDAY HOMES', 'SAVINGS', 'PROPERTY', 'PROTECTION', 'ASSET', 'SERVICES', 'L L C', 'NATIONAL', 'ASSOCIATION', 'MANAGEMENT', 'PARAGON', 'MORTGAGE', 'CHOICE', 'PROPERTIES', 'J T C', 'RESIDENTIAL', 'OPPORTUNITIES', 'FUND', 'LEGACY', 'SERIES', 'HOMES', 'LOAN'];
        const removeFromNamesArray = ['ET', 'AS', 'DECEASED', 'DCSD', 'CP\/RS', 'JT\/RS' ,'JTWROS', 'TEN IN COM' , ' - *Joint Tenants', ' - *Tenancy', 'LLC' ,' - *Tenants' , ' - *Heir' ];
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
        const regexProperty = new RegExp(`\\b\\d+\\s(?<property>.+)`,'gi');
        const match = regexProperty.exec(property);
        if (match == null) return null;
        return match.groups?.property;
    }
    parseMailingUnit = (address : string) : any =>{
        const addressUnitDesignatorsArray = ['APT', 'BLDG', 'FL', 'STE', 'UNIT', 'RM', 'DEPT', '#'];
        const addressUnitRegexString = `\\b\\s(?<unit>${addressUnitDesignatorsArray.join('\\s.+|')}\\s.+)\\b`;
        const addressUnitRegex = new RegExp(addressUnitRegexString , 'i');
        const match = address.match(addressUnitRegex);
        if (match == null) return null;
        return match.groups?.unit;
    }
    parseAddress = (address : string) : any => {
        const regexAddress = new RegExp(`(?<city>.*),?\\s(?<state>\\w{2})\\s+(?<zip>\\d+)`,'gi');
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

        const page = this.browserPages.propertyAppraiserPage!;
        await page.setDefaultNavigationTimeout(0);
        let document = docsToParse;

            if (!this.decideSearchByV2(document)) {
                console.log('Insufficient info for Owner and Property');
                return false;
            }
            
            // do everything that needs to be done for each document here
            let addressString = '';
            let result: any;
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
                await page.goto('http://icare.co.lucas.oh.us/LucasCare/search/commonsearch.aspx?mode=owner')
                await page.waitForSelector('input#inpOwner');
            }
            else {
                addressString = document.propertyId['Property Address'];
                const parseraddr = this.getAddressV2(document.propertyId);
                if(!this.isEmptyOrSpaces(parseraddr.street_address)){
                    addressString = parseraddr.street_address;
                }
                result = parser.parseLocation(addressString);
                console.log(`Looking for address: ${addressString}`);
                await page.goto('http://icare.co.lucas.oh.us/LucasCare/search/commonsearch.aspx?mode=address')
                await page.waitForSelector('input#inpNumber');
            }

            if(this.searchBy == 'address'){
                if(!result || !result.number || !result.street){
                    console.log('The street number or name is missing!');
                    return false;
                }
                const searchHouseNo = result.number;
                const searchStreet = result.street;
                const searchUnitNum = result.sec_unit_num;
                if(searchHouseNo != null)
                {
                    const inputStreetNo = (await page.$('#inpNumber'))!;
                    await inputStreetNo.click({clickCount : 3 });
                    await inputStreetNo.type(searchHouseNo.trim());
                }
                if(searchStreet != null)
                {
                    const inputStreetName = (await page.$('#inpStreet'))!;
                    await inputStreetName.click({clickCount : 3 });
                    await inputStreetName.type(searchStreet.trim());
                }
                if(searchUnitNum != null)
                {
                    const inputStreetUnit = (await page.$('#inpUnit'))!;
                    await inputStreetUnit.click({clickCount : 3 });
                    await inputStreetUnit.type(searchUnitNum.trim());
                }
            } else {
                const inputOwnerName = (await page.$('#inpOwner'))!;
                await inputOwnerName.click({clickCount : 3 });
                await inputOwnerName.type(owner_name.trim());
            }
            await Promise.all([
                page.click('#btSearch'),
                page.waitForNavigation({waitUntil: 'networkidle0'})
            ]);
            if(await page.$('#searchResults') != null)
            {       
                try
                {
                    if(this.searchBy == 'address'){
                        const viewButtonXpath = await page.$x('//*[@id="searchResults"]/tbody/tr/td/div[starts-with(normalize-space(text()), "' +  addressString.toUpperCase() +'" )   ]');
                        await viewButtonXpath[0].click();
                        await page.waitForXPath('//tr//td[text() = "Owner"]/following-sibling::td');
                    } else {
                        let searchResults = await page.$x('//tr[@class="SearchResults"]');
                        for(const row of searchResults){
                            let name = await row.evaluate(el => el.children[3].children[0].textContent?.trim());
                            const regexp = new RegExp(owner_name_regexp);
                            if (regexp.exec(name!.toUpperCase())){
                                await row.click();
                                await page.waitForXPath('//tr//td[text() = "Owner"]/following-sibling::td');
                                break;
                            }
                        }
                    }
                }
                catch(err)
                {
                    console.log("no house found");
                    return true;
                }
            }
            else if ((await page.$x('//tbody//p[contains(., "Your search did not find any records")]'))[0] !== undefined)
            {
                console.log("no house found");
                return true;
            }

            let ownerNameArray = [];
            let ownerNameXpath = await page.$x('//tr//td[text() = "Owner"]/following-sibling::td')
            let ownerName = await page.evaluate(td => td.innerText , ownerNameXpath[0]);
            ownerName = ownerName.replace(/\n/g,'')
            let parsedName = this.discriminateAndRemove(ownerName.trim());
            if(parsedName.type == 'person')
            {
                let nameArray = ownerName.split('&');
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

            await page.waitForXPath('//tr//td[text() = "Property Address"]/following-sibling::td');
            const paddress1Xpath = await page.$x('//tr//td[text() = "Property Address"]/following-sibling::td');
            let paddress1 = await page.evaluate(td => td.innerHTML ,paddress1Xpath[0]);
            paddress1 = paddress1.replace(/\s+/g , ' ');
            const paddress2Xpath = await page.$x('//tr//td[text() = "Property Address"]/parent::tr/following-sibling::tr/td[2]');
            const paddress2 = await page.evaluate(td => td.innerHTML ,paddress2Xpath[0]);
            let propertyAddress = paddress1 + " " + paddress2;

            await page.waitForXPath('//tr//td[text() = "Mailing Address"]/following-sibling::td');
            const address1Xpath = await page.$x('//tr//td[text() = "Mailing Address"]/following-sibling::td');
            let address1 = await page.evaluate(td => td.innerText ,address1Xpath[0]);
            address1 = address1.replace(/\s+/g , ' ');
            const address2Xpath = await page.$x('//tr//td[text() = "Mailing Address"]/parent::tr/following-sibling::tr/td[2]');
            const address2 = await page.evaluate(td => td.innerText ,address2Xpath[0]);

            let ownerAddress = address1 + " " + address2;
            ownerAddress = ownerAddress.replace(/\s+/g , ' ');
            const mailingUnit = this.parseMailingUnit(address1);
            let result_mailing = this.parseAddress(address2);
            const mailingCity = result_mailing.city;
            const mailingState = result_mailing.state;
            const mailingZip = result_mailing.zip;

            let result_property = this.parseAddress(paddress2);
            const propertyCity = result_property.city;
            const propertyState = result_property.state;
            const propertyZip = result_property.zip;

            const ownerOccupied = ownerAddress == propertyAddress ? true : false;

            await page.waitForXPath('//tr//td[text() = "Total"]/following-sibling::td[4]');
            const assessedValueXpath = await page.$x('//tr//td[text() = "Total"]/following-sibling::td[4]');
            const assessedValue = await page.evaluate(td => td.innerText ,assessedValueXpath[0]);
            const propertyTypeXpath = await page.$x('//tr//td[text() = "Class"]/following-sibling::td');
            const propertyType = await page.evaluate(td => td.innerText ,propertyTypeXpath[0]);
            const salesDateXpath = await page.$x('//tr//td[text() = "Sales Date"]/following-sibling::td');
            const salesDate = await page.evaluate(td => td.innerText ,salesDateXpath[0]);
            const salesPriceXpath = await page.$x('//tr//td[text() = "Sale Amount"]/following-sibling::td');
            const salesPrice = await page.evaluate(td => td.innerText ,salesPriceXpath[0]);

            let dataFromPropertyAppraisers: any = {};
            dataFromPropertyAppraisers["Owner Occupied"] = ownerOccupied;
            dataFromPropertyAppraisers["Full Name"] = ownerNameArray[0].name;
            dataFromPropertyAppraisers["First Name"] = ownerNameArray[0].fName;
            dataFromPropertyAppraisers["Last Name"] = ownerNameArray[0].lName;
            dataFromPropertyAppraisers["Middle Name"] = ownerNameArray[0].mName;
            dataFromPropertyAppraisers["Name Suffix"] = ownerNameArray[0].suffix;
            dataFromPropertyAppraisers["Mailing Care of Name"] = '';
            dataFromPropertyAppraisers["Mailing Address"] = address1;
            dataFromPropertyAppraisers["Mailing Unit #"] = mailingUnit;
            dataFromPropertyAppraisers["Mailing City"] = mailingCity;
            dataFromPropertyAppraisers["Mailing State"] = mailingState;
            dataFromPropertyAppraisers["Mailing Zip"] = mailingZip;
            dataFromPropertyAppraisers["Property Type"] = propertyType;
            dataFromPropertyAppraisers["Total Assessed Value"] = assessedValue;
            dataFromPropertyAppraisers["Last Sale Recording Date"] = salesDate;
            dataFromPropertyAppraisers["Last Sale Amount"] = salesPrice;
            dataFromPropertyAppraisers["Est. Remaining balance of Open Loans"] = '';
            dataFromPropertyAppraisers["Est Value"] = '';
            dataFromPropertyAppraisers["yearBuilt"] = '';
            dataFromPropertyAppraisers["Est Equity"] = '';
            dataFromPropertyAppraisers["Lien Amount"] = '';
            dataFromPropertyAppraisers["Property Address"] = paddress1;
            dataFromPropertyAppraisers["Property State"] = this.publicRecordProducer.state.toUpperCase();
            dataFromPropertyAppraisers["County"] = this.publicRecordProducer.county;
            dataFromPropertyAppraisers["Property City"] = propertyCity;
            dataFromPropertyAppraisers["Property Zip"] = propertyZip;
            try{
                await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
            } catch(e){
                //
            }
        return true;
    }

}