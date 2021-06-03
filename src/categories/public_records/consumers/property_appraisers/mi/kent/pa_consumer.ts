const parseAddress = require('parse-address');
import puppeteer from 'puppeteer';
import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
const nameParsingService = require('../../consumer_dependencies/nameParsingServiceNew');
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'https://www.accesskent.com/Property/'
    }

    xpaths = {
        isPAloaded: '//*[@id="head"]'
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
            const parseName = nameParsingService.newParseName(fullName);
            let firstName = parseName.firstName;
            let middleName = parseName.middleName;
            let lastName = parseName.lastName;
            let nameSuffix = parseName.suffix;
            return {
                fullName: fullName.trim(),
                firstName: firstName.trim(),
                middleName: middleName.trim(),
                lastName: lastName.trim(),
                nameSuffix: nameSuffix.trim()
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
            
            if(this.searchBy == 'name'){
                console.log("The property appraiser site only support searched by address! https://www.accesskent.com/Property/");
                return false;
            }
            //affect the current address
            console.log('------------------Looking for address : ' + document.propertyId['Property Address'] + "--------------------")
            let address = parseAddress.parseLocation(document.propertyId['Property Address']);
            const parsev2 = this.getAddressV2(document.propertyId);
            if(!this.isEmptyOrSpaces(parsev2.street_address)){
                address = parseAddress.parseLocation(parsev2.street_address);
            }
            if(!address || (!address.number && !address.street)){
                console.log("The address number and address name is missing!");
                return false;
            }

            let dataFromPropertyAppraisers: any = {};
            dataFromPropertyAppraisers["County"] = 'Kent';
            dataFromPropertyAppraisers["Property State"] = 'MI';
            //main try
            try {
                //go to the search page
                try {
                    await page.goto('https://www.accesskent.com/Property/', {
                        waitUntil: 'networkidle0',
                        timeout: 60000
                    });
                } catch (error) {
                    console.log("error  : " + error);
                    console.log('couldnt head to www.accesskent.com retrying ... ');
                    //retry for second time
                    try {
                        await page.goto('https://www.accesskent.com/Property/', {
                            waitUntil: 'networkidle0',
                            timeout: 60000
                        });
                    } catch (error) {
                        console.log("error  : " + error);
                        return false;
                    }

                }

                //fill in the street name
                try {
                    if (address.street) {
                        await page.waitForXPath(`//*[@id="sreetNameField"]`);
                        let [searchBox] = await page.$x(`//*[@id="sreetNameField"]`);
                        await searchBox.click({ clickCount: 3 });
                        await searchBox.press('Backspace');
                        await searchBox.type(address.street);
                    }

                } catch (error) {
                    console.log('Error in fill in the street name  :');
                    console.log(error);
                }







                //fill in the house number
                try {
                    if (address.number) {
                        await page.waitForXPath(`//*[@id="addressNo"]`);
                        let [houseNumberInputMin] = await page.$x(`//*[@id="addressNo"]`);
                        await houseNumberInputMin.click({ clickCount: 3 });
                        await houseNumberInputMin.press('Backspace');
                        await houseNumberInputMin.type(address.number);
                    }

                } catch (error) {
                    console.log('Error in fill in the house number :');
                    console.log(error);
                }







                //click search 
                try {
                    await page.waitForXPath(`//*[@id="PropSearch"]/div/div[1]/fieldset/div[3]/div/input`);
                    let [searchButton] = await page.$x(`//*[@id="PropSearch"]/div/div[1]/fieldset/div[3]/div/input`);
                    await searchButton.click();

                } catch (error) {
                    console.log('Error in click search :');
                    console.log(error);
                }






                try {
                    await page.waitForNavigation();
                } catch (error) {
                    console.log('Error in loading :');
                    console.log(error);
                }



                let [notFoundIndicator] = await page.$x(`//*[contains(text(),'There were no results found.')]`);
                // let [foundMoreThanResultIndicator] = await page.$x(`/html/body/div[2]/div/div[1]/div/form/table/tbody/tr/td[3]`);
                if (notFoundIndicator) {
                    console.log("address Not Found ! ");
                } else {





                    //open result 
                    try {
                        let [parcelLink] = await page.$x(`/html/body/div[2]/div/div[1]/div/form/table/tbody/tr/td[2]/a`);
                        if (parcelLink) {
                            await parcelLink.click();
                        } else {
                            console.log('Parcel link is not available');
                            return true;
                        }
                    } catch (error) {
                        console.log('Error in open result  :');
                        console.log(error);
                    }





                    try {
                        await page.waitForNavigation();
                    } catch (error) {
                        console.log('Error in loading  :');
                        console.log(error);
                    }









                    //owner name 1
                    let secondaryOwnersNamesArray: any = [];
                    try {
                        let [ownerName1]: any = await page.$x(`//*[contains(text(),'Owner Name One:')]/following-sibling::text()`);
                        if (ownerName1) {
                            ownerName1 = await page.evaluate(ownerName1 => ownerName1.textContent, ownerName1);
                            ownerName1 = ownerName1.trim();

                            //the first owner name will be stored in the main document
                            //separate the name if its type is a person
                            let discriminateResult = discriminateAndRemove(ownerName1);
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
                            console.log('owner name 1 Not Available');
                        }
                    } catch (error) {
                        console.log('Error in owner name 1 :');
                        console.log(error);
                    }






                    //owner name 2
                    try {
                        let [ownerName2]: any = await page.$x(`//*[contains(text(),'Owner Name Two:')]/following-sibling::text()`);
                        if (ownerName2) {
                            ownerName2 = await page.evaluate(ownerName2 => ownerName2.textContent, ownerName2);
                            ownerName2 = ownerName2.trim();
                            // console.log('owner name 2 : ');
                            // console.log(ownerName2);
                            // console.log('\n')

                            if (ownerName2 != "") {
                                let discriminateResult = discriminateAndRemove(ownerName2);
                                if (discriminateResult.type == 'person') {
                                    let separatedNamesArray = checkForMultipleNamesAndNormalize(discriminateResult.name);
                                    for (let i = 0; i < separatedNamesArray.length; i++) {
                                        let separatedNameObj = separatedNamesArray[i];
                                        secondaryOwnersNamesArray.push(separatedNameObj);
                                    }
                                }
                            }

                        } else {
                            console.log('owner name 2 Not Available');
                        }

                    } catch (error) {
                        console.log('Error in owner name 2 :');
                        console.log(error);
                    }







                    //property type
                    try {
                        let [propertyType]: any = await page.$x(`//*[contains(text(),'Property Classification:')]/following-sibling::text()`);
                        if (propertyType) {
                            propertyType = await page.evaluate(propertyType => propertyType.textContent, propertyType);
                            propertyType = propertyType.trim();
                            // console.log('property type : ');
                            // console.log(propertyType);
                            // console.log('\n')
                            if (propertyType != '')
                                dataFromPropertyAppraisers["Property Type"] = propertyType;

                        } else {
                            console.log('property type Not Available');
                        }

                    } catch (error) {
                        console.log('Error in property type :');
                        console.log(error);
                    }






                    //total Assessed value
                    try {
                        //get position of Assessed value in the table
                        let positionOfTotalAssessedValue: any = await page.$x(`//*[contains(text(),'State Equalized Value')]/preceding-sibling::*`);
                        positionOfTotalAssessedValue = positionOfTotalAssessedValue.length;

                        let totalAssessedValue: any = await page.$x(`//*[contains(text(),'State Equalized Value')]/parent::tr/parent::thead/following-sibling::tbody/tr[1]/td`);
                        totalAssessedValue = totalAssessedValue[positionOfTotalAssessedValue]
                        if (totalAssessedValue) {
                            totalAssessedValue = await totalAssessedValue.getProperty('innerText');
                            totalAssessedValue = await totalAssessedValue.jsonValue();
                            // console.log('total Assessed Value : ');
                            // console.log(totalAssessedValue);
                            // console.log('\n')
                            if (totalAssessedValue != '')
                                dataFromPropertyAppraisers["Total Assessed Value"] = totalAssessedValue;

                        } else {
                            console.log('total Assessed Value Not Available');
                        }
                    } catch (error) {
                        console.log('Error in total Assessed Value text:');
                        console.log(error);
                    }









                    //go to the sales history tab 
                    let [salesHistoryTab] = await page.$x(`//*[contains(text(),'Sales History')]`);
                    if (salesHistoryTab) {
                        try {
                            await salesHistoryTab.click();
                        } catch (error) {
                            console.log('Error in go to the sales history tab  :');
                            console.log(error);
                        }





                        //wait for navigation
                        try {
                            await page.waitForNavigation();
                        } catch (error) {
                            console.log('Error in loading :');
                            console.log(error);
                        }








                        try {


                            //get position of Last sale date in tha table 
                            let positionOfLastSaleDate: any = await page.$x(`//*[contains(text(),'Sale Date')]/preceding-sibling::*`);
                            positionOfLastSaleDate = positionOfLastSaleDate.length;

                            //total Assessed value
                            let lastSaleDate: any = await page.$x(`//*[contains(text(),'Sale Date')]/parent::tr/parent::thead/following-sibling::tbody/tr[1]/td`);
                            lastSaleDate = lastSaleDate[positionOfLastSaleDate]
                            //Last sale date text
                            if (lastSaleDate) {
                                lastSaleDate = await lastSaleDate.getProperty('innerText');
                                lastSaleDate = await lastSaleDate.jsonValue();
                                // console.log('Last Sale Date : ');
                                // console.log(lastSaleDate);
                                // console.log('\n')
                                if (lastSaleDate != '')
                                    dataFromPropertyAppraisers["Last Sale Recording Date"] = lastSaleDate;
                            } else {
                                console.log('Last Sale Date Not Available');
                            }

                        } catch (error) {
                            console.log('Error in Last Sale Date :');
                            console.log(error);
                        }

















                        //last sale price
                        try {
                            //get position of last sale price in tha table 
                            let positionOfLastSalePrice: any = await page.$x(`//*[contains(text(),'Sale Price')]/preceding-sibling::*`);
                            positionOfLastSalePrice = positionOfLastSalePrice.length;
                            //total Assessed value
                            let lastSalePrice: any = await page.$x(`//*[contains(text(),'Sale Price')]/parent::tr/parent::thead/following-sibling::tbody/tr[1]/td`);
                            lastSalePrice = lastSalePrice[positionOfLastSalePrice];
                            //last sale price text
                            if (lastSalePrice) {
                                lastSalePrice = await lastSalePrice.getProperty('innerText');
                                lastSalePrice = await lastSalePrice.jsonValue();
                                // console.log('last sale price : ');
                                // console.log(lastSalePrice);
                                // console.log('\n')
                                if (lastSalePrice && lastSalePrice.trim() != '')
                                    dataFromPropertyAppraisers["Last Sale Amount"] = lastSalePrice;
                            } else {
                                console.log('last sale price Not Available');
                            }
                        } catch (error) {
                            console.log('Error in  :');
                            console.log(error);
                        }



                    } else {
                        console.log('Sales history tab not showing ');

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
                    try{
                        await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
                    }catch(e){
                        //
                    }
                }



            } catch (error) {
                console.log(error);
                return false;
            }

        return true;
    }

}