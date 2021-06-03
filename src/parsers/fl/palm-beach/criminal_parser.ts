import AbstractParser from '../../abstract_parser'
import { IPublicRecordProducer } from '../../../models/public_record_producer'
const fs = require('fs');
import db from "../../../models/db";
import { PracticeTypes } from '../../interfaces_parser';

export default class CriminalParser extends AbstractParser {
  protected count: number
  protected publicProducer: IPublicRecordProducer
  protected productId: any
  protected type: string

  constructor(publicRecordProducer: IPublicRecordProducer, productId: any) {
    super()
    this.count = 0
    this.publicProducer = publicRecordProducer
    this.productId = productId
    this.type = '';
  }

  public getDelimiter(): string {
    return ","
  }

  public getHeaders(fileName: string): string[] {
    if (
      fileName.match(/^Criminal Data .+xlsx$/)
    ) {
      return this.getCriminalHeaders();
    } else if (
      fileName.match(/^Criminal Data .+csv$/)
    ) {
      return this.getFelonyAndTrafficHeaders();
    } else {
      return [];
    }
  }

  public getCriminalHeaders() : string[] {
    this.type = 'Criminal';
    return [
      'partyLastName',
      'partyFirstName', 
      'partyMiddleName',
      'JRSR',
      'DOB',
      'race',
      '',
      'sex',
      'caseNumber',
      'fillingDate',
      'Statute',
      'charge',
      'dispositionDescription',
      'dispositionDate',
      'sentMonths',
      'sentDays',
      'sentYears',
      'probMonths',
      'probDays',
      'probYears',
      'chrgSeq',
      'partyAddress1',
      'partyCity',
      'partyState', 
      'partyZip'
    ]
  }
  
  public getFelonyAndTrafficHeaders() : string[] {
    this.type = "FelonyAndTraffic";
    return [
      'partyFullName',
      'DOB',
      'dlNum',
      'dlState',
      'partyAddress1',
      'partyCity',
      'partyState',
      'partyZip',
      'caseNumber',
      'partyType',
      'citiationNum',
      'chargeFileDate',
      'chargeCount',
      'statute',
      'chargeDesc',
      'nextCourtEvtDate',
      'nextCourtEvtDesc',
      'dispositionDate',
      'dispositionDescription'
    ]
  }

  public async parse(caseGroup: [{[ key: string]: any}] ): Promise<boolean> {
    let skipHeader = true;
    for(const group of caseGroup) {
      const items = group[1];
      const dfs = items
      if (this.type == 'Criminal') {
        await this.parseCriminal(dfs);
      } else if (this.type == 'FelonyAndTraffic') {
        if(skipHeader){
          skipHeader = false;
          continue;
        }
        await this.parseFelonyAndTraffic(dfs);
      }
    }
    return true;
  }

  public async parseCriminal(
    defs: { [key: string]: any }[],
  ) {
    for(const df of defs) {
      const data = {
        'Full Name': `${df.partyLastName} ${df.partyFirstName} ${df.partyMiddleName}`,
        'First Name': df.partyFirstName,
        'Last Name': df.partyLastName,
        'Middle Name': df.partyMiddleName,
        'Property Address': df.partyAddress1,
        'Property Unit #': df.partyAddress2 || '',
        'Property City': df.partyCity,
        'Property State': df.partyState || 'FL',
        'Property Zip': df.partyZip,
        'County': 'palm-beach',
        csvFillingDate: df.fillingDate.split(' ')[0].trim(),
        productId: this.productId,
        originalDocType: df.dispositionDescription,
      };

      if (await this.saveToOwnerProductPropertyByParser(data, this.publicProducer)) {
        this.count++
      }
    }
  }

  public async parseFelonyAndTraffic(
    defs: { [key: string]: any }[],
  ) {
    for(const df of defs) {
      const fullName = df.partyFullName.trim();
      const parseName = nameParsingService.newParseName(fullName);

      if (df.partyType != 'FELONY') {
        continue;
      }

      const data = {
        'Full Name': fullName,
        'First Name': parseName.firstName,
        'Last Name': parseName.lastName,
        'Middle Name': parseName.middleName,
        'Property Address': df.partyAddress1,
        'Property Unit #': df.partyAddress2 || '',
        'Property City': df.partyCity,
        'Property State': df.partyState || 'FL',
        'Property Zip': df.partyZip,
        'County': 'palm-beach',
        csvFillingDate: df.chargeFileDate,
        productId: this.productId,
        originalDocType: df.dispositionDescription,
      };

      if (await this.saveToOwnerProductPropertyByParser(data, this.publicProducer)) {
        this.count++
      }
    }
  }

  public get recordCount() {
    return this.count
  }
}
