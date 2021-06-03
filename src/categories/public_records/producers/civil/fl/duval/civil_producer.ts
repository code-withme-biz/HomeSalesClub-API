import axios from 'axios';
import https from 'https';
import xml2js from 'xml2js';

const AdmZip = require('adm-zip');

import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';

const credentials = {
  loginId: "aborelllaw",
  password: "GsBMJv1b"
}

export default class CivilProducer extends AbstractProducer {
  totalOfSavedRecords = 0;
  browser: puppeteer.Browser | undefined;
  browserPages = {
    generalInfoPage: undefined as undefined | puppeteer.Page
  };
  urls = {
    generalInfoPage: 'https://ftp.duvalclerk.com/'
  }

  xpaths = {
    isPAloaded: '//*[@id="btn-LoginButton"]'
  }

  constructor(publicRecordProducer: IPublicRecordProducer) {
    // @ts-ignore
    super();
    this.publicRecordProducer = publicRecordProducer;
    this.stateToCrawl = this.publicRecordProducer?.state || '';
  }

  // //check if date is not older than one month
  // isDateGreaterThanLastMonth = (dateTocheck: any) => {
  //   let dateTocheckObj = new Date(dateTocheck);
  //   let lastMonth = new Date();
  //   lastMonth.setMonth(lastMonth.getMonth() - 1);
  //   if (dateTocheckObj > lastMonth) {
  //     return true;
  //   }
  //   return false;
  // 

  // To check if the data already populated        
  checkIfCaseWasAlreadyProcessed = async (county: any, fullName: any, caseUniqueId: any) => {
    const data = await db.models.Owner.findOne(
      { County: county, "Full Name": fullName, caseUniqueId: caseUniqueId }
    ).exec();
    if (data) {
      return true;
    }
    return false;
  }

  // this function Parse The date from the file name 
  getTheDateFromFileName = (fileName: any) => {
    let fullDate = fileName.split('-')[1].replace('.zip', "");
    let year = fullDate.substring(0, 4);
    let month = fullDate.substring(4, 6);
    let day = fullDate.substring(6, 8);
    let formattedDate = year + '/' + month + '/' + day;
    return formattedDate;
  }


  // this function check if a file was already processed or not
  checkIfFileAlreadyProcessed = async (filename: any) => {
    let fileDate = this.getTheDateFromFileName(filename);
    const data = await db.models.Property.findOne({ County: 'duval', fillingDate: fileDate }).exec();
    if (data) {
      return true;
    }
    return false;

  }


  parseTheCasesAndStoreThem = async (jsonContent: any, fillingDate: any) => {
    console.log('processing date : ' + fillingDate);

    if (!jsonContent.hasOwnProperty('Cases') || !jsonContent.Cases.hasOwnProperty('Case') || !Array.isArray(jsonContent.Cases.Case)) {
      console.log('Empty XML. Skipping.');
      return;
    }

    let countDocsSaved = 0;
    //loop through cases and add them to the document 
    for (let Case of jsonContent.Cases.Case) {

      let practiceType = this.getPracticeType(Case.CaseTypeDescription[0])
      if (Case.Party) {

        for (let Party of Case.Party) {

          if (
            (Party.PartyTypeDescription && Party.PartyTypeDescription[0] == 'DEFENDANT') ||
            (Party.PartyTypeDescription1 && Party.PartyTypeDescription1[0] == 'DEFENDANT') ||
            (Party.PartyTypeDescription1 && Party.PartyTypeDescription[0] == 'RESPONDENT') ||
            (Party.PartyTypeDescription1 && Party.PartyTypeDescription1[0] == 'RESPONDENT')
          ) {

            try {
              let fullName = Party.FirstName[0] + " " + Party.MiddleName[0] + " " + Party.LastName[0];
              let parseName: any = this.newParseName(fullName);
              if(parseName.type && parseName.type == 'COMPANY'){
                continue;
              }
              let address = Party.PartyAddress1[0] + Party.PartyAddress2[0];

              //check if exists 
              let alreadyProcessed = await this.checkIfCaseWasAlreadyProcessed('duval', fullName, Case.CaseID[0]);
              if (alreadyProcessed) {
                continue;
              }

              const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
              const prod = await db.models.Product.findOne({ name: productName }).exec();
              
              const ownerObj = {
                "Property Address": address,
                "Property City": Party.PartyCity[0],
                "Property Zip": Party.PartyZip[0],
                'Property State': this.publicRecordProducer.state,
                'County': this.publicRecordProducer.county,
                "First Name": Party.FirstName[0],
                "Last Name": Party.LastName[0],
                "Middle Name": Party.MiddleName[0],
                "Name Suffix": Party.NameSuffixCode[0],
                "Full Name": fullName,
                "practiceType": practiceType,
                "vacancyProcessed": false,
                "fillingDate": fillingDate,
                "productId": prod._id,
                'caseUniqueId': Case.CaseID[0],
                originalDocType: Case.CaseTypeDescription[0]
              }
              if(await this.civilAndLienSaveToNewSchema(ownerObj)){
                countDocsSaved++;
              }
            } catch (error) {
              console.log('Error:');
              console.log(error);
            }
          }
        }
      }
    }
    console.log(countDocsSaved + ' docs saved.')
    this.totalOfSavedRecords = this.totalOfSavedRecords + countDocsSaved;
    console.log("records saved so far : " + this.totalOfSavedRecords);
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

  // This is main function
  async parseAndSave(): Promise<boolean> {

    try {
      const loginPage = await this.browser?.newPage()!;
      await this.setParamsForPage(loginPage);
      await loginPage.goto('https://ftp.duvalclerk.com/', { waitUntil: 'load' });
      await loginPage.waitForXPath('//*[@id="btn-LoginButton"]');

      let userHandle = await loginPage.$x('//*[@id="user-box-text"]');
      let passHandle = await loginPage.$x('//*[@id="pword-box-text"]');
      let submitHandle = await loginPage.$x('//*[@id="btn-LoginButton"]');

      await userHandle[0].click();
      await userHandle[0].type(credentials.loginId, { delay: 173 });

      await passHandle[0].click();
      await passHandle[0].type(credentials.password, { delay: 148 })
      await Promise.all([
        loginPage.waitForNavigation({ waitUntil: 'load', timeout: 60000 }),
        submitHandle[0].click()
      ]);

      const pathsPage = await this.browser?.newPage()!;
      await this.setParamsForPage(pathsPage);
      await pathsPage.goto('https://ftp.duvalclerk.com/Web%20Client/ListError.xml?Command=List&Dir=%2FCivil%20Data%20Daily', { waitUntil: 'load' });

      const cookies = await loginPage.cookies();
      let cookieHeader = ''
      for (let c of cookies) {
        cookieHeader += `${c.name}=${c.value}; `;
      }
      const httpsAgent = new https.Agent({ rejectUnauthorized: false });

      const allPathHandles = await pathsPage.$x('//FilePath');
      for (let pathHandle of allPathHandles) {
        let urlAdd = await pathHandle.evaluate(elem => elem.textContent);
        let alreadyProcessed = await this.checkIfFileAlreadyProcessed(urlAdd);
        //check if this file was already processed or not
        if (alreadyProcessed) {
          continue;
        }

        let dlPageUrl = 'https://ftp.duvalclerk.com/?Command=Download&File=' + urlAdd;
        const axiosResp = await axios.get(dlPageUrl, { headers: { 'cookie': cookieHeader }, timeout: 90000, httpsAgent: httpsAgent, responseType: 'arraybuffer' });
        if (axiosResp.status !== 200) {
          continue;
        }

        let zip = new AdmZip(axiosResp.data);
        let zipEntries = zip.getEntries();
        // loop through the files that we got from unziping the downloaded file
        for (const entry of zipEntries) {
          //get the xml file from the unziped files
          if (entry.entryName.includes('.xml')) {
            let fillingDate = this.getTheDateFromFileName(entry.entryName);

            //transform the xml content of the file to json
            // let jsonContent = await parseXmlToJson(zip.readAsText(entry));
            let parser = new xml2js.Parser();
            let jsonContent = await parser.parseStringPromise(zip.readAsText(entry))

            //grab the cases from the json and store them
            await this.parseTheCasesAndStoreThem(jsonContent, fillingDate);
          }
        }

        await pathsPage.waitFor(863);
      }
    }
    catch (error) {
      console.log('Error in  :');
      console.log(error);
      await AbstractProducer.sendMessage("Duval", "Florida", this.totalOfSavedRecords, "Civil");
      return false;

    }
    //send the number of saved records in a notification
    await AbstractProducer.sendMessage("Duval", "Florida", this.totalOfSavedRecords, "Civil");

    console.log('Scraping Finished successfully ')
    return true;

  }
}