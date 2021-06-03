import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
var parser = require('parse-address'); 
const nameParsingService = require('../../consumer_dependencies/nameParsingServiceNew');
import puppeteer from 'puppeteer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'https://paytax.erie.gov/webprop/index.asp'
    }

    xpaths = {
        isPAloaded: '//p[contains(.,"Property Address")]/input[1]'
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
    
    parseAddress = (address : string) : any => {
        const regexAddress = new RegExp(`(?<city>.*)\\s+(?<state>\\w{2})\\b`,'gi');
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
        let document = docsToParse;
            if (!this.decideSearchByV2(document)) {
                return false;
            }
            

            let searchHouseNo;
            let searchStreet;
            let first_name = '';
            let last_name = '';
            let owner_name = '';
            let owner_name_regexp = '';

            // do everything that needs to be done for each document here
            if(this.searchBy == 'address'){
                let addressString = document.propertyId["Property Address"];
                let result : any = parser.parseLocation(addressString);
                const parsev2 = this.getAddressV2(document.propertyId);
                if(!this.isEmptyOrSpaces(parsev2.street_address)){
                    result = parser.parseLocation(parsev2.street_address);
                }
                if(!result || (!result.number && !result.street)){
                    console.log("The street number and street name is missing!");
                    return false;
                }
                searchHouseNo = result.number ? result.number : '';
                searchStreet = result.street ? result.street : '';
                console.log(`Looking for address: ${document.propertyId["Property Address"]}`);
            } else {
                const nameInfo = this.getNameInfo(document.ownerId);
                first_name = nameInfo.first_name;
                last_name = nameInfo.last_name;
                owner_name = nameInfo.owner_name;
                owner_name_regexp = nameInfo.owner_name_regexp;
                if (owner_name === '') return false;
                console.log(`Looking for owner: ${owner_name}`);
            }

            await page.goto('https://paytax.erie.gov/webprop/index.asp');
            try{
                await page.waitForXPath('//p[contains(.,"Property Address")]/input[1]');
            } catch(e){
                console.log("Website loading failed, please check: https://paytax.erie.gov/webprop/index.asp");
                return true;
            }

            if(this.searchBy == 'address'){
                if(searchHouseNo != '')
                {
                    const inputStreetNoXpath = await page.$x('//p[contains(.,"Property Address")]/input[1]');
                    await inputStreetNoXpath[0].type(searchHouseNo.trim(), {delay: 150});
                }
                if(searchStreet != '')
                {
                    const inputStreetXpath = await page.$x('//p[contains(.,"Property Address")]/input[2]');
                    await inputStreetXpath[0].type(searchStreet.trim(), {delay: 150});
                }
            } else {
                await page.type('input[name="txtowner"]', owner_name, {delay: 150});
            }
            const submitButton = await page.$x('//*[@id="center_column_wide"]/form/input[@type = "submit"]');
            await Promise.all([
                submitButton[0].click(),
                page.waitForNavigation({waitUntil: 'networkidle0'})
            ]);

            let searchResults = await page.$x('//table[@id="generic_site_table"]/tbody/tr');
            if(searchResults.length < 2){
                console.log("Not found!");
                return true;
            }
            searchResults.shift();
            let datalinks = [];
            if(this.searchBy == 'name'){
                for(const row of searchResults){
                    let link = await row.evaluate(el => el.children[0].children[0].getAttribute('href'));
                    link = "https://paytax.erie.gov/webprop/" + link;
                    let name = await row.evaluate(el => el.children[1].textContent?.trim());
                    const regexp = new RegExp(owner_name_regexp);
                    if (regexp.exec(name!.toUpperCase())){
                        datalinks.push(link);
                    }
                }
            } else {
                let link = await searchResults[0].evaluate(el => el.children[0].children[0].getAttribute('href'));
                link = "https://paytax.erie.gov/webprop/" + link;
                datalinks.push(link);
            }
            console.log(datalinks);
            for(const link of datalinks){
                console.log(link);
                try{
                    await page.goto(link);
                    await page.waitForXPath('//*[@id = "generic_site_table"]//tr/th[text() = "Property Location"]/following-sibling::td');

                    const ownerNameXpath =  await page.$x('//*[@id = "generic_site_table"]//tr/th[text() = "Owner"]/following-sibling::td');
                    let ownerName = await page.evaluate(td => td.innerText , ownerNameXpath[0]);
                    let parseName = await nameParsingService.newParseName(ownerName);

                    const propertyAddressXpath = await page.$x('//*[@id = "generic_site_table"]//tr/th[text() = "Property Location"]/following-sibling::td');
                    let propertyAddress = await page.evaluate(td => td.innerText , propertyAddressXpath[0]);
                    propertyAddress = propertyAddress.trim();

                    const ownerAddressXpath = await page.$x('//*[@id = "generic_site_table"]//tr/th[text() = "Mailing Address"]/following-sibling::td');
                    let ownerAddress = await page.evaluate(td => td.innerText , ownerAddressXpath[0])
                    ownerAddress = ownerAddress.trim().replace(/\s+/g ,' ');
                    const ownerOccupied = ownerAddress == propertyAddress ? true : false;
                    
                    const mailingCityAndStateXpath = await page.$x('//*[@id = "generic_site_table"]//tr/th[text() = "City/State"]/following-sibling::td');
                    let mailingCityAndState = await page.evaluate(td => td.innerText , mailingCityAndStateXpath[0])
                    let result = this.parseAddress(mailingCityAndState)
                    const mailingCity = result.city ? result.city : '';
                    const mailingState = result.state ? result.state : '';
                    const mailingZipXpath = await page.$x('//*[@id = "generic_site_table"]//tr/th[text() = "Zip"]/following-sibling::td');
                    let mailingZip = await page.evaluate(td => td.innerText , mailingZipXpath[0]);

                    await page.waitForXPath('//*[@id = "generic_site_table"]//tr/th[text() = "Assessment"]/following-sibling::td');
                    const assessedValueXpath = await page.$x('//*[@id = "generic_site_table"]//tr/th[text() = "Assessment"]/following-sibling::td');
                    let assessedValue = await page.evaluate(td => td.innerText , assessedValueXpath[0]);
                    assessedValue = assessedValue.trim();

                    await page.waitForXPath('//*[@id = "generic_site_table"]//tr/th[text() = "Property Class"]/following-sibling::td');
                    const propertyTypeXpath = await page.$x('//*[@id = "generic_site_table"]//tr/th[text() = "Property Class"]/following-sibling::td');
                    const propertyTypeString = await page.evaluate(td => td.innerText , propertyTypeXpath[0]);
                    const propertyType = this.parseProperty(propertyTypeString.trim());
                    
                    const historyButton = await page.$x('//*[@id = "generic_site_table"]//tr/td/a[text() = "Owner History"]');
                    await historyButton[0].click();
                    let salesDate : string;
                    try{
                        await page.waitForSelector('#generic_site_table > tbody > tr:last-child > td:last-child',{timeout : 3000});
                        salesDate = await page.$eval('#generic_site_table > tbody > tr:last-child > td:last-child' , span => span.innerHTML);
                    }
                    catch(err)
                    {
                        salesDate = '';
                    }
                    let dataFromPropertyAppraisers: any = {};
                    dataFromPropertyAppraisers["Owner Occupied"] = ownerOccupied;
                    dataFromPropertyAppraisers["Full Name"] = parseName.fullName;
                    dataFromPropertyAppraisers["First Name"] = parseName.firstName;
                    dataFromPropertyAppraisers["Last Name"] = parseName.lastName;
                    dataFromPropertyAppraisers["Middle Name"] = parseName.middleName;
                    dataFromPropertyAppraisers["Name Suffix"] = parseName.suffix;
                    dataFromPropertyAppraisers["Mailing Care of Name"] = '';
                    dataFromPropertyAppraisers["Mailing Address"] = ownerAddress;
                    dataFromPropertyAppraisers["Mailing Unit #"] = '';
                    dataFromPropertyAppraisers["Mailing City"] = mailingCity;
                    dataFromPropertyAppraisers["Mailing State"] = mailingState;
                    dataFromPropertyAppraisers["Mailing Zip"] = mailingZip;
                    dataFromPropertyAppraisers["Property Type"] = propertyType;
                    dataFromPropertyAppraisers["Total Assessed Value"] = assessedValue;
                    dataFromPropertyAppraisers["Last Sale Recording Date"] = salesDate;
                    dataFromPropertyAppraisers["Last Sale Amount"] = '';
                    dataFromPropertyAppraisers["Est. Remaining balance of Open Loans"] = '';
                    dataFromPropertyAppraisers["Est Value"] = '';
                    dataFromPropertyAppraisers["yearBuilt"] = '';
                    dataFromPropertyAppraisers["Est Equity"] = '';
                    dataFromPropertyAppraisers["Lien Amount"] = '';
                    dataFromPropertyAppraisers["County"] = 'erie';
                    dataFromPropertyAppraisers["Property State"] = 'NY';
                    dataFromPropertyAppraisers["Property Address"] = propertyAddress;
                    await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
                } catch(e){
                    console.log(e);
                    continue;
                }
            }
            await this.randomSleepIn5Sec();
        return true;
    }

}