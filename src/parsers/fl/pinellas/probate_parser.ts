import AbstractParser from '../../abstract_parser'
import { IPublicRecordProducer } from '../../../models/public_record_producer'
import db from "../../../models/db";
const nameParsingService = require("../../../categories/public_records/consumers/property_appraisers/consumer_dependencies/nameParsingServiceNew");

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

  public getHeaders(fileName: string) : string[] {
    if(fileName.match(/pinellas-odyssey-probate/i)) {
        return this.getProbate();
    }
    return [];
  }

  public getProbate() : string[] {
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
    for(const group of caseGroup) {
        const items = group[1];
        let productName = '/fl/pinellas/probate';

        const productId = await db.models.Product.findOne({
            name: productName,
        }).exec();

        let skipHeader = true;
        for(const party of items) {
            if(skipHeader){
              skipHeader = false;
              continue;
            }
            const parsedName = nameParsingService.newParseName(party['Plaintiff/PetitionerName']);
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
                'Mailing Address': party['Plaintiff/PetitionerAddress'],
                'Mailing Unit #': '',
                'Mailing City': party['Plaintiff/PetitionerCity'],
                'Mailing State': party['Plaintiff/PetitionerState'] || 'FL',
                'Mailing Zip': party['Plaintiff/PetitionerZip'],
                csvFillingDate: party['FillingDate'],
                productId: productId,
                originalDocType: party['CaseType'],
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
