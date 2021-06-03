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
    const regexp1 = /CIVIL_Evictions_Weekly_[0-9]+\.txt/g;
    const regexp2 = /CIVLT[0-9]+\.txt/g;
    const regexp3 = /CIVLTNTN[0-9]+\.txt/g;

    if (regexp1.test(fileName)) {
      return this.getEvictionHeaders1();
    } else if (regexp2.test(fileName)) {
      return this.getEvictionHeaders2();
    } else if (regexp3.test(fileName)) {
      return this.getEvictionHeaders3();
    } else {
      return [];
    }
  }

  public getEvictionHeaders1(): string[] {
    return [
      "caseNumber",
      "fillingDate",
      "dispositionDescription",
      "",
      "partyName",
      "partyAddress1",
      "partyCity",
      "partyState",
      "partyZip",
      "propertyOwner",
    ];
  }

  public getEvictionHeaders2(): string[] {
    return [
      "caseNumber",
      "propertyOwner",
      "",
      "",
      "",
      "",
      "partyAddress1",
      "",
      "",
      "partyCity",
      "partyState",
      "partyZip",
    ];
  }

  public getEvictionHeaders3(): string[] {
    return [
      "caseNumber",
      "fillingDate",
      "",
      "partyName",
      "partyAddress",
      "partyCity",
      "partyState",
      "partyZip",
      "propertyOwner",
    ];
  }

  public async parse(caseGroup: [{ [key: string]: any }]): Promise<boolean> {
    for (const group of caseGroup) {
      const items = group[1];
      for (const item of items) {
        const parsedName = item.partyName
          ? nameParsingService.newParseName(item.partyName)
          : nameParsingService.newParseName(item.propertyOwner);
        const data = {
          "Full Name": parsedName.fullName,
          "First Name": parsedName.firstName,
          "Last Name": parsedName.lastName,
          "Middle Name": parsedName.middleName,
          "Property Address": item.partyAddress,
          "Property City": item.partyCity,
          "Property State": item.partyState || "FL",
          "Property Zip": item.partyZip,
          County: "Miami-Dade",
          csvFillingDate: item.fillingDate,
          productId: this.productId,
          originalDocType: PracticeTypes.eviction,
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
