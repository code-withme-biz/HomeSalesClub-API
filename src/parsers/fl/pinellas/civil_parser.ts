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
    return ",";
  }

  public getHeaders(fileName: string): string[] {
    if(fileName.match(/pinellas-odyssey-civil/i)) {
      return this.getCivil();
    } else {
      return [];
    }
  }

  public getCivil(): string[] {
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
    ];
  }
  
  public async parse(caseGroup: [{ [key: string]: any }]): Promise<boolean> {
    for (const group of caseGroup) {
      const items = group[1];
      const pls = [];
      const defs = [];
      for(const item of items){
        // console.log(item);
        const parseNamePl = nameParsingService.newParseName(item['Plaintiff/PetitionerName']);
        const pl = 
          {
          "partyFirstName": parseNamePl.firstName,
          "partyLastName": parseNamePl.lastName,
          "partyMiddleName": parseNamePl.middleName,
          "partyAddress1": item["Plaintiff/PetitionerAddress"],
          "partyAddress2": "",
          "partyCity": item["Plaintiff/PetitionerCity"],
          "partyState": item["Plaintiff/PetitionerState"],
          "partyZip": item["Plaintiff/PetitionerZip"],
          "fillingDate": item["FillingDate"],
          "dispositionDescription": item["CaseType"],
          "caseNumber": item["caseNumber"]
          }
        pls.push(pl);

        const parseNameDf = nameParsingService.newParseName(item['Defendant/DecedentName']);
        const def = 
          {
          "partyFirstName": parseNameDf.firstName,
          "partyLastName": parseNameDf.lastName,
          "partyMiddleName": parseNameDf.middleName,
          "partyAddress1": item["Defendant/DecedentAddress"],
          "partyAddress2": "",
          "partyCity": item["Defendant/DecedentCity"],
          "partyState": item["Defendant/DecedentState"],
          "partyZip": item["Defendant/DecedentZip"],
          "fillingDate": item["FillingDate"],
          "dispositionDescription": item["CaseType"],
          "caseNumber": item["caseNumber"]
          }
        defs.push(def);
      }

      // console.log(defs);
      switch (defs[0]?.["dispositionDescription"]) {
        case "Other - Insurance Claim":
        case "CC Property Insurance Claims > $8,000 - $15,000":
        case "CC Property Insurance Claims >$15,000 - $30,000":
        case "* SC Property Insurance Claim > $100 - $500":
        case "* SC Property Insurance Claim > $500 - $2,500":
        case "* SC Property Insurance Claim >$2,500 - $5,000":
        case "* SC Property Insurance Claim >$5,000 - $8,000":
        case (defs[0]?.["dispositionDescription"].match(/property insurance claims/i) || {}).input:
          await this.parseInsuranceClaims(defs, pls);
          break;
        case "XX Auto Recovery":
          await this.parseAutoInsuranceClaims(defs, pls);
          break;
        case (defs[0]?.["dispositionDescription"].match(/AUTO NEGLIGENCE/i) || {}).input:
          await this.parseTrafficAndTakeBoth(defs, pls);
          break;
        case (defs[0]?.["dispositionDescription"].match(/NEGLIGENCE - COUNTY/i) || {}).input:
        case "Neg - Negligence Other":
          await this.parseAutoNegligence(defs, pls);
          break;
        case "Neg - Premises Liability Commercial":
        case (defs[0]?.["dispositionDescription"].match(/premises.*liability.*commercial/i) || {}).input:
        case "Neg - Premises Liability Residential":
        case (defs[0]?.["dispositionDescription"].match(/nursing home/i) || {}).input:
          await this.parsePermisesLiability(defs, pls);
          break;
        case "Contract and Indebtedness":
        case (defs[0]?.["dispositionDescription"].match(/CONTRACTS AND INDEBTEDNESS/i) || {}).input:
          await this.parseMortgageLien(defs, pls);
          break;
        case "Condominium Action":
          await this.parseHOALien(defs, pls);
          break;
        case "Real Prop Other - $0 - $50,000":
        case "Real Prop Other - >$50K - <$250,000":
        case "Real Prop Comm Foreclosure - >$50K - <$250,000":
        case (defs[0]?.["dispositionDescription"].match(/real prop other/i) || {}).input:
        case (defs[0]?.["dispositionDescription"].match(/real prop comm/i) || {}).input:
        case (defs[0]?.["dispositionDescription"].match(/real prop.*homestead/i) || {}).input:
        case (defs[0]?.["dispositionDescription"].match(/OTHER REAL PROPERTY/i) || {}).input:
        case "Real Prop Non-Homestead Res Fore - >$50K - <$250,000":
        case "Real Prop Non-Homestead Res Fore =/>$250,000":
        case "Real Prop Homestead Res Fore - $0 - $50,000":
        case "Real Prop Homestead Res Fore - >$50K - <$250,000":
        case "Real Prop Homestead Res Fore =/>$250,000":
        case "Real Property/Mortgage Foreclosure $1 - $15,000":
        case (defs[0]?.["dispositionDescription"].match(/real property mtg/i) || {}).input:
        case (defs[0]?.["dispositionDescription"].match(/foreclosure/i) || {}).input:
          await this.parsePreforeclosure(defs, pls);
          break;
        case "Other":
        case "Other - Discrimination Employment or Other":
          await this.parseEmploymentDiscrimination(defs, pls);
          break;
        case "Removal of Tenant":
        case "* Removal of Tenant  Non-Residential":
        case "* Removal of Tenant  Non-Residential & Dmgs":
        case "* Removal of Tenant  Residential":
        case (defs[0]?.["dispositionDescription"].match(/removal of tenant/i) || {}).input:
        case (defs[0]?.["dispositionDescription"].match(/EVICTION/i) || {}).input:
        case "Chapter 82 - Unlawful Detainer":
        case (defs[0]?.["dispositionDescription"].match(/UNLAWFUL DETAINER/i) || {}).input:
        case (defs[0]?.["dispositionDescription"].match(/DELINQUENT TENANT/i) || {}).input:
          await this.parseEviction(caseGroup);
          break;
        case "* Removal of Tenant  Residential & Dmgs":
          await this.parsePLSEviction(defs, pls);
          break;
        case "* SC Credit Card Debt > $500 - $2,500":
        case "* SC Credit Card Debt >$2,500 - $5,000":
        case "* SC Credit Card Debt >$5,000 - $8,000":
        case "CC Credit Card Debt > $8,000 - $15,000":
        case "CC Credit Card Debt >$15,000 - $30,000":
        case (defs[0]?.["dispositionDescription"].match(/cc credit card debt/i) || {}).input:
        case "* CC Damages > $8,000 - $15,000":
        case "* CC Damages >$15,000 - $30,000":
        case (defs[0]?.["dispositionDescription"].match(/cc damages/i) || {}).input:
        case (defs[0]?.["dispositionDescription"].match(/credit card debt damages/i) || {}).input:
        case (defs[0]?.["dispositionDescription"].match(/small claims.*damage/i) || {}).input:
        case "Replevin":
        case "CC Replevin >$15,000 - $30,000":
        case (defs[0]?.["dispositionDescription"].match(/replevin/i) || {}).input:
        case "Civil Restitution Lien </=$100":
          await this.parseDebt(defs, pls);
          break;
        case "* SC Damages > $100 - $500":
        case "* SC Damages > $500 - $2,500":
        case "* SC Damages >$2,500 - $5,000":
        case "* SC Damages >$5,000 - $8,000":
        case (defs[0]?.["dispositionDescription"].match(/sc.*damages/i) || {}).input:
          await this.parseSCDamageDebt(defs, pls);
          break;
        case "* SC PIP </=$100":
        case "* SC PIP > $100 - $500":
        case "* SC PIP > $500 - $2,500":
        case "* SC PIP >$2,500 - $5,000":
        case "* SC PIP >$5,000 - $8,000":
        case "* PIP Claims > $8,000 - $15,000":
        case (defs[0]?.["dispositionDescription"].match(/pip.*claims/i) || {}).input:
          await this.parsePermisesLiability(defs, pls);
          break;
        case "Neg - Negligent Security":
          await this.parseAutoNegligence(defs, pls);
          break;
        case "CC Equity </= $15,000":
        case "CC Equity >$15,000 - $30,000":
        case (defs[0]?.["dispositionDescription"].match(/cc equity/i) || {}).input:
        case "Foreign Judgment (Civil)":
        case (defs[0]?.["dispositionDescription"].match(/FOREIGN JUDGMENT/i) || {}).input:
        case "Products Liability":
        case (defs[0]?.["dispositionDescription"].match(/products liability/i) || {}).input:
          await this.parseCivil(defs, pls);
          break;
        case "Neg - Construction Defect":
          await this.parsePropertyDefect(defs, pls);
          break;
        case "Fraud":
          break;
        case "Diss. of  Marriage +":
        case "Diss. of  Marriage +":
        case (defs[0]?.["dispositionDescription"].match(/DISSOLUTION OF MARRIAGE/i) || {}).input:
          await this.parseDivorce(caseGroup);
          break;
        case "Name Change +":
        case (defs[0]?.["dispositionDescription"].match(/NAME CHANGE/i) || {}).input:
        case "Other Domestic Relations +":
          await this.parseMarriage(caseGroup);
          break;
        case "Child Support/IV-D":
        case (defs[0]?.["dispositionDescription"].match(/IV-D SUPPORT/i) || {}).input:
        case "Paternity +":
        case (defs[0]?.["dispositionDescription"].match(/paternity/i) || {}).input:
        case "Enf Admin Support/IV-D":
        case "Temp Custody by Extended Family +":
        case (defs[0]?.["dispositionDescription"].match(/CHILD CUSTODY/i) || {}).input:
        case "Enf of For Jgmt (Support) +":
        case "Disestablishment of Paternity +":
          await this.parseChildSupport(caseGroup);
          break;
        case "Neg - Business Tort":
        case (defs[0]?.["dispositionDescription"].match(/BUSINESS TORTS/i) || {}).input:
        case "Professional Malpractice - Medical":
        case (defs[0]?.["dispositionDescription"].match(/professional malpractice/i) || {}).input:
        case (defs[0]?.["dispositionDescription"].match(/malpractice.*medical/i) || {}).input:
          await this.parsePersonalInjuryAndTakeBoth(defs, pls);
          break;
        case "Extension of Time":
        case "Other - Business Transaction":
        case (defs[0]?.["dispositionDescription"].match(/business transaction/i) || {}).input:
        case "Forfeiture":
        case (defs[0]?.["dispositionDescription"].match(/shareholder derivative/i) || {}).input:
        case (defs[0]?.["dispositionDescription"].match(/confirm arbitration/i) || {}).input:
          await this.parseOtherCivilAndTakeBoth(defs, pls);
          break;
        case "Other - Anti-trust/Trade Regulation":
        case "eWrit Issuance - Garnishment":
        case "CC/TC of Continuing Garnishment W/Req Forms I":
        case (defs[0]?.["dispositionDescription"].match(/cc enforce/i) || {}).input:
        case (defs[0]?.["dispositionDescription"].match(/^small claims/i) || {}).input:
          await this.parseDebtAndTakeBoth(defs, pls);
          break;
        case (defs[0]?.["dispositionDescription"].match(/trust litigation/i) || {}).input:
          await this.parsePreinheritence(defs, pls);
          break;
        case "Declaratory Judgment":
          await this.parseDeclaratoryJudgmentAndTakeBoth(defs, pls);
          break;
        case (defs[0]?.["dispositionDescription"].match(/habeas corpus/i) || {}).input:
            await this.parseCriminal(defs, pls);
            break;
        case (defs[0]?.["dispositionDescription"].match(/DOMESTIC.*VIOLENCE/i) || {}).input:
          await this.parseCriminalAndTakeBoth(defs, pls);
          break;
        case (defs[0]?.["dispositionDescription"].match(/libel\/slander/i) || {}).input:
          await this.parseOtherCivilTakePl(defs, pls);
          break;
        default:
          console.log(defs[0]?.["dispositionDescription"]);
          fs.appendFile('log.txt', defs[0]?.["dispositionDescription"] + ' | ' + defs[0]?.["caseNumber"] + '\n', function (err: any) {
            if (err) {
              // append failed
            } else {
              // done
            }
          })
          break;
      }
      // console.log(group);
    }

    return true;
  }

  private async parseInsuranceClaims(
    defs: { [key: string]: any }[],
    pls: { [key: string]: any }[]
  ) {
    const productId = await db.models.Product.findOne({
      name: "/fl/pinellas/insurance-claims",
    }).exec();

    for (const pl of pls) {
      const data = {
        "Full Name": `${pl.partyLastName} ${pl.partyFirstName} ${pl.partyMiddleName}`,
        "First Name": pl.partyFirstName,
        "Last Name": pl.partyLastName,
        "Middle Name": pl.partyMiddleName,
        "Property Address": pl.partyAddress1,
        "Property Unit #": pl.partyAddress2,
        "Property City": pl.partyCity,
        "Property State": pl.partyState || "FL",
        "Property Zip": pl.partyZip,
        County: "pinellas",
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

  public async parseAutoInsuranceClaims(
    defs: { [key: string]: any }[],
    pls: { [key: string]: any }[]
  ) {
    const productId = await db.models.Product.findOne({
      name: "/fl/pinellas/insurance-claims",
    }).exec();

    for (const def of defs) {
      const data = {
        "Full Name": `${def.partyLastName} ${def.partyFirstName} ${def.partyMiddleName}`,
        "First Name": def.partyFirstName,
        "Last Name": def.partyLastName,
        "Middle Name": def.partyMiddleName,
        "Property Address": def.partyAddress1,
        "Property Unit #": def.partyAddress2,
        "Property City": def.partyCity,
        "Property State": def.partyState || "FL",
        "Property Zip": def.partyZip,
        County: "pinellas",
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

  private async parseAutoNegligence(
    defs: { [key: string]: any }[],
    pls: { [key: string]: any }[]
  ) {
    const productId = await db.models.Product.findOne({
      name: "/fl/pinellas/personal-injury",
    }).exec();

    for (const def of defs) {
      const data = {
        "Full Name": `${def.partyLastName} ${def.partyFirstName} ${def.partyMiddleName}`,
        "First Name": def.partyFirstName,
        "Last Name": def.partyLastName,
        "Middle Name": def.partyMiddleName,
        "Property Address": def.partyAddress1,
        "Property Unit #": def.partyAddress2,
        "Property City": def.partyCity,
        "Property State": def.partyState || "FL",
        "Property Zip": def.partyZip,
        County: "pinellas",
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

  private async parseCriminal(
    defs: { [key: string]: any }[],
    pls: { [key: string]: any }[]
  ) {
    const productId = await db.models.Product.findOne({
      name: "/fl/pinellas/criminal",
    }).exec();

    for (const def of defs) {
      const data = {
        "Full Name": `${def.partyLastName} ${def.partyFirstName} ${def.partyMiddleName}`,
        "First Name": def.partyFirstName,
        "Last Name": def.partyLastName,
        "Middle Name": def.partyMiddleName,
        "Property Address": def.partyAddress1,
        "Property Unit #": def.partyAddress2,
        "Property City": def.partyCity,
        "Property State": def.partyState || "FL",
        "Property Zip": def.partyZip,
        County: "pinellas",
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

  private async parseCriminalAndTakeBoth(
    defs: { [key: string]: any }[],
    pls: { [key: string]: any }[]
  ) {
    const productId = await db.models.Product.findOne({
      name: "/fl/pinellas/criminal",
    }).exec();

    for (const def of defs) {
      const data = {
        "Full Name": `${def.partyLastName} ${def.partyFirstName} ${def.partyMiddleName}`,
        "First Name": def.partyFirstName,
        "Last Name": def.partyLastName,
        "Middle Name": def.partyMiddleName,
        "Property Address": def.partyAddress1,
        "Property Unit #": def.partyAddress2,
        "Property City": def.partyCity,
        "Property State": def.partyState || "FL",
        "Property Zip": def.partyZip,
        County: "pinellas",
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
        "Property Address": pl.partyAddress1,
        "Property Unit #": pl.partyAddress2,
        "Property City": pl.partyCity,
        "Property State": pl.partyState || "FL",
        "Property Zip": pl.partyZip,
        County: "pinellas",
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
      name: "/fl/pinellas/personal-injury",
    }).exec();

    for (const def of defs) {
      const data = {
        "Full Name": `${def.partyLastName} ${def.partyFirstName} ${def.partyMiddleName}`,
        "First Name": def.partyFirstName,
        "Last Name": def.partyLastName,
        "Middle Name": def.partyMiddleName,
        "Property Address": def.partyAddress1,
        "Property Unit #": def.partyAddress2,
        "Property City": def.partyCity,
        "Property State": def.partyState || "FL",
        "Property Zip": def.partyZip,
        County: "pinellas",
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
        "Property Address": pl.partyAddress1,
        "Property Unit #": pl.partyAddress2,
        "Property City": pl.partyCity,
        "Property State": pl.partyState || "FL",
        "Property Zip": pl.partyZip,
        County: "pinellas",
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
      name: "/fl/pinellas/traffic",
    }).exec();

    for (const def of defs) {
      const data = {
        "Full Name": `${def.partyLastName} ${def.partyFirstName} ${def.partyMiddleName}`,
        "First Name": def.partyFirstName,
        "Last Name": def.partyLastName,
        "Middle Name": def.partyMiddleName,
        "Property Address": def.partyAddress1,
        "Property Unit #": def.partyAddress2,
        "Property City": def.partyCity,
        "Property State": def.partyState || "FL",
        "Property Zip": def.partyZip,
        County: "pinellas",
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
        "Property Address": pl.partyAddress1,
        "Property Unit #": pl.partyAddress2,
        "Property City": pl.partyCity,
        "Property State": pl.partyState || "FL",
        "Property Zip": pl.partyZip,
        County: "pinellas",
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

  private async parseDeclaratoryJudgmentAndTakeBoth(
    defs: { [key: string]: any }[],
    pls: { [key: string]: any }[]
  ) {
    const productId = await db.models.Product.findOne({
      name: "/fl/pinellas/declaratory-judgment",
    }).exec();

    for (const def of defs) {
      const data = {
        "Full Name": `${def.partyLastName} ${def.partyFirstName} ${def.partyMiddleName}`,
        "First Name": def.partyFirstName,
        "Last Name": def.partyLastName,
        "Middle Name": def.partyMiddleName,
        "Property Address": def.partyAddress1,
        "Property Unit #": def.partyAddress2,
        "Property City": def.partyCity,
        "Property State": def.partyState || "FL",
        "Property Zip": def.partyZip,
        County: "pinellas",
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
        "Property Address": pl.partyAddress1,
        "Property Unit #": pl.partyAddress2,
        "Property City": pl.partyCity,
        "Property State": pl.partyState || "FL",
        "Property Zip": pl.partyZip,
        County: "pinellas",
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
      name: "/fl/pinellas/other-civil",
    }).exec();

    for (const def of defs) {
      const data = {
        "Full Name": `${def.partyLastName} ${def.partyFirstName} ${def.partyMiddleName}`,
        "First Name": def.partyFirstName,
        "Last Name": def.partyLastName,
        "Middle Name": def.partyMiddleName,
        "Property Address": def.partyAddress1,
        "Property Unit #": def.partyAddress2,
        "Property City": def.partyCity,
        "Property State": def.partyState || "FL",
        "Property Zip": def.partyZip,
        County: "pinellas",
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
        "Property Address": pl.partyAddress1,
        "Property Unit #": pl.partyAddress2,
        "Property City": pl.partyCity,
        "Property State": pl.partyState || "FL",
        "Property Zip": pl.partyZip,
        County: "pinellas",
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

  private async parsePermisesLiability(
    defs: { [key: string]: any }[],
    pls: { [key: string]: any }[]
  ) {
    const productId = await db.models.Product.findOne({
      name: "/fl/pinellas/personal-injury",
    }).exec();

    // we target plaintiff because this is where plaintiff gets in accident on property due to property owner negligence
    for (const pl of pls) {
      const data = {
        "Full Name": `${pl.partyLastName} ${pl.partyFirstName} ${pl.partyMiddleName}`,
        "First Name": pl.partyFirstName,
        "Last Name": pl.partyLastName,
        "Middle Name": pl.partyMiddleName,
        "Property Address": pl.partyAddress1,
        "Property Unit #": pl.partyAddress2,
        "Property City": pl.partyCity,
        "Property State": pl.partyState || "FL",
        "Property Zip": pl.partyZip,
        County: "pinellas",
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

  private async parseOtherCivilTakePl(
    defs: { [key: string]: any }[],
    pls: { [key: string]: any }[]
  ) {
    const productId = await db.models.Product.findOne({
      name: "/fl/pinellas/other-civil",
    }).exec();

    for (const pl of pls) {
      const data = {
        "Full Name": `${pl.partyLastName} ${pl.partyFirstName} ${pl.partyMiddleName}`,
        "First Name": pl.partyFirstName,
        "Last Name": pl.partyLastName,
        "Middle Name": pl.partyMiddleName,
        "Property Address": pl.partyAddress1,
        "Property Unit #": pl.partyAddress2,
        "Property City": pl.partyCity,
        "Property State": pl.partyState || "FL",
        "Property Zip": pl.partyZip,
        County: "pinellas",
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

  // Contract indebtedness is most common in the mortgage industry, when a party is in debt to a lender from the purchase of a home mortgage loan
  private async parseMortgageLien(
    defs: { [key: string]: any }[],
    pls: { [key: string]: any }[]
  ) {
    const productId = await db.models.Product.findOne({
      name: "/fl/pinellas/mortgage-lien",
    }).exec();
    const parties = defs.concat(pls);

    for (const party of parties) {
      const data = {
        "Full Name": `${party.partyFirstName} ${party.partyLastName} ${party.partyMiddleName}`,
        "First Name": party.partyFirstName,
        "Last Name": party.partyLastName,
        "Middle Name": party.partyMiddleName,
        "Property Address": party.partyAddress1,
        "Property Unit #": party.partyAddress2,
        "Property City": party.partyCity,
        "Property State": party.partyState || "FL",
        "Property Zip": party.partyZip,
        County: "pinellas",
        csvFillingDate: party.fillingDate,
        productId: productId,
        originalDocType: party.dispositionDescription,
        csvCaseNumber: party.caseNumber
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
      name: "/fl/pinellas/hoa-lien",
    }).exec();

    for (const def of defs) {
      const data = {
        "Full Name": `${def.partyLastName} ${def.partyFirstName} ${def.partyMiddleName}`,
        "First Name": def.partyFirstName,
        "Last Name": def.partyLastName,
        "Middle Name": def.partyMiddleName,
        "Property Address": def.partyAddress1,
        "Property Unit #": def.partyAddress2,
        "Property City": def.partyCity,
        "Property State": def.partyState || "FL",
        "Property Zip": def.partyZip,
        County: "pinellas",
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

  private async parsePreforeclosure(
    defs: { [key: string]: any }[],
    pls: { [key: string]: any }[]
  ) {
    const productId = await db.models.Product.findOne({
      name: "/fl/pinellas/preforeclosure",
    }).exec();

    for (const def of defs) {
      const data = {
        "Full Name": `${def.partyLastName} ${def.partyFirstName} ${def.partyMiddleName}`,
        "First Name": def.partyFirstName,
        "Last Name": def.partyLastName,
        "Middle Name": def.partyMiddleName,
        "Property Address": def.partyAddress1,
        "Property Unit #": def.partyAddress2,
        "Property City": def.partyCity,
        "Property State": def.partyState || "FL",
        "Property Zip": def.partyZip,
        County: "pinellas",
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

  private async parseEmploymentDiscrimination(
    defs: { [key: string]: any }[],
    pls: { [key: string]: any }[]
  ) {
    const productId = await db.models.Product.findOne({
      name: "/fl/pinellas/employment-discrimination",
    }).exec();

    for (const def of defs) {
      const data = {
        "Full Name": `${def.partyLastName} ${def.partyFirstName} ${def.partyMiddleName}`,
        "First Name": def.partyFirstName,
        "Last Name": def.partyLastName,
        "Middle Name": def.partyMiddleName,
        "Property Address": def.partyAddress1,
        "Property Unit #": def.partyAddress2,
        "Property City": def.partyCity,
        "Property State": def.partyState || "FL",
        "Property Zip": def.partyZip,
        County: "pinellas",
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

  private async parseEviction(caseGroup: [{ [key: string]: any }]) {
    const productId = await db.models.Product.findOne({
      name: "/fl/pinellas/eviction",
    }).exec();

    for (const group of caseGroup) {
      const parties = group[1];

      const pls = parties.filter((item: { [key: string]: any }) => {
        return item["partyTypeCode"] === "PL";
      });

      const defs = parties.filter((item: { [key: string]: any }) => {
        return item["partyTypeCode"] === "DF";
      });

      for (const pl of pls) {
        const data = {
          "Full Name": `${pl.partyLastName} ${pl.partyFirstName} ${pl.partyMiddleName}`,
          "First Name": pl.partyFirstName,
          "Last Name": pl.partyLastName,
          "Middle Name": pl.partyMiddleName,
          "Property Address": defs[0].partyAddress1,
          "Property Unit #": defs[0].partyAddress2,
          "Property City": defs[0].partyCity,
          "Property State": defs[0].partyState || "FL",
          "Property Zip": defs[0].partyZip,
          County: "pinellas",
          "Mailing Address": pl.addressLine1,
          "Mailing City": pl.city,
          "Mailing State": pl.state,
          "Mailing Zip": pl.zip,
          csvFillingDate: pl.fillingDate,
          productId: productId,
          originalDocType: pl.dispositionDescription,
          csvCaseNumber: pl.caseNumber
        };

        if (
          await saveToOwnerProductPropertyByProducer(data, this.publicProducer)
        ) {
          this.count++;
        }
      }
    }
  }

  private async parseDivorce(caseGroup: [{ [key: string]: any }]) {
    const productId = await db.models.Product.findOne({
      name: "/fl/pinellas/divorce",
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
          County: "pinellas",
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
      name: "/fl/pinellas/marriage",
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
          County: "pinellas",
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
      name: "/fl/pinellas/child-support",
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
          County: "pinellas",
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

  public async parsePLSEviction(
    defs: { [key: string]: any }[],
    pls: { [key: string]: any }[]
  ) {
    const productId = await db.models.Product.findOne({
      name: "/fl/pinellas/eviction",
    }).exec();

    // we target plaintiff because this is where plaintiff gets in accident on property due to property owner negligence
    for (const pl of pls) {
      const data = {
        "Full Name": `${pl.partyLastName} ${pl.partyFirstName} ${pl.partyMiddleName}`,
        "First Name": pl.partyFirstName,
        "Last Name": pl.partyLastName,
        "Middle Name": pl.partyMiddleName,
        "Property Address": pl.partyAddress1,
        "Property Unit #": pl.partyAddress2,
        "Property City": pl.partyCity,
        "Property State": pl.partyState || "FL",
        "Property Zip": pl.partyZip,
        County: "pinellas",
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

  public async parseDebt(
    defs: { [key: string]: any }[],
    pls: { [key: string]: any }[]
  ) {
    const productId = await db.models.Product.findOne({
      name: "/fl/pinellas/debt",
    }).exec();

    for (const def of defs) {
      const data = {
        "Full Name": `${def.partyLastName} ${def.partyFirstName} ${def.partyMiddleName}`,
        "First Name": def.partyFirstName,
        "Last Name": def.partyLastName,
        "Middle Name": def.partyMiddleName,
        "Property Address": def.partyAddress1,
        "Property Unit #": def.partyAddress2,
        "Property City": def.partyCity,
        "Property State": def.partyState || "FL",
        "Property Zip": def.partyZip,
        County: "pinellas",
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

  public async parseDebtAndTakeBoth(
    defs: { [key: string]: any }[],
    pls: { [key: string]: any }[]
  ) {
    const productId = await db.models.Product.findOne({
      name: "/fl/pinellas/debt",
    }).exec();

    for (const def of defs) {
      const data = {
        "Full Name": `${def.partyLastName} ${def.partyFirstName} ${def.partyMiddleName}`,
        "First Name": def.partyFirstName,
        "Last Name": def.partyLastName,
        "Middle Name": def.partyMiddleName,
        "Property Address": def.partyAddress1,
        "Property Unit #": def.partyAddress2,
        "Property City": def.partyCity,
        "Property State": def.partyState || "FL",
        "Property Zip": def.partyZip,
        County: "pinellas",
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
        "Property Address": pl.partyAddress1,
        "Property Unit #": pl.partyAddress2,
        "Property City": pl.partyCity,
        "Property State": pl.partyState || "FL",
        "Property Zip": pl.partyZip,
        County: "pinellas",
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

  public async parsePreinheritence(
    defs: { [key: string]: any }[],
    pls: { [key: string]: any }[]
  ) {
    const productId = await db.models.Product.findOne({
      name: "/fl/pinellas/pre-inheritance",
    }).exec();

    for (const def of defs) {
      const data = {
        "Full Name": `${def.partyLastName} ${def.partyFirstName} ${def.partyMiddleName}`,
        "First Name": def.partyFirstName,
        "Last Name": def.partyLastName,
        "Middle Name": def.partyMiddleName,
        "Property Address": def.partyAddress1,
        "Property Unit #": def.partyAddress2,
        "Property City": def.partyCity,
        "Property State": def.partyState || "FL",
        "Property Zip": def.partyZip,
        County: "pinellas",
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
        "Property Address": pl.partyAddress1,
        "Property Unit #": pl.partyAddress2,
        "Property City": pl.partyCity,
        "Property State": pl.partyState || "FL",
        "Property Zip": pl.partyZip,
        County: "pinellas",
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

  public async parseSCDamageDebt(
    defs: { [key: string]: any }[],
    pls: { [key: string]: any }[]
  ) {
    const productId = await db.models.Product.findOne({
      name: "/fl/pinellas/debt",
    }).exec();

    for (const pl of pls) {
      const data = {
        "Full Name": `${pl.partyLastName} ${pl.partyFirstName} ${pl.partyMiddleName}`,
        "First Name": pl.partyFirstName,
        "Last Name": pl.partyLastName,
        "Middle Name": pl.partyMiddleName,
        "Property Address": pl.partyAddress1,
        "Property Unit #": pl.partyAddress2,
        "Property City": pl.partyCity,
        "Property State": pl.partyState || "FL",
        "Property Zip": pl.partyZip,
        County: "pinellas",
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

  public async parseCivil(
    defs: { [key: string]: any }[],
    pls: { [key: string]: any }[]
  ) {
    const productId = await db.models.Product.findOne({
      name: "/fl/pinellas/other-civil",
    }).exec();

    for (const def of defs) {
      const data = {
        "Full Name": `${def.partyLastName} ${def.partyFirstName} ${def.partyMiddleName}`,
        "First Name": def.partyFirstName,
        "Last Name": def.partyLastName,
        "Middle Name": def.partyMiddleName,
        "Property Address": def.partyAddress1,
        "Property Unit #": def.partyAddress2,
        "Property City": def.partyCity,
        "Property State": def.partyState || "FL",
        "Property Zip": def.partyZip,
        County: "pinellas",
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

  public async parsePropertyDefect(
    defs: { [key: string]: any }[],
    pls: { [key: string]: any }[]
  ) {
    const productId = await db.models.Product.findOne({
      name: "/fl/pinellas/property-defect",
    }).exec();

    for (const pl of pls) {
      const data = {
        "Full Name": `${pl.partyLastName} ${pl.partyFirstName} ${pl.partyMiddleName}`,
        "First Name": pl.partyFirstName,
        "Last Name": pl.partyLastName,
        "Middle Name": pl.partyMiddleName,
        "Property Address": pl.partyAddress1,
        "Property Unit #": pl.partyAddress2,
        "Property City": pl.partyCity,
        "Property State": pl.partyState || "FL",
        "Property Zip": pl.partyZip,
        County: "pinellas",
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
