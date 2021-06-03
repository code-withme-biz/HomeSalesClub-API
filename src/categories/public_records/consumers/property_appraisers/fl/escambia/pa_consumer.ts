import puppeteer from 'puppeteer';
const axios = require("axios");
const parseAddress = require('parse-address');

import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
import { IPublicRecordAttributes } from '../../../../../../models/public_record_attributes'
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'https://www.escpa.org/CAMA/Search.aspx'
    }

    xpaths = {
        isPAloaded: '//*[@id="ctl00_MasterPlaceHolder_txtValue"]'
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
        //-------------------name seperation stuff goes here-------------------//

        const companyIdentifiersArray = ['GENERAL', 'TRUST', 'TRUSTEE', 'TRUSTEES', 'INC', 'ORGANIZATION', 'CORP', 'CORPORATION', 'LLC', 'MOTORS', 'BANK', 'UNITED', 'CO', 'COMPANY', 'FEDERAL', 'MUTUAL', 'ASSOC', 'AGENCY', 'PA', 'P A', '\\d\\d+', 'TR', 'S A', 'FIRM', 'PORTFOLIO', 'LEGAL', 'MANAGEMENT', 'COUNTY', 'CWSAMS', 'LP', 'CITY', 'INDUSTRIAL', 'IND', 'PARK', 'HABITAT', 'HOLDINGS', 'MOUNT', 'MISSIONARY', 'PUBLIC', 'LAND', 'CHURCH\\s*OF'];
        const removeFromNamesArray = ['ET', 'AS', 'DECEASED', 'DCSD', 'CP\/RS', 'JT\/RS', 'JTRS', 'TRS', 'C\/O', '\\(BEN\\)', 'EST OF', 'EST', 'LE(?=\\s*$)', 'H\/E', 'ETAL', 'ET AL'];
        const suffixNamesArray = ['I', 'II', 'III', 'IV', 'V', 'ESQ', 'JR', 'SR']

        const companyRegexString = `\\b(?:${companyIdentifiersArray.join('|')})\\b`;
        const removeFromNameRegexString = `^(.*?)(?:\\b|\\s+)(?:${removeFromNamesArray.join('|')})(?:\\b(.*?))?$`;

        const discriminateAndRemove = (name: any) => {
            let isCompanyName = name.match(new RegExp(companyRegexString, 'i'));
            if (isCompanyName) {
                return {
                    type: 'company',
                    name: name
                }
            }

            let cleanName = name.match(new RegExp(removeFromNameRegexString, 'i'))
            if (cleanName) {
                if (cleanName[1].trim()) {
                    name = cleanName[1];
                }
                else if (cleanName[2].trim()) {
                    name = cleanName[2];
                }
            }
            return {
                type: 'person',
                name: name
            }
        }

        const normalizeNames = (fullName: any) => {
            const normalizeNameRegexString = `^\\s*(?:(.*?)\\s*,\\s*)?([^\\s]*)(?:\\s*(.*?))?(?:\\s*((?:${suffixNamesArray.join('|')})))?\\s*$`;
            const normalizeNameRegex = new RegExp(normalizeNameRegexString, 'i');

            let normalizedNameMatch = fullName.match(normalizeNameRegex);
            if (normalizedNameMatch) {
                let firstName = normalizedNameMatch[2];
                let middleName = normalizedNameMatch[3] || '';
                let lastName = normalizedNameMatch[1] || '';
                let nameSuffix = normalizedNameMatch[4] || '';
                return {
                    fullName: fullName.trim(),
                    firstName: firstName.trim(),
                    middleName: middleName.trim(),
                    lastName: lastName.trim(),
                    nameSuffix: nameSuffix.trim()
                }
            }
            return {
                fullName: fullName.trim()
            }
        }

        const checkForMultipleNamesAndNormalize = (name: any) => {
            let results = [];
            let lastNameBkup = '';

            let multipleNames = name.match(/^(.*?)\s*&\s*(.*?)$/);
            while (multipleNames) {
                let secondName = '';
                if (multipleNames[1].trim()) {
                    let normalized = normalizeNames(multipleNames[1])
                    if (normalized.hasOwnProperty('lastName') && normalized.lastName) {
                        lastNameBkup = normalized.lastName;
                    } else if (lastNameBkup) {
                        normalized['lastName'] = lastNameBkup;
                    }
                    results.push(normalized);
                }

                if (multipleNames[2].trim()) secondName = multipleNames[2];
                multipleNames = secondName.match(/^(.*?)\s*&\s*(.*?)$/);
                if (!multipleNames && secondName.trim()) {
                    let normalized = normalizeNames(secondName);
                    if ((!normalized.hasOwnProperty('lastName') || !normalized.lastName) && lastNameBkup) {
                        normalized['lastName'] = lastNameBkup;
                    }
                    results.push(normalized);
                }
            }

            if (results.length) {
                return results;
            }
            return [normalizeNames(name)];
        }
        //--------------------------name separation stuff ends here---------------------------------//





        const getData = async (page: puppeteer.Page, document: any) => {
            let dataFromPropertyAppraisers: any = {};
            //owner names
            let secondaryOwnersNamesArray = [];
            try {
                let ownersNames = await page.$x(`//*[@id="ctl00_MasterPlaceHolder_GenCell"]/table/tbody/tr[4]/td[2]/span/text()`);
                //loop trough owners names 
                for (let index = 0; index < ownersNames.length; index++) {
                    //get one owner name text from the array of elements handlers
                    let ownerName;
                    ownerName = ownersNames[index];
                    ownerName = await ownerName.getProperty('textContent');
                    ownerName = await ownerName.jsonValue();
    
                    //the first owner name will be stored in the main document
                    if (index == 0) {
                        //separate the name if its type is a person
                        let discriminateResult = discriminateAndRemove(ownerName);
                        if (discriminateResult.type == 'person') {
                            let separatedNamesArray = checkForMultipleNamesAndNormalize(discriminateResult.name);
    
                            for (let i = 0; i < separatedNamesArray.length; i++) {
                                let separatedNameObj = separatedNamesArray[i];
                                if (i == 0) {
                                    dataFromPropertyAppraisers["Full Name"] = separatedNameObj.fullName;
                                    dataFromPropertyAppraisers["First Name"] = separatedNameObj.firstName;
                                    dataFromPropertyAppraisers["Last Name"] = separatedNameObj.lastName;
                                    dataFromPropertyAppraisers["Middle Name"] = separatedNameObj.middleName;
                                    dataFromPropertyAppraisers["Name Suffix"] = separatedNameObj.nameSuffix;
                                }
                                else {
                                    secondaryOwnersNamesArray.push(separatedNameObj);
                                }
                            }
    
                        } else {
                            dataFromPropertyAppraisers["Full Name"] = discriminateResult.name;
                        }
                    }
                    //the other owner names will be kept in an array to clone to object using it
                    else {
                        secondaryOwnersNamesArray.push(ownerName);
                    }
                }
            } catch (error) {
                console.log("Owner name ERROR : ")
                console.log(error);
            }
    
            // grab property address
            let propertyAddress: any;
            [propertyAddress] = await page.$x(`//*[@id="ctl00_MasterPlaceHolder_GenCell"]/table/tbody/tr[6]/td[2]/span`);
            //make sure elem handler exists
            if (propertyAddress) {
                propertyAddress = await propertyAddress.getProperty('innerText');
                propertyAddress = await propertyAddress.jsonValue();
                //separate mailing address and add it to the document
                dataFromPropertyAppraisers["Property Address"] = propertyAddress;
                dataFromPropertyAppraisers["Property State"] = 'FL';
                dataFromPropertyAppraisers["County"] = 'Escambia';
            }

            //grab mailling address
            let maillingAddress: any;
            [maillingAddress] = await page.$x(`//*[@id="ctl00_MasterPlaceHolder_GenCell"]/table/tbody/tr[5]/td[2]/span`);
            //make sure elem handler exists
            if (maillingAddress) {
                maillingAddress = await maillingAddress.getProperty('innerText');
                maillingAddress = await maillingAddress.jsonValue();
                //separate mailing address and add it to the document
                let maillingAddress_separated = parseAddress.parseLocation(maillingAddress);
                dataFromPropertyAppraisers["Mailing Address"] = maillingAddress;
                if (maillingAddress_separated.city) {
                    dataFromPropertyAppraisers["Mailing City"] = maillingAddress_separated.city;
                }
                if (maillingAddress_separated.state) {
                    dataFromPropertyAppraisers["Mailing State"] = maillingAddress_separated.state;
                }
                if (maillingAddress_separated.zip) {
                    dataFromPropertyAppraisers["Mailing Zip"] = maillingAddress_separated.zip;
                }
            }
    
            //Total Assessed Value 
            try {
                let [totalAssessedValue]: any = await page.$x(`//*[@id="ctl00_MasterPlaceHolder_AssessCell"]/table/tbody/tr[3]/td[4]`);
                if (totalAssessedValue) {
                    totalAssessedValue = await totalAssessedValue.getProperty('innerText');
                    totalAssessedValue = await totalAssessedValue.jsonValue();
                    dataFromPropertyAppraisers["Total Assessed Value"] = totalAssessedValue;
                }
            } catch (error) {
                console.log("Total Assessed Value ERROR : ")
                console.log(error);
            }
    
    
    
            //Property Type
            try {
                let [propertyType]: any = await page.$x(`//*[@id="ctl00_MasterPlaceHolder_GenCell"]/table/tbody/tr[7]/td[2]/span`);
                if (propertyType) {
                    propertyType = await propertyType.getProperty('innerText');
                    propertyType = await propertyType.jsonValue();
                    propertyType = propertyType.replace(/(\r\n|\n|\r)/gm, "");
                    dataFromPropertyAppraisers["Property Type"] = propertyType;
                }
            } catch (error) {
                console.log("Property Type ERROR : ")
                console.log(error);
            }
    
    
    
    
            //Last Sale Recording Date
            try {
                let [lastSaleDate]: any = await page.$x(`//*[@id="ctl00_MasterPlaceHolder_SalesCell"]/table/tbody/tr[3]/td[1]`);
                if (lastSaleDate) {
                    lastSaleDate = await lastSaleDate.getProperty('innerText');
                    lastSaleDate = await lastSaleDate.jsonValue();
                    dataFromPropertyAppraisers["Last Sale Recording Date"] = lastSaleDate;
                }
            } catch (error) {
                console.log("Last Sale Recording Date ERROR : ")
                console.log(error);
            }
    
    
    
            //Last Sale Amount
            try {
                let [lastSaleAmount]: any = await page.$x(`//*[@id="ctl00_MasterPlaceHolder_SalesCell"]/table/tbody/tr[3]/td[4]`);
                if (lastSaleAmount) {
                    lastSaleAmount = await lastSaleAmount.getProperty('innerText');
                    lastSaleAmount = await lastSaleAmount.jsonValue();
                    dataFromPropertyAppraisers["Last Sale Amount"] = lastSaleAmount;
                }
            } catch (error) {
                console.log("Last Sale Amount ERROR : ")
                console.log(error);
            }
    
            try {
                //Est Value
                let [ref]: any = await page.$x(`//*[@id="ctl00_MasterPlaceHolder_GenCell"]/table/tbody/tr[2]/td[2]/span`);
                if (ref) {
                    ref = await ref.getProperty('innerText');
                    ref = await ref.jsonValue();
                    await page.goto('https://www.escpa.org/CAMA/hscalcdefault.aspx?ref=' + ref, { waitUntil: 'networkidle2' });
                    let [estimatedValue]: any = await page.$x(`//*[@id="ctl00_MasterPlaceHolder_txtValue"]`);
                    if (estimatedValue) {
                        estimatedValue = await estimatedValue.getProperty('value');
                        estimatedValue = await estimatedValue.jsonValue();
                        dataFromPropertyAppraisers["Est Value"] = estimatedValue;
                    }
                    await page.goBack();
                }
            } catch (error) {
                console.log("Last Sale Amount ERROR : ")
                console.log(error);
            }
    
    
    
            //owner occupied
            try {
                let ownerOccupied;
                if (document["Mailing Address"] != "" && document["Property Address"]) {
                    //normalize addresses then compare
                    if (
                        document["Mailing Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase().includes(document["Property Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase()) ||
                        document["Mailing Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase() == document["Property Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase() ||
                        document["Property Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase().includes(document["Mailing Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase())
                    ) {
                        ownerOccupied = true;
                    } else {
                        ownerOccupied = false;
                    }
                    dataFromPropertyAppraisers["Owner Occupied"] = ownerOccupied;
                }
    
            } catch (error) {
                console.log("Owner Occupied ERROR : ")
                console.log(error);
            }
    
    

            //save 
            // console.log(document);
            // await this.saveToLineItem(document);
            // await this.saveToOwnerProductProperty(document);
            await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);

    
    
    
            // secondaryOwnersNamesArray.forEach(async ownerName => {
            //     console.log('---------- cloned doc ----------')
            //     let newDoc = await this.cloneDocument(document);
            //     //separate the name if its type is a person
            //     let discriminateResult = discriminateAndRemove(ownerName);
            //     if (discriminateResult.type == 'person') {
            //         let separatedNamesArray = checkForMultipleNamesAndNormalize(discriminateResult.name);
            //         for (let separatedNameObj of separatedNamesArray) {
            //             newDoc["Full Name"] = separatedNameObj.fullName;
            //             newDoc["First Name"] = separatedNameObj.firstName;
            //             newDoc["Last Name"] = separatedNameObj.lastName;
            //             newDoc["Middle Name"] = separatedNameObj.middleName;
            //             newDoc["Name Suffix"] = separatedNameObj.nameSuffix;
            //         }
            //     } else {
            //         newDoc["Full Name"] = discriminateResult.name;
            //     }
            //     console.log(newDoc);
            //     await this.saveToLineItem(newDoc);
            //     await this.saveToOwnerProductProperty(newDoc);
            // });
    
    
            console.log("\n\n");
            // go back to the rows page to scrap the next address 
            await Promise.all([
                page.goBack(),
                page.waitForNavigation()
            ]);
        }


        const page = this.browserPages.propertyAppraiserPage!;
        let document = docsToParse;            // let docToSave: any = await this.getLineItemObject(document);
            if (!this.decideSearchByV2(document)) {
                   console.log('Insufficient info for Owner and Property');
                    return false;
            }
            try {
                await page.goto('https://www.escpa.org/CAMA/Search.aspx', {
                    waitUntil: 'networkidle0',
                    timeout: 60000
                });
            } catch (error) {
                console.log("error  : " + error);
                console.log('couldnt head to www.alachuacounty.us retrying ... ');
                //retry for second time
                try {

                    await page.goto('https://www.escpa.org/CAMA/Search.aspx', {
                        waitUntil: 'networkidle0',
                        timeout: 60000
                    });
                } catch (error) {
                    console.log("error  : " + error);
                    return false;
                }

            }

            let address;
            let first_name = '';
            let last_name = '';
            let owner_name = '';
            let owner_name_regexp = '';

            try {
                //loop trough addresses 
                if (this.searchBy === 'name') {
                    const nameInfo = this.getNameInfo(document.ownerId);
                    first_name = nameInfo.first_name;
                    last_name = nameInfo.last_name;
                    owner_name = nameInfo.owner_name;
                    owner_name_regexp = nameInfo.owner_name_regexp;
                    if (owner_name === '') return false;
                    console.log(`Looking for owner: ${owner_name}`);

                    // fill in the owner name
                    await page.waitForXPath(`//*[@id="ctl00_MasterPlaceHolder_txtValue"]`);
                    let [searchBox] = await page.$x(`//*[@id="ctl00_MasterPlaceHolder_txtValue"]`);
                    await searchBox.click({ clickCount: 3 });
                    await searchBox.press('Backspace');
                    await searchBox.type(owner_name);
                    //pick owner name option
                    await page.waitForXPath(`//*[@id="ctl00_MasterPlaceHolder_rbowner"]`);
                    let [ownerNameButton] = await page.$x(`//*[@id="ctl00_MasterPlaceHolder_rbowner"]`);
                    await ownerNameButton.click();
                }
                else {
                    address = document.propertyId["Property Address"];
                    const parsev2 = this.getAddressV2(document.propertyId);
                    if(!this.isEmptyOrSpaces(parsev2.street_address)){
                        address = parsev2.street_address;
                    }
                    console.log(`Looking for address: ${address}`);

                    //fill in the address
                    await page.waitForXPath(`//*[@id="ctl00_MasterPlaceHolder_txtValue"]`);
                    let [searchBox] = await page.$x(`//*[@id="ctl00_MasterPlaceHolder_txtValue"]`);
                    await searchBox.click({ clickCount: 3 });
                    await searchBox.press('Backspace');
                    await searchBox.type(address);
                    //pick exact match option
                    await page.waitForXPath(`//*[@id="ctl00_MasterPlaceHolder_rbExact"]`);
                    let [exactMatchButton] = await page.$x(`//*[@id="ctl00_MasterPlaceHolder_rbExact"]`);
                    await exactMatchButton.click();
                }
                //click search 
                await page.waitForXPath(`//*[@id="ctl00_MasterPlaceHolder_btnSubmit"]`);
                let [searchButton] = await page.$x(`//*[@id="ctl00_MasterPlaceHolder_btnSubmit"]`);
                await searchButton.click();
                
                //wait for error label to show in case there is one
                await page.waitForNavigation();

            } catch (error) {
                console.log(error)
                return false;
            }          

            let errorLabel;
            [errorLabel] = await page.$x(`//*[@id="ctl00_MasterPlaceHolder_lblErr"]`);
            if (errorLabel) {
                try {
                    errorLabel = await errorLabel.getProperty('textContent');
                    errorLabel = await errorLabel.jsonValue();
                    console.log(errorLabel);
                } catch (error) {
                    console.log(error);
                }

                return false;
            } else {
                //start sraping data if no error label
                const manyResults = await page.$('table#ctl00_MasterPlaceHolder_grdv');
                if (manyResults) {
                    const paginations = await page.$$('table#ctl00_MasterPlaceHolder_grdv > tbody table > tbody > tr > td');
                    const index = 0;
                    if (paginations && paginations.length > 0) {
                        for (let pagination of paginations) {
                            if (index > 0) {
                                await Promise.all([
                                    page.click(`table[id$="ctl00_MasterPlaceHolder_grdv"] > tbody table > tbody > tr > td:nth-child(${index}) > a`),
                                    page.waitForNavigation()
                                ]);
                            }
                            const rows = await page.$x('//table[@id="ctl00_MasterPlaceHolder_grdv"]/tbody/tr[position()>2]');
                            for (let p = 0 ; p < rows.length ; p++) {
                                if (this.searchBy === "name") {
                                    let name: any = (await page.$(`table#ctl00_MasterPlaceHolder_grdv > tbody > tr:nth-child(${p+2})`))!;
                                    name = await page.evaluate(el => el.children[4].textContent, name);
                                    const regexp = new RegExp(owner_name_regexp);
                                    if (regexp.exec(name.toUpperCase())) {
                                        await Promise.all([
                                            page.click(`table#ctl00_MasterPlaceHolder_grdv > tbody > tr:nth-child(${p+2}) > td:first-child > a`),
                                            page.waitForNavigation()
                                        ]);
                                        await getData(page, document);
                                    }
                                }
                                else {
                                    await Promise.all([
                                        page.click(`table#ctl00_MasterPlaceHolder_grdv > tbody > tr:nth-child(${p+2}) > td:first-child > a`),
                                        page.waitForNavigation()
                                    ]);
                                    await getData(page, document);
                                    if (this.searchBy === 'address') break;
                                }
                            }
                        }
                    }
                    else {
                        const rows = await page.$x('//table[@id="ctl00_MasterPlaceHolder_grdv"]/tbody/tr[position()>2]');
                        for (let p = 0 ; p < rows.length ; p++) {
                            if (this.searchBy === "name") {
                                let name: any = (await page.$(`table#ctl00_MasterPlaceHolder_grdv > tbody > tr:nth-child(${p+2})`))!;
                                name = await page.evaluate(el => el.children[4].textContent, name);
                                const regexp = new RegExp(owner_name_regexp);
                                if (regexp.exec(name.toUpperCase())) {
                                    await Promise.all([
                                        page.click(`table#ctl00_MasterPlaceHolder_grdv > tbody > tr:nth-child(${p+2}) > td:first-child > a`),
                                        page.waitForNavigation()
                                    ]);
                                    await getData(page, document);
                                }
                            }
                            else {
                                await Promise.all([
                                    page.click(`table#ctl00_MasterPlaceHolder_grdv > tbody > tr:nth-child(${p+1}) > td:first-child > a`),
                                    page.waitForNavigation()
                                ]);
                                await getData(page, document);
                            }
                        }
                    }
                }
                else {
                    await getData(page, document);
                }
                
            }
        return true;
    }
}