import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import puppeteer from 'puppeteer';
import Papa from 'papaparse';
import axios from 'axios';
import fs from 'fs';
import db from '../../../../../../models/db';

export default class CivilProducer extends AbstractProducer {
  browser: puppeteer.Browser | undefined;
  browserPages = {
    generalInfoPage: undefined as undefined | puppeteer.Page
  };
  urls = {
    generalInfoPage: 'https://publicrec.hillsclerk.com/Civil/dailyfilings/'
  }

  xpaths = {
    isPAloaded: '//h1[contains(.,"dailyfilings")]'
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

  discriminateAndRemove(name: string): any {
    const companyIdentifiersArray = ['GENERAL', 'TRUSTEE', 'TRUSTEES', 'INC', 'ORGANIZATION', 'CORP', 'CORPORATION', 'LLC', 'MOTORS', 'BANK', 'UNITED', 'CO', 'COMPANY', 'FEDERAL', 'MUTUAL', 'ASSOC', 'AGENCY', 'OF', 'SECRETARY', 'DEVELOPMENT', 'INVESTMENTS', 'HOLDINGS', 'ESTATE', 'LLP', 'LP', 'TRUST', 'LOAN', 'CONDOMINIUM', 'CHURCH', 'CITY', 'CATHOLIC', 'D/B/A', 'COCA COLA', 'LTD', 'CLINIC', 'TODAY', 'PAY', 'CLEANING', 'COSMETIC', 'CLEANERS', 'FURNITURE', 'DECOR', 'FRIDAY HOMES', 'SAVINGS', 'PROPERTY', 'PROTECTION', 'ASSET', 'SERVICES', 'L L C', 'NATIONAL', 'ASSOCIATION', 'MANAGEMENT', 'PARAGON', 'MORTGAGE', 'CHOICE', 'PROPERTIES', 'J T C', 'RESIDENTIAL', 'OPPORTUNITIES', 'FUND', 'LEGACY', 'SERIES', 'HOMES', 'LOAN'];
    const removeFromNamesArray = ['ET', 'AS', 'DECEASED', 'DCSD', 'CP\/RS', 'JT\/RS', 'esq', 'esquire', 'jr', 'jnr', 'sr', 'snr', '2', 'ii', 'iii', 'iv', 'md', 'phd', 'j.d.', 'll.m.', 'm.d.', 'd.o.', 'd.c.', 'p.c.', 'ph.d.', '&'];
    const companyRegexString = `\\b(?:${companyIdentifiersArray.join('|')})\\b`;
    const removeFromNameRegexString = `^(.*?)\\b(?:${removeFromNamesArray.join('|')})\\b.*?$`;
    const companyRegex = new RegExp(companyRegexString, 'i');
    const removeFromNamesRegex = new RegExp(removeFromNameRegexString, 'i');
    let isCompanyName = name.match(companyRegex);
    if (isCompanyName) {
      return {
        type: 'company',
        name: name
      }
    }

    let cleanName = name.match(removeFromNamesRegex);
    if (cleanName) {
      name = cleanName[1];
    }
    return {
      type: 'person',
      name: name
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

  // To check empty or space
  isEmptyOrSpaces(str: string) {
    return str === null || str.match(/^\s*$/) !== null;
  }

  getSuffix(name: string): any {
    const suffixList = ['esq', 'esquire', 'jr', 'jnr', 'sr', 'snr', '2', 'ii', 'iii', 'iv', 'md', 'phd', 'j.d.', 'll.m.', 'm.d.', 'd.o.', 'd.c.', 'p.c.', 'ph.d.'];
    name = name.toLowerCase();
    for (let suffix of suffixList) {
      let regex = new RegExp(' ' + suffix, 'gm');
      if (name.match(regex)) {
        return suffix;
      }
    }
    return '';
  }

  async getCsvWithAxios(csvUrl: string) {
    const axiosRes = await axios.get(csvUrl);
    if (axiosRes) {
      return Papa.parse(axiosRes.data, { header: true, skipEmptyLines: true });
    }
    return null;
  }

  // Parse file and save to the DB
  async parseJsonAndSave(jsonResData: any, civilDataFillingDate: string) {
    let count = 0;
    for (let row of jsonResData) {
      let partyType = row['PartyType'];
      try {
        let allowedPartyType = false;
        if (partyType.match(/defendant/i) || partyType.match(/respondent/i)) {
          allowedPartyType = true;
        }
        if (!allowedPartyType) {
          continue;
        }
      } catch {
        continue;
      }
      let caseType = row['CaseTypeDescription'];
      let practiceType = this.getPracticeType(caseType);
      let firstName = row['FirstName'];
      let middleName = row['MiddleName'];
      let lastName = row['LastName/CompanyName'];
      let suffixName = this.getSuffix(lastName);
      let nameDiscriminator = this.discriminateAndRemove(lastName);
      let fullName;
      if (nameDiscriminator.type == 'company') {
        if(!nameDiscriminator.name.match(/llc/i) || !nameDiscriminator.name.match(/l l c/i)){
          continue;
        }
        firstName = '';
        middleName = '';
        lastName = '';
        suffixName = '';
        fullName = nameDiscriminator.name;
      } else {
        lastName = nameDiscriminator.name;
        fullName = nameDiscriminator.name + ' ' + firstName + ' ' + middleName;
      }
      let partyAddress = row['PartyAddress'];
      let propertyZip = '';
      let propertyState = '';
      let propertyCity = '';
      let propertyAddress = '';

      if (!this.isEmptyOrSpaces(partyAddress)) {
        let addressArray = partyAddress.split(",");
        let propertyStateAndZip = addressArray.pop().trim();
        let propertyStateAndZipArray = propertyStateAndZip.split(/\s+/);
        propertyZip = propertyStateAndZipArray.pop();
        propertyZip = propertyZip ? propertyZip : '';
        propertyState = propertyStateAndZipArray.pop();
        propertyState = propertyState ? propertyState : '';
        propertyCity = addressArray.pop();
        propertyCity = propertyCity ? propertyCity : '';
        propertyAddress = addressArray.pop();
        propertyAddress = propertyAddress ? propertyAddress : '';
      }
      if (propertyAddress.match(/unknown/i)) {
        propertyAddress = '';
      }
      if (propertyCity.match(/unknown/i)) {
        propertyCity = '';
      }
      if (propertyState.match(/unknown/i)) {
        propertyState = '';
      }
      if (propertyZip.match(/unknown/i)) {
        propertyZip = '';
      }

      const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
      console.log(productName);
      const prod = await db.models.Product.findOne({ name: productName }).exec();

      const obj = {
        "First Name": firstName,
        "Last Name": lastName.replace(",", "").trim(),
        "Middle Name": middleName,
        "Name Suffix": suffixName,
        "Full Name": fullName.trim(),
        'Property State': this.publicRecordProducer.state,
        'County': this.publicRecordProducer.county,
        "practiceType": practiceType,
        "vacancyProcessed": false,
        "fillingDate": civilDataFillingDate,
        "productId": prod._id,
        originalDocType: caseType,
        "Property Address": propertyAddress.trim(),
        "Property City": propertyCity.trim(),
        "Property Zip": propertyZip.trim(),
      }
      if(await this.civilAndLienSaveToNewSchema(obj)){
        count += 1;
      }
    }
    return count;
  }

  // This is main function
  async parseAndSave(): Promise<boolean> {
    const civilDomain: string = 'https://publicrec.hillsclerk.com';
    const civilUrl: string = 'https://publicrec.hillsclerk.com/Civil/dailyfilings/';

    let countRecords = 0;
    try{
      let reqCivil = await axios.get(civilUrl);
      let sourceCivil = reqCivil.data;
      let civilDataUrlPattern = /<A HREF="(.*?)"/g;
      let civilDataUrls = [];
      let m;
      while ((m = civilDataUrlPattern.exec(sourceCivil)) !== null) {
        // This is necessary to avoid infinite loops with zero-width matches
        if (m.index === civilDataUrlPattern.lastIndex) {
          civilDataUrlPattern.lastIndex++;
        }
        if (m[1].includes('dailyfilings')) {
          civilDataUrls.push(m[1]);
        }
      }
      for (let civilDataUrl of civilDataUrls) {
        civilDataUrl = civilDomain + civilDataUrl;
        console.log("Processing with pipe =>", civilDataUrl);
        let civilDataFileName = civilDataUrl.split('/').pop()!;
        let civilDataFillingDate = civilDataFileName.split('_').pop()!.replace('.csv', '');
        const jsonRes = await this.getCsvWithAxios(civilDataUrl); // Get the json without downloading
        if (jsonRes) {
          const result = await this.parseJsonAndSave(jsonRes.data, civilDataFillingDate); // Parse the json and save to the DB
          if (!result) {
            console.log(civilDataFillingDate, "=> This date already populated!");
          } else {
            countRecords += result;
          }
        }
      }
      
      await AbstractProducer.sendMessage('Hillsborough', 'Florida', countRecords, 'Civil');
      return true;
    } catch (e){
      console.log(e);
      await AbstractProducer.sendMessage('Hillsborough', 'Florida', countRecords, 'Civil');
      return false;
    }
  }
}