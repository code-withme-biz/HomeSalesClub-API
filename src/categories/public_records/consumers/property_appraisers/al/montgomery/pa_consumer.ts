import puppeteer from 'puppeteer';
const parseAddress = require('parse-address');
import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';
const nameParsingService = require('../../consumer_dependencies/nameParsingServiceNew');


export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'https://revco.mc-ala.org/CAPortal/CAPortal_MainPage.aspx'
    }

    xpaths = {
        isPAloaded: '//*[@id="MainTable"]'
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
        // console.log(`Documents to look up: ${docsToParse.length}.`);
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
            let parserName = nameParsingService.newParseName(fullName);
            return {
                fullName: parserName.fullName.trim(),
                firstName: parserName.firstName.trim(),
                middleName: parserName.middleName.trim(),
                lastName: parserName.lastName.trim(),
                nameSuffix: parserName.suffix.trim()
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












        //--------------------------Helpers---------------------------------//
        // wait for frames to load
        function once(emitter: any, event: any) {
            return new Promise(resolve => emitter.once(event, resolve));
        }
        // if pageFunction returns a promise, $eval will wait for its resolution
        function waitForIFrameLoad(page: any, iframeSelector: any, timeout = 30000) {
            return page.$eval(
                iframeSelector,
                (el: any, timeout: any) => {
                    const p = new Promise((resolve, reject) => {
                        el.onload = () => {
                            resolve()
                        }
                        setTimeout(() => {
                            reject(new Error("Waiting for iframe load has timed out"))
                        }, timeout)
                    })
                    return p
                },
                timeout,
            )
        }
        //--------------------------Helpers end here---------------------------------//



        const getData = async (frame: puppeteer.Frame | null | undefined, document: IOwnerProductProperty) => {
            let dataFromPropertyAppraisers: any = {};
            //frame2
            let frame2;
            try {
                await frame?.waitFor(`#Iframe2`)
                let elementHandle2 = await frame?.$(`#Iframe2`);
                frame2 = await elementHandle2?.contentFrame();
            } catch (error) {
                console.log('Error in getting iframe 2 :');
                console.log(error);
            }
            //owner name
            try {
                await frame2?.waitForXPath(`//*[@id="MainTable"]/tbody/tr[1]/td[1]/fieldset/table/tbody/tr[2]/td[2]`)
                let [ownerName]: any = await frame2?.$x(`//*[@id="MainTable"]/tbody/tr[1]/td[1]/fieldset/table/tbody/*/*/*[contains(text(),"OWNER")]/parent::td/following-sibling::td`);
                ownerName = await ownerName.getProperty('innerText');
                ownerName = await ownerName.jsonValue();
                console.log('owner name : ' + ownerName);
                let discriminateResult = discriminateAndRemove(ownerName);
                if (discriminateResult.type == 'person') {
                    let separatedNamesArray = checkForMultipleNamesAndNormalize(discriminateResult.name);
                    dataFromPropertyAppraisers["Full Name"] = separatedNamesArray[0].fullName;
                    dataFromPropertyAppraisers["First Name"] = separatedNamesArray[0].firstName;
                    dataFromPropertyAppraisers["Last Name"] = separatedNamesArray[0].lastName;
                    dataFromPropertyAppraisers["Middle Name"] = separatedNamesArray[0].middleName;
                    dataFromPropertyAppraisers["Name Suffix"] = separatedNamesArray[0].nameSuffix;
                } else {
                    dataFromPropertyAppraisers["Full Name"] = discriminateResult.name;
                }
            } catch (error) {
                console.log('Error in owner name :');
                console.log(error);
            }
    
    
    
            //property address
            try {
                let [propertyAddress]: any = await frame2?.$x(`//*[@id="MainTable"]/tbody/tr[1]/td[1]/fieldset/table/tbody/*/*/*[contains(text(),"ADDRESS")]/parent::td/following-sibling::td`);
                propertyAddress = await propertyAddress.getProperty('innerText');
                propertyAddress = await propertyAddress.jsonValue();
                propertyAddress = propertyAddress.trim();
                console.log('property address : ' + propertyAddress);
                if (this.searchBy === 'name') {
                    dataFromPropertyAppraisers['Property Address'] = propertyAddress;
                    //add mailing city, state and zip
                    let propertyAddress_separated = parseAddress.parseLocation(propertyAddress);
                    if (propertyAddress_separated.city) {
                        dataFromPropertyAppraisers["Mailing City"] = propertyAddress_separated.city;
                    }
                    if (propertyAddress_separated.state) {
                        dataFromPropertyAppraisers["Mailing State"] = propertyAddress_separated.state;
                    }
                    if (propertyAddress_separated.zip) {
                        dataFromPropertyAppraisers["Mailing Zip"] = propertyAddress_separated.zip;
                    }
                }
            } catch (error) {
                console.log('Error in property address :');
                console.log(error);
            }
    
    
    
    
            //mailling address
            try {
                let [maillingAddress]: any = await frame2?.$x(`//*[@id="MainTable"]/tbody/tr[1]/td[1]/fieldset/table/tbody/*/*/*[contains(text(),"LOCATION")]/parent::td/following-sibling::td`);
                maillingAddress = await maillingAddress.getProperty('innerText');
                maillingAddress = await maillingAddress.jsonValue();
                console.log('mailling address : ' + maillingAddress);
    
                maillingAddress = maillingAddress.trim();
                dataFromPropertyAppraisers["Mailing Address"] = maillingAddress;
    
    
                //add mailing city, state and zip
                let maillingAddress_separated = parseAddress.parseLocation(maillingAddress);
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
                console.log('Error in mailling address:');
                console.log(error);
            }
    
    
    
            //frame 3
            let frame3;
            try {
                await frame?.waitFor(`#Iframe1`)
                let elementHandle3 = await frame?.$(`#Iframe1`);
                frame3 = await elementHandle3?.contentFrame();
    
            } catch (error) {
                console.log('Error in frame 3 :');
                console.log(error);
            }
    
    
    
    
            //total assessed value 
            try {
                let totalAssessedValue: any = await frame3?.$x(`//*[@id="thisForm"]/table/tbody/tr/td/fieldset/table/tbody/tr[4]/td/fieldset/table/tbody/tr[13]/td[1]`);
                if (totalAssessedValue && totalAssessedValue[0]) {
    
                    totalAssessedValue = totalAssessedValue[0];
                    totalAssessedValue = await totalAssessedValue.getProperty('innerText');
                    totalAssessedValue = await totalAssessedValue.jsonValue();
                    totalAssessedValue = totalAssessedValue.split('$')[1];
                    totalAssessedValue = totalAssessedValue.trim();
                    dataFromPropertyAppraisers["Total Assessed Value"] = totalAssessedValue;
                } else {
                    console.log("total Assessed Value not found")
                }
            } catch (error) {
                console.log('Error in total assessed value  :');
                console.log(error);
            }
    
    
    
    
            //get estimated value 
            try {
                let [EstimatedValue]: any = await frame3?.$x(`//*[@id="ValueFS"]/table/tbody/tr[10]/td[2]`);
                if (EstimatedValue) {
                    EstimatedValue = await EstimatedValue.getProperty('innerText');
                    EstimatedValue = await EstimatedValue.jsonValue();
                    EstimatedValue = EstimatedValue.split('$')[1];
                    if (EstimatedValue)
                    {
                        EstimatedValue = EstimatedValue.trim();
                    }
                    if(EstimatedValue != '')
                    {
                        dataFromPropertyAppraisers["Est Value"] = EstimatedValue;
                    }
                } else {
                    console.log('Estimated Value not Found');
                }
    
            } catch (error) {
                console.log('Error in estimated value:');
                console.log(error);
            }
    
    
    
    
            //go to the land tab
            try {
                await frame2?.waitForXPath(`//*[@id="Land"]`)
                let [landTab]: any = await frame2?.$x(`//*[@id="Land"]`)
                await landTab.click();
    
            } catch (error) {
                console.log('Error in clicking land tab :');
                console.log(error);
            }
    
    
    
    
    
    
            await page.waitFor(3000);
            //check if sales info are available
            let [salesInfoExistIndicator]: any = await frame3?.$x(`//*[@id="TABLE4"]/tbody/tr[1]/td/b`)
            if (salesInfoExistIndicator) {
    
                try {
                    salesInfoExistIndicator = await salesInfoExistIndicator.getProperty('innerText');
                    salesInfoExistIndicator = await salesInfoExistIndicator.jsonValue();
                } catch (error) {
                    console.log('Error in sales info  :');
                    console.log(error);
                }
    
    
                //if no sales info available
                if (salesInfoExistIndicator.includes('No Sales Information')) {
                    console.log("no sales info available")
                } else {
                    try {
    
    
    
    
                        //get last sale date 
                        try {
                            await frame3?.waitForXPath(`//*[@id="TABLE4"]/tbody/tr[1]/td[1]`)
                            let [LastSaleDate]: any = await frame3?.$x(`//*[@id="TABLE4"]/tbody/tr[1]/td[1]`)
                            LastSaleDate = await LastSaleDate.getProperty('innerText');
                            LastSaleDate = await LastSaleDate.jsonValue();
                            LastSaleDate = LastSaleDate.trim();
                            dataFromPropertyAppraisers["Last Sale Recording Date"] = LastSaleDate;
                        } catch (error) {
                            console.log('Error in last sale date :');
                            console.log(error);
                        }
    
    
    
                        //get last sale Price
                        try {
                            await frame3?.waitForXPath(`//*[@id="TABLE4"]/tbody/tr[1]/td[2]`)
                            let [LastSalePrice]: any = await frame3?.$x(`//*[@id="TABLE4"]/tbody/tr[1]/td[2]`)
                            LastSalePrice = await LastSalePrice.getProperty('innerText');
                            LastSalePrice = await LastSalePrice.jsonValue();
                            LastSalePrice = LastSalePrice.split('$')[1];
                            LastSalePrice = LastSalePrice.trim();
                            dataFromPropertyAppraisers["Last Sale Amount"] = LastSalePrice;
    
                        } catch (error) {
                            console.log('Error in last sale Price:');
                            console.log(error);
                        }
    
    
    
                        //get property type
                        try {
                            await frame3?.waitForXPath(`//*[@id="TABLE1"]/tbody/tr[2]/td[3]`)
                            let [propertyType]: any = await frame3?.$x(`//*[@id="TABLE1"]/tbody/tr[2]/td[3]`)
                            propertyType = await propertyType.getProperty('innerText');
                            propertyType = await propertyType.jsonValue();
                            propertyType = propertyType.trim();
                            dataFromPropertyAppraisers["Property Type"] = propertyType;
                        } catch (error) {
                            console.log('Error in property type :');
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
                    } catch (error) {
                        console.log('sales info problem : ');
                        console.log(error);
                    }
    
                }
            }

            dataFromPropertyAppraisers["County"] = this.publicRecordProducer.county;
            dataFromPropertyAppraisers["Property State"] = this.publicRecordProducer.state.toUpperCase();
            try{
                await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
            } catch(e){
                //
            }
        }




        const page = this.browserPages.propertyAppraiserPage!;

        //head to the PA website
        try {
            await page.goto('https://revco.mc-ala.org/CAPortal/CAPortal_MainPage.aspx', {
                waitUntil: 'networkidle0',
                timeout: 60000
            });
        } catch (error) {
            console.log("error  : " + error);
            console.log('couldnt head to revco.mc-ala.org retrying ... ');
            //retry for second time
            try {

                await page.goto('https://revco.mc-ala.org/CAPortal/CAPortal_MainPage.aspx', {
                    waitUntil: 'networkidle0',
                    timeout: 60000
                });
            } catch (error) {
                console.log("error  : " + error);
                return false;
            }

        }

        let document = docsToParse;
        
            if (!this.decideSearchByV2(document)) {
                return false;
            }
            
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
            } else {
                address = document.propertyId['Property Address'];
                const parseaddr = this.getAddressV2(document.propertyId);
                if(!this.isEmptyOrSpaces(parseaddr.street_address)){
                    address = parseaddr.street_address;
                }
                console.log(`Looking for address: ${document.propertyId['Property Address']}`);
            }

            //main try 
            try {
                //click on property Tax
                try {
                    await page.waitForXPath(`//*[@id="PTCInfo"]`);
                    let [propertyTaxButton] = await page.$x(`//*[@id="PTCInfo"]`);
                    await propertyTaxButton.click();
                } catch (error) {
                    console.log('Error in  propertyTaxButton:');
                    console.log(error);
                }

                //wait for frame 
                await once(page, 'framenavigated');






                //we will work with the fram not the main page
                let frame;
                try {
                    await page.waitForXPath(`//*[@id="Iframe1"]`)
                    let elementHandle = await page.$('#Iframe1');
                    frame = await elementHandle?.contentFrame();
                } catch (error) {
                    console.log('Error in getting the Iframe 1  :');
                    console.log(error);
                    return false;
                }

                //fill in the address
                try {
                    await frame?.waitForXPath(`//*[@id="SearchText"]`);
                    if(this.searchBy == 'address'){
                        await frame?.click('input#SearchByPropAddr');
                    }
                    let [searchBox]: any = await frame?.$x(`//*[@id="SearchText"]`);
                    await searchBox.click({ clickCount: 3 });
                    await searchBox.press('Backspace');
                    await searchBox.type(this.searchBy === 'name' ? owner_name : address);

                } catch (error) {
                    console.log('Error in  filling the address :');
                    console.log(error);
                    return false;
                }




                //click search by mailling address radio button
                if (this.searchBy === 'name') {
                    try {
                        await frame?.waitForXPath(`//*[@id="SearchByName"]`);
                        let [searchByNameButton]: any = await frame?.$x(`//*[@id="SearchByName"]`);
                        await searchByNameButton.click();

                    } catch (error) {
                        console.log('Error in search by name :');
                        console.log(error);
                        return false;
                    }
                }
                else {
                    try {
                        await frame?.waitForXPath(`//*[@id="SearchByPropAddr"]`);
                        let [searchByPropertyButton]: any = await frame?.$x(`//*[@id="SearchByPropAddr"]`);
                        await searchByPropertyButton.click();

                    } catch (error) {
                        console.log('Error in search by property address :');
                        console.log(error);
                        return false;
                    }
                }


                //prepare frame to be reloaded
                let iFrameLoaded;
                try {
                    iFrameLoaded = waitForIFrameLoad(page, '#Iframe1')
                } catch (error) {
                    console.log('Error in iFrame Loading  :');
                    console.log(error);
                }



                //click search 
                try {
                    await frame?.waitForXPath(`//*[@id="Search"]`);
                    let [searchButton]: any = await frame?.$x(`//*[@id="Search"]`);
                    await searchButton.click();
                } catch (error) {
                    console.log('Error in click search :');
                    console.log(error);
                }


                //wait for the frame to load
                try {
                    await iFrameLoaded;
                } catch (error) {
                    console.log('Error in iFrame Loading :');
                    console.log(error);
                }






                let [errorIndicator]: any = await frame?.$x(`//*[@id="TotalRecFound"]/*[contains(text(),'No Records Found')]`);
                if (errorIndicator) {


                    console.log('Not Found');
                    return false;


                } else {


                    try {

                        //click the address
                        try {
                            await frame?.waitForXPath(`//*[@id="BodyTable"]/tbody/tr/td/fieldset/legend/span/b/u`);
                            const ids = [];
                            let index = 0;
                            let id_handles: any = await frame?.$x(`//*[@id="BodyTable"]/tbody/tr/td/fieldset/legend/span/b/u`);
                            let name_handles: any = await frame?.$x(`//*[@id="BodyTable"]//*[contains(text(), "OWNER NAME:")]/following-sibling::td[1]`);
                            if (this.searchBy === 'name') {
                                for (const namehandle of name_handles) {
                                    const name = await frame?.evaluate(el => el.textContent.trim(), namehandle);
                                    const regexp = new RegExp(owner_name_regexp);
                                    if (regexp.exec(name.toUpperCase())) {
                                        const id = await frame?.evaluate(el => el.textContent.trim(), id_handles[index]);
                                        ids.push(id);
                                        break;
                                    }
                                    index++;
                                }
                                for (const id of ids) {
                                    let [id_handle] = (await frame?.$x(`//*[contains(text(), "${id}")]`))!;
                                    await id_handle.click();
                                    await getData(frame, document);
                                }
                            }
                            else {
                                await id_handles[0].click();
                                await getData(frame, document);
                            }
                        } catch (error) {
                            console.log('couldnt click the address ')
                            console.log(error)
                            return false;
                        }
                    } catch (error) {
                        console.log(error)
                        console.log('trying the next address..')
                    }
                }


            } catch (error) {
                console.log(error);
                return false;
            }




        // }





        return true;
    }


}