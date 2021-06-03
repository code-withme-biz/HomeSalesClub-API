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
    if(fileName == 'WKTCDISPO.txt' || fileName == 'SUTRFFIC.txt' || fileName == 'MOTRFFIC.txt' || fileName == 'TUTRFFIC.txt' || fileName == 'WETRFFIC.txt' || fileName == 'THTRFFIC.txt' || fileName == 'FRTRFFIC.txt' || fileName == 'SATRFFIC.txt') {
        return this.getTrafficCriminal();
    } else if (fileName == 'WKTIDISPO.txt' || fileName == 'SUINFRAC.txt' || fileName == 'MOINFRAC.txt' || fileName == 'TUINFRAC.txt' || fileName == 'WEINFRAC.txt' || fileName == 'THINFRAC.txt' || fileName == 'FRINFRAC.txt' || fileName == 'SAINFRAC.txt') {
        return this.getTrafficInfraction();
    } else {
        return [];
    }
  }

  public getTrafficCriminal() : string[] {
    this.type = 'Traffic Criminal';
    return [
      'partyTypeCode', 'caseNumber', 'fillingDate', 'dispositionDescription',
      'uniformCaseNumber', 'BCCN', 'NTA', 'partyLastName',
      'partyFirstName', 'partyMiddleName', 'partyAddress1', 'partyAddress2', 'partyCity', 'partyState',
      'partyZip', 'partyPhoneNumber', 'partyDOB', 'race', 'partySex', 'driverLicenseState',
      'driverLicenseNumber', 'commercialDLIndicator', 'hearingDate', 'hearingDescription'
    ]
  }

  public getTrafficInfraction() : string[] {
    this.type = 'Traffic Infraction'
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
