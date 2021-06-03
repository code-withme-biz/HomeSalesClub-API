import AbstractParser from "../../abstract_parser";
import { PracticeTypes } from "../../interfaces_parser";

import { saveToOwnerProductPropertyByProducer } from "../../../services/general_service";
import { IPublicRecordProducer } from "../../../models/public_record_producer";
const nameParsingService = require("../../../categories/public_records/consumers/property_appraisers/consumer_dependencies/nameParsingServiceNew");

export default class EvictionParser extends AbstractParser {
  protected count: number;
  protected publicProducer: IPublicRecordProducer;
  protected productId: any;

  constructor(publicRecordProducer: IPublicRecordProducer, productId: any) {
    super();
    this.count = 0;
    this.publicProducer = publicRecordProducer;
    this.productId = productId;
  }

  public getDelimiter(): string {
    return "^";
  }

  public getHeaders(fileName: string): string[] {
    if (/wky_mlsapp_[0-9]+\.txt/g.test(fileName)) {
      return [
        "lastName",
        "firstName",
        "middleName",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "marriageDate",
        "",
        "partyAddress1",
        "city",
        "state",
        "zip",
      ];
    } else {
      return [];
    }
  }

  public async parse(caseGroup: [{ [key: string]: any }]): Promise<boolean> {
    for (const group of caseGroup) {
      const items = group[1];
      for (const item of items) {
        const partyName =
          item.lastName + ", " + item.firstName + " " + item.middleName;
        const parsedName = nameParsingService.newParseName(partyName);
        let dateStr = item.marriageDate;
        dateStr = [dateStr.slice(0, 2), "/", dateStr.slice(2)].join("");
        dateStr = [dateStr.slice(0, 5), "/", dateStr.slice(5)].join("");
        let date = new Date(dateStr);
        date.setTime(date.getTime() + 172800000);
        const dateFormated = date.toLocaleDateString("en-US", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        });
        const data = {
          "Full Name": parsedName.fullName,
          "First Name": parsedName.firstName,
          "Last Name": parsedName.lastName,
          "Middle Name": parsedName.middleName,
          "Property Address": item.partyAddress1,
          "Property City": item.city,
          "Property State": item.state || "FL",
          "Property Zip": item.zip,
          csvFillingDate: dateFormated,
          County: "Miami-Dade",
          productId: this.productId,
        };

        if (
          await this.saveToOwnerProductPropertyByParser(
            data,
            this.publicProducer
          )
        ) {
          this.count++;
        }
      }
    }

    return true;
  }

  public get recordCount() {
    return this.count;
  }
}
