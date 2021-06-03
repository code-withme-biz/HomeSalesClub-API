import puppeteer from 'puppeteer';
import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
import { IPublicRecordAttributes } from '../../../../../../models/public_record_attributes'
import { String } from 'aws-sdk/clients/cloudsearchdomain';
import { getTextByXpathFromPage } from '../../../../../../services/general_service';
var parser = require('parse-address'); 

import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'https://paopropertysearch.coj.net/Basic/Search.aspx'
    }

    xpaths = {
        isPAloaded: '//*[@id = "ctl00_cphBody_tbStreetNumber"]'
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
            // let docToSave: any = await this.getLineItemObject(doc);
            if (!this.decideSearchByV2(document)) {
                   console.log('Insufficient info for Owner and Property');
                    return false;
            }            // do everything that needs to be done for each document here
            let addressString = '';

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
            }
            else {
                addressString = document.propertyId["Property Address"];
                const parsev2 = this.getAddressV2(document.propertyId);
                if(!this.isEmptyOrSpaces(parsev2.street_address)){
                    addressString = parsev2.street_address;
                }
                console.log(`Looking for address: ${addressString}`);
            }

            await page.goto('https://paopropertysearch.coj.net/Basic/Search.aspx')

            if (this.searchBy === 'name') {
                const owner_input = (await page.$('input[id $= "_tbName"]'))!;
                await owner_input.type(owner_name); 
            }
            else {
                let result : any = parser.parseLocation(addressString);
                const searchHouseNo = result.number;
                const searchStreet = result.street;

                if(searchHouseNo != null)
                {
                    await page.waitForSelector('#ctl00_cphBody_tbStreetNumber');
                    const inputStreetNo = (await page.$('#ctl00_cphBody_tbStreetNumber'))!;
                    await inputStreetNo.click({clickCount : 3 });
                    await inputStreetNo.type(searchHouseNo.trim());
                }
                if(searchStreet != null)
                {
                    const inputStreetName = (await page.$('#ctl00_cphBody_tbStreetName'))!;
                    await inputStreetName.click({clickCount : 3 });
                    await inputStreetName.type(searchStreet.trim());
                }
            }
            await Promise.all([
                page.click('#ctl00_cphBody_bSearch'),
                page.waitForNavigation()
            ]);
            await page.waitFor(4000);
            
            const rows = await page.$x('//table[contains(@id, "_gridResults")]/tbody/tr[position()>1]');
            if (rows.length === 0) {
                console.log("No results found");
                return true;
            }
            let index = 0;
            const datalinks = [];
            for (const row of rows) {
                let name = await page.evaluate(el => el.children[1].textContent, row);
                name = name.replace(/\n|\s+/gm, ' ').trim();
                const regexp = new RegExp(owner_name_regexp);
                if (regexp.exec(name.toUpperCase())) {
                    const datalink = await page.evaluate(el => el.children[0].children[0].href, row);
                    datalinks.push(datalink);
                }
                index++;
            }
            
            for (let datalink of datalinks) {
                await Promise.all([
                    page.goto(datalink, {waitUntil: 'load'}),
                    page.waitForSelector('#ctl00_cphBody_repeaterOwnerInformation_ctl00_lblOwnerName')
                ]);
                console.log('~~~~~~~~~~~~~~~')
                let ownerNameArray = [];
                let ownerNameXpath = await page.$x('//*[@id = "ctl00_cphBody_repeaterOwnerInformation_ctl00_lblOwnerName"]')
                let ownerName = await page.evaluate(td => td.innerText , ownerNameXpath[0]);
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

                await page.waitForXPath('//*[@id = "ctl00_cphBody_lblPrimarySiteAddressLine1"]');
                const address1 = (await page.$eval('#ctl00_cphBody_lblPrimarySiteAddressLine1' , span => span.textContent))!;
                const address2 = (await page.$eval('#ctl00_cphBody_lblPrimarySiteAddressLine2' , span => span.textContent))!;
                let propertyAddress = address1.trim();
                propertyAddress = propertyAddress.trim();
                let address2Array = address2.split(/\s+/g);
                let propertyZip = address2Array.pop();
                let propertyState = address2Array.pop();
                let propertyCity = '';
                for(const city of address2Array){
                    propertyCity += city + " ";
                }
                propertyCity = propertyCity.trim()

                let ownerAddress = propertyAddress;
                const ownerOccupied = ownerAddress == propertyAddress ? true : false;
                
                const result = this.parseAddress(address2)
                const mailingCity = result.city;
                const mailingState = result.state;  
                const mailingZip = result.zip;

                await page.waitForSelector('#ctl00_cphBody_lblAssessedValueA10InProgress');
                const assessedValue = (await page.$eval('#ctl00_cphBody_lblAssessedValueA10InProgress' , span => span.textContent))!;

                const propertyTypeString = (await page.$eval('#ctl00_cphBody_lblPropertyUse' , span => span.textContent))!;
                const propertyType = this.parseProperty(propertyTypeString);
                
                let salesDate : string , salesPrice : string, marketValue : string;
                try{
                    await page.waitForSelector('#ctl00_cphBody_gridSalesHistory > tbody > tr:nth-child(2) > td:nth-child(2)');
                    salesDate = (await page.$eval('#ctl00_cphBody_gridSalesHistory > tbody > tr:nth-child(2) > td:nth-child(2)' , span => span.textContent))!;
                    salesPrice = (await page.$eval('#ctl00_cphBody_gridSalesHistory > tbody > tr:nth-child(2) > td:nth-child(3)' , span => span.textContent))!;
                    marketValue = (await page.$eval('#ctl00_cphBody_lblJustMarketValueInProgress' , span => span.textContent))!;
                }
                catch(err)
                {
                    salesDate = '', salesPrice = '', marketValue = '';
                }
                

                // yearBuilt
                const year_built_xpath = '//*[text()="Year Built"]/parent::th[1]/following-sibling::td[1]';
                const year_built = await getTextByXpathFromPage(page, year_built_xpath);

                let dataFromPropertyAppraisers: any = {};
                dataFromPropertyAppraisers["Owner Occupied"] = ownerOccupied;
                dataFromPropertyAppraisers["Full Name"] = ownerNameArray[0].name;
                dataFromPropertyAppraisers["First Name"] = ownerNameArray[0].fName;
                dataFromPropertyAppraisers["Last Name"] = ownerNameArray[0].lName;
                dataFromPropertyAppraisers["Middle Name"] = ownerNameArray[0].mName;
                dataFromPropertyAppraisers["Name Suffix"] = ownerNameArray[0].suffix;
                dataFromPropertyAppraisers["Mailing Care of Name"] = '';
                dataFromPropertyAppraisers["Mailing Address"] = ownerAddress;
                dataFromPropertyAppraisers["Mailing Unit #"] = '';
                dataFromPropertyAppraisers["Mailing City"] = mailingCity;
                dataFromPropertyAppraisers["Mailing State"] = mailingState;
                dataFromPropertyAppraisers["Mailing Zip"] = mailingZip;
                dataFromPropertyAppraisers["Property Type"] = propertyType;
                dataFromPropertyAppraisers["Total Assessed Value"] = assessedValue;
                dataFromPropertyAppraisers["Last Sale Recording Date"] = salesDate;
                dataFromPropertyAppraisers["Last Sale Amount"] = salesPrice;
                dataFromPropertyAppraisers["Est. Remaining balance of Open Loans"] = '';
                dataFromPropertyAppraisers["Est Value"] = marketValue;
                dataFromPropertyAppraisers["yearBuilt"] = year_built;
                dataFromPropertyAppraisers["Est Equity"] = '';
                dataFromPropertyAppraisers["Lien Amount"] = '';
                dataFromPropertyAppraisers["County"] = "Duval";
                dataFromPropertyAppraisers["Property State"] = "FL";
                dataFromPropertyAppraisers["Property Address"] = propertyAddress;
                dataFromPropertyAppraisers["Property Unit #"] = '';
                dataFromPropertyAppraisers["Property City"] = propertyCity;
                dataFromPropertyAppraisers["Property Zip"] = propertyZip;

                await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
                if (this.searchBy === 'address') break;
            }
        return true;
    }

}