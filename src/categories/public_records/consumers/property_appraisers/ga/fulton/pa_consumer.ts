import puppeteer from 'puppeteer';
import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
import { IPublicRecordAttributes } from '../../../../../../models/public_record_attributes'
var parser = require('parse-address'); 
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';
import { IProperty } from '../../../../../../models/property';
import { launchTorBrowser, setParamsForPage } from '../../../../../../services/general_service';

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'https://iaspublicaccess.fultoncountyga.gov/search/commonsearch.aspx?mode=address'
    }

    xpaths = {
        isPAloaded: '//*[@id = "btAgree"]'
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
            if (retries > 15) {
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
        const companyIdentifiersArray = [ 'GENERAL',  'TRUSTEE',  'TRUSTEES',  'INC', 'ORGANIZATION', 'CORP', 'CORPORATION', 'LLC', 'MOTORS', 'BANK', 'UNITED', 'CO', 'COMPANY', 'FEDERAL', 'MUTUAL', 'ASSOC', 'AGENCY' , 'SECRETARY' , 'DEVELOPMENT' , 'INVESTMENT' , 'ESTATE', 'LLP', 'LP', 'HOLDINGS' ,'TRUST' ,'LOAN' ,'CONDOMINIUM' , 'PROPERTY'];
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


    readDocsToParse(): IOwnerProductProperty {
      return this.ownerProductProperties;
    }

    // use this as a middle layer between init() and parseAndSave().
    // this should check if the page is usable or if there was an error,
    // so use an xpath that is available when page is usable.
    // return true when it's usable, false if it errors out.
    async read(): Promise<boolean> {
        let retries = 0;
        while(true){
            if(retries > 15){
                return false;
            }
            try {
                await this.browserPages.propertyAppraiserPage?.waitForXPath(this.xpaths.isPAloaded);
                return true;
            } catch (err) {
                console.log(await this.browserPages.propertyAppraiserPage?.content())
                console.warn('Problem loading property appraiser page.');
                this.browser = await launchTorBrowser();
                let newPage = await this.browser.newPage();
                this.browserPages.propertyAppraiserPage = newPage;
                await setParamsForPage(this.browserPages.propertyAppraiserPage);
                await this.browserPages.propertyAppraiserPage.goto(this.urls.propertyAppraiserPage, { waitUntil: 'load' });
            }
            retries++;
        }
    }

    async getData(page: puppeteer.Page, doc: any) {
        let ownerNameArray = [];
        let ownerNameXpath = await page.$x('//tr//td[contains(.//text(), "Owners:")]/following-sibling::td')
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

        await page.waitForXPath('//tr//td[contains(.//text(), "Property Location")]/following-sibling::td');
        const propertyAddressXpath = await page.$x('//tr//td[contains(.//text(), "Property Location")]/following-sibling::td');
        let propertyAddress = await page.evaluate(td => td.innerText , propertyAddressXpath[0]);
        propertyAddress = propertyAddress.trim();
        
        await page.waitForXPath('//*[@id="Mailing Address"]/tbody/tr[2]/td[1]');
        const ownerAddressXpath = await page.$x('//*[@id="Mailing Address"]/tbody/tr[2]/td[1]');
        let ownerAddress = await page.evaluate(td => td.innerHTML , ownerAddressXpath[0])
        let ownerAddressArray = ownerAddress.trim().replace(/\s+/g ,' ').split('<br>');
        ownerAddress = ownerAddressArray[1].trim() + ' ' + ownerAddressArray[2].trim();
        let result = this.parseAddress(ownerAddressArray[2].trim())
        const mailingCity = result.city;
        const mailingState = result.state;  
        const mailingZip = result.zip;

        const ownerOccupied = ownerAddress == propertyAddress ? true : false;

        let propertyType : string;
        try{
            await page.waitForXPath('//tr//td[contains(.//text(), "Land Use Code")]/following-sibling::td');
            const propertyTypeXpath = await page.$x('//tr//td[contains(.//text(), "Land Use Code")]/following-sibling::td');
            propertyType = await page.evaluate(td => td.innerText , propertyTypeXpath[0]);
        }
        catch(err)
        {
            propertyType = '';
        }
        
        await page.waitForXPath('//a//span[contains(.//text(), "Values")]');
        const valuesButton = await page.$x('//a//span[contains(.//text(), "Values")]');
        await valuesButton[0].click();

        let assessedValue : string ;
        try{
            await page.waitForXPath('//*[@id="Assessed Value"]/tbody/tr[2]/td[5]', {timeout : 3000});
            const assessedValueXpath = await page.$x('//*[@id="Assessed Value"]/tbody/tr[2]/td[5]');
                assessedValue= await page.evaluate(td => td.innerText , assessedValueXpath[0]);
            assessedValue = assessedValue.trim();
        }
        catch(err)
        {
            assessedValue = '';
        }

        let estValue : string ;
        try{
            await page.waitForXPath('//*[@id="Appraised Values"]/tbody/tr[2]/td[4]', {timeout : 3000});
            const estValueXpath = await page.$x('//*[@id="Appraised Values"]/tbody/tr[2]/td[4]');
            estValue= await page.evaluate(td => td.innerText , estValueXpath[0]);
            estValue = estValue.trim();
        }
        catch(err)
        {
          estValue = '';
        }

        await page.waitForXPath('//a//span[contains(.//text(), "Sales")]');
        const salesButton = await page.$x('//a//span[contains(.//text(), "Sales")]');
        await salesButton[0].click();

        let salesDate , salesPrice;
        try{
            await page.waitForXPath('//*[@id="Sales"]/tbody/tr[2]/td[1]' , {timeout : 1000});
            const salesDateXpath = await page.$x('//*[@id="Sales"]/tbody/tr[2]/td[1]');
            salesDate = await page.evaluate(td => td.innerText , salesDateXpath[0]);
            salesDate = salesDate.trim();

            const salesPriceXpath = await page.$x('//*[@id="Sales"]/tbody/tr[2]/td[2]');
            salesPrice = await page.evaluate(td => td.innerText , salesPriceXpath[0]);
            salesPrice = salesPrice.trim();
        }
        catch(err)
        {
            salesDate = "";
            salesPrice = "";
        }


        await page.waitForXPath('//a//span[contains(.//text(), "Sales")]');
        const residentialButton = await page.$x('//a//span[contains(.//text(), "Residential")]');
        await residentialButton[0].click();
        
        let effectiveYearBuilt;
        try{
          await page.waitForXPath('//*[text()="Year Built:"]/following-sibling::td[1]' , {timeout : 1000});
          const effectiveYearBuiltXpath = await page.$x('//*[text()="Year Built:"]/following-sibling::td[1]');
          effectiveYearBuilt = await page.evaluate(td => td.innerText , effectiveYearBuiltXpath[0]);
          effectiveYearBuilt = effectiveYearBuilt.trim();
        }
        catch(err)
        {
          effectiveYearBuilt = "";
        }

        let dataFromPropertyAppraisers: any = {
          "Owner Occupied": ownerOccupied,
          "owner_full_name": ownerNameArray[0].name,
          "Full Name": ownerNameArray[0].name,
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
          "Est Value": estValue,
          "yearBuilt": effectiveYearBuilt,
          "Est Equity": '',
          "Lien Amount": '',
          "Property State": 'GA',
          "County": 'fulton'
        }
        if (this.searchBy === 'name') {
          dataFromPropertyAppraisers["Property Address"] = propertyAddress;

        }
        try{
          await this.saveToOwnerProductPropertyV2(doc, dataFromPropertyAppraisers);
        } catch(e){
          //
        }
    }
    // the main parsing function. if read() succeeds, parseAndSave is started().
    // return true after all parsing is complete 

    // docsToParse is the collection of all address objects to parse from mongo.
    // !!! Only mutate document objects with the properties that need to be added!
    // if you need to multiply a document object (in case of multiple owners
    // or multiple properties (2-3, not 30) you can't filter down to one, use this.cloneMongoDocument(document);
    // once all properties from PA have been added to the document, call 
    async parseAndSave(docsToParse: IOwnerProductProperty): Promise<boolean>   {

        const page = this.browserPages.propertyAppraiserPage!;
        await page.setDefaultNavigationTimeout(0);
        await page.click('#btAgree');
        let doc = docsToParse;
            if (!this.decideSearchByV2(doc)) {
              // console.log('Insufficient info for Owner and Property');
              return false;
            }
            
            // do everything that needs to be done for each document here
            let addressString = '';
            let result: any;
            let first_name = '';
            let last_name = '';
            let owner_name = '';
            let owner_name_regexp = '';
            let url = '';

            if (this.searchBy === 'name') {
                url = 'https://iaspublicaccess.fultoncountyga.gov/search/commonsearch.aspx?mode=owner';
                const nameInfo = this.getNameInfo(doc.ownerId);
                first_name = nameInfo.first_name;
                last_name = nameInfo.last_name;
                owner_name = nameInfo.owner_name;
                owner_name_regexp = nameInfo.owner_name_regexp;
                if (owner_name === '') return false;
                console.log(`Looking for owner: ${owner_name}`);
            }
            else {
                url = 'https://iaspublicaccess.fultoncountyga.gov/search/commonsearch.aspx?mode=address';
                addressString = doc.propertyId['Property Address'];
                const parseraddr = this.getAddressV2(doc.propertyId);
                if(!this.isEmptyOrSpaces(parseraddr.street_address)){
                    addressString = parseraddr.street_address;
                }
                result = parser.parseLocation(addressString);
                console.log(`Looking for address: ${addressString}`);
            }


            await page.goto(url)

            if (this.searchBy === 'name') {
                const inputName = (await page.$('#inpOwner'))!;
                await inputName.click({clickCount : 3 });
                await inputName.type(owner_name.trim());
            }
            else {
                const searchHouseNo = result.number;
                const searchStreet = result.street;
                const searchUnitNum = result.sec_unit_num;
                if(searchHouseNo != null)
                {
                    await page.waitForSelector('#inpNumber');
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
            }
            await Promise.all([
                page.click('#btSearch'),
                page.waitForNavigation()
            ]);
            try
            {
                const rows = await page.$x('//table[@id="searchResults"]/tbody/tr[position()>2]');
                if (rows.length === 0) {
                  console.log("No house found");
                  return true;
                }

                const ids = [];
                if (this.searchBy === 'name') {
                    for (const row of rows) {
                        const {name, id} = await page.evaluate(el => ({name: el.children[2].textContent.trim(), id: el.children[1].textContent}), row);
                        const regexp = new RegExp(owner_name_regexp);
                        if (!regexp.exec(name.toUpperCase())) continue;
                        ids.push(id);
                    }
                }
                else {
                    const id = await page.evaluate(el => el.children[1].textContent, rows[0]);
                    ids.push(id);
                }

                if (ids.length === 0) {
                    console.log("No house found");
                    return true;
                }

                for (const id of ids) {
                  const [row] = await page.$x(`//table[@id="searchResults"]/tbody/tr[./td[contains(., "${id}")]]`);
                  if (row) {
                    await Promise.all([
                      row.click(),
                      page.waitForNavigation()
                    ]);
                    await this.randomSleepInOneSec();
                    await this.getData(page, doc);
                    await page.goBack();
                    await this.randomSleepInOneSec();
                    await page.goBack();
                    await this.randomSleepInOneSec();
                    await page.goBack();
                  }
                  await this.randomSleepIn5Sec();
                }            
            } catch(err) {
                console.log(err)
                console.log("no house found");
                return true;
            }
        return true;
    }

}