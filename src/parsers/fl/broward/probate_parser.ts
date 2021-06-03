import AbstractParser from '../../abstract_parser'
import { PracticeTypes } from '../../interfaces_parser'

import { saveToOwnerProductPropertyByProducer } from '../../../services/general_service'
import { IPublicRecordProducer } from '../../../models/public_record_producer'

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
    return "|"
  }

  public getHeaders(fileName: string) : string[] {
    if(fileName == 'WKPROBATWC.txt') {
      return this.getWeeklyProbateHeaders();
    } else {
      if(fileName.match(/PROBAT\.txt/)){
        return this.getDailyProbateHeaders();
      }
      return [];
    }
  }

  public getWeeklyProbateHeaders() : string[] {
    this.type = 'Weekly';
    return [
      'caseNumber', 'petitionFiledDate', 'caseTypeCode', 'caseTypeDescription',
      'partyTypeCode', 'lastName', 'firstName', 'middleName', 'dateOfBirth',
      'dateOfDeath', 'age', 'addressLine1', 'addressLine2', 'city', 'state', 'zip', 'phone', 'uniformCaseNumber', 'caseCreatedDate'
    ]
  }

  public getDailyProbateHeaders(): string[] {
    this.type = 'Daily';
    return [
      'caseNumber', 'petitionFiledDate', 'caseTypeDescription', 'caseTypeCode',
      'partyTypeCode', 'lastName', 'firstName', 'middleName', 'dateOfBirth',
      'dateOfDeath', 'age', 'addressLine1', 'addressLine2', 'city', 'state', 'zip', 'phone', 'uniformCaseNumber', 'caseCreatedDate'
    ]
  }

  public async parse(caseGroup: [{[ key: string]: any}] ): Promise<boolean> {
      for(const group of caseGroup) {
          const desc = group[1].find( (item: {[key: string]: any}) => {
              return  item['partyTypeCode'] === 'DECD';  
          });

          const pets = group[1].filter( (item: {[key: string]: any}) => {
              return  [
                  'PET', 'RAGT', 'REPR', 'TRST', 
                  'CREPR', 'PWF', 'CAV', 'CREPR'
              ].includes(item['partyTypeCode'])
          });

          for(const pet of pets) {
            let data;
            if(this.type == 'Weekly'){
              data = {
                'Full Name': `${pet.lastName} ${pet.firstName} ${pet.middleName}`,
                'First Name': pet.firstName,
                'Last Name': pet.lastName,
                'Middle Name': pet.middleName,
                'Property Address': desc.addressLine1,
                'Property City': desc.city,
                'Property State': desc.state || 'FL',
                'Property Zip': desc.zip,
                'County': 'broward',
                'Mailing Address': pet.addressLine1,
                'Mailing City': pet.city,
                'Mailing State': pet.state,
                'Mailing Zip': pet.zip,
                csvFillingDate: desc.petitionFiledDate,
                csvCaseNumber: desc.caseNumber,
                productId: this.productId,
                originalDocType: PracticeTypes.probate,
              }
            } else {
              let fullName = '';
              let middleName = '';
              if(pet.middleName && pet.middleName.length < 3){
                fullName = `${pet.lastName} ${pet.firstName} ${pet.middleName}`;
                middleName = `${pet.middleName}`;
              } else {
                fullName = `${pet.lastName} ${pet.firstName}`;
              }

              let firstName = '';
              if(pet.firstName && pet.firstName.match(/\d/)){
                fullName = `${pet.lastName}`;
              } else {
                firstName = `${pet.firstName}`;
              }
              data = {
                'Full Name': fullName,
                'First Name': firstName,
                'Last Name': pet.lastName,
                'Middle Name': middleName,
                'County': 'broward',
                'Property State': 'FL',
                csvFillingDate: pet.petitionFiledDate,
                csvCaseNumber: pet.caseNumber,
                productId: this.productId,
                originalDocType: PracticeTypes.probate,
              }
            }
        
            if (await this.saveToOwnerProductPropertyByParser(data, this.publicProducer, true)) {
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
