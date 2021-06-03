const parseAddress = require('parse-address');
import puppeteer from 'puppeteer';
import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;


    urls = {
        propertyAppraiserPage: 'http://propaccess.traviscad.org/clientdb/?cid=1'
    }

    xpaths = {
        isPAloaded: '//*[@id="searchTypes"]'
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

        const page = this.browserPages.propertyAppraiserPage!;

        let document = docsToParse;

            if (!this.decideSearchByV2(document)) {
                console.log('Insufficient info for Owner and Property');
                return false;
            }
            
            //head to the PA website
            //go to the search page
            try {
                if (this.searchBy === 'name') {
                    await page.goto('http://propaccess.traviscad.org/clientdb/PropertySearch.aspx?cid=1', {
                        waitUntil: 'networkidle0',
                        timeout: 60000
                    });
                    await page.waitForSelector('input#propertySearchOptions_advanced');
                    await Promise.all([
                        page.click('input#propertySearchOptions_advanced'),
                        page.waitForNavigation()
                    ]);                }
                else
                    await page.goto('http://propaccess.traviscad.org/clientdb/?cid=1', {
                        waitUntil: 'networkidle0',
                        timeout: 60000
                    });
            } catch (error) {
                console.log("error  : " + error);
                console.log('couldnt head to propaccess.trueautomation.com retrying ... ');
                //retry for second time
                try {
                    if (this.searchBy === 'name') {
                        await page.goto('http://propaccess.traviscad.org/clientdb/PropertySearch.aspx?cid=1', {
                            waitUntil: 'networkidle0',
                            timeout: 60000
                        });
                        await page.waitForSelector('input#propertySearchOptions_advanced');
                        await Promise.all([
                            page.click('input#propertySearchOptions_advanced'),
                            page.waitForNavigation()
                        ]);
                    }
                    else
                        await page.goto('http://propaccess.traviscad.org/clientdb/?cid=1', {
                            waitUntil: 'networkidle0',
                            timeout: 60000
                        });
                } catch (error) {
                    console.log("error  : " + error);
                    return false;
                }

            }

            //affect the current address
            let address = '';

            let first_name = '';
            let last_name = '';
            let owner_name = '';
            let owner_name_regexp = '';  

            if (this.searchBy === 'address')  {
                address = document.propertyId["Property Address"];
                console.log('------------------Looking for address : ' + address + "--------------------")
                const parsev2 = this.getAddressV2(document.propertyId);
                if(!this.isEmptyOrSpaces(parsev2.street_address)){
                    address = parsev2.street_address
                }
            } else {
                const nameInfo = this.getNameInfo(document.ownerId);
                first_name = nameInfo.first_name;
                last_name = nameInfo.last_name;
                owner_name = nameInfo.owner_name;
                owner_name_regexp = nameInfo.owner_name_regexp;
                if (owner_name === '') return false;

                console.log('------------------Looking for Owner : ' + owner_name + "--------------------")
            }

            //main try 
            try {
                if (this.searchBy === 'name') {
                    try {
                        await page.waitForXPath(`//*[@id="propertySearchOptions_ownerName"]`);
                        let [searchBox] = await page.$x(`//*[@id="propertySearchOptions_ownerName"]`);
                        await searchBox.click({ clickCount: 3 });
                        await searchBox.press('Backspace');
                        await searchBox.type(owner_name);
                    } catch (error) {
                        console.log('Error while filling in the address :');
                        console.log(error);
                    }
                }
                else {
                    //fill in the address
                    try {
                        await page.waitForXPath(`//*[@id="propertySearchOptions_searchText"]`);
                        let [searchBox] = await page.$x(`//*[@id="propertySearchOptions_searchText"]`);
                        await searchBox.click({ clickCount: 3 });
                        await searchBox.press('Backspace');
                        await searchBox.type(address);
                    } catch (error) {
                        console.log('Error while filling in the address :');
                        console.log(error);
                    }
                }                



                //click search
                try {
                    await page.waitFor(3000);
                    const id = this.searchBy === 'name' ? "propertySearchOptions_searchAdv" : "propertySearchOptions_search"
                    await page.waitForXPath(`//*[@id="${id}"]`);
                    let [searchButton] = await page.$x(`//*[@id="${id}"]`);
                    await searchButton.click();
                } catch (error) {
                    console.log('Error while clicking search  :');
                    console.log(error);
                }


                //wait for page to load                
                try {
                    await page.waitForNavigation();
                } catch (error) {
                    console.log('Error in loading  :');
                    console.log(error);
                }

                let dataFromPropertyAppraisers = {
                    'Full Name': '',
                    'First Name': '',
                    'Last Name': '',
                    'Middle Name': '',
                    'Name Suffix': '',
                    'Mailing Care of Name': '',
                    'Mailing Address': '',
                    'Mailing Unit #': '',
                    'Mailing City': '',
                    'Mailing State': '',
                    'Mailing Zip': '',
                    'Property Address': '',
                    'Property Unit #': '',
                    'Property City': '',
                    'Property State': 'TX',
                    'Property Zip': '',
                    'County': 'Travis',
                    'Owner Occupied': false,
                    'Property Type': '',
                    'Total Assessed Value': '',
                    'Last Sale Recording Date': '',
                    'Last Sale Amount': '',
                    'Est. Remaining balance of Open Loans': '',
                    'Est Value': '',
                    'yearBuilt': '',
                    'Est Equity': '',
                    'Lien Amount': ''
                }; 
                
                let [notFoundIndicator] = await page.$x(`//*[contains(text(),'None found.')]`);
                if (notFoundIndicator) {
                    console.log("Not Found !");
                } else {

                    const detaillinks = [];
                    if (this.searchBy === 'name') {
                        const name_handles = await page.$x('//*[@id="propertySearchResults_resultsTable"]/tbody/tr/td[7]');
                        const link_handles = await page.$x('//*[@id="propertySearchResults_resultsTable"]/tbody/tr/td[10]/a');
                        let index = 0;
                        for (let name_handle of name_handles) {
                            const owner_name_get = await page.evaluate(el => el.textContent, name_handle);
                            const regexp = new RegExp(owner_name_regexp);
                            console.log(owner_name_get, owner_name);
                            if (regexp.exec(owner_name_get.toUpperCase())) {
                                const detaillink = await page.evaluate(el => el.href, link_handles[index]);
                                detaillinks.push(detaillink);
                                index++;
                            }
                        }
                    }
                    else {
                        const link_handles = await page.$x('//*[@id="propertySearchResults_resultsTable"]/tbody/tr/td[10]/a');
                        if (link_handles[0]) {
                            const detaillink = await page.evaluate(el => el.href, link_handles[0]);
                            detaillinks.push(detaillink);
                        }
                    }
                    
                    for (let detaillink of detaillinks) {
                        try {
                            // wait for page to  load 
                            await page.goto(detaillink, {waitUntil: 'load'});
                        } catch (error) {
                            console.log('Error in loading  :');
                            console.log(error);
                        }

                        //expand
                        try {
                            let [expandButton] = await page.$x(`//*[@id="tabContent"]/div[1]/span/input`);
                            if (expandButton)
                                await expandButton.click();
                        } catch (error) {
                            console.log('Error while clicking expand  :');
                            console.log(error);
                        }

                        //property address
                        try {
                            let [propertyAddress]: any = await page.$x(`//*[@id="propertyDetails"]/table/tbody/*/*[text()='Address:']/following-sibling::td`);
                            if (propertyAddress) {
                                propertyAddress = await propertyAddress.getProperty('innerText');
                                propertyAddress = await propertyAddress.jsonValue();
                                
                                if (propertyAddress && propertyAddress.trim() != '') {
                                    dataFromPropertyAppraisers["Property Address"] = propertyAddress.replace(/(\r\n|\n|\r)/gm, " ")
                                    //add mailing city, state and zip
                                    let propertyAddress_separated = parseAddress.parseLocation(propertyAddress);
                                    if (propertyAddress_separated.city) {
                                        dataFromPropertyAppraisers["Property City"] = propertyAddress_separated.city;
                                    }
                                    if (propertyAddress_separated.zip) {
                                        dataFromPropertyAppraisers["Property Zip"] = propertyAddress_separated.zip;
                                    }
                                }
                            } else {
                                console.log('property address Not Available');
                            }
                        } catch (error) {
                            console.log('Error in property address  :');
                            console.log(error);
                        }
                        let secondaryOwnersNamesArray = [];
                        //Owner Name
                        try {
                            let [OwnerName]: any = await page.$x(`//*[@id="propertyDetails"]/table/tbody/*/*[text()='Name:']/following-sibling::td`);
                            if (OwnerName) {
                                OwnerName = await OwnerName.getProperty('innerText');
                                OwnerName = await OwnerName.jsonValue();
                                // console.log('Owner Name: ');
                                // console.log(OwnerName);
                                // console.log('\n')

                                let discriminateResult = discriminateAndRemove(OwnerName);
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
                                            secondaryOwnersNamesArray.push(separatedNamesArray[i]);
                                        }
                                    }
                                } else {
                                    dataFromPropertyAppraisers["Full Name"] = discriminateResult.name;
                                }
                            } else {
                                console.log('Owner Name Not Available');
                            }
                        } catch (error) {
                            console.log('Error inOwner Name  :');
                            console.log(error);
                        }

                        //Mailling address
                        try {
                            let parsedMaillingAddress;
                            let [MaillingAddress]: any = await page.$x(`//*[@id="propertyDetails"]/table/tbody/*/*[text()='Mailing Address:']/following-sibling::td`);
                            if (MaillingAddress) {
                                MaillingAddress = await MaillingAddress.getProperty('innerText');
                                MaillingAddress = await MaillingAddress.jsonValue();
                                // console.log('Mailling address : ');
                                // console.log(MaillingAddress);
                                // console.log('\n')
                                if (MaillingAddress && MaillingAddress.trim() != '') {
                                    dataFromPropertyAppraisers["Mailing Address"] = MaillingAddress.replace(/(\r\n|\n|\r)/gm, " ")
                                    //add mailing city, state and zip
                                    let maillingAddress_separated = parseAddress.parseLocation(MaillingAddress);
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
                            } else {
                                console.log('Mailling address Not Available');
                                console.log('\n')
                            }
                        } catch (error) {
                            console.log('Error in Mailling address  :');
                            console.log(error);
                        }

                        //property type
                        try {
                            let [propertyType]: any = await page.$x(`//*[@id="propertyDetails"]/table/tbody/*/*[text()='Property Use Description:']/following-sibling::td`);
                            if (propertyType) {
                                propertyType = await propertyType.getProperty('innerText');
                                propertyType = await propertyType.jsonValue();
                                // console.log('property type : ');
                                // console.log(propertyType);
                                // console.log('\n')
                                if (propertyType && propertyType.trim() != '')
                                    dataFromPropertyAppraisers["Property Type"] = propertyType;

                            } else {
                                console.log('property type Not Available');
                                console.log('\n')
                            }
                        } catch (error) {
                            console.log('Error in property type :');
                            console.log(error);
                        }

                        //last sale date 
                        try {
                            let [lastSaleDate]: any = await page.$x(`//*[@id="deedHistoryDetails_deedHistoryTable"]/tbody/tr[2]/td[2]`);
                            if (lastSaleDate) {
                                lastSaleDate = await lastSaleDate.getProperty('innerText');
                                lastSaleDate = await lastSaleDate.jsonValue();
                                // console.log('last sale date : ');
                                // console.log(lastSaleDate);
                                // console.log('\n')
                                if (lastSaleDate && lastSaleDate.trim() != '')
                                    dataFromPropertyAppraisers["Last Sale Recording Date"] = lastSaleDate;
                            } else {
                                console.log('sales info not available');
                                console.log('\n')
                            }
                        } catch (error) {
                            console.log('Error in last sale date  :');
                            console.log(error);
                        }

                        //Total assessed Value 
                        try {
                            let [totalAssessedValue]: any = await page.$x(`//*[@id="rollHistoryDetails"]/table/tbody/tr[2]/td[7]`);
                            if (totalAssessedValue) {
                                totalAssessedValue = await totalAssessedValue.getProperty('innerText');
                                totalAssessedValue = await totalAssessedValue.jsonValue();
                                // console.log('Total assessed Value : ');
                                // console.log(totalAssessedValue);
                                // console.log('\n')
                                if (totalAssessedValue && totalAssessedValue.trim() != '')
                                    dataFromPropertyAppraisers["Total Assessed Value"] = totalAssessedValue;
                            } else {
                                console.log('Total assessed Value not available');
                            }
                        } catch (error) {
                            console.log('Error in Total assessed Value :');
                            console.log(error);
                        }

                        //Estimated Value 
                        try {
                            let [estimatedValue]: any = await page.$x(`//*[@id="valuesDetails"]/table/tbody/*/*[contains(text(),'Market Value:')]/following-sibling::td[2]`);
                            if (estimatedValue) {
                                estimatedValue = await estimatedValue.getProperty('innerText');
                                estimatedValue = await estimatedValue.jsonValue();
                                // console.log('Estimated Value Value : ');
                                // console.log(estimatedValue);
                                // console.log('\n')
                                if (estimatedValue && estimatedValue.trim() != '')
                                    dataFromPropertyAppraisers["Est Value"] = estimatedValue;
                            } else {
                                console.log('Estimated Value Value not available');
                                console.log('\n')

                            }
                        } catch (error) {
                            console.log('Error in Estimated Value :');
                            console.log(error);
                        }

                        //owner occupied
                        try {
                            let ownerOccupied;
                            if (dataFromPropertyAppraisers["Mailing Address"] != "" && dataFromPropertyAppraisers["Property Address"]) {
                                //normalize addresses then compare
                                if (
                                    dataFromPropertyAppraisers["Mailing Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase().includes(dataFromPropertyAppraisers["Property Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase()) ||
                                    dataFromPropertyAppraisers["Mailing Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase() == dataFromPropertyAppraisers["Property Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase() ||
                                    dataFromPropertyAppraisers["Property Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase().includes(dataFromPropertyAppraisers["Mailing Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase())
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
                        console.log(dataFromPropertyAppraisers);
                        await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
                            
                        /*
                        try {
                            //all secondaryOwnersNamesArray are persons no need to test them 
                            secondaryOwnersNamesArray.forEach(async ownerNameSeparated => {

                                console.log('---------- cloned doc ----------')
                                let newDoc = await this.cloneDocument(docToSave);
                                newDoc["Full Name"] = ownerNameSeparated.fullName;
                                newDoc["First Name"] = ownerNameSeparated.firstName;
                                newDoc["Last Name"] = ownerNameSeparated.lastName;
                                newDoc["Middle Name"] = ownerNameSeparated.middleName;
                                newDoc["Name Suffix"] = ownerNameSeparated.nameSuffix;

                                console.log(newDoc);
                                await this.saveToLineItem(newDoc);
                                await this.saveToOwnerProductProperty(newDoc);
                            });
                        } catch (error) {
                            console.log('Error in separating other owners names :');
                            console.log(error);
                        }
                        */
                    }
                }
            } catch (error) {
                console.log(error);
                return false;
            }

        return true;
    }

}