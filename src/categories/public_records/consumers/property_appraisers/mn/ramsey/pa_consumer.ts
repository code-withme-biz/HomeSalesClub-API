// import puppeteer from 'puppeteer';
// import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
// import { IPublicRecordAttributes } from '../../../../../../models/public_record_attributes'
// import { String } from 'aws-sdk/clients/cloudsearchdomain';


// export default class PAConsumer extends AbstractPAConsumer {
//     source: string;
//     state: string;
//     county: string;
//     categories: string[];

//     urls = {
//         propertyAppraiserPage: 'https://beacon.schneidercorp.com/application.aspx?app=RamseyCountyMN&PageType=Search'
//     }

//     xpaths = {
//         isPAloaded: '//*[@id="ctlBodyPane_ctl01_ctl01_txtAddress"]'
//     }
    
//     discriminateAndRemove = (name : string) => {
//         const companyIdentifiersArray = [ 'GENERAL',  'TRUSTEE',  'TRUSTEES',  'INC', 'ORGANIZATION', 'CORP', 'CORPORATION', 'LLC', 'MOTORS', 'BANK', 'UNITED', 'CO', 'COMPANY', 'FEDERAL', 'MUTUAL', 'ASSOC', 'AGENCY' , 'SECRETARY' , 'DEVELOPMENT' , 'INVESTMENT' , 'ESTATE', 'LLP', 'LP', 'HOLDINGS' ,'TRUST' ,'LOAN' ,'CONDOMINIUM' , 'AKA'];
//         const removeFromNamesArray = ['ET', 'AS', 'DECEASED', 'DCSD', 'CP\/RS', 'JT\/RS' ,'JTWROS', 'TEN IN COM' , '- *Joint Tenants', '- *Tenancy', 'LLC' ];
//         const companyRegexString = `\\b(?:${companyIdentifiersArray.join('|')})\\b`;
//         const removeFromNameRegexString = `^(.*?)\\b(?:${removeFromNamesArray.join('|')})\\b.*?$`;
//         const companyRegex = new RegExp(companyRegexString, 'i');
        
//         const removeFromNamesRegex = new RegExp(removeFromNameRegexString, 'i');
//         let isCompanyName = name.match(companyRegex);
//         if (isCompanyName) {
//             return {
//                 type: 'company',
//                 name: name
//             }
//         }
        
//         let cleanName = name.match(removeFromNamesRegex);
//         if (cleanName) {
//             name = cleanName[1];
            
//         }
//         return {
//             type: 'person',
//             name: name
//         }
    
//     }

//     parseSearchAddress = (address : string) =>{
//         const addressSuffixArray = ['APT', 'AVE', 'BLVD', 'BLDG', 'CTR', 'CIR', 'CT', 'DR', 'EXPY', 'EXT', 'FT', 'FWY', 'FL', 'HTS', 'HWY', 'IS', 'JCT', 'LN', 'MT', 'PKY', 'PL', 'PO', 'RD', 'RR', 'ST', 'SPG', 'SPGS', 'SQ', 'STE', 'UNIT', 'RM', 'DEPT', '#' , 'TER', 'TPKE' ,'TRL' ,'CV', 'Pkwy'];
//         const addressDirArray = ['N', 'S', 'W', 'E', 'NE', 'NW', 'SE', 'SW'];
//         const addressSuffixRegexString = `\\b(?:${addressSuffixArray.join('\\b.*|')})\\b`;
//         const adddressDirRegexString = `\\b(?:${addressDirArray.join('|')})\\b`;
//         const addressSuffixRegex = new RegExp(addressSuffixRegexString , 'i');
//         const addressDirRegex = new RegExp(adddressDirRegexString , 'i');

//         address = address.replace(addressDirRegex , '')
//         address = address.replace(addressSuffixRegex , '')
//         const regexAddress = new RegExp(`(?<houseNo>\\d+)?\\b\\s*?(?<street>.*)\\s*`,'gi');
//         const match = regexAddress.exec(address);
//         if(match == null) return {houseNo : null , street : null};
    
//         return match.groups;
//     }
    
//     parseProperty = (property : string) : any => {
//         const regexProperty = new RegExp(`-\\s(?<property>.+)`,'gi');
//         const match = regexProperty.exec(property);
//         if (match == null) return null;
//         return match.groups?.property;
//     }
    
//     parseAddress = (address : string) : any => {
//         const regexAddress = new RegExp(`(?<city>.*),?\\s+(?<state>\\w{2})\\s(?<zip>.+)\\b`,'gi');
//         const match = regexAddress.exec(address);
//         if (match == null) return {city : null , state : null , zip : null}
//         return match.groups;
//     }

//     parseName = (name : string) : any =>{
//         const suffixArray = ['II', 'III', 'IV', 'CPA', 'DDS', 'ESQ', 'JD', 'JR', 'LLD', 'MD', 'PHD', 'RET', 'RN', 'SR', 'DO'];
//         const suffixRegexString = `\\b(?:${suffixArray.join('|')})\\b`;
//         const middleNameRegexString = `\\b(?:\\w{1})\\b`;
//         const suffixRegex = new RegExp(suffixRegexString , 'i');
//         const middleNameRegex = new RegExp(middleNameRegexString , 'i');

//         let parsedName = this.discriminateAndRemove(name.trim());
//         let nameArray : any = [null , null];

//         let result : any = {
//             fName : null,
//             lName : null,
//             mName : null,
//             suffix : null,
//             name : name
//         }
//         if(parsedName.type == 'person')
//         {
//             let personName = parsedName['name'];
//             result['name'] = parsedName['name'];
//             personName = personName.replace(',','');
//             const isSuffix = personName.match(suffixRegex);
//             if(isSuffix)
//             {
//                 result.suffix = isSuffix[0];
//                 personName = personName.replace(isSuffix[0] , '');
//             }
//             const isMiddleName : any = personName.match(middleNameRegex);
//             if(isMiddleName)
//             {
//                 result.mName = isMiddleName[0];
//                 personName = personName.replace(new RegExp(`\\b${isMiddleName[0]}\\b`,'gi') , '');
//             }
//             personName = personName.trim();
//             if(isMiddleName != '')
//                 nameArray = personName.split(/\b\s+/g);
//             if(nameArray.length == 3)
//                 result.mName = nameArray[2];
//             result.fName = nameArray[1];
//             result.lName = nameArray[0];
//         }
//         return result;
//     }
    
//     constructor(state: string, county: string, categories: string[] = ['foreclosure', 'preforeclosure', 'auction', 'tax-lien', 'bankruptcy'], source: string = '') {
//         super();
//         this.source = source;
//         this.state = state;
//         this.county = county;
//         this.categories = categories;
//     }

//     async readDocsToParse() {
//         const docsToParse = await this.getDocumentsArrayFromMongo(this.state, this.county, this.categories);
//         return docsToParse;
//     }

//     // use this to initialize the browser and go to a specific url.
//     // setParamsForPage is needed (mainly for AWS), do not remove or modify it please.
//     // return true when page is usable, false if an unexpected error is encountered.
//     async init(): Promise<boolean> {
//         this.browser = await this.launchBrowser();
//         this.browserPages.propertyAppraiserPage = await this.browser.newPage();
//         await this.setParamsForPage(this.browserPages.propertyAppraiserPage);
//         try {
//             await this.browserPages.propertyAppraiserPage.goto(this.urls.propertyAppraiserPage, { waitUntil: 'load' });
//             return true;
//         } catch (err) {
//             console.warn(err);
//             return false;
//         }
//     };

//     // use this as a middle layer between init() and parseAndSave().
//     // this should check if the page is usable or if there was an error,
//     // so use an xpath that is available when page is usable.
//     // return true when it's usable, false if it errors out.
//     async read(): Promise<boolean> {
//         try {
//             await this.browserPages.propertyAppraiserPage?.waitForXPath(this.xpaths.isPAloaded);
//             return true;
//         } catch (err) {
//             console.warn('Problem loading property appraiser page.');
//             return false;
//         }
//     }

//     // the main parsing function. if read() succeeds, parseAndSave is started().
//     // return true after all parsing is complete 

//     // docsToParse is the collection of all address objects to parse from mongo.
//     // !!! Only mutate document objects with the properties that need to be added!
//     // if you need to multiply a document object (in case of multiple owners
//     // or multiple properties (2-3, not 30) you can't filter down to one, use this.cloneMongoDocument(document);
//     // once all properties from PA have been added to the document, call 
//     async parseAndSave(docsToParse: IPublicRecordAttributes[]): Promise<boolean> {
//         console.log(`Documents to look up: ${docsToParse.length}.`);

//         const page = this.browserPages.propertyAppraiserPage!;
//         await page.setDefaultNavigationTimeout(0);

//         await page.waitForXPath('//div[@class = "modal-footer"]//a[contains(., "Agree")]');
//         const agreeButton = await page.$x('//div[@class = "modal-footer"]//a[contains(., "Agree")]');
//         await agreeButton[0].click();

//         for (let doc of docsToParse) {
            
//             // do everything that needs to be done for each document here
//             await page.goto(this.urls.propertyAppraiserPage)
//             let addressString = doc["Property Address"];
//             await page.waitForXPath('//*[@id="ctlBodyPane_ctl01_ctl01_txtAddress"]');
//             let inputStreet = await page.$x('//*[@id="ctlBodyPane_ctl01_ctl01_txtAddress"]');
//             await inputStreet[0].type(addressString.trim());
//             await page.waitForXPath('//*[@id="ctlBodyPane_ctl01_ctl01_btnSearch"]')
//             let searchButton = await page.$x('//*[@id="ctlBodyPane_ctl01_ctl01_btnSearch"]');
//             await Promise.all([
//                 searchButton[0].click(),
//                 page.waitForNavigation()
//             ]);
            
//             if(await page.$('#ctlBodyPane_ctl00_ctl01_gvwParcelResults') != null)
//             {
//                 await page.waitForXPath('//*[@id="ctlBodyPane_ctl00_ctl01_gvwParcelResults"]//tbody//th//a[1]');
//                 const showButton = await page.$x('//*[@id="ctlBodyPane_ctl00_ctl01_gvwParcelResults"]//tbody//th//a[1]');
//                 await page.waitFor(1000)
//                 await showButton[0].click();
//                 await page.waitForSelector('#ctlBodyPane_ctl00_divHeader');
//             }
            
//             else if(await page.$('#ctlBodyPane_ctl00_divHeader') == null) {
//                 console.log("no house found");
//                 continue;
//             }

//             await page.waitForXPath('//tr//th[contains(., "Owner")]/following-sibling::td');
//             let ownerNameArray = [];
//             let ownerNameXpath = await page.$x('//tr//th[contains(., "Owner")]/following-sibling::td');
//             let ownerName = await page.evaluate(td => td.innerText , ownerNameXpath[0]);
//             let parsedName = this.discriminateAndRemove(ownerName);
//             if(parsedName.type == 'person')
//             {
//                 let nameArray = ownerName.split(/\n/g);
//                 ownerNameArray.push(this.parseName(nameArray[0].trim()));
//                 if(nameArray[1] != null)
//                 {
//                     ownerNameArray.push(this.parseName(nameArray[1]));
//                 }
//             }
//             else
//                 ownerNameArray.push(this.parseName(ownerName.replace(/\n/g,' ').replace(/\s+/g,' ')));
//             ownerName = ownerName.trim().replace(/\n/g,' ').replace(/\s+/g,' ');


//             await page.waitForXPath('//*[@id = "ctlBodyPane_ctl01_ctl01_lblPropertyAddress"]');
//             const propertyAddressXpath = await page.$x('//*[@id = "ctlBodyPane_ctl01_ctl01_lblPropertyAddress"]');
//             let propertyAddress = await page.evaluate(td => td.innerHTML , propertyAddressXpath[0]);
//             propertyAddress = propertyAddress.replace(/<br>/g,' ').replace(/\s+/g,' ').trim();

//             const ownerAddressXpath = await page.$x('//*[@id = "ctlBodyPane_ctl03_ctl01_grdTaxpayers"]/tbody/tr/td[2]');
//             let ownerAddress = await page.evaluate(td => td.innerHTML , ownerAddressXpath[0]);
//             let ownerArray = ownerAddress.split('<br>');
//             ownerAddress = ownerAddress.replace(/<br>/g,' ').replace(/\s+/g,' ').trim();
            
//             let result = this.parseAddress(ownerArray[1].trim())
//             const mailingCity = result.city;
//             const mailingState = result.state;  
//             const mailingZip = result.zip;

//             const ownerOccupied = ownerAddress == propertyAddress ? true : false;

            
//             await page.waitForXPath('//*[@id = "ctlBodyPane_ctl01_ctl01_lblLandUse"]');
//             const propertyTypeXpath = await page.$x('//*[@id = "ctlBodyPane_ctl01_ctl01_lblLandUse"]');
//             const propertyType = await page.evaluate(td => td.innerText , propertyTypeXpath[0]);
            
//             let assessedValue : any;
//             try{
//                 await page.waitForXPath('//*[@id = "ctlBodyPane_ctl07_ctl01_gvwSA"]/tbody/tr[1]/td[4]');
//                 const assessedValueXpath = await page.$x('//*[@id = "ctlBodyPane_ctl07_ctl01_gvwSA"]/tbody/tr[1]/td[4]');
//                 assessedValue = await page.evaluate(td => td.innerText , assessedValueXpath[0]);
//             }catch(err){
//                 assessedValue = null;
//             }
            
//             let salesDate : any , salesPrice : any;
//             try{
//                 await page.waitForXPath('//*[@id = "ctlBodyPane_ctl09_ctl01_gvwSales"]/tbody/tr[1]/th[1]');
//                 const salesDateXpath = await page.$x('//*[@id = "ctlBodyPane_ctl09_ctl01_gvwSales"]/tbody/tr[1]/th[1]');
//                 salesDate = await page.evaluate(td => td.innerText , salesDateXpath[0]);
//                 const salesPriceXpath = await page.$x('//*[@id = "ctlBodyPane_ctl09_ctl01_gvwSales"]/tbody/tr[1]/td[2]');
//                 salesPrice = await page.evaluate(td => td.innerText , salesPriceXpath[0]);
//             }catch(err){
//                 salesDate = null;
//                 salesPrice = null;
//             }

//             let marketValue : any;
//             try{
//                 await page.waitForXPath('//tr//th[contains(., "Estimated Market Value")]/following-sibling::td[1]')
//                 const marketValueXpath = await page.$x('//tr//th[contains(., "Estimated Market Value")]/following-sibling::td[1]');
//                 marketValue = await page.evaluate(td => td.innerText , marketValueXpath[0]);
//             }catch(err){
//                 marketValue = null;
//             }

//             doc["Owner Occupied"] = ownerOccupied;
//             doc["owner_full_name"] = ownerNameArray[0].name;
//             doc["First Name"] = ownerNameArray[0].fName;
//             doc["Last Name"] = ownerNameArray[0].lName;
//             doc["Middle Name"] = ownerNameArray[0].mName;
//             doc["Name Suffix"] = ownerNameArray[0].suffix;
//             doc["Mailing Care of Name"] = '';
//             doc["Mailing Address"] = ownerAddress;
//             doc["Mailing Unit #"] = '';
//             doc["Mailing City"] = mailingCity;
//             doc["Mailing State"] = mailingState;
//             doc["Mailing Zip"] = mailingZip;
//             doc["Property Type"] = propertyType;
//             doc["Total Assessed Value"] = assessedValue;
//             doc["Last Sale Recording Date"] = salesDate;
//             doc["Last Sale Amount"] = salesPrice;
//             doc["Est. Remaining balance of Open Loans"] = '';
//             doc["Est Value"] = marketValue;
//             doc["yearBuilt"] = '';
//             doc["Est Equity"] = '';
//             doc["Lien Amount"] = '';
//             doc. = true;
//             await doc.save();
//             if(ownerNameArray[1]){
//                 let newDocument = await this.cloneMongoDocument(doc)
//                 newDocument["owner_full_name"] = ownerNameArray[1].name;
//                 newDocument["First Name"] = ownerNameArray[1].fName;
//                 newDocument["Last Name"] = ownerNameArray[1].lName;
//                 newDocument["Middle Name"] = ownerNameArray[1].mName;
//                 newDocument["Name Suffix"] = ownerNameArray[1].suffix;
//                 await newDocument.save()
//             }
//         }
//         return true;
//     }

// }