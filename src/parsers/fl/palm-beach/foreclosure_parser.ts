import AbstractParser from '../../abstract_parser'
import { IPublicRecordProducer } from '../../../models/public_record_producer'
const fs = require('fs');
import db from "../../../models/db";
import { PracticeTypes } from '../../interfaces_parser';
const nameParsingService = require("../../../categories/public_records/consumers/property_appraisers/consumer_dependencies/nameParsingServiceNew");

export default class ForeclosureParser extends AbstractParser {
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
      fileName.match(/^Foreclosure .+/)
    ) {
      return this.getForeclosureHeaders();
    } else {
      return [];
    }
  }

  public getForeclosureHeaders() : string[] {
    return [
      'caseNumber',
      'defName',
      'defAddress1',
      'defAddress2',
      '',
      'defCity',
      'defState',
      'defZip',
      'saleDate',
      'judgmentAmnt',
      'plName',
      'fillingDate',
      'trialDate'
    ]
  }
  
  public async parse(caseGroup: [{[ key: string]: any}] ): Promise<boolean> {
    for(const group of caseGroup) {
      const items = group[1];
      const dfs = items
      
      for(const df of dfs) {
        const fullName = df.defName.trim();
        const parseName = nameParsingService.newParseName(fullName);

        const data = {
          'Full Name': fullName,
          'First Name': parseName.firstName,
          'Last Name': parseName.lastName,
          'Middle Name': parseName.middleName,
          'Property Address': df.defAddress1,
          'Property Unit #': df.defAddress2 || '',
          'Property City': df.defCity,
          'Property State': df.defState || 'FL',
          'Property Zip': df.defZip,
          'County': 'palm-beach',
          // 'Sold Date': df.saleDate || '',
          // 'soldAmount': df.judgmentAmnt,
          csvFillingDate: df.fillingDate,
          productId: this.productId,
          originalDocType: PracticeTypes.foreclosure,
          caseNumber: df.caseNumber
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
