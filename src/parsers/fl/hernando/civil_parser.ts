import AbstractParser from "../../abstract_parser";
import { IPublicRecordProducer } from "../../../models/public_record_producer";
import db from "../../../models/db";
const nameParsingService = require("../../../categories/public_records/consumers/property_appraisers/consumer_dependencies/nameParsingServiceNew");

export default class CivilParser extends AbstractParser {
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
    if (/[0-9]{2}-[0-9]{2}-[0-9]{2}\.(csv|CSV)/g.test(fileName)) {
      return ",";
    } else if (/[0-9]{4}-[0-9]{2}-[0-9]{2}.(csv|CSV)/g.test(fileName)) {
      return "|";
    } else return " ";
  }

  public getHeaders(fileName: string, type: string): string[] {
    if (/[0-9]{4}-[0-9]{2}-[0-9]{2}.(csv|CSV)/g.test(fileName)) {
      this.type = "CSV";
      return this.getCSVHeaders();
    } else if (/[0-9]{2}-[0-9]{2}-[0-9]{2}\.(csv|CSV)/g.test(fileName)) {
      this.type = "OFFICIAL";
      return this.getOfficialHeaders();
    } else {
      return [];
    }
  }

  private getCSVHeaders(): string[] {
    return [
      "",
      "abbreviation",
      "caseNumber",
      "description",
      "fillingDate",
      "status",
      "partyType",
      "partyName",
      "partyAddress1",
      "",
      "city",
      "state",
      "zip",
    ];
  }

  private getOfficialHeaders(): string[] {
    return [
      "grantor",
      "grantee",
      "clerkNumber",
      "book",
      "pageNumber",
      "dispositionDescription",
      "legal",
      "date",
    ];
  }

  public async parse(caseGroup: [{ [key: string]: any }]): Promise<boolean> {
    console.log("parsing ... ... ...");
    for (const group of caseGroup) {
      const items = group[1];
      if (this.type === "CSV") {
        const pls: any[] = items.filter((item: { [key: string]: any }) => {
          return item["partyType"] === "Plaintiff";
        });
        const defs: any[] = items.filter((item: { [key: string]: any }) => {
          return item["partyType"] === "Defendant";
        });
        await this.process(defs, pls);
      } else if (this.type === "OFFICIAL") {
      }
    }
    return true;
  }

  private async process(defs: any[], pls: any[]) {
    if (defs[0]?.["description"].replace(/\s+/g, " ")) {
      switch (defs[0]?.["description"].replace(/\s+/g, " ")) {
        case "z DO NOT USE - Legacy Mortgage Foreclosure":
        case "Mortgage/Real Property Foreclosure (County Civil)":
        case "RPMF -Other Action":
        case "RPMF -Other Action ($0 - $50,000)":
        case "RPMF -Other Action ($50,001 - $249,999)":
        case "RPMF -Other Action ($250,000 or more)":
        case "HOMESTEAD-RESID $50K-$249K":
        case "RPMF -Homestead":
        case "RPMF -Homestead ($0 - $50,000)":
        case "RPMF -Homestead ($50,001 - $249,999)":
        case "RPMF -Homestead ($250,000 or more)":
        case "RPMF -Non-Homestead":
        case "RPMF -Non-Homestead ($0 - $50,000)":
        case "RPMF -Non-Homestead ($50,001 - $249,999)":
        case "RPMF -Non-Homestead ($250,000 or more)":
        case "RPMF -Commercial":
        case "RPMF -Commercial ($0 - $50,000)":
        case "RPMF -Commercial ($50,001 - $249,999)":
        case "RPMF -Commercial ($250,000 or more)":
          await this.parsePreforeclosure(defs, pls);
          break;
        case "Nursing Home Negligence":
        case "AUTO NEGLIGENCE":
        case "Auto Negligence":
        case "Auto Negligence ($8,001 - $15,000)":
        case "Auto Negligence ($15,001 - $30,000)":
        case "Batch Filed SP Auto Negligence (Up to $5,000)":
        case "SP Auto Negligence (Up to $5,000)":
        case "SP Auto Negligence ($5,001 to $8,000)":
          await this.parseTrafficAndTakeBoth(defs, pls);
          break;
        case "Other Negligence":
        case "Other Negligence ($8,001 - $15,000)":
        case "Other Negligence ($15,001 - $30,000)":
        case "SP Other Negligence (Up to $5,000)":
        case "SP Other Negligence ($5,001 to $8,000)":
          await this.parseAutoNegligence(defs, pls);
          break;
        case "Contract & Indebtedness":
        case "CONTRACT AND INDEBTEDNESS":
        case "Contract and Indebtedness ($8,001 - $15,000)":
        case "Contract and Indebtedness ($15,001 - $30,000)":
        case "SP Contract and Indebtedness (Up to $5,000)":
        case "SP Contract and Indebtedness ($5,001 to $8,000)":
        case "Amended FJ":
        case "Based on Vol Dismissals":
        case "Clerical Error":
        case "Clerical error":
        case "Clerical error 06-25-19 date was incorrect.":
        case "Clerical error 07-05-19 was not the correct date.":
        case "Clerical error closing date was wrong":
        case "Clerical error date changed":
        case "Clerical error date was wrong.":
        case "Clerical error date.":
        case "Clerical error in date":
        case "Clerical error in the closing date":
        case "Clerical error in the date":
        case "Clerical error in the date.":
        case "Clerical error in the dates":
        case "Clerical error incorrect closing date 01-04-20.":
        case "Clerical error should be 04-23-19":
        case "Clerical error should be 11-21-17":
        case "Clerical error the closing date is 05-15-19.":
        case "Clerical error the closing date should be 05-17-19":
        case "Clerical error the closing date should be 07-31-17 not 08-01-17":
        case "Clerical error the date should be 05-23-19.":
        case "Clerical error the date should be 05-27-19.":
        case "Clerical error the date should be 05-28-19":
        case "Clerical error the date should be 06-06-19.":
        case "Clerical error the date should be 08-02-19":
        case "Clerical error the date should be 08-08-19.":
        case "Clerical error the date was incorrect.":
        case "Clerical error the judgment was signed on 02/10/21.":
        case "Clerical error wrong date.":
        case "Clerical error.":
        case "Clerical error. The correct closing date is 05-09-19.":
        case "Clerk error":
        case "Clerks error should not be 01-19-17":
        case "Closed by the Judge on 06-20-17":
        case "Closing date was update.":
        case "Correct closing date is 7/25/2018":
        case "DJUD - Default Final Judgment":
        case "Date should Reflect date of SGBK":
        case "Date was updated 11-25-19 was incorrect.":
        case "Error":
        case "FJDF - Final Jdmt For Defendant":
        case "FJUD":
        case "FJUD - Final Judgment":
        case "FORC - Final Order Removing Case From Printout":
        case "FORD":
        case "FORD - Final Order":
        case "FWOP":
        case "FWOP - Order Of Dismissal (f.W.O.P.)":
        case "Final Judgment":
        case "Incorrect closing date in error":
        case "Judge signed in place FJ with wrong case number":
        case "NOTR - Notice Of Removal To Federal Court":
        case "ODIS":
        case "ODIS - Order Of Dismissal":
        case "OTRN - Order Of Transfer (change Of Venue)":
        case "Order Did Not Close the Case":
        case "Order Directing Clerk To Reopen Case":
        case "Order of Dismissal":
        case "Order of Dismissal & Order Approving stip":
        case "Order of Dismissal filed on 2/20/2018":
        case "Order of dismissal was filed first.":
        case "Per VOLD":
        case "SGBK - Suggestion Of Bankruptcy":
        case "STOJ - Stip Of Settlement/jdgmt":
        case "SUJU - Summary Final Judgment":
        case "The closing order clerk made a clerical error in dates and documents.":
        case "VOLD - Voluntary Dismissal":
        case "VOLD filed.":
        case "VOLUNTARY DISMISSAL":
        case "Voluntary Dismissal":
        case "Voluntary Dismissal Filed 3/16/2020":
        case "clerical error":
        case "clerical error in dates":
        case "closed by default final judgment":
        case "closed on prior date in error":
        case "closed per judge order of Dismissal":
        case "date changed due to clerical error":
        case "date changed due to clerk error":
        case "default final judgment date was updated":
        case "error":
        case "incorrect date was entered":
        case "per judges order":
        case "see order":
        case "see order of dismissal":
        case "this case has a summary judgment":
        case "updated disp see order and date":
        case "voluntary dismissal date was updated":
        case "was not suppose to close out case/voluntary dismissal only for one def":
        case "ADMINISTRATION":
        case "SUMMARY ADMINISTRATION $1000 & OVER":
        case "SAFETY DEPOSIT BOX":
        case "DISPOSITION WITHOUT ADMINISTRATION":
          await this.parseDebt(defs, pls);
          break;
        case "Condominium":
        case "Condominium ($8,001 - $15,000)":
        case "Condominium ($15,001 - $30,000)":
        case "SP Condominium (Up to $5,000)":
        case "SP Condominium ($5,001 to $8,000)":
          await this.parseHOALien(defs, pls);
          break;
        case "Personal Injury Protection":
        case "Personal Injury Protection ($8,001 - $15,000)":
        case "Personal Injury Protection ($15,001 - $30,000)":
        case "SP Personal Injury Protection (Up to $5,000)":
        case "SP Personal Injury Protection ($5,001 to $8,000)":
        case "Batch Filed SP Personal Injury Protection (Up to $5,000)":
        case "Batch Filed SP Personal Injury Protection ($5001 to $8000)":
        case "Negligent Security":
        case "Comm Premises Liability":
        case "Medical Malpractice":
          await this.parsePersonalInjury(defs, pls);
          break;
        case "Insurance Claim":
        case "INSURANCE CLAIM":
          await this.parseInsuranceClaims(defs, pls);
          break;
        case "OTHER CIVIL: OTHER CIRCUIT CIVIL":
        case "OTHER COUNTY CIVIL":
        case "Other Civil Complaint":
        case "Other Civil Complaint (Non-Monetary)":
        case "Equitable Relief":
        case "Equitable Relief (Less than $30,000)":
        case "Antitrust / Trade Regulation":
        case "Other Professional Malpractice":
        case "Shareholder Derivative":
        case "Declaratory Judgment":
        case "Declaratory Judgment (Less than $30,000)":
        case "Injunctive Relief":
        case "Injunctive Relief (Less than $30,000)":
        case "Replevin":
        case "Replevin ($0 - $15,000)":
        case "Replevin ($15,001 - $30,000)":
        case "SP Replevin (Up to $5,000)":
        case "Resid. Premises Liability":
        case "Securities Litigation":
        case "Property Lien":
        case "Construction Lien":
        case "Construction Lien Foreclosure ($8,001 - $15,000)":
        case "Construction Lien Foreclosure ($15,001 - $30,000)":
        case "SP Construction Lien Foreclosure (Up to $5,000)":
        case "SP Construction Lien Foreclosure ($5,001 to $8,000)":
        case "Batch Filed SP Construction Lien Foreclosure (Up to $5,000":
        case "Construction Defect":
        case "Business Governance":
        case "Business Malpractice":
        case "Voluntary Binding Arbitration":
        case "Voluntary Binding Arbitration ($8,001 - $15,000)":
        case "Voluntary Binding Arbitration ($15,001 - $30,000)":
        case "SP Voluntary Binding Arbitration (Up to $5,000)":
        case "SP Voluntary Binding Arbitration ($5,001 to $8,000)":
        case "Libel / Slander":
        case "Eminent Domain":
        case "Small Claims (Up to $5000)":
        case "Small Claims ($5,001 to $8,000)":
        case "Small Claims Foreign Judgment":
        case "SMALL CLAIMS $500-$2500":
        case "SMALL CLAIMS $2,500-$5,000":
        case "SMALL CLAIMS $5,000-$8,000":
        case "Trade Secrets":
        case "SP Landlord Tenant (Up to $5,000)":
        case "SP Landlord Tenant ($5,001 to $8,000)":
        case "Discrimination - Employment or Other":
        case "International Commercial Arbitration":
        case "Trust Litigation":
        case "County Civil (Non-Monetary)":
        case "COUNTY CIVIL $8,000-$15,000":
        case "Challenge - Statute or Ordinance":
        case "Intellectual Property":
        case "Civil Forfeiture":
        case "Third Party Indemnification":
        case "Pet for Advers Prelim Hrg":
        case "Pet for Advers Prelim Hrg (Less than $30,000)":
          await this.parseOtherCivil(defs, pls);
          break;
        case "Evictions (Non-Monetary)":
        case "Evictions < $15,000":
        case "Evictions ($15,001 - $30,000)":
        case "Evictions - Residential":
        case "Evictions - Non-Residential":
        case "EVICTION NON-MONETARY - RESIDENTIAL":
          await this.parseEviction(defs, pls);
          break;
      }
    }
    return true;
  }

  private async parsePreforeclosure(
    defs: { [key: string]: any }[],
    pls: { [key: string]: any }[]
  ) {
    const productId = await db.models.Product.findOne({
      name: "/fl/hernando/preforeclosure",
    }).exec();

    for (const def of defs) {
      const parsedName = nameParsingService.newParseName(def.partyName);
      const data = {
        "Full Name": parsedName.fullName,
        "First Name": parsedName.firstName,
        "Last Name": parsedName.lastName,
        "Middle Name": parsedName.middleName,
        "Property Address": def.partyAddress1,
        "Property Unit #": def.partyAddress2,
        "Property City": def.city,
        "Property State": def.state || "FL",
        "Property Zip": def.zip,
        County: "hernando",
        csvFillingDate: def.fillingDate,
        productId: productId,
        originalDocType: def.partyType,
      };

      if (
        await this.saveToOwnerProductPropertyByParser(data, this.publicProducer)
      ) {
        this.count++;
      }
    }
  }

  private async parseInsuranceClaims(
    defs: { [key: string]: any }[],
    pls: { [key: string]: any }[]
  ) {
    const productId = await db.models.Product.findOne({
      name: "/fl/hernando/insurance-claims",
    }).exec();

    for (const pl of pls) {
      const parsedName = nameParsingService.newParseName(pl.partyName);
      const data = {
        "Full Name": parsedName.fullName,
        "First Name": parsedName.firstName,
        "Last Name": parsedName.lastName,
        "Middle Name": parsedName.middleName,
        "Property Address": pl.partyAddress1,
        "Property Unit #": pl.partyAddress2,
        "Property City": pl.city,
        "Property State": pl.state || "FL",
        "Property Zip": pl.zip,
        County: "hernando",
        csvFillingDate: pl.fillingDate,
        productId: productId,
        originalDocType: pl.partyType,
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
      name: "/fl/hernando/personal-injury",
    }).exec();

    for (const def of defs) {
      const parsedName = nameParsingService.newParseName(def.partyName);
      const data = {
        "Full Name": parsedName.fullName,
        "First Name": parsedName.firstName,
        "Last Name": parsedName.lastName,
        "Middle Name": parsedName.middleName,
        "Property Address": def.partyAddress1,
        "Property Unit #": def.partyAddress2,
        "Property City": def.city,
        "Property State": def.state || "FL",
        "Property Zip": def.zip,
        County: "hernando",
        csvFillingDate: def.fillingDate,
        productId: productId,
        originalDocType: def.partyType,
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
      name: "/fl/hernando/debt",
    }).exec();
    const parties = defs.concat(pls);

    for (const party of parties) {
      const parsedName = nameParsingService.newParseName(party.partyName);
      const data = {
        "Full Name": parsedName.fullName,
        "First Name": parsedName.firstName,
        "Last Name": parsedName.lastName,
        "Middle Name": parsedName.middleName,
        "Property Address": party.partyAddress1,
        "Property Unit #": party.partyAddress2,
        "Property City": party.city,
        "Property State": party.state || "FL",
        "Property Zip": party.zip,
        County: "hernando",
        csvFillingDate: party.fillingDate,
        productId: productId,
        originalDocType: party.partyType,
        csvCaseNumber: party.caseNumber,
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
      name: "/fl/hernando/hoa-lien",
    }).exec();

    for (const def of defs) {
      const parsedName = nameParsingService.newParseName(def.partyName);
      const data = {
        "Full Name": parsedName.fullName,
        "First Name": parsedName.firstName,
        "Last Name": parsedName.lastName,
        "Middle Name": parsedName.middleName,
        "Property Address": def.partyAddress1,
        "Property Unit #": def.partyAddress2,
        "Property City": def.city,
        "Property State": def.state || "FL",
        "Property Zip": def.zip,
        County: "hernando",
        csvFillingDate: def.fillingDate,
        productId: productId,
        originalDocType: def.partyType,
      };

      if (
        await this.saveToOwnerProductPropertyByParser(data, this.publicProducer)
      ) {
        this.count++;
      }
    }
  }

  private async parsePersonalInjury(
    defs: { [key: string]: any }[],
    pls: { [key: string]: any }[]
  ) {
    const productId = await db.models.Product.findOne({
      name: "/fl/hernando/personal-injury",
    }).exec();

    for (const def of defs) {
      const parsedName = nameParsingService.newParseName(def.partyName);
      const data = {
        "Full Name": parsedName.fullName,
        "First Name": parsedName.firstName,
        "Last Name": parsedName.lastName,
        "Middle Name": parsedName.middleName,
        "Property Address": def.partyAddress1,
        "Property Unit #": def.partyAddress2,
        "Property City": def.city,
        "Property State": def.state || "FL",
        "Property Zip": def.zip,
        County: "hernando",
        csvFillingDate: def.fillingDate,
        productId: productId,
        originalDocType: def.partyType,
      };

      if (
        await this.saveToOwnerProductPropertyByParser(data, this.publicProducer)
      ) {
        this.count++;
      }
    }
  }

  private async parseOtherCivil(
    defs: { [key: string]: any }[],
    pls: { [key: string]: any }[]
  ) {
    const productId = await db.models.Product.findOne({
      name: "/fl/hernando/other-civil",
    }).exec();

    for (const pl of pls) {
      const parsedName = nameParsingService.newParseName(pl.partyName);
      const data = {
        "Full Name": parsedName.fullName,
        "First Name": parsedName.firstName,
        "Last Name": parsedName.lastName,
        "Middle Name": parsedName.middleName,
        "Property Address": pl.partyAddress1,
        "Property Unit #": pl.partyAddress2,
        "Property City": pl.city,
        "Property State": pl.state || "FL",
        "Property Zip": pl.zip,
        County: "hernando",
        csvFillingDate: pl.fillingDate,
        productId: productId,
        originalDocType: pl.partyType,
      };

      if (
        await this.saveToOwnerProductPropertyByParser(data, this.publicProducer)
      ) {
        this.count++;
      }
    }

    for (const def of defs) {
      const parsedName = nameParsingService.newParseName(def.partyName);
      const data = {
        "Full Name": parsedName.fullName,
        "First Name": parsedName.firstName,
        "Last Name": parsedName.lastName,
        "Middle Name": parsedName.middleName,
        "Property Address": def.partyAddress1,
        "Property Unit #": def.partyAddress2,
        "Property City": def.city,
        "Property State": def.state || "FL",
        "Property Zip": def.zip,
        County: "hernando",
        csvFillingDate: def.fillingDate,
        productId: productId,
        originalDocType: def.partyType,
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
      name: "/fl/hernando/traffic",
    }).exec();

    for (const pl of pls) {
      const parsedName = nameParsingService.newParseName(pl.partyName);
      const data = {
        "Full Name": parsedName.fullName,
        "First Name": parsedName.firstName,
        "Last Name": parsedName.lastName,
        "Middle Name": parsedName.middleName,
        "Property Address": pl.partyAddress1,
        "Property Unit #": pl.partyAddress2,
        "Property City": pl.city,
        "Property State": pl.state || "FL",
        "Property Zip": pl.zip,
        County: "hernando",
        csvFillingDate: pl.fillingDate,
        productId: productId,
        originalDocType: pl.partyType,
      };

      if (
        await this.saveToOwnerProductPropertyByParser(data, this.publicProducer)
      ) {
        this.count++;
      }
    }

    for (const def of defs) {
      const parsedName = nameParsingService.newParseName(def.partyName);
      const data = {
        "Full Name": parsedName.fullName,
        "First Name": parsedName.firstName,
        "Last Name": parsedName.lastName,
        "Middle Name": parsedName.middleName,
        "Property Address": def.partyAddress1,
        "Property Unit #": def.partyAddress2,
        "Property City": def.city,
        "Property State": def.state || "FL",
        "Property Zip": def.zip,
        County: "hernando",
        csvFillingDate: def.fillingDate,
        productId: productId,
        originalDocType: def.partyType,
      };

      if (
        await this.saveToOwnerProductPropertyByParser(data, this.publicProducer)
      ) {
        this.count++;
      }
    }
  }

  private async parseEviction(
    defs: { [key: string]: any }[],
    pls: { [key: string]: any }[]
  ) {
    const productId = await db.models.Product.findOne({
      name: "/fl/hernando/insurance-claims",
    }).exec();

    for (const pl of pls) {
      const parsedName = nameParsingService.newParseName(pl.partyName);
      const data = {
        "Full Name": parsedName.fullName,
        "First Name": parsedName.firstName,
        "Last Name": parsedName.lastName,
        "Middle Name": parsedName.middleName,
        "Property Address": pl.partyAddress1,
        "Property Unit #": pl.partyAddress2,
        "Property City": pl.city,
        "Property State": pl.state || "FL",
        "Property Zip": pl.zip,
        County: "hernando",
        csvFillingDate: pl.fillingDate,
        productId: productId,
        originalDocType: pl.partyType,
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
