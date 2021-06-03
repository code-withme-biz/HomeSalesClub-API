import AbstractParser from '../../abstract_parser'
import { IPublicRecordProducer } from '../../../models/public_record_producer'
const fs = require('fs');
import db from "../../../models/db";
import { PracticeTypes } from '../../interfaces_parser';
import { platform } from 'os';

export default class ProbateParser extends AbstractParser {
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
      fileName.match(/^Decedent .+/)
    ) {
      return this.getProbateHeaders();
    } else {
      return [];
    }
  }

  public getProbateHeaders() : string[] {
    return [
      'caseNumber1',
      'decFirstName',
      'decLastName',
      'decAddress',
      'decUnit',
      'decCity',
      'decZip',
      'dateOfDeath1',
      'caseNumber2',
      'petFirstName',
      'petLastName',
      'petAddress',
      'petUnit',
      'petCity',
      'petState',
      'petZip',
      'dateOfDeath2',
      'caseNumber3',
      'lawFirstName',
      'lawlastName',
      'lawAddress',
      'lawUnit',
      'lawCity',
      'lawState',
      'lawZip',
      'dateOfDeath3'
    ]
  }
  
  public async parse(caseGroup: [{[ key: string]: any}] ): Promise<boolean> {
    for(const group of caseGroup) {
      const items = group[1];
      
      for(const item of items) {
        let lastName = '';
        let firstName = '';
        let propertyAddress = '';
        let propertyUnit = '';
        let propertyCity = '';
        let propertyState = '';
        let propertyZip = '';
        let mailingAddress = '';
        let mailingUnit = '';
        let mailingCity = '';
        let mailingState = '';
        let mailingZip = '';
        let caseNumber = '';

        if ((!item.petLastName || item.petLastName == "") && (!item.petFirstName || item.petFirstName == "")) {
            firstName = item.decFirstName
            lastName = item.decLastName;
            propertyAddress = item.decAddress;
            propertyUnit = item.decUnit || '';
            propertyCity = item.decCity;
            propertyState = item.decState || 'FL';
            propertyZip = item.decZip;
            mailingAddress = item.decAddress;
            mailingUnit = item.decUnit || '';
            mailingCity = item.decCity;
            mailingState = item.decState || 'FL';
            mailingZip = item.decZip;
            caseNumber = item.caseNumber1;
        } else {
            firstName = item.petFirstName;
            lastName = item.petLastName;
            propertyAddress = item.decAddress;
            propertyUnit = item.decUnit || '';
            propertyCity = item.decCity;
            propertyState = item.decState || 'FL';
            propertyZip = item.decZip;
            mailingAddress = item.petAddress;
            mailingUnit = item.petUnit || '';
            mailingCity = item.petCity;
            mailingState = item.petState || 'FL';
            mailingZip = item.petZip;
            caseNumber = item.caseNumber2;
        }
        
        const data = {
            "Full Name": `${lastName} ${firstName}`,
            "First Name": firstName,
            "Last Name": lastName,
            "Middle Name": '',
            "Property Address": propertyAddress,
            "Property Unit #": propertyUnit,
            "Property City": propertyCity,
            "Property State": propertyState,
            "Property Zip": propertyZip,
            County: "palm-beach",
            "Mailing Address": mailingAddress,
            "Mailing City": mailingCity,
            "Mailing State": mailingState,
            "Mailing Zip": mailingZip,
            productId: this.productId,
            originalDocType: PracticeTypes.probate,
            csvCaseNumber: caseNumber
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
