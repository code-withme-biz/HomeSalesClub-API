import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
const parseAddress = require('parse-address');
const { parseFullName } = require('parse-full-name');
import { config as CONFIG } from '../../../../../../config';
import { IConfigEnv } from '../../../../../../iconfig';
import { load } from 'dotenv/types';

const config: IConfigEnv = CONFIG[process.env.NODE_ENV || 'production'];

export default class CivilProducer extends AbstractProducer {
    browser: puppeteer.Browser | undefined;
    browserPages = {
        generalInfoPage: undefined as undefined | puppeteer.Page,
    };
    urls = {
        generalInfoPage: 'https://www.alachuacounty.us/depts/clerk/publicrecords/pages/officialrecords.aspx'
    }

    xpaths = {
        isPAloaded: '/html/body'
    }

    page: any;
    numberOfSavedRecords = 0;

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


    async launchBrowser(): Promise<puppeteer.Browser> {
        return await puppeteer.launch({
            headless: config.puppeteer_headless,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            ignoreDefaultArgs: ['--disable-extensions'],
            timeout: 60000,
            defaultViewport: null,

        });
    }



    async read(): Promise<boolean> {
        try {
            await this.browserPages.generalInfoPage?.waitForXPath(this.xpaths.isPAloaded);
            return true;
        } catch (err) {
            console.warn('Problem loading civil producer this.page.');
            return false;
        }
    }


    ///////////////////////////////////////////////////////////////////////
    // scrap Current Page        
    ///////////////////////////////////////////////////////////////////////
    async scrapCurrentPage() {
        //loop through the records
        for (let rowNumber = 0; rowNumber < 28; rowNumber++) {
            const currentRow = await this.page.$x(`//*[@id="ctl00_ctl00_cphNoMargin_cphNoMargin_g_G1_ctl00_it4_${rowNumber}_Label1"]`);
            if (currentRow[0]) {
                let chancesLeft = 6;
                let recordOpened = false;
                while (!recordOpened && chancesLeft > 0) {
                    //open record
                    try {
                        // await this.page.waitFor(2 * 1000);
                        await currentRow[0].click();

                        await this.page.waitForXPath(`//*[@id="ctl00_cphNoMargin_f_oprTab_tmpl0_Label11"]`);
                        recordOpened = true;
                    }
                    catch (error) {
                        //wait for 5 seconds and retry
                        console.log('retrying to open the record');
                        await this.page.reload();
                        chancesLeft--;
                        await this.page.waitFor(10 * 1000);

                    }
                }

                if (recordOpened) {
                    await this.scrapCurrentRecord();
                    // await this.page.waitFor(7*1000)

                    await this.page.goBack();
                }

            }


        }
    }

    ///////////////////////////////////////////////////////////////////////
    // scrap Current Record     
    ///////////////////////////////////////////////////////////////////////
    async scrapCurrentRecord() {

        //get the filling date
        let [fillingDate]: any = await this.page.$x(`//*[@id="ctl00_cphNoMargin_f_oprTab_tmpl0_documentInfoList_ctl00_DataLabel3"]`);
        if (fillingDate) {
            fillingDate = await fillingDate.getProperty('innerText');
            fillingDate = await fillingDate.jsonValue();
        }
        else {
            return;
        }
        //If no text found in the date place holder return
        if (!fillingDate) {
            return;
        }

        //get the document type 
        let [documentType]: any = await this.page.$x(`//*[@id="ctl00_cphNoMargin_f_oprTab_tmpl0_documentInfoList_ctl00_Datalabel2"]`);
        if (documentType) {
            documentType = await documentType.getProperty('innerText');
            documentType = await documentType.jsonValue();
        }
        else {
            documentType = "";
        }
        //get the case Id 

        let [caseId]: any = await this.page.$x(`//*[@id="ctl00_cphNoMargin_f_oprTab_tmpl0_documentInfoList_ctl00_txtInstrumentNo"]`);
        if (caseId) {
            caseId = await caseId.getProperty('innerText');
            caseId = await caseId.jsonValue();
        }
        else {
            caseId = "";
        }

        //get the persons names
        let partiesToScrap = [
            'Grantee',
            'Grantor',
            'Direct Party',
            // 'Indirect Party'
        ];
        for (const paryType of partiesToScrap) {
            let numberOfPersonsInCurrentPartyType = (await this.page.$x(`//*[contains(text(),'${paryType}')]/parent::td/parent::tr/following-sibling::tr[1]/td/table/tbody/tr`));
            for (let currentPersonNumber = 1; currentPersonNumber <= numberOfPersonsInCurrentPartyType.length; currentPersonNumber++) {
                let [currentPerson]: any = await this.page.$x(`//*[contains(text(),'${paryType}')]/parent::td/parent::tr/following-sibling::tr[1]/td/table/tbody/tr[${currentPersonNumber}]/td[3]`);
                if (currentPerson) {
                    currentPerson = await currentPerson.getProperty('innerText');
                    currentPerson = await currentPerson.jsonValue();
                    currentPerson = currentPerson.replace(/\s\s+/g, ' ');
                } else {
                    currentPerson = '';
                }
                await this.saveRecord(currentPerson, fillingDate, documentType, caseId);
            }
        }
    }

    ///////////////////////////////////////////////////////////////////////
    // save Record   
    ///////////////////////////////////////////////////////////////////////
    async saveRecord(fullName: string, fillingDate: string, documentType: string, caseId: string) {

        let parserName: any = this.newParseName(fullName);
        if(parserName.type && parserName.type == 'COMPANY'){
            return;
        }

        let normalizedFillingDate: any = new Date(fillingDate.split(' ')[0]);
        if (String(normalizedFillingDate) !== "Invalid Date" && this.getFormattedDate(normalizedFillingDate)) {
            fillingDate = this.getFormattedDate(normalizedFillingDate).toString();
        }
        //get the practice type
        let practiceType: any;
        try {
            practiceType = this.getPracticeType(documentType);
        }
        catch (error) {
            console.log('Error in  :');
            console.log(error);
        }

        //get the product ID
        let productId: any;
        try {
            const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
            console.log(productName);
            const prod = await db.models.Product.findOne({ name: productName }).exec();
            productId = prod._id;
        }
        catch (error) {
            console.log('Error in productId :');
            console.log(error);
        }

        const docToSave = {
            "Full Name": parserName.fullName,
            "First Name": parserName.firstName,
            "Last Name": parserName.lastName,
            "Middle Name": parserName.middleName,
            "Name Suffix": parserName.suffix,
            "fillingDate": fillingDate,
            "productId": productId,
            "practiceType": practiceType,
            "vacancyProcessed": false,
            'caseUniqueId': caseId,
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            originalDocType: documentType
        }

        //save record
        try {
            if(await this.civilAndLienSaveToNewSchema(docToSave)){
                this.numberOfSavedRecords++;
            }
            console.log('New record saved !');
        }
        catch (error) {
            console.log('Error in saving the record :');
            console.log(error);
        }
    }

    ///////////////////////////////////////////////////////////////////////
    // Main Function   
    ///////////////////////////////////////////////////////////////////////
    async parseAndSave(): Promise<boolean> {

        try{
            let startDate: any;
            let endDate: any;
            try {
                let dateRange = await this.getDateRange('Florida', 'Alachua');
                startDate = this.getFormattedDate(dateRange.from);
                endDate = this.getFormattedDate(dateRange.to);
            }
            catch (error) {
                console.log('Error in getting startDate :');
                console.log(error);
                return false;
            }

            //new page
            this.page = await this.browser?.newPage()!;

            //set default timout to 40 sec
            this.page.setDefaultTimeout(40 * 1000);

            //visit the home page
            await this.page.goto(`https://www.alachuacounty.us/depts/clerk/publicrecords/pages/officialrecords.aspx`);
            await this.page.waitForXPath(`//*[contains(text(),'Official Records Search')]`);

            //click Official Records Search
            let [officialRecordsSearchButton] = await this.page.$x(`//*[contains(text(),'Official Records Search')]`)
            await officialRecordsSearchButton.click();

            //click I accept
            await this.page.waitForXPath(`//span[contains(text(),'I Accept')]`);
            let [IAcceptButton] = await this.page.$x(`//span[contains(text(),'I Accept')]`)
            await IAcceptButton.click();
            await this.page.waitFor(10 * 1000);

            //fill in the start date
            await this.page.waitForXPath(`//*[@id="cphNoMargin_f_ddcDateFiledFrom"]/tbody/tr/td[1]/input`);
            let [startDateInput] = await this.page.$x(`//*[@id="cphNoMargin_f_ddcDateFiledFrom"]/tbody/tr/td[1]/input`)
            await startDateInput.click();
            await startDateInput.type(startDate);

            //fill in the end date
            await this.page.waitForXPath(`//*[@id="cphNoMargin_f_ddcDateFiledTo"]/tbody/tr/td[1]/input`);
            let [endDateInput] = await this.page.$x(`//*[@id="cphNoMargin_f_ddcDateFiledTo"]/tbody/tr/td[1]/input`)
            await endDateInput.click();
            await endDateInput.type(endDate);

            let optionText = ['DEED', 'LIEN', 'LIS PENDENS', 'MORTGAGE', 'PROBATE', 'MARRIAGE', 'EASEMENT', 'JUDGMENT'];
            for(const option of optionText){
                let optionHandle = await this.page.$x('//label[contains(text(), "'+option+'")]');
                await optionHandle[0].click();
                await this.sleep(500);
            }

            //click Search 
            await this.page.waitForXPath(`//*[@id="cphNoMargin_SearchButtons2_btnSearch__5"]`);
            let [searchButton] = await this.page.$x(`//*[@id="cphNoMargin_SearchButtons2_btnSearch__5"]`)
            await searchButton.click();

            //wait for page to load 
            console.log('waiting for page to load');
            await this.page.waitForXPath(`//*[@id="cphNoMargin_cphNoMargin_OptionsBar1_ItemList"]`);

            //order records by date ascending 
            console.log('ordering date of records in an ascending order...')
            await this.page.select('#cphNoMargin_cphNoMargin_OptionsBar1_ddlSortColumns', 'DATE_RECEIVED ASC')

            //wait for sort to apply
            try {
                await this.page.waitForXPath(`//*[@id="ctl00_ctl00_cphNoMargin_cphNoMargin_g_G1_ctl00_it4_0_Label1"]`);
            }
            catch (error) {
                console.log('Error in  :');
                console.log(error);
            }

            //get the number of the available pages
            let pagesNumber = (await this.page.$x(`//*[@id="cphNoMargin_cphNoMargin_OptionsBar1_ItemList"]/option`)).length;
            for (let currentPageNumber = 1; currentPageNumber <= pagesNumber; currentPageNumber++) {
                //select page
                await this.page.waitForXPath(`//*[@id="cphNoMargin_cphNoMargin_OptionsBar1_ItemList"]`);
                await this.page.select('#cphNoMargin_cphNoMargin_OptionsBar1_ItemList', currentPageNumber.toString());
                await this.page.waitForXPath(`//*[@id="Header1_menuMsg"]`);
                await this.page.waitFor(10 * 1000);
                await this.scrapCurrentPage();
            }

            //send the number of saved records in a notification
            await AbstractProducer.sendMessage("alachua", "florida", this.numberOfSavedRecords, 'Civil');

            //end
            console.log('scraper finished, number of saved Records is : ' + this.numberOfSavedRecords);
            await this.browser?.close();

            return true;
        } catch(error){
            console.log(error);
            await AbstractProducer.sendMessage("alachua", "florida", this.numberOfSavedRecords, 'Civil');
            return false;
        }
    }
}