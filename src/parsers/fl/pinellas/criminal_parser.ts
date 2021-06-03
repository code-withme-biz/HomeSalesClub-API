import AbstractParser from '../../abstract_parser'
import { IPublicRecordProducer } from '../../../models/public_record_producer'
const fs = require('fs');
import db from "../../../models/db";
const nameParsingService = require("../../../categories/public_records/consumers/property_appraisers/consumer_dependencies/nameParsingServiceNew");


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

  public getHeaders(fileName: string) : string[] {
    if(fileName.match(/pinellas-odyssey-criminal/i)) {
        return this.getCriminalAndTraffic();
    }
    return [];
  }

  public getCriminalAndTraffic() : string[] {
    return [
        'caseNumber',
        'CaseType',
        'FillingDate',
        'Defendant/DecedentName',
        'Defendant/DecedentAddress',
        'Defendant/DecedentCity',
        'Defendant/DecedentZip',
        'Defendant/DecedentState',
        'Plaintiff/PetitionerName',
        'Plaintiff/PetitionerAddress',
        'Plaintiff/PetitionerCity',
        'Plaintiff/PetitionerZip',
        'Plaintiff/PetitionerState'
    ]
  }
  
  public async parse(caseGroup: [{[ key: string]: any}] ): Promise<boolean> {
    let skipHeader = true;
    for(const group of caseGroup) {
        if(skipHeader){
            skipHeader = false;
            continue;
        }
        const items = group[1];
        let productName;
        switch (items[0]?.["CaseType"]) {
            case (items[0]?.["CaseType"].match(/felony/i) || {}).input:
                this.type = 'Felony';
                productName = '/fl/pinellas/criminal';
                break;
            case (items[0]?.["CaseType"].match(/misdemeanor/i) || {}).input:
                this.type = 'Misdemeanor';
                productName = '/fl/pinellas/criminal';
                break;
            case (items[0]?.["CaseType"].match(/traffic/i) || {}).input:
            case (items[0]?.["CaseType"].match(/infraction/i) || {}).input:
                this.type = items[0]?.["CaseType"];
                productName = '/fl/pinellas/traffic';
                break;
            default:
                console.log(items[0]?.["CaseType"]);
                fs.appendFile('log.txt', items[0]?.["CaseType"] + '-' + items[0]?.["CaseNumber"] + '\n', function (err: any) {
                  if (err) {
                    // append failed
                  } else {
                    // done
                  }
                })
                this.type = items[0]?.["CaseType"];
                productName = '/fl/pinellas/criminal';
                break;
        }

        const productId = await db.models.Product.findOne({
            name: productName,
        }).exec();

        for(const party of items) {
            const parsedName = nameParsingService.newParseName(party['Defendant/DecedentName']);
            const data = {
                'Full Name': parsedName.fullName,
                'First Name': parsedName.firstName,
                'Last Name': parsedName.lastName,
                'Middle Name': parsedName.middleName,
                'Property Address': party['Defendant/DecedentAddress'],
                'Property Unit #': '',
                'Property City': party['Defendant/DecedentCity'],
                'Property State': party['Defendant/DecedentState'] || 'FL',
                'Property Zip': party['Defendant/DecedentZip'],
                'County': 'pinellas',
                csvFillingDate: party['FillingDate'],
                productId: productId,
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
