import puppeteer from 'puppeteer';
const parseAddress = require('parse-address');

import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
import { IPublicRecordAttributes } from '../../../../../../models/public_record_attributes'

import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'http://tn-knox-assessor.publicaccessnow.com/PropertyLookup.aspx'
    }

    xpaths = {
        isPAloaded: '//*[@id="Body"]'
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
                return false;
            }
            
            //head to the PA website
            try {
                await page.goto('http://tn-knox-assessor.publicaccessnow.com/PropertyLookup.aspx', {
                    waitUntil: 'networkidle0',
                    timeout: 60000
                });
            } catch (error) {
                console.log("error  : " + error);
                console.log('couldnt head to jeffersonpva.ky.gov retrying ... ');
                //retry for second time
                try {
                    await page.goto('http://tn-knox-assessor.publicaccessnow.com/PropertyLookup.aspx', {
                        waitUntil: 'networkidle0',
                        timeout: 60000
                    });
                } catch (error) {
                    console.log("error  : " + error);
                    return false;
                }

            }

            let dataFromPropertyAppraisers: any = {};
            let search_value = '';
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
                search_value = owner_name;
              }
              else {
                  search_value = document.propertyId['Property Address'];
                  const parseaddr = this.getAddressV2(document.propertyId);
                  if(!this.isEmptyOrSpaces(parseaddr.street_address)){
                      search_value = parseaddr.street_address;
                  }
                  console.log(`Looking for address: ${document.propertyId['Property Address']}`);
              }

            //main try 
            try {



                //fill in the address
                try {
                    await page.waitForXPath(`//*[@id="fldSearchFor"]`);
                    let [searchBox] = await page.$x(`//*[@id="fldSearchFor"]`);
                    await searchBox.click({ clickCount: 3 });
                    await searchBox.press('Backspace');
                    await searchBox.type(search_value);

                } catch (error) {
                    console.log('Error happened while filling in the address:');
                    console.log(error);
                    return false;

                }


                //click search 
                try {
                    await page.waitForXPath(`//*[@id="QuickSearch"]/div/div/table/tbody/tr/td[2]/button[1]/span`);
                    let [searchButton] = await page.$x(`//*[@id="QuickSearch"]/div/div/table/tbody/tr/td[2]/button[1]/span`);
                    await searchButton.click();

                } catch (error) {
                    console.log('Error in click search :');
                    console.log(error);
                    return false;

                }



                //wait for results to load
                try {
                    await page.waitForNavigation();
                } catch (error) {
                    console.log('Error in loading the results :');
                    console.log(error);
                    return false;

                }






                let [notFoundIndicator] = await page.$x(`//*[@id="QuickSearch"]/*[contains(text(),"Sorry, no records were found")]`);
                if (notFoundIndicator) {
                    console.log('address not found');
                    return true;
                }


                //click in the search result
                const datalinks = [];
                let searchResults;
                try {
                    await page.waitForXPath('//*[@id="QuickSearch"]/div[2]/div/ul[2]/li[1]/a');
                    searchResults = await page.$x(`//*[@id="QuickSearch"]/div[2]/div/ul[2]/li[1]/a`);
                    // await searchResult.click();

                } catch (error) {
                    console.log(error);
                    return false;
                }

                if(this.searchBy == 'name'){
                    for(const row of searchResults){
                        let name = await row.evaluate(el => el.textContent?.trim());
                        let link = await row.evaluate(el => el.getAttribute('href'));
                        link = "http://tn-knox-assessor.publicaccessnow.com/" + link;
                        const regexp = new RegExp(owner_name_regexp);
                        if (regexp.exec(name!.toUpperCase())){
                            datalinks.push(link);
                        }
                    }
                } else {
                    let link = await searchResults[0].evaluate(el => el.getAttribute('href'));
                    link = "http://tn-knox-assessor.publicaccessnow.com/" + link;
                    datalinks.push(link);
                }
                console.log(datalinks);

                for(const datalink of datalinks){
                    console.log(datalink);
                    try {
                        await page.goto(datalink, {waitUntil: 'networkidle0'});
                    } catch (error) {
                        console.log('Error in  :');
                        console.log(error);
                    }

                    //owner name
                    let secondaryOwnersNamesArray = [];
                    try {
                        let ownerNameXPath = await this.getTextContentByXpathFromPage(page, `//*[@id="lxT459"]/table/tbody/tr[1]/td/text()[1]`);
                        let ownerName = ownerNameXPath.trim();
                        ownerName = ownerName.split("&")[0].trim();
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
                                    secondaryOwnersNamesArray.push(separatedNamesArray[i]);
                                }

                            }
                        } else {
                            dataFromPropertyAppraisers["Full Name"] = discriminateResult.name;
                        }
                    } catch (error) {
                        console.log('Error in owner name :');
                        console.log(error);
                    }






                    //mailling address
                    try {
                        let maillingAddress1 = await this.getTextContentByXpathFromPage(page, `//*[@id="lxT459"]/table/tbody/tr[1]/td/text()[last()-1]`);
                        let maillingAddress2 = await this.getTextContentByXpathFromPage(page, `//*[@id="lxT459"]/table/tbody/tr[1]/td/text()[last()]`);
                        console.log('Mailling address 1: ' + maillingAddress1);
                        console.log('Mailling address 2 : ' + maillingAddress2);

                        maillingAddress1 = maillingAddress1.replace(/\s+/g,' ').trim();
                        maillingAddress2 = maillingAddress2.replace(/\s+/g,' ').trim();
                        dataFromPropertyAppraisers["Mailing Address"] = maillingAddress1;


                        //add mailing city, state and zip
                        let maillingAddress_separated = parseAddress.parseLocation(maillingAddress1 + ", " + maillingAddress2);
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
                        //
                    }




                    //property address 
                    try {
                        let [propertyAddress]:any = await page.$x(`//*[@id="lxT459"]/table/tbody/tr[4]/td`);
                        propertyAddress = await propertyAddress.getProperty('textContent')
                        propertyAddress = await propertyAddress.jsonValue();
                        dataFromPropertyAppraisers["Property Address"] = propertyAddress;
                        console.log('property address from web: ' + propertyAddress);

                    } catch (error) {
                        console.log('Error in property address :');
                        console.log(error);
                    }





                    //get property type 
                    try {
                        let [propertyType]: any = await page.$x(`//*[@id="lxT459"]/table/tbody/*/*[contains(text(),"Property Class")]/following-sibling::td`);
                        propertyType = await propertyType.getProperty('textContent')
                        propertyType = await propertyType.jsonValue();
                        console.log("property type : " + propertyType)
                        propertyType = propertyType.trim();
                        dataFromPropertyAppraisers["Property Type"] = propertyType;
                    } catch (error) {
                        //
                    }


                    //get Total assessed value 
                    try {
                        let [totalAssessedValue]: any = await page.$x(`//*[@id="ValueHistory"]/tbody/*/*[contains(text(),"Total Appr")]/following-sibling::td`);
                        totalAssessedValue = await totalAssessedValue.getProperty('innerText')
                        totalAssessedValue = await totalAssessedValue.jsonValue();
                        totalAssessedValue = totalAssessedValue.trim();
                        console.log("Total assessed value : " + totalAssessedValue)
                        dataFromPropertyAppraisers["Total Assessed Value"] = totalAssessedValue;
                    } catch (error) {
                        //
                    }







                    //check if sales history available
                    let [salesHistoryNotFound] = await page.$x(`//*[@id="lxT461"]/*[contains(text(),"does not exist")]`);
                    if (salesHistoryNotFound) {
                        console.log('Sales history does not exist for this account')
                    } else {
                        //get the  last sale date and price from inside the sales history







                        //last Sale Date
                        try {
                            await page.waitForXPath('//*[@id="lxT461"]/table/tbody/tr[2]/td[3]');
                            let [lastSaleDate]: any = await page.$x(`//*[@id="lxT461"]/table/tbody/tr[2]/td[3]`);
                            lastSaleDate = await lastSaleDate.getProperty('innerText')
                            lastSaleDate = await lastSaleDate.jsonValue();
                            lastSaleDate = lastSaleDate.trim();
                            console.log('last sale date : ' + lastSaleDate);
                            dataFromPropertyAppraisers["Last Sale Recording Date"] = lastSaleDate;

                        } catch (error) {
                            //
                        }







                        //last sale price
                        try {
                            let [lastSalePrice]: any = await page.$x(`//*[@id="lxT461"]/table/tbody/tr[2]/td[9]`);
                            lastSalePrice = await lastSalePrice.getProperty('innerText')
                            lastSalePrice = await lastSalePrice.jsonValue();
                            lastSalePrice = lastSalePrice.trim();
                            console.log('last sale price : ' + lastSalePrice);
                            dataFromPropertyAppraisers["Last Sale Amount"] = lastSalePrice;

                        } catch (error) {
                            //
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
                            //
                        }

                        dataFromPropertyAppraisers["County"] = "Knox";
                        dataFromPropertyAppraisers["Property State"] = "TN";
                        try {
                            await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
                        } catch(e){
                            //
                        }
                    }
                }
            } catch (error) {
                console.log(error);
                return false;
            }

        return true;
    }

}