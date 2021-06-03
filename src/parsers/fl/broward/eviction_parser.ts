import AbstractParser from '../../abstract_parser'
import { PracticeTypes } from '../../interfaces_parser'

import { saveToOwnerProductPropertyByProducer } from '../../../services/general_service'
import { IPublicRecordProducer } from '../../../models/public_record_producer'

export default class EvictionParser extends AbstractParser {
  protected count: number
  protected publicProducer: IPublicRecordProducer
  protected productId: any

  constructor(publicRecordProducer: IPublicRecordProducer, productId: any) {
    super()
    this.count = 0
    this.publicProducer = publicRecordProducer
    this.productId = productId
  }

  public getDelimiter(): string {
    return "|"
  }

  public getHeaders(fileName: string) : string[] {
    if(fileName == 'WKEVICT.txt' || fileName == 'MNEVICT.txt') {
      return this.getEvictionHeaders();
    } else if(fileName == 'SETENANT.txt' || fileName == 'MNTENANT.txt'){
      return this.getTenantHeaders();
    } else {
      return [];
    }
  }

  public getEvictionHeaders() : string[] {
    return [
      'caseNumber', 'fillingDate', 'dispositionCode', 'dispositionDescription',
      'dispositionDate', 'partyGroupNumber', 'partyTypeCode', 'partyName',
      'partyAddress1', 'partyCity', 'partyState', 'partyZip', 'uniformCaseNumber', 'reportDate'
    ]
  }

  public getTenantHeaders() : string[] {
    return [
      'fillingDate', 'partyName', 'partyAddress1', 'partyCity', 'partyState', 'partyZip', 
      'dispositionDescription', 'caseNumber', 'dispositionCode', 
      'dispositionDate', 'partyGroupNumber', 'partyTypeCode', 
      'uniformCaseNumber', 'reportDate' 
    ]
  }
  
  public async parse(caseGroup: [{[ key: string]: any}] ): Promise<boolean> {
    for(const group of caseGroup) {
        const items = group[1];
        const pls = items.filter((item: {[key: string]: any}) => {
            return  item['partyTypeCode'] === 'PL';  
        });

        for(const pl of pls) {
            const firstName = pl.partyName.split(',')[1];
            const lastName = pl.partyName.split(',')[0];

            const data = {
              'Full Name': pl.partyName,
              'First Name': firstName,
              'Last Name': lastName,
              'Property State': 'FL',
              'County': 'broward',
              csvFillingDate: pl.fillingDate,
              productId: this.productId,
              originalDocType: PracticeTypes.eviction,
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
