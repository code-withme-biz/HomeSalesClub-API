import puppeteer from 'puppeteer';
import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
var parser = require('parse-address');
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';
const nameParsingService = require('../../consumer_dependencies/nameParsingServiceNew');

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'https://www.scpafl.org/RealPropertySearch'
    }

    xpaths = {
        isPAloaded: '//*[@id = "dnn_ctr446_View_callbackSearch_expHeader_cmbStreet_I"]'
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
        const regexAddress = new RegExp(`^.+\\s+(?<city>.*),\\s+(?<state>\\w{2})\\s(?<zip>.+)\\b`,'gi');
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

    // the main parsing function. if read() succeeds, parseAndSave is started().
    // return true after all parsing is complete 

    // docsToParse is the collection of all address objects to parse from mongo.
    // !!! Only mutate document objects with the properties that need to be added!
    // if you need to multiply a document object (in case of multiple owners
    // or multiple properties (2-3, not 30) you can't filter down to one, use this.cloneMongoDocument(document);
    // once all properties from PA have been added to the document, call 
    async parseAndSave(docsToParse: IOwnerProductProperty): Promise<boolean> {

        const page = this.browserPages.propertyAppraiserPage!;
        let doc = docsToParse;
            // let docToSave: any = await this.getLineItemObject(doc);
            if (!this.decideSearchByV2(doc)) {
                console.log('Insufficient info for Owner and Property');
                return false;
            }
            
            // do everything that needs to be done for each doc here
            let addressString = '';
            let result: any;
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
                if(!this.isEmptyOrSpaces(parsev2.street_address)){
                    addressString = parsev2.street_address;
                }
                console.log(`Looking for address: ${addressString}`);
            }
            try{
                await page.goto('https://www.scpafl.org/RealPropertySearch');
                await page.waitForSelector('#dnn_ctr446_View_callbackSearch_expHeader_txtAddr_I');

                if (this.searchBy === 'name') {
                    const inputStreetNo = (await page.$('#dnn_ctr446_View_callbackSearch_expHeader_cmbOwner_I'))!;
                    await inputStreetNo.click({clickCount : 3 });
                    await inputStreetNo.type(owner_name.trim(), {delay: 150});
                    await page.click('#dnn_ctr446_View_callbackSearch_expHeader_ctl04');
                }
                else {
                    result = parser.parseLocation(addressString);
                    if(!result || (!result.number && !result.street)){
                        console.log("Street number and street name is missing!");
                        return false;
                    }
                    const searchHouseNo = result.number ? result.number : '';
                    const searchStreet = result.street ? result.street : '';

                    if(searchHouseNo != '')
                    {
                        const inputStreetNo = (await page.$('#dnn_ctr446_View_callbackSearch_expHeader_txtAddr_I'))!;
                        await inputStreetNo.click({clickCount : 3 });
                        await inputStreetNo.type(searchHouseNo.trim(), {delay: 150});
                    }
                    if(searchStreet != '')
                    {
                        const inputStreetName = (await page.$('#dnn_ctr446_View_callbackSearch_expHeader_cmbStreet_I'))!;
                        await inputStreetName.click({clickCount : 3 });
                        await inputStreetName.type(searchStreet.trim(), {delay: 150});
                    }
                    await page.click('#dnn_ctr446_View_callbackSearch_expHeader_ctl05');
                }
                
                // await page.waitForSelector('#dnn_ctr446_View_callbackSearch_gridResult_DXMainTable');
                await Promise.race([
                    page.waitForXPath('//table[@class="dxlpLoadingPanel dxlpControl" and contains(@style, "display: none")]'),
                    page.waitForSelector('#ctl00_Content_cellOwner2')
                ]);
                await page.waitFor(1000);
                await page.waitFor(() => 
                    document.querySelectorAll('#dnn_ctr446_View_callbackSearch_gridResult_DXMainTable, #ctl00_Content_cellOwner2').length
                );

                if(await page.$('#dnn_ctr446_View_callbackSearch_gridResult_DXMainTable') != null)
                {
                    const ids = [];
                    if (this.searchBy === 'name') {
                        const rows = await page.$x('//*[@id="dnn_ctr446_View_callbackSearch_gridResult_DXMainTable"]/tbody/tr[position()>2]');
                        for (const row of rows) {
                            const name = await page.evaluate(el => el.children[1].textContent, row);
                            const regexp = new RegExp(owner_name_regexp);
                            if (!regexp.exec(name.toUpperCase())) continue;
                            const id = await page.evaluate(el => el.id, row);
                            ids.push(id);
                            break;
                        }
                    }
                    else {
                        await page.waitForXPath('//*[@id = "dnn_ctr446_View_callbackSearch_gridResult_DXMainTable"]/tbody/tr[3]');
                        const row = await page.$x('//*[@id = "dnn_ctr446_View_callbackSearch_gridResult_DXMainTable"]/tbody/tr[3]');
                        const id = await page.evaluate(el => el.id, row[0]);
                        ids.push(id);
                    }
                    if (ids.length > 0) {
                        for (const id of ids) {
                            try{
                                console.log(id);
                                await page.click(`tr#${id} > td:first-child`);
                                console.log('click');
                                await page.waitForSelector('#ctl00_Content_cellOwner2');
                                await this.getData(page, doc, result);
                            }
                            catch(err)
                            {
                                console.log(err)
                                try{
                                    await page.waitForSelector('#ctl00_Content_cellOwner2');
                                    await this.getData(page, doc, result);
                                }
                                catch(err1)
                                {
                                    console.log(err1)
                                    console.log("no house found");
                                    continue;
                                }
                            }
                        }
                    }
                    else {
                        console.log("no house found");
                        return true;
                    }
                }
                else if (await page.$('#ctl00_Content_cellOwner2') !== null) {
                    await this.getData(page, doc, result);
                }
                else {
                    console.log("no house found");
                    return true;
                }
            } catch(e){
                console.log(e);
                return false;
            }
        return true;
    }
    async getData(page: puppeteer.Page, document: IOwnerProductProperty, result: any) {
        let dataFromPropertyAppraisers: any = {};
        let ownerNameArray = [];
        let ownerNameXpath = await page.$x('//*[@id = "ctl00_Content_cellOwner2"]')
        let ownerNames = await page.evaluate(td => td.innerHTML , ownerNameXpath[0]);
        let ownerName = ownerNames.split("<br>")[0].trim();
        let parseName = nameParsingService.newParseName(ownerName);
        ownerNameArray.push(parseName);

        await page.waitForXPath('//*[@id = "ctl00_Content_cellAddress2"]');

        const propertyAddressXpath = await page.$x('//*[@id = "ctl00_Content_cellAddress2"]');
        let propertyAddress = await page.evaluate(td => td.innerText , propertyAddressXpath[0]);
        propertyAddress = propertyAddress.trim();
        let propertyAddressParsed = parser.parseLocation(propertyAddress);

        const ownerAddressXpath = await page.$x('//*[@id = "ctl00_Content_cellMailing"]');
        let ownerAddress = await page.evaluate(td => td.innerText , ownerAddressXpath[0])
        ownerAddress = ownerAddress.trim().replace(/\s+/g ,' ');
        const ownerOccupied = ownerAddress == propertyAddress ? true : false;

        propertyAddress = 
            ((propertyAddressParsed['number'] ? propertyAddressParsed['number'] + ' ' : '') +
            (propertyAddressParsed['prefix'] ? propertyAddressParsed['prefix'] + ' ' : '') +
            (propertyAddressParsed['street'] ? propertyAddressParsed['street'] + ' ' : '') +
            (propertyAddressParsed['type'] ? propertyAddressParsed['type'] : '')).trim();
        
        result = this.parseAddress(ownerAddress)
        const mailingCity = (result && result.city) || '';
        const mailingState = (result && result.state) || '';  
        const mailingZip = (result && result.zip) || '';

        await page.waitForXPath('//tr//td[contains(., "Assessed Value")]/following-sibling::td[2]');
        const assessedValueXpath = await page.$x('//tr//td[contains(., "Assessed Value")]/following-sibling::td[2]');
        let assessedValue = await page.evaluate(td => td.innerText , assessedValueXpath[0]);
        assessedValue = assessedValue.trim();

        await page.waitForXPath('//*[@id = "ctl00_Content_cellDOR"]');
        const propertyTypeXpath = await page.$x('//*[@id = "ctl00_Content_cellDOR"]');
        const propertyTypeString = await page.evaluate(td => td.innerText , propertyTypeXpath[0]);
        const propertyType = this.parseProperty(propertyTypeString.trim());
        
        let salesDate : string , salesPrice : string;
        try{
            await page.waitForXPath('//*[@id="ctl00_Content_PageControl1_grdSales_DXDataRow0"]/td[2]' ,{timeout : 3000});
            const salesDateXpath = await page.$x('//*[@id="ctl00_Content_PageControl1_grdSales_DXDataRow0"]/td[2]');
            salesDate = await page.evaluate(td => td.innerText , salesDateXpath[0]);
            salesDate = salesDate.trim();
            const salesPriceXpath = await page.$x('//*[@id="ctl00_Content_PageControl1_grdSales_DXDataRow0"]/td[3]');
            salesPrice = await page.evaluate(td => td.innerText , salesPriceXpath[0]);
            salesPrice = salesPrice.trim();
        }
        catch(err)
        {
            salesDate = '', salesPrice = '';
        }           
        dataFromPropertyAppraisers["Owner Occupied"] = ownerOccupied;
        dataFromPropertyAppraisers["Full Name"] = ownerNameArray[0].fullName;
        dataFromPropertyAppraisers["First Name"] = ownerNameArray[0].firstName;
        dataFromPropertyAppraisers["Last Name"] = ownerNameArray[0].lastName;
        dataFromPropertyAppraisers["Middle Name"] = ownerNameArray[0].middleName;
        dataFromPropertyAppraisers["Name Suffix"] = ownerNameArray[0].suffix;
        dataFromPropertyAppraisers["Mailing Care of Name"] = '';
        dataFromPropertyAppraisers["Mailing Address"] = ownerAddress;
        dataFromPropertyAppraisers["Mailing Unit #"] = '';
        dataFromPropertyAppraisers["Mailing City"] =  mailingCity;
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
        dataFromPropertyAppraisers['Property Address'] = propertyAddress;
        dataFromPropertyAppraisers['Property City'] = propertyAddressParsed.city ? propertyAddressParsed.city : '';
        dataFromPropertyAppraisers['Property State'] = "FL";
        dataFromPropertyAppraisers['Property Zip'] = propertyAddressParsed.zip ? propertyAddressParsed.zip : '';
        dataFromPropertyAppraisers['County'] = "Seminole";
        await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
    }
}