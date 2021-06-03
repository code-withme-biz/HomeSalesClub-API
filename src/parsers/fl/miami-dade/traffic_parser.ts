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
    if (/ALTICKE[0-9](\_)?([0-9]+)?\.TXT/g.test(fileName)) {
      return "  ";
    } else if (/dly_all_accident_[0-9]\.txt/g.test(fileName)) {
      return "¨";
    } else if (/DWLSNVDLCENT\_[0-9]+\.TXT/g) {
      return "  ";
    } else {
      return " ";
    }
  }

  public getHeaders(fileName: string): string[] {
    if (/ALTICKE[0-9](\_)?([0-9]+)?\.(txt|TXT)/g.test(fileName)) {
      this.type = "ALTICKE";
      return [];
    } else if (/dly_all_accident_[0-9]+\.txt/g.test(fileName)) {
      this.type = "ACCIDENT";
      return [];
    } else if (/DWLSNVDLCENT\_[0-9]+\.TXT/g) {
      this.type = "DWLSNVDLCENT";
      return [];
    } else {
      return [];
    }
  }

  public async parse(caseGroup: [{ [key: string]: any }]): Promise<boolean> {
    for (const group of caseGroup) {
      const items = group[1];
      if (this.type === "ALTICKE") {
        const defs: any[] = [];
        for (let i = 0; i < items.length; i++) {
          const values: string[] = [];
          const element = Object.values(items[i]) as string[];
          for (let j = 0; j < element.length - 1; j++) {
            if (element[j].replace(/\s+/g, " ")) {
              values.push(element[j].replace(/\s+/g, " "));
            }
          }
          if (values[2].match(/[0-9]+/g)) {
            const partyAddress1 = values[2].replace(
              /^[A-Z]+[- ][A-Z]+[ ]?/g,
              ""
            );
            const name = values[2].replace(partyAddress1, "");
            values.splice(2, 1, ...[name, partyAddress1]);
          }
          if (values[1].match(/[\d]+/g)) {
            const lastName = values[1].replace(/[\d]+/g, "");
            const fillingDate = values[1].replace(lastName, "");
            values.splice(1, 1, ...[fillingDate, lastName]);
          }
          if (values[5].match(/[A-Z]{2}[0-9]+/g)) {
            const city = values[5].replace(/[A-Z]{2}[0-9]+/g, "");
            values.splice(5, 1, ...[city, values[5].replace(city, "")]);
          }
          if (!values[6].match(/^[A-Z]{2}[0-9]+/g)) {
            if (values[7].match(/[A-Z]{2}[0-9]+/g)) {
              values.splice(5, 1);
            } else if (values[6].match(/[A-Z]{2}[0-9]+/g)) {
              const str = values[6].match(/[A-Z]{2}[0-9]+/g);
              if (str) values.splice(6, 1, str[0]);
            } else if (values[8].match(/[A-Z]{2}[0-9]+/g)) {
              values.splice(5, 2);
            } else {
              console.log(values);
            }
          }
          const zip = values[6].replace(/[A-Z]{2}/g, "");
          values.splice(6, 1, ...[values[6].replace(zip, ""), zip]);
          let dateStr = values[1];
          dateStr = [dateStr.slice(0, 4), "/", dateStr.slice(4)].join("");
          dateStr = [dateStr.slice(0, 7), "/", dateStr.slice(7)].join("");
          const dateFormated = new Date(dateStr).toLocaleDateString("en-US", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          });
          defs.push({
            caseNumber: values[0],
            partyName: values[2] + ", " + values[3],
            partyAddress1: values[4],
            fillingDate: dateFormated,
            city: values[5],
            state: values[6],
            zip: values[7],
          });
        }
        await this.process(defs);
      } else if (this.type === "ACCIDENT") {
        const defs: any[] = [];
        for (let i = 0; i < items.length; i++) {
          const values = Object.values(items[i]) as string[];
          let strs: string[] = [];
          for (let j = 0; j < values.length; j++) {
            const element = values[j];
            if (element.length > 0) {
              if (element.match(/\�[A-Z]{2}\�[0-9]+/g)) {
                strs = [...strs, element];
                break;
              } else {
                strs = [...strs, element];
              }
            }
          }
          const caseNumber = strs[0];
          const zip = strs[strs.length - 1]
            .replace(/\�/g, "")
            .replace(/[A-Z]+/g, "");
          const state = strs[strs.length - 1]
            .replace(/\�/g, "")
            .replace(zip, "");
          let str: string = "";
          for (let j = 1; j < strs.length - 1; j++) {
            str = str + " " + strs[j].trim();
          }
          str = str.trim();
          let other = str.replace(/^\�[0-9]+/g, "");
          let fillingDate = str.replace(other, "").replace(/\�/g, "");
          fillingDate = [
            fillingDate.slice(0, 4),
            "/",
            fillingDate.slice(4),
          ].join("");
          fillingDate = [
            fillingDate.slice(0, 7),
            "/",
            fillingDate.slice(7),
          ].join("");
          const dateFormated = new Date(fillingDate).toLocaleDateString(
            "en-US",
            {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }
          );
          let other1 = other.replace(
            /^\�[A-Z]+( [A-Z]+)?( [A-Z]+)?( [A-Z]+)?( [A-Z]+)?/g,
            ""
          );
          const firstName = other.replace(other1, "").replace(/\�/g, "");
          let other2 = other1
            .replace(/\�[A-Z]+( [A-Z]+)?( [A-Z]+)?( [A-Z]+)?( [A-Z]+)?$/g, "")
            .trim();

          const city = other1.replace(other2, "").replace(/\�/g, "");
          let partyAddress1 = other2.replace(
            /^\�[A-Z ]\�[A-Z]+( [A-Z]+)?/g,
            ""
          );
          const middleName = other2.replace(partyAddress1, "").split("�")[1];
          const lastName = other2.replace(partyAddress1, "").split("�")[2];
          partyAddress1 = partyAddress1.replace(/\�/g, "");
          defs.push({
            caseNumber,
            partyName:
              lastName + ", " + firstName + " " + middleName && middleName,
            partyAddress1,
            fillingDate: dateFormated,
            city,
            state,
            zip,
          });
        }
        await this.process(defs);
      } else if (this.type === "DWLSNVDLCENT") {
        const defs: any[] = [];
        for (let i = 0; i < items.length; i++) {
          let temps = Object.values(items[i]) as string[];
          let values: string[] = [];
          for (let j = 0; j < temps.length; j++) {
            if (temps[j]) {
              if (j == 1) {
                values.push(temps[j]);
              } else {
                if (temps[j].match(/^[A-Z]{2}[0-9]+/g)) {
                  values.push(temps[j]);
                  break;
                }
                if (temps[j].match(/^[0-9]+[A-Z]+/g)) {
                  const temp = temps[j].match(/^[0-9]+/g);
                  if (temp) {
                    values.push(temp[0]);
                  }
                  values.push(temps[j].replace(/^[0-9]+[A-Z]+/g, ""));
                } else {
                  values.push(temps[j]);
                }
              }
            }
          }
          values.splice(
            1,
            1,
            ...[
              values[1].substring(0, 7),
              values[1].replace(values[1].substring(0, 7), ""),
            ]
          );
          const caseNumber = values[0];
          const zip = values[values.length - 1].replace(/[A-Z]{2}/g, "");
          const state = values[values.length - 1].replace(zip, "");
          const city = values[values.length - 2];
          let partyAddress1: string = "",
            lastName: string = "",
            middleName: string = "",
            firstName: string = "";
          values.splice(values.length - 2, 2);
          if (values[values.length - 1].match(/^[0-9]+ [A-Z]+/g)) {
            partyAddress1 = values[values.length - 1];
            values.splice(values.length - 1, 1);
          } else if (values[values.length - 1].length === 0) {
            partyAddress1 = "";
            values.splice(values.length - 1, 1);
          } else {
            partyAddress1 = values[values.length - 2];
            values.splice(values.length - 2, 2);
          }
          let fillingDate = values[values.length - 1];
          fillingDate = [
            fillingDate.slice(0, 2),
            "/",
            fillingDate.slice(2),
          ].join("");
          fillingDate = [
            fillingDate.slice(0, 5),
            "/",
            fillingDate.slice(5),
          ].join("");
          values.splice(values.length - 1, 1);
          values.splice(0, 2);
          if (values.length == 1) {
            lastName = values[0];
          }
          if (values.length == 2) {
            lastName = values[0];
            firstName = values[1];
          }
          if (values.length == 3) {
            lastName = values[0];
            firstName = values[1];
            middleName = values[2];
          }
          defs.push({
            caseNumber,
            partyName: lastName + ", " + firstName + " " + middleName,
            partyAddress1,
            fillingDate,
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
        County: "miami-dade",
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
