import AbstractParser from '../../abstract_parser'
import { IPublicRecordProducer } from '../../../models/public_record_producer'
const fs = require('fs');

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
    return "|"
  }
  
  public async parse(caseGroup: [{[ key: string]: any}] ): Promise<boolean> {
    for(const group of caseGroup) {
        const items = group[1];
        console.log(items);
        const dfs = items.filter((item: {[key: string]: any}) => {
            return  item['partyTypeCode'] === 'DEFENDANT';  
        });

        for(const df of dfs) {
            const data = {
                'Full Name': `${df.partyLastName} ${df.partyFirstName} ${df.partyMiddleName}`,
                'First Name': df.partyFirstName,
                'Last Name': df.partyLastName,
                'Middle Name': df.partyMiddleName,
                'Property Address': df.partyAddress1,
                'Property Unit #': '',
                'Property City': df.partyCity,
                'Property State': df.partyState || 'FL',
                'Property Zip': df.partyZip,
                'County': 'duval',
                csvFillingDate: df.fillingDate.split('T')[0].trim(),
                productId: this.productId,
                originalDocType: df.caseType,
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
