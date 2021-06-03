import AbstractParser from '../../abstract_parser'
import { IPublicRecordProducer } from '../../../models/public_record_producer'
const fs = require('fs');
import db from "../../../models/db";
import { PracticeTypes } from '../../interfaces_parser';

export default class MarriageParser extends AbstractParser {
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
      fileName.match(/^Marriage Licenses .+/)
    ) {
      return this.getMarriageHeaders();
    } else {
      return [];
    }
  }

  public getMarriageHeaders() : string[] {
    return [
      'fillingDate',
      'caseNumber',
      'partyLastName',
      'partyFirstName',
      'partyAddress1',
      'partyCity',
      'partyState',
      'partyZip',
      'partyCounty',
      'partyBirthPlace'
    ]
  }
  
  public async parse(caseGroup: [{[ key: string]: any}] ): Promise<boolean> {
    for(const group of caseGroup) {
      const items = group[1];
      const dfs = items

      for(const df of dfs) {
        const data = {
          'Full Name': `${df.partyLastName} ${df.partyFirstName}`,
          'First Name': df.partyFirstName,
          'Last Name': df.partyLastName,
          'Middle Name': df.partyMiddleName|| '',
          'Property Address': df.partyAddress1,
          'Property Unit #': df.partyAddress2 || '',
          'Property City': df.partyCity,
          'Property State': df.partyState || 'FL',
          'Property Zip': df.partyZip,
          'County': 'palm-beach',
          csvFillingDate: df.fillingDate.split(' ')[0].trim(),
          productId: this.productId,
          originalDocType: PracticeTypes.marriage,
          csvCaseNumber: df.caseNumber
        };
  
        if (await this.saveToOwnerProductPropertyByParser(data, this.publicProducer)) {
          this.count++
        }
      }  
    }

    return true;
  }

  public get recordCount() {
    return this.count
  }
}
