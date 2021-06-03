import AbstractParser from "../../abstract_parser";
import { IPublicRecordProducer } from "../../../models/public_record_producer";
const nameParsingService = require("../../../categories/public_records/consumers/property_appraisers/consumer_dependencies/nameParsingServiceNew");

export default class TrafficParser extends AbstractParser {
  protected count: number;
  protected publicProducer: IPublicRecordProducer;
  protected productId: any;
  protected type: string;

  constructor(publicRecordProducer: IPublicRecordProducer, productId: any) {
    super();
    this.count = 0;
    this.publicProducer = publicRecordProducer;
    this.productId = productId;
    this.type = "";
  }

  public getDelimiter(fileName: string): string {
    if (/inf_([0-9]+)?(_)?([0-9]+)?.(txt|TXT)/g.test(fileName)) {
      return "  ";
    } else {
      return " ";
    }
  }

  public getHeaders(fileName: string): string[] {
    if (/inf_([0-9]+)?(_)?([0-9]+)?.(txt|TXT)/g.test(fileName)) {
      this.type = "INF";
      return [];
    } else {
      return [];
    }
  }

  public async parse(caseGroup: [{ [key: string]: any }]): Promise<boolean> {
    for (const group of caseGroup) {
      const items = group[1];
      if (this.type === "INF") {
        const defs: any[] = [];
        for (let i = 0; i < items.length; i++) {
          const values: string[] = [];
          const elements = Object.values(items[i]) as string[];
          for (let j = 0; j < elements.length; j++) {
            if (elements[j].replace(/\s+/g, " ")) {
              values.push(elements[j].replace(/\s+/g, " "));
            }
          }
          const caseNumber = values[0];
          const fillingDate = values[1];
          const partyName = values[2];
          const partyAddress1 = values[3];
          const city = values[5].replace(/[A-Z]{2} [0-9]+$/g, "");
          const state = values[5].replace(city, "").replace(/[0-9]+/g, "");
          const zip = values[5].replace(city, "").replace(/[A-Z]{2}/g, "");
          defs.push({
            caseNumber,
            partyName,
            fillingDate,
            partyAddress1,
            city,
            state,
            zip,
          });
        }
        await this.process(defs);
      }
    }
    return true;
  }

  private async process(defs: any[]): Promise<Boolean> {
    for (const df of defs) {
      const parsedName = nameParsingService.newParseName(df.partyName);
      const data = {
        "Full Name": parsedName.fullName,
        "First Name": parsedName.firstName,
        "Last Name": parsedName.lastName,
        "Middle Name": parsedName.middleName,
        "Property Address": df.partyAddress1,
        "Property City": df.city,
        "Property State": df.state || "FL",
        "Property Zip": df.zip,
        County: "hernando",
        csvFillingDate: df.fillingDate,
        productId: this.productId,
        originalDocType: this.type,
      };

      if (
        await this.saveToOwnerProductPropertyByParser(data, this.publicProducer)
      ) {
        this.count++;
      }
    }
    return true;
  }

  public get recordCount() {
    return this.count;
  }
}
