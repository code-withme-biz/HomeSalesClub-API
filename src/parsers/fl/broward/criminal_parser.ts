import AbstractParser from '../../abstract_parser'
import { IPublicRecordProducer } from '../../../models/public_record_producer'

export default class TrafficParser extends AbstractParser {
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
    if(fileName == 'SUFELONY.txt' || fileName == 'MOFELONY.txt' || fileName == 'TUFELONY.txt' || fileName == 'WEFELONY.txt' || fileName == 'THFELONY.txt' || fileName == 'FRFELONY.txt' || fileName == 'SAFELONY.txt') {
        return this.getFelony();
    } else if (fileName == 'SUMISDEM.txt' || fileName == 'MOMISDEM.txt' || fileName == 'TUMISDEM.txt' || fileName == 'WEMISDEM.txt' || fileName == 'THMISDEM.txt' || fileName == 'FRMISDEM.txt' || fileName == 'SAMISDEM.txt') {
        return this.getMisdemeanor();
    } else {
        return [];
    }
  }

  public getFelony() : string[] {
    this.type = 'Felony';
    return [
      'partyTypeCode', 'caseNumber', 'fillingDate', 'dispositionDescription',
      'uniformCaseNumber', 'BCCN', 'NTA', 'partyLastName',
      'partyFirstName', 'partyMiddleName', 'partyAddress1', 'partyAddress2', 'partyCity', 'partyState',
      'partyZip', 'partyPhoneNumber', 'partyDOB', 'race', 'partySex', 'driverLicenseState',
      'driverLicenseNumber', 'commercialDLIndicator', 'futureEvent', 'futureEventDate'
    ]
  }

  public getMisdemeanor() : string[] {
    this.type = 'Misdemeanor';
    return [
      'partyTypeCode', 'caseNumber', 'fillingDate', 'dispositionDescription',
      'uniformCaseNumber', 'BCCN', 'NTA', 'partyLastName',
      'partyFirstName', 'partyMiddleName', 'partyAddress1', 'partyAddress2', 'partyCity', 'partyState',
      'partyZip', 'partyPhoneNumber', 'partyDOB', 'race', 'partySex', 'driverLicenseState',
      'driverLicenseNumber', 'commercialDLIndicator', 'futureEvent', 'futureEventDate'
    ]
  }
  
  public async parse(caseGroup: [{[ key: string]: any}] ): Promise<boolean> {
    for(const group of caseGroup) {
        const items = group[1];
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
                'Property Unit #': df.partyAddress2,
                'Property City': df.partyCity,
                'Property State': df.partyState || 'FL',
                'Property Zip': df.partyZip,
                'County': 'broward',
                csvFillingDate: df.fillingDate,
                productId: this.productId,
                originalDocType: this.type,
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
