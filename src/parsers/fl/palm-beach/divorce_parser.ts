import AbstractParser from '../../abstract_parser'
import { IPublicRecordProducer } from '../../../models/public_record_producer'
const fs = require('fs');
import db from "../../../models/db";
import { PracticeTypes } from '../../interfaces_parser';
const nameParsingService = require("../../../categories/public_records/consumers/property_appraisers/consumer_dependencies/nameParsingServiceNew");

export default class DivorceParser extends AbstractParser {
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
      fileName.match(/^Divorce Cases .+/)
    ) {
      return this.getDivorceHeaders();
    } else if (
      fileName.match(/^Family .+/)
    ) {
      return this.getFamilyHeaders();
    } else {
      return [];
    }
  }

  public getDivorceHeaders() : string[] {
    this.type = 'Divorce';
    return [
      'caseNumber',
      'PIDM',
      'caseStatus',
      'dispositionDate',
      'FJDM Date',
      'partySeqNo',
      'partyType',
      'partyName',
      'attyFor',
      'partyAddress1',
      'partyCity',
      'partyState',
      'partyZip',
      'partyPhone'
    ]
  }

  public getFamilyHeaders() : string[] {
    this.type = 'Family';
    return [
      'partyName',
      'partyAddress1',
      'partyCity',
      'partyState',
      'partyZip',
      'caseNumber',
      'fillingDate',
    ]
  }
  
  public async parse(caseGroup: [{[ key: string]: any}] ): Promise<boolean> {
    for(const group of caseGroup) {
      const items = group[1];
      
      if (this.type == 'Family') {
        await this.parseFamily(items);
      } else if (this.type == 'Divorce') {
        const pls = items.filter((item: { [key: string]: any }) => {
          return item["partyType"] === "PLAINTIFF/PETITIONER";
        });
        const defs = items.filter((item: { [key: string]: any }) => {
          return item["partyType"] === "DEFENDANT/RESPONDENT";
        });
        await this.parseDivorce(defs, pls);
      }
    }
    return true;
  }

  private async parseFamily(
    item: [{ [key: string]: any }]
  ) {
    const defs = item;

    for(const df of defs) {
      const fullName = df.partyName.trim();
      const parseName = nameParsingService.newParseName(fullName);

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
        csvFillingDate: df.fillingDate,
        productId: this.productId,
        originalDocType: PracticeTypes.divorce,
        csvCaseNumber: df.caseNumber
      };

      if (await this.saveToOwnerProductPropertyByParser(data, this.publicProducer)) {
        this.count++
      }
    }  
  }

  private async parseDivorce(
    defs: [{ [key: string]: any }],
    pls: [{ [key: string]: any }]
  ) {
    for(const df of defs) {
      const fullName = df.partyName.trim();
      const parseName = nameParsingService.newParseName(fullName);

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
        'Phone': df.partyPhone,
        csvFillingDate: df.dispositionDate.split(' ')[0].trim(),
        productId: this.productId,
        originalDocType: PracticeTypes.divorce,
        caseNumber: df.caseNumber
      };

      if (await this.saveToOwnerProductPropertyByParser(data, this.publicProducer)) {
        this.count++
      }
    }  

    for(const pl of pls) {
      const fullName = pl.partyName.trim();
      const parseName = nameParsingService.newParseName(fullName);
      const data = {
        'Full Name': fullName,
        'First Name': parseName.firstName,
        'Last Name': parseName.lastName,
        'Middle Name': parseName.middleName,
        'Property Address': pl.partyAddress1,
        'Property Unit #': pl.partyAddress2 || '',
        'Property City': pl.partyCity,
        'Property State': pl.partyState || 'FL',
        'Property Zip': pl.partyZip,
        'County': 'palm-beach',
        'Phone': pl.partyPhone,
        csvFillingDate: pl.dispositionDate.split(' ')[0].trim(),
        productId: this.productId,
        originalDocType: PracticeTypes.divorce,
        caseNumber: pl.caseNumber
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
