import AbstractParser from "../../abstract_parser";
import { PracticeTypes } from "../../interfaces_parser";
const nameParsingService = require("../../../categories/public_records/consumers/property_appraisers/consumer_dependencies/nameParsingServiceNew");

import { saveToOwnerProductPropertyByProducer, sleep } from "../../../services/general_service";
import { IPublicRecordProducer } from "../../../models/public_record_producer";
import db from "../../../models/db";
const fs = require('fs');

export default class CivilParser extends AbstractParser {
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
    return "|";
  }

  public getHeaders(fileName: string): string[] {
    if (
      fileName.match(/^Civil Case Party .+/)
    ) {
      return this.getCivil();
    } else {
      return [];
    }
  }

  public getCivil(): string[] {
    return [
      "caseNumber",
      "fillingDate",
      "dispositionCode",
      "dispositionDescription",
      "partyType",
      "partyFirstName",
      "partyMiddleName",
      "partyLastName",
      "partyAddress1",
      "partyCity",
      "partyState",
      "partyZip",
      "attorneyName",
    ];
  }

  public async parse(caseGroup: [{ [key: string]: any }]): Promise<boolean> {
    for (const group of caseGroup) {
      console.log(group);
      const items = group[1];
      const pls = items.filter((item: { [key: string]: any }) => {
        return item["partyType"] === "PLAINTIFF/PETITIONER";
      });

      const defs = items.filter((item: { [key: string]: any }) => {
        return item["partyType"] === "DEFENDANT/RESPONDENT";
      });

      switch (defs[0]?.["dispositionDescription"]) {
        // divorce
        case "DISSOLUTION":
        case "SIMPLIFIED DISSOLUTION":
          await this.parseDivorce(caseGroup);
          break;
        // child-support
        case "PATERNITY":
        case "CUSTODY (DOMESTIC RELATIONS)":
        case "UIFSA INITIATING NEW":
          await this.parseChildSupport(caseGroup);
          break;
        // marriage
        case "OTHER DOMESTIC RELATIONS":
        case "NAME CHANGE":
          await this.parseMarriage(caseGroup);
          break;
        // other-civil
        case "OTHER CIRCUIT":
        case "PRODUCT LIABILITY":
          await this.parseOtherCivilAndTakeBoth(defs, pls);
          break;
        // traffic
        case "AUTO NEGLIGENCE":
          await this.parseTrafficAndTakeBoth(defs, pls);
          break;
        // personal-injury
        case "MEDICAL MALPRACTICE":
        case "PREMISES LIABILITY RESIDENTIAL":
        case "PREMISES LIABILITY COMMERCIAL":
          await this.parsePersonalInjuryAndTakeBoth(defs, pls);
          break;
        // hoa_lien
        case "Assn Lien Foreclosure = < $50K":
          await this.parseHOALien(defs, pls);
          break;
        // debt
        case "CONTRACT & DEBT":
          await this.parseDebtAndTakeBoth(defs, pls);
          break;
        // insurance-claims
        case "INSURANCE CLAIM":
          await this.parseInsuranceClaimsAndTakeBoth(defs, pls);
          break;
        default:
          console.log(defs[0]?.["dispositionDescription"]);
          // fs.appendFile('log.txt', defs[0]?.["dispositionDescription"] + '-' + defs[0]?.["caseNumber"] + '\n', function (err: any) {
          //   if (err) {
          //     // append failed
          //   } else {
          //     // done
          //   }
          // })
          break;
      }
      // console.log(group);
    }

    return true;
  }

  public async parseInsuranceClaimsAndTakeBoth(
    defs: { [key: string]: any }[],
    pls: { [key: string]: any }[]
  ) {
    const productId = await db.models.Product.findOne({
      name: "/fl/palm-beach/insurance-claims",
    }).exec();

    for (const def of defs) {
      const data = {
        "Full Name": `${def.partyLastName} ${def.partyFirstName} ${def.partyMiddleName}`,
        "First Name": def.partyFirstName,
        "Last Name": def.partyLastName,
        "Middle Name": def.partyMiddleName,
        "Property Address": def.partyAddress1 || '',
        "Property Unit #": def.partyAddress2 || '',
        "Property City": def.partyCity || '',
        "Property State": def.partyState || "FL",
        "Property Zip": def.partyZip || '',
        County: "palm-beach",
        csvFillingDate: def.fillingDate,
        productId: productId,
        originalDocType: def.dispositionDescription,
        csvCaseNumber: def.caseNumber
      };

      if (
        await this.saveToOwnerProductPropertyByParser(data, this.publicProducer)
      ) {
        this.count++;
      }
    }

    for (const pl of pls) {
      const data = {
        "Full Name": `${pl.partyLastName} ${pl.partyFirstName} ${pl.partyMiddleName}`,
        "First Name": pl.partyFirstName,
        "Last Name": pl.partyLastName,
        "Middle Name": pl.partyMiddleName,
        "Property Address": pl.partyAddress1 || '',
        "Property Unit #": pl.partyAddress2 || '',
        "Property City": pl.partyCity || '',
        "Property State": pl.partyState || "FL",
        "Property Zip": pl.partyZip || '',
        County: "palm-beach",
        csvFillingDate: pl.fillingDate,
        productId: productId,
        originalDocType: pl.dispositionDescription,
        csvCaseNumber: pl.caseNumber
      };

      if (
        await this.saveToOwnerProductPropertyByParser(data, this.publicProducer)
      ) {
        this.count++;
      }
    }
  }

  private async parsePersonalInjuryAndTakeBoth(
    defs: { [key: string]: any }[],
    pls: { [key: string]: any }[]
  ) {
    const productId = await db.models.Product.findOne({
      name: "/fl/palm-beach/personal-injury",
    }).exec();

    for (const def of defs) {
      const data = {
        "Full Name": `${def.partyLastName} ${def.partyFirstName} ${def.partyMiddleName}`,
        "First Name": def.partyFirstName,
        "Last Name": def.partyLastName,
        "Middle Name": def.partyMiddleName,
        "Property Address": def.partyAddress1 || '',
        "Property Unit #": def.partyAddress2 || '',
        "Property City": def.partyCity || '',
        "Property State": def.partyState || "FL",
        "Property Zip": def.partyZip || '',
        County: "palm-beach",
        csvFillingDate: def.fillingDate,
        productId: productId,
        originalDocType: def.dispositionDescription,
        csvCaseNumber: def.caseNumber
      };

      if (
        await this.saveToOwnerProductPropertyByParser(data, this.publicProducer)
      ) {
        this.count++;
      }
    }

    for (const pl of pls) {
      const data = {
        "Full Name": `${pl.partyLastName} ${pl.partyFirstName} ${pl.partyMiddleName}`,
        "First Name": pl.partyFirstName,
        "Last Name": pl.partyLastName,
        "Middle Name": pl.partyMiddleName,
        "Property Address": pl.partyAddress1 || '',
        "Property Unit #": pl.partyAddress2 || '',
        "Property City": pl.partyCity || '',
        "Property State": pl.partyState || "FL",
        "Property Zip": pl.partyZip || '',
        County: "palm-beach",
        csvFillingDate: pl.fillingDate,
        productId: productId,
        originalDocType: pl.dispositionDescription,
        csvCaseNumber: pl.caseNumber
      };

      if (
        await this.saveToOwnerProductPropertyByParser(data, this.publicProducer)
      ) {
        this.count++;
      }
    }
  }

  private async parseOtherCivilAndTakeBoth(
    defs: { [key: string]: any }[],
    pls: { [key: string]: any }[]
  ) {
    const productId = await db.models.Product.findOne({
      name: "/fl/palm-beach/other-civil",
    }).exec();

    for (const def of defs) {
      const data = {
        "Full Name": `${def.partyLastName} ${def.partyFirstName} ${def.partyMiddleName}`,
        "First Name": def.partyFirstName,
        "Last Name": def.partyLastName,
        "Middle Name": def.partyMiddleName,
        "Property Address": def.partyAddress1 || '',
        "Property Unit #": def.partyAddress2 || '',
        "Property City": def.partyCity || '',
        "Property State": def.partyState || "FL",
        "Property Zip": def.partyZip || '',
        County: "palm-beach",
        csvFillingDate: def.fillingDate,
        productId: productId,
        originalDocType: def.dispositionDescription,
        csvCaseNumber: def.caseNumber
      };

      if (
        await this.saveToOwnerProductPropertyByParser(data, this.publicProducer)
      ) {
        this.count++;
      }
    }

    for (const pl of pls) {
      const data = {
        "Full Name": `${pl.partyLastName} ${pl.partyFirstName} ${pl.partyMiddleName}`,
        "First Name": pl.partyFirstName,
        "Last Name": pl.partyLastName,
        "Middle Name": pl.partyMiddleName,
        "Property Address": pl.partyAddress1 || '',
        "Property Unit #": pl.partyAddress2 || '',
        "Property City": pl.partyCity || '',
        "Property State": pl.partyState || "FL",
        "Property Zip": pl.partyZip || '',
        County: "palm-beach",
        csvFillingDate: pl.fillingDate,
        productId: productId,
        originalDocType: pl.dispositionDescription,
        csvCaseNumber: pl.caseNumber
      };

      if (
        await this.saveToOwnerProductPropertyByParser(data, this.publicProducer)
      ) {
        this.count++;
      }
    }
  }

  private async parseHOALien(
    defs: { [key: string]: any }[],
    pls: { [key: string]: any }[]
  ) {
    const productId = await db.models.Product.findOne({
      name: "/fl/palm-beach/hoa-lien",
    }).exec();

    for (const def of defs) {
      const data = {
        "Full Name": `${def.partyLastName} ${def.partyFirstName} ${def.partyMiddleName}`,
        "First Name": def.partyFirstName,
        "Last Name": def.partyLastName,
        "Middle Name": def.partyMiddleName,
        "Property Address": def.partyAddress1 || '',
        "Property Unit #": def.partyAddress2 || '',
        "Property City": def.partyCity || '',
        "Property State": def.partyState || "FL",
        "Property Zip": def.partyZip || '',
        County: "palm-beach",
        csvFillingDate: def.fillingDate,
        productId: productId,
        originalDocType: def.dispositionDescription,
        csvCaseNumber: def.caseNumber
      };

      if (
        await this.saveToOwnerProductPropertyByParser(data, this.publicProducer)
      ) {
        this.count++;
      }
    }
  }

  private async parseDivorce(caseGroup: [{ [key: string]: any }]) {
    const productId = await db.models.Product.findOne({
      name: "/fl/palm-beach/divorce",
    }).exec();

    for (const group of caseGroup) {
      // save both petitioner & respondent
      for (const person of group[1]) {
        const data = {
          "Full Name": `${person.partyLastName} ${person.partyFirstName} ${person.partyMiddleName}`,
          "First Name": person.partyFirstName,
          "Last Name": person.partyLastName,
          "Middle Name": person.partyMiddleName,
          "Property Address": person.partyAddress1 || '',
          "Property Unit #": person.partyAddress2 || '',
          "Property City": person.partyCity || '',
          "Property State": person.partyState || "FL",
          "Property Zip": person.partyZip || '',
          County: "palm-beach",
          "Mailing Address": person.addressLine1 || '',
          "Mailing City": person.city || '',
          "Mailing State": person.state || '',
          "Mailing Zip": person.zip || '',
          csvFillingDate: person.fillingDate || '',
          productId: productId,
          originalDocType: person.dispositionDescription,
          csvCaseNumber: person.caseNumber
        };

        if (
          await saveToOwnerProductPropertyByProducer(data, this.publicProducer)
        ) {
          this.count++;
        }
      }
    }
  }

  private async parseMarriage(caseGroup: [{ [key: string]: any }]) {
    const productId = await db.models.Product.findOne({
      name: "/fl/palm-beach/marriage",
    }).exec();

    for (const group of caseGroup) {
      // save both petitioner & respondent
      for (const person of group[1]) {
        const data = {
          "Full Name": `${person.partyLastName} ${person.partyFirstName} ${person.partyMiddleName}`,
          "First Name": person.partyFirstName,
          "Last Name": person.partyLastName,
          "Middle Name": person.partyMiddleName,
          "Property Address": person.partyAddress1 || '',
          "Property Unit #": person.partyAddress2 || '',
          "Property City": person.partyCity || '',
          "Property State": person.partyState || "FL",
          "Property Zip": person.partyZip || '',
          County: "palm-beach",
          "Mailing Address": person.addressLine1 || '',
          "Mailing City": person.city || '',
          "Mailing State": person.state || '',
          "Mailing Zip": person.zip || '',
          csvFillingDate: person.fillingDate || '',
          productId: productId,
          originalDocType: person.dispositionDescription,
          csvCaseNumber: person.caseNumber
        };

        if (
          await saveToOwnerProductPropertyByProducer(data, this.publicProducer)
        ) {
          this.count++;
        }
      }
    }
  }

  private async parseChildSupport(caseGroup: [{ [key: string]: any }]) {
    const productId = await db.models.Product.findOne({
      name: "/fl/palm-beach/child-support",
    }).exec();

    for (const group of caseGroup) {
      // save both petitioner & respondent
      for (const person of group[1]) {
        const data = {
          "Full Name": `${person.partyLastName} ${person.partyFirstName} ${person.partyMiddleName}`,
          "First Name": person.partyFirstName,
          "Last Name": person.partyLastName,
          "Middle Name": person.partyMiddleName,
          "Property Address": person.partyAddress1 || '',
          "Property Unit #": person.partyAddress2 || '',
          "Property City": person.partyCity || '',
          "Property State": person.partyState || "FL",
          "Property Zip": person.partyZip || '',
          County: "palm-beach",
          "Mailing Address": person.addressLine1 || '',
          "Mailing City": person.city || '',
          "Mailing State": person.state || '',
          "Mailing Zip": person.zip || '',
          csvFillingDate: person.fillingDate || '',
          productId: productId,
          originalDocType: person.dispositionDescription,
          csvCaseNumber: person.caseNumber
        };

        if (
          await saveToOwnerProductPropertyByProducer(data, this.publicProducer)
        ) {
          this.count++;
        }
      }
    }
  }

  public async parseDebtAndTakeBoth(
    defs: { [key: string]: any }[],
    pls: { [key: string]: any }[]
  ) {
    const productId = await db.models.Product.findOne({
      name: "/fl/palm-beach/debt",
    }).exec();

    for (const def of defs) {
      const data = {
        "Full Name": `${def.partyLastName} ${def.partyFirstName} ${def.partyMiddleName}`,
        "First Name": def.partyFirstName,
        "Last Name": def.partyLastName,
        "Middle Name": def.partyMiddleName,
        "Property Address": def.partyAddress1 || '',
        "Property Unit #": def.partyAddress2 || '',
        "Property City": def.partyCity || '',
        "Property State": def.partyState || "FL",
        "Property Zip": def.partyZip || '',
        County: "palm-beach",
        csvFillingDate: def.fillingDate,
        productId: productId,
        originalDocType: def.dispositionDescription,
        csvCaseNumber: def.caseNumber
      };

      if (
        await this.saveToOwnerProductPropertyByParser(data, this.publicProducer)
      ) {
        this.count++;
      }
    }

    for (const pl of pls) {
      const data = {
        "Full Name": `${pl.partyLastName} ${pl.partyFirstName} ${pl.partyMiddleName}`,
        "First Name": pl.partyFirstName,
        "Last Name": pl.partyLastName,
        "Middle Name": pl.partyMiddleName,
        "Property Address": pl.partyAddress1 || '',
        "Property Unit #": pl.partyAddress2 || '',
        "Property City": pl.partyCity || '',
        "Property State": pl.partyState || "FL",
        "Property Zip": pl.partyZip || '',
        County: "palm-beach",
        csvFillingDate: pl.fillingDate,
        productId: productId,
        originalDocType: pl.dispositionDescription,
        csvCaseNumber: pl.caseNumber
      };

      if (
        await this.saveToOwnerProductPropertyByParser(data, this.publicProducer)
      ) {
        this.count++;
      }
    }
  }

  private async parseAutoNegligenceAndTakeBoth(
    defs: { [key: string]: any }[],
    pls: { [key: string]: any }[]
  ) {
    const productId = await db.models.Product.findOne({
      name: "/fl/palm-beach/personal-injury",
    }).exec();

    for (const def of defs) {
      const data = {
        "Full Name": `${def.partyLastName} ${def.partyFirstName} ${def.partyMiddleName}`,
        "First Name": def.partyFirstName,
        "Last Name": def.partyLastName,
        "Middle Name": def.partyMiddleName,
        "Property Address": def.partyAddress1 || '',
        "Property Unit #": def.partyAddress2 || '',
        "Property City": def.partyCity || '',
        "Property State": def.partyState || "FL",
        "Property Zip": def.partyZip || '',
        County: "palm-beach",
        csvFillingDate: def.fillingDate,
        productId: productId,
        originalDocType: def.dispositionDescription,
        csvCaseNumber: def.caseNumber
      };

      if (
        await this.saveToOwnerProductPropertyByParser(data, this.publicProducer)
      ) {
        this.count++;
      }
    }
    
    for (const pl of pls) {
      const data = {
        "Full Name": `${pl.partyLastName} ${pl.partyFirstName} ${pl.partyMiddleName}`,
        "First Name": pl.partyFirstName,
        "Last Name": pl.partyLastName,
        "Middle Name": pl.partyMiddleName,
        "Property Address": pl.partyAddress1 || '',
        "Property Unit #": pl.partyAddress2 || '',
        "Property City": pl.partyCity || '',
        "Property State": pl.partyState || "FL",
        "Property Zip": pl.partyZip || '',
        County: "palm-beach",
        csvFillingDate: pl.fillingDate,
        productId: productId,
        originalDocType: pl.dispositionDescription,
        csvCaseNumber: pl.caseNumber
      };

      if (
        await this.saveToOwnerProductPropertyByParser(data, this.publicProducer)
      ) {
        this.count++;
      }
    }
  }

  private async parseTrafficAndTakeBoth(
    defs: { [key: string]: any }[],
    pls: { [key: string]: any }[]
  ) {
    const productId = await db.models.Product.findOne({
      name: "/fl/palm-beach/traffic",
    }).exec();

    for (const def of defs) {
      const data = {
        "Full Name": `${def.partyLastName} ${def.partyFirstName} ${def.partyMiddleName}`,
        "First Name": def.partyFirstName,
        "Last Name": def.partyLastName,
        "Middle Name": def.partyMiddleName,
        "Property Address": def.partyAddress1 || '',
        "Property Unit #": def.partyAddress2 || '',
        "Property City": def.partyCity || '',
        "Property State": def.partyState || "FL",
        "Property Zip": def.partyZip || '',
        County: "palm-beach",
        csvFillingDate: def.fillingDate,
        productId: productId,
        originalDocType: def.dispositionDescription,
        csvCaseNumber: def.caseNumber
      };

      if (
        await this.saveToOwnerProductPropertyByParser(data, this.publicProducer)
      ) {
        this.count++;
      }
    }
    
    for (const pl of pls) {
      const data = {
        "Full Name": `${pl.partyLastName} ${pl.partyFirstName} ${pl.partyMiddleName}`,
        "First Name": pl.partyFirstName,
        "Last Name": pl.partyLastName,
        "Middle Name": pl.partyMiddleName,
        "Property Address": pl.partyAddress1 || '',
        "Property Unit #": pl.partyAddress2 || '',
        "Property City": pl.partyCity || '',
        "Property State": pl.partyState || "FL",
        "Property Zip": pl.partyZip || '',
        County: "palm-beach",
        csvFillingDate: pl.fillingDate,
        productId: productId,
        originalDocType: pl.dispositionDescription,
        csvCaseNumber: pl.caseNumber
      };

      if (
        await this.saveToOwnerProductPropertyByParser(data, this.publicProducer)
      ) {
        this.count++;
      }
    }
  }
 

  public get recordCount() {
    return this.count;
  }
}
