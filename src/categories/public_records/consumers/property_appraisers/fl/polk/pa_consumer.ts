const parseAddress = require('parse-address');
import puppeteer from 'puppeteer';
import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';
import { getTextByXpathFromPage } from '../../../../../../services/general_service';

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'https://www.polkpa.org/CamaDisplay.aspx?OutputMode=Input&searchType=RealEstate&page=FindByAddress',
        searchByOwnerPage: 'https://www.polkpa.org/CamaDisplay.aspx?OutputMode=Input&searchType=RealEstate&page=FindByOwnerName'
    }

    xpaths = {
        isPAloaded: '//*[@id="address"]'
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










        const page = this.browserPages.propertyAppraiserPage!;
        let document = docsToParse;
            // let docToSave: any = await this.getLineItemObject(document);
            if (!this.decideSearchByV2(document)) {
                console.log('Insufficient info for Owner and Property');
                return false;
            }

            
            // do everything that needs to be done for each document here
            //affect the current address
            let address = '';
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
                address = document.propertyId["Property Address"];
                const parseaddr = this.getAddressV2(document.propertyId);
                if(!this.isEmptyOrSpaces(parseaddr.street_address)){
                    address = parseaddr.street_address;
                }
                console.log(`Looking for address: ${address}`);
            }

            //go to the page
            const url = this.searchBy === 'name' ? this.urls.searchByOwnerPage : this.urls.propertyAppraiserPage;
            try {
                await page.goto(url, {
                    waitUntil: 'networkidle0',
                    timeout: 60000
                });
            } catch (error) {
                console.log("error  : " + error);
                console.log('couldnt head to www.polkpa.org retrying ... ');
                //retry for second time
                try {

                    await page.goto(url, {
                        waitUntil: 'networkidle0',
                        timeout: 60000
                    });
                } catch (error) {
                    console.log("error  : " + error);
                    return false;
                }

            }




            if (this.searchBy === 'name') {
                try {
                    //fill in the address
                    await page.waitForXPath(`//*[@id="OwnerName"]`);
                    let [searchBox] = await page.$x(`//*[@id="OwnerName"]`);
                    await searchBox.click({ clickCount: 3 });
                    await searchBox.press('Backspace');
                    await searchBox.type(owner_name);
                } catch (error) {
                    console.log('couldnt type in the address in the search box due the following error : ')
                    console.log(error);
                    return false;
                }
            }
            else {
                try {
                    //fill in the address
                    await page.waitForXPath(`//*[@id="address"]`);
                    let [searchBox] = await page.$x(`//*[@id="address"]`);
                    await searchBox.click({ clickCount: 3 });
                    await searchBox.press('Backspace');
                    await searchBox.type(address);
                } catch (error) {
                    console.log('couldnt type in the address in the search box due the following error : ')
                    console.log(error);
                    return false;
                }
            }
            


            try {
                //click search 
                await page.waitForXPath(`//*[@id="CamaDisplayArea"]/div[1]/div[3]/table/tbody/tr/td/input`);
                let [searchButton] = await page.$x(`//*[@id="CamaDisplayArea"]/div[1]/div[3]/table/tbody/tr/td/input`);
                await searchButton.click();
            } catch (error) {
                console.log('couldnt click search button due to the following error :')
                console.log(error)
                return false;
            }



            //wait for error label to show in case there is one
            try {
                await page.waitForNavigation();
            } catch (error) {
                console.log('loading took too long ')
                console.log(error);
            }



            // testing if errorLabel exists; if so ignore and search for an other address
            try {
                let [errorLabel]: any = await page.$x(`//*[@id="CamaDisplayArea"]/span[1]`);
                if (errorLabel) {
                    errorLabel = await errorLabel.getProperty('textContent');
                    errorLabel = await errorLabel.jsonValue();
                    if (errorLabel.includes('0 Matches found')) {
                        console.log(errorLabel);
                        return true;
                    }
                }

            } catch (error) {
                console.log("couldnt find error label to read its value")
                console.log(error);

            }



            //pick the result
            try {
                await page.waitForXPath(`//*[@id="CamaDisplayArea"]/div[3]/table/tbody/tr[2]/td[3]/a`);
            } catch (error) {
                console.log('couldnt find any results, error:')
                console.log(error);
                //back and continue the search
                return true;
            }

            //click on the result
            const datalinks = [];
            try {
                if (this.searchBy === 'name') {
                    const rows = await page.$x(`//*[@id="CamaDisplayArea"]/div[3]/table/tbody/tr[position()>1]`);
                    for (const row of rows) {
                        const {name, link} = await page.evaluate(el => ({name: el.children[1].textContent, link: el.children[2].children[0].href}), row);
                        console.log(name)
                        const regexp = new RegExp(owner_name_regexp);
                        if (!regexp.exec(name.toUpperCase())) continue;
                        datalinks.push(link);
                    }
                }
                else {
                    let [parcelIDLink]: any = await page.$x(`//*[@id="CamaDisplayArea"]/div[3]/table/tbody/tr[2]/td[3]/a`);
                    const datalink = await page.evaluate(el => el.href, parcelIDLink);
                    datalinks.push(datalink);
                }
            } catch (error) {
                console.log('couldnt click on the first result, error:')
                console.log(error);
            }

            for (const datalink of datalinks) {
                try {
                    //wait for page to load
                    await page.goto(datalink, {waitUntil: 'load'});
                } catch (error) {
                    console.log('page didnt load, error:')
                    console.log(error);
                }


                //scraping the data
                let dataFromPropertyAppraisers: any = {};
                try {



                    //get the owners' names
                    let secondaryOwnersNamesArray = [];
                    try {
                        let ownersNamesStillExist = true;
                        let numberOfOwnerName = 1;
                        while (ownersNamesStillExist) {
                            let [OwnerName]: any = await page.$x(`//*[@id="CamaDisplayArea"]/table[2]/tbody/tr/td[` + numberOfOwnerName + `]/table[1]/tbody/tr/td[1]`);
                            if (OwnerName) {
                                OwnerName = await OwnerName.getProperty('textContent');
                                OwnerName = await OwnerName.jsonValue();
                                numberOfOwnerName++;
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
                                            secondaryOwnersNamesArray.push(separatedNameObj);
                                        }

                                    }
                                } else {
                                    dataFromPropertyAppraisers["Full Name"] = discriminateResult.name;
                                }
                            } else {
                                ownersNamesStillExist = false;
                            }
                        }
                    } catch (error) {
                        console.log("error in Owner name :")
                        console.log(error);
                    }





                    //get the mailling address
                    try {
                        let fullMailingAddress = "";
                        let maillingAddresseLinesStillExist = true;
                        let numberOfMaillingAddressLine = 1;
                        while (maillingAddresseLinesStillExist) {
                            let [maillingAddress]: any = await page.$x(`//*[@id="CamaDisplayArea"]/table[2]/tbody/tr/td[1]/table[2]/tbody/tr[` + numberOfMaillingAddressLine + `]/td[2]/span`);
                            if (maillingAddress) {
                                maillingAddress = await maillingAddress.getProperty('textContent');
                                maillingAddress = await maillingAddress.jsonValue();
                                fullMailingAddress = fullMailingAddress + maillingAddress + " ";
                                numberOfMaillingAddressLine++;
                            } else {
                                maillingAddresseLinesStillExist = false;
                            }
                        }
                        dataFromPropertyAppraisers["Mailing Address"] = fullMailingAddress;

                        //separate mailing address and add it to the document
                        let maillingAddress_separated = parseAddress.parseLocation(fullMailingAddress);
                        if (maillingAddress_separated.city) {
                            dataFromPropertyAppraisers["Mailing City"] = maillingAddress_separated.city;
                        }
                        if (maillingAddress_separated.state) {
                            dataFromPropertyAppraisers["Mailing State"] = maillingAddress_separated.state;
                        }
                        if (maillingAddress_separated.zip) {
                            dataFromPropertyAppraisers["Mailing Zip"] = maillingAddress_separated.zip;
                        }
                    } catch (error) {
                        console.log("error in mailing address :")
                        console.log(error)
                    }





                    //get property type 
                    try {
                        let [propertyType]: any = await page.$x(`//*[@id="CamaDisplayArea"]/div[6]/h4/a`);
                        if (propertyType) {
                            propertyType = await propertyType.getProperty('textContent');
                            propertyType = await propertyType.jsonValue();
                            dataFromPropertyAppraisers["Property Type"] = propertyType;
                        }
                    } catch (error) {
                        console.log("error in the property type")
                        console.log(error)
                    }


                    //get the assessed value 
                    try {
                        let [assessedValue]: any = await page.$x(`//*[@id="CamaDisplayArea"]/div[12]/table[1]/tbody/*/*[contains(text(),'Assessed Value')]//following-sibling::td`);
                        if (assessedValue) {
                            assessedValue = await assessedValue.getProperty('textContent');
                            assessedValue = await assessedValue.jsonValue();
                            // console.log("Assessed Value: " + assessedValue);
                            dataFromPropertyAppraisers["Total Assessed Value"] = assessedValue;
                        }
                    } catch (error) {
                        console.log('error in total assessed value ')
                        console.log(error)
                    }



                    try {
                        //get the last Sale date
                        let [saleDate]: any = await page.$x(`//*[@id="CamaDisplayArea"]/div[3]/table/tbody/tr[2]/td[2]`);
                        if (saleDate) {
                            saleDate = await saleDate.getProperty('textContent');
                            saleDate = await saleDate.jsonValue();
                            dataFromPropertyAppraisers["Last Sale Recording Date"] = saleDate;
                        }
                    } catch (error) {
                        console.log('error in the last sale date :')
                        console.log(error)
                    }



                    try {
                        let [salePrice]: any = await page.$x(`//*[@id="CamaDisplayArea"]/div[3]/table/tbody/tr[2]/td[6]`);
                        if (salePrice) {
                            salePrice = await salePrice.getProperty('textContent');
                            salePrice = await salePrice.jsonValue();
                            dataFromPropertyAppraisers["Last Sale Amount"] = salePrice;
                        }
                    } catch (error) {
                        console.log('error in sale price :')
                        console.log(error)
                    }

                    try {
                        //get the estimated value 
                        let [estValue]: any = await page.$x(`//*[@id="CamaDisplayArea"]/div[12]/table[1]/tbody/*/*[contains(text(),'Assessed Value')]//following-sibling::td`);
                        if (estValue) {
                            estValue = await estValue.getProperty('textContent');
                            estValue = await estValue.jsonValue();
                            dataFromPropertyAppraisers["Est Value"] = estValue;
                        }
                    } catch (error) {
                        console.log('error in the est value : ')
                        console.log(error)
                    }



                    // property address
                    const property_address = (await page.evaluate(el => el.textContent, (await page.$x('//*[text()="Site Address"]/following-sibling::table//*[text()="Address 1"]/following-sibling::td/span'))[0])).trim();
                    const property_city = (await page.evaluate(el => el.textContent, (await page.$x('//*[text()="Site Address"]/following-sibling::table//*[text()="City"]/following-sibling::td/span'))[0])).trim();
                    const property_state = (await page.evaluate(el => el.textContent, (await page.$x('//*[text()="Site Address"]/following-sibling::table//*[text()="State"]/following-sibling::td/span'))[0])).trim();
                    const property_zip = (await page.evaluate(el => el.textContent, (await page.$x('//*[text()="Site Address"]/following-sibling::table//*[text()="Zip Code"]/following-sibling::td/span'))[0])).trim();

                    //owner occupied
                    try {
                        let ownerOccupied;
                        if (dataFromPropertyAppraisers["Mailing Address"] != "" && dataFromPropertyAppraisers["Property Address"]) {
                            //normalize addresses then compare
                            if (
                                dataFromPropertyAppraisers["Mailing Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase().includes(dataFromPropertyAppraisers["Property Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase()) ||
                                dataFromPropertyAppraisers["Mailing Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase() == dataFromPropertyAppraisers["Property Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase() ||
                                dataFromPropertyAppraisers["Property Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase().includes(dataFromPropertyAppraisers["Property Address"].replace(/(\r\n|\n|\r)/gm, "").toLowerCase())
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


                    // if (this.searchBy === 'name') {
                    dataFromPropertyAppraisers['Property Address'] = property_address;
                    dataFromPropertyAppraisers['Property City'] = property_city;
                    dataFromPropertyAppraisers['Property State'] = 'FL';
                    dataFromPropertyAppraisers['Property Zip'] = property_zip;
                    // }
                    dataFromPropertyAppraisers['County'] = 'Polk';

                          
                    // yearBuilt
                    const year_built_xpath = '//*[text()="Actual Year Built:"]/following-sibling::text()[1]';
                    const year_built = await getTextByXpathFromPage(page, year_built_xpath);
                    
                    dataFromPropertyAppraisers['yearBuilt'] = year_built;
                    
                    await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
                    //document parsed 
                    //save 

                } catch (error) {
                    console.log(error);
                    continue;
                }


            }


        return true;
    }

}