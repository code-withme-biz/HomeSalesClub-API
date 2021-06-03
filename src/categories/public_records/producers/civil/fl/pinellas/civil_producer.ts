import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
const parseAddress = require('parse-address');
const { parseFullName } = require('parse-full-name');

export default class CivilProducer extends AbstractProducer {
    browser: puppeteer.Browser | undefined;
    numberOfSavedRecords = 0;
    browserPages = {
        generalInfoPage: undefined as undefined | puppeteer.Page
    };
    urls = {
        generalInfoPage: 'https://ccmspa.pinellascounty.org/PublicAccess/default.aspx'
    }

    xpaths = {
        isPAloaded: '/html/body/table/tbody/tr[2]/td/table/tbody/tr[1]/td[2]/a[2]'
    }

    constructor(publicRecordProducer: IPublicRecordProducer) {
        // @ts-ignore
        super();
        this.publicRecordProducer = publicRecordProducer;
        this.stateToCrawl = this.publicRecordProducer?.state || '';
    }

    async init(): Promise<boolean> {
        this.browser = await this.launchBrowser();
        this.browserPages.generalInfoPage = await this.browser.newPage();
        await this.setParamsForPage(this.browserPages.generalInfoPage);
        try {
            await this.browserPages.generalInfoPage.goto(this.urls.generalInfoPage, { waitUntil: 'load' });
            return true;
        } catch (err) {
            console.warn(err);
            return false;
        }
    }





    async read(): Promise<boolean> {
        try {
            await this.browserPages.generalInfoPage?.waitForXPath(this.xpaths.isPAloaded);
            return true;
        } catch (err) {
            console.warn('Problem loading civil producer page.');
            return false;
        }
    }

    async parseAndSave(): Promise<boolean> {

        const that = this;

        //define the options that we should pick from the select
        const selectOptions = [
            'COUNTY CIVIL',
            'CIRCUIT CIVIL',
            'DELINQUENT',
            'DIVORCE',
            'FAMILY',
            'MORTGAGE',
        ]













        //get the end date based on the last saved record
        let startDate: any;
        let endDate: any;
        try {

            let dateRange = await this.getDateRange('Florida', 'Pinellas');
            startDate = this.getFormattedDate(dateRange.from);
            endDate = this.getFormattedDate(dateRange.to);
            console.log(`\n`);

        }
        catch (error) {
            console.log('Error in getting startDate :');
            console.log(error);
        }








        const self = this;



        //start the scraping
        const page = await this.browser?.newPage()!;
        for (const selectOption of selectOptions) {


            //declare the recordsPaths where all the paths will be saved 
            const recordsPaths = [];



            console.log('scraping :' + selectOption);
            await page.goto(this.urls.generalInfoPage);

            await page.waitForXPath(`/html/body/table/tbody/tr[2]/td/table/tbody/tr[1]/td[2]/a[2]`);
            let [civilLink] = await page.$x(`/html/body/table/tbody/tr[2]/td/table/tbody/tr[1]/td[2]/a[2]`);
            await civilLink.click();
            await page.waitForNavigation();


            await page.waitForXPath(`//*[@id="DateFiled"]`);
            let [dateFiled] = await page.$x(`//*[@id="DateFiled"]`);
            await dateFiled.click();


            await page.waitForXPath(`//*[@id="DateFiledOnAfter"]`);
            let [startDateInput] = await page.$x(`//*[@id="DateFiledOnAfter"]`);
            await startDateInput.click({ clickCount: 3 });
            await startDateInput.press('Backspace');
            await startDateInput.type(startDate);



            await page.waitForXPath(`//*[@id="DateFiledOnBefore"]`);
            let [endDateInput] = await page.$x(`//*[@id="DateFiledOnBefore"]`);
            await endDateInput.click({ clickCount: 3 });
            await endDateInput.press('Backspace');
            await endDateInput.type(endDate);


            await page.waitForXPath(`//*[@id='selCaseTypeGroups']/child::*`);
            let elements = await page.$x(`//*[@id='selCaseTypeGroups']/child::*`);
            for (let element of elements) {
                let elementText: any = await element.getProperty('textContent')
                elementText = await elementText.jsonValue();
                if (
                    elementText.includes(selectOption)
                ) {
                    await element.click();
                }
            }

            await page.waitForXPath(`//*[@id="SearchSubmit"]`);
            let [searchButton] = await page.$x(`//*[@id="SearchSubmit"]`);
            await searchButton.click();



            await page.waitForXPath(`/html/body/table[3]/tbody/tr[1]/td[2]/b`);
            let [recordsNumber]: any = await page.$x(`/html/body/table[3]/tbody/tr[1]/td[2]/b`);
            recordsNumber = await recordsNumber.getProperty('textContent')
            recordsNumber = await recordsNumber.jsonValue();
            recordsNumber = +recordsNumber;

            for (let index = 1; index < recordsNumber; index++) {
                await page.waitForXPath(`/html/body/table[4]/tbody/tr[${(index + 2)}]/td[1]/a`);
                let [recordPath]: any = await page.$x(`/html/body/table[4]/tbody/tr[${(index + 2)}]/td[1]/a`);
                recordPath = await recordPath.getProperty('href')
                recordPath = await recordPath.jsonValue();
                recordsPaths.push(recordPath)
            }
            //revers array to start saving from the old date to the new ones 
            await scrapRecordsPaths(recordsPaths.reverse());

        }
        console.log(`finished scraping all options !`)







        //////////////////////////////////////////////////////////////////////
        //This function takes an array of paths and scraps the data from them
        /////////////////////////////////////////////////////////////////////
        async function scrapRecordsPaths(recordsPaths: any) {
            

                const docToSave = {
                    "Property Address": '',
                    "Property City": '',
                    "Property State": '',
                    "County": "pinellas",
                    "Property Zip": '',
                    "First Name": "",
                    "Last Name": "",
                    "Middle Name": "",
                    "Name Suffix": "",
                    "Full Name": "",
                    "practiceType": "",
                    "vacancyProcessed": false,
                    "fillingDate": "",
                    "productId": null,
                    'caseUniqueId': "",
                    originalDocType:''
                }

                console.log('we found : ' + recordsPaths.length + " records to scrap")
                for (const recordsPath of recordsPaths) {
                    //case Id is the id that we get from the url, since we cant have two cases with the same url,
                    //we can consider the case id is enough to know if a case was already saved or not
                    let caseId = recordsPath.split("CaseID=")[1];

                    //open the record page 
                    let loadingChances = 4;
                    let loadingAttempte = 1;
                    let pageLoaded = false;
                    while (loadingAttempte <= loadingChances && pageLoaded == false) {
                        try {
                            await page.goto(recordsPath, { waitUntil: 'load', timeout: 2 * 60 * 1000 });
                            await page.waitForXPath(`/html/body/p/a/img`);
                            pageLoaded = true;
                        }
                        catch (error) {
                            console.log('retrying...')
                            await page.waitFor(loadingAttempte * 60 * 1000);
                            loadingAttempte++;
                        }
                    }
                    if (pageLoaded == false) {
                        console.log('This record page wouldnt open in 4 retries, skipping this record... ');
                        continue;
                    }
                    let [userExist] = await page.$x(`//*[(contains(text(),'DEFENDANT') or contains(text(),'APPELLANT') or contains(text(),'RESPONDENT') ) and @class='ssTableHeader']`);
                    if (!userExist) {
                        console.log('No APPELLANT or DEFENDANT found for this case ')
                        console.log('\n')
                        continue;
                    }
                    let [defendant]: any = await page.$x(`//*[contains(text(),'DEFENDANT') or contains(text(),'APPELLANT') or contains(text(),'RESPONDENT') ]/following-sibling::*`);
                    if (defendant) {
                        defendant = await defendant.getProperty('textContent')
                        defendant = await defendant.jsonValue();
                        defendant = defendant.trim();
                        if(defendant.match(/unknown/i) || defendant.match(/also known/i)){
                            continue;
                        }
                        //save name 
                        try {
                            let nameSeparated: any = self.newParseName(defendant);
                            if(nameSeparated.type && nameSeparated.type == 'COMPANY'){
                                continue;
                            }
                            // console.log(nameSeparated.fullName)
                            docToSave["Full Name"] = nameSeparated.fullName;
                            docToSave["First Name"] = nameSeparated.firstName;
                            docToSave["Last Name"] = nameSeparated.lastName;
                            docToSave["Middle Name"] = nameSeparated.middleName;
                            docToSave["Name Suffix"] = nameSeparated.suffix;
                        } catch (error) {
                            continue;
                        }
                    } else {
                        console.log(`no name found`)
                    }


                    let [propertyAddress]: any = await page.$x(`//*[contains(text(),'DEFENDANT') or contains(text(),'APPELLANT') or contains(text(),'RESPONDENT') ]/parent::*/following-sibling::tr[1]/td`);
                    if (propertyAddress) {
                        propertyAddress = await propertyAddress.getProperty('textContent')
                        propertyAddress = await propertyAddress.jsonValue();
                        propertyAddress = propertyAddress.trim();


                        //add address 
                        if (propertyAddress && propertyAddress.trim() != '') {
                            propertyAddress = propertyAddress.replace(/(\r\n|\n|\r)/gm, " ")
                            docToSave["Property Address"] = propertyAddress.split(/\s\s/)[0];
                            //add mailing city, state and zip
                            let propertyAddress_separated = parseAddress.parseLocation(propertyAddress);
                            if (propertyAddress_separated.city) {
                                docToSave["Property City"] = propertyAddress_separated.city;
                            }
                            if (propertyAddress_separated.state) {
                                docToSave["Property State"] = propertyAddress_separated.state;
                            }
                            if (propertyAddress_separated.zip) {
                                docToSave["Property Zip"] = propertyAddress_separated.zip;
                            }
                        }


                    } else {
                        console.log(`No address Found`)
                    }


                    let [caseType]: any = await page.$x(`//*[contains(text(),'Case Type')]/following-sibling::*`);
                    if (caseType) {
                        caseType = await caseType.getProperty('textContent')
                        caseType = await caseType.jsonValue();
                        //add practice type
                        docToSave["practiceType"] = self.getPracticeType(caseType);
                        docToSave.originalDocType = caseType;
                    } else {
                        console.log(`No case type, goes to debt`)
                        //add practice type
                        docToSave["practiceType"] = "debt";
                    }




                    //add product ID
                    try {
                        const productName = `/${self.publicRecordProducer.state.toLowerCase()}/${self.publicRecordProducer.county}/${docToSave["practiceType"]}`;
                        const prod = await db.models.Product.findOne({ name: productName }).exec();
                        docToSave["productId"] = prod._id;
                    }
                    catch (error) {
                        console.log('Error in productId :');
                        console.log(error);
                    }


                    let [fillingDate]: any = await page.$x(`//*[contains(text(),'Date Filed')]/following-sibling::*`);
                    if (fillingDate) {
                        fillingDate = await fillingDate.getProperty('textContent')
                        fillingDate = await fillingDate.jsonValue();
                        //add fillingDate
                        docToSave.fillingDate = fillingDate;
                    } else {
                        console.log(`No fillingDate`)
                    }


                    //get the unique case Id
                    try {
                        let caseUniqueId: any = await page.url();
                        caseUniqueId = caseUniqueId.split("CaseID=")[1];
                        if (caseUniqueId) {
                            docToSave.caseUniqueId = caseUniqueId;
                        } else {
                            console.log(`No caseUniqueId`)
                            continue;
                        }
                    }
                    catch (error) {
                        console.log('Error in unique case Id:');
                        console.log(error);
                        continue;

                    }
                    console.log('\n')

                    if (await self.civilAndLienSaveToNewSchema(docToSave))
                        that.numberOfSavedRecords++;

                }
        }
        
        //send the number of saved records in a notification
        await AbstractProducer.sendMessage("Pinellas", "Florida", this.numberOfSavedRecords, "Civil");

        await this.browser?.close();
        return true;
    }
}