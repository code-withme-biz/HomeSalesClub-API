import AbstractParser from "../../abstract_parser";
import { IPublicRecordProducer } from "../../../models/public_record_producer";
import { groupByKey } from "../../../core/collectionable";
import db from "../../../models/db";
import { SaveData } from "../../../types/saveData";
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
    if (
      /DLY_NOLLE_PROS_[0-9]+\.TXT/g.test(fileName) ||
      /mly_felconv_[0-9]+\.txt/g.test(fileName) ||
      /mly_cjis_filings_closings_[0-9]+\.txt/g.test(fileName) ||
      /mly_casechg_[0-9]+\.txt/g.test(fileName) ||
      /dly_all_criminal_[0-9]+\.(txt|TXT)/g.test(fileName) ||
      /dly_all_dui_[0-9]+\.(txt|TXT)/g.test(fileName)
    ) {
      return "�";
    } else {
      return "  ";
    }
  }

  public getHeaders(fileName: string): string[] {
    if (/FELONY(_[0-9]+)?\.ASC/g.test(fileName)) {
      this.type = "Felony";
      return [];
    } else if (/NOLLEPRO(_[0-9]+)?\.ASC/g.test(fileName)) {
      this.type = "Nollepro";
      return [];
    } else if (/DLY_NOLLE_PROS_[0-9]+\.TXT/g.test(fileName)) {
      this.type = "Daily_Nollepro";
      return this.getDailyNolleproHeaders();
    } else if (/mly_felconv_[0-9]+\.txt/g.test(fileName)) {
      this.type = "Monthly_Felnoy_Conv";
      return this.getMlyFelConv();
    } else if (/mly_cjis_filings_closings_[0-9]+\.txt/g.test(fileName)) {
      this.type = "Monthly_CJIS_Filling";
      return this.getMlyCJIS();
    } else if (/mly_casechg_[0-9]+\.txt/g.test(fileName)) {
      this.type = "Monthly_CASECHG";
      return this.getMlyCASECHG();
    } else if (/CJSHIST\.ASC/g.test(fileName)) {
      this.type = "Criminal";
      return this.getCJSHIST();
    } else if (/dly_all_criminal_[0-9]+\.(txt|TXT)/g.test(fileName)) {
      this.type = "ALL_CRIMINAL";
      return this.getAllCriminal();
    } else if (/dly_all_dui_[0-9]+\.(txt|TXT)/g.test(fileName)) {
      this.type = "ALL_DUI";
      return this.getAllDui();
    } else {
      return [];
    }
  }

  private getDailyNolleproHeaders(): string[] {
    return [
      "caseNumber",
      "lastName",
      "firstName",
      "middleName",
      "partyAddress1",
      "unit",
      "city",
      "state",
      "zip",
    ];
  }

  private getMlyFelConv(): string[] {
    return [
      "lastName",
      "firstName",
      "partyAddress1",
      "",
      "city",
      "state",
      "",
      "",
      "",
    ];
  }

  private getMlyCJIS(): string[] {
    return [
      "citationNumber",
      "idNumber",
      "lastName",
      "firstName",
      "middleName",
      "birthday",
      "race",
      "sex",
      "partyAddress1",
      "",
      "city",
      "state",
      "zip",
      "",
      "",
      "",
      "",
      "",
      "",
      "fillingDate",
    ];
  }

  private getMlyCASECHG(): string[] {
    return [];
  }

  private getCJSHIST(): string[] {
    return [];
  }

  private getAllCriminal(): string[] {
    return [
      "caseNumber",
      "fillingDate",
      "lastName",
      "middleName",
      "firstName",
      "partyAddress1",
      "",
      "city",
      "state",
      "zip",
    ];
  }

  private getAllDui(): string[] {
    return [
      "caseNumber",
      "fillingDate",
      "lastName",
      "middleName",
      "firstName",
      "partyAddress1",
      "",
      "city",
      "state",
      "zip",
    ];
  }

  public async parse(caseGroup: [{ [key: string]: string }]): Promise<boolean> {
    for (const group of caseGroup) {
      let items: any[] = [];
      if (this.type == "Felony") {
        items = this.processFelonyItem(group);
      } else if (this.type == "Nollepro") {
        items = this.processNolleproItem(group);
      } else if (this.type == "Daily_Nollepro") {
        items = this.processDailyNolleproItem(group);
      } else if (this.type == "Monthly_Felnoy_Conv") {
        items = this.processMonthlyFelConv(group);
      } else if (this.type == "Monthly_CJIS_Filling") {
        items = this.processMlyCJIS(group);
      } else if (this.type === "Monthly_CASECHG") {
        items = this.processMlyCASECHG(group);
      } else if (this.type === "Criminal") {
        items = this.processCJSHIST(group);
        this.productId = await db.models.Product.findOne({
          name: "/fl/miami-dade/criminal",
        }).exec();
        this.type = "Criminal Justice Convictions";
      } else if (this.type === "ALL_CRIMINAL" || this.type === "ALL_DUI") {
        items = this.processAllCriminals(group);
      }

      for (const item of items) {
        const parsedName = nameParsingService.newParseName(item.partyName);
        const data = {
          "Full Name": parsedName.fullName,
          "First Name": parsedName.firstName,
          "Last Name": parsedName.lastName,
          "Middle Name": parsedName.middleName,
          "Property Address": item.partyAddress1,
          "Property City": item.city,
          "Property State": item.state || "FL",
          "Property Zip": item.zip,
          County: "miami-dade",
          productId: this.productId,
          originalDocType: this.type,
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

  private processFelonyItem(group: { [key: string]: string }): any[] {
    const data = [];
    const value = group[1];
    for (let i = 0; i < value.length; i++) {
      const element = value[i];
      const items: string[] = [];
      for (let j = 0; j < Object.values(element).length; j++) {
        const temp = Object.values(element)[j];
        if (temp) {
          items.push(temp);
        }
      }
      if (!items[2].includes("UNKNOWN") && !items[2].includes("HOMELESS")) {
        let caseNumber, defendant, partyAddress1, city, state, zip, zipcode;
        caseNumber = items[0];
        defendant = items[1];
        if (items[3].match(/.[A-Z]+[0-9]{5}/g)) {
          const str = items[3].match(/.[A-Z]+[0-9]{5}/g);
          if (str) {
            zip = str[0].match(/[0-9]{5}/g);
            if (zip) {
              state = str[0].replace(zip[0], "");
              zipcode = zip[0];
              city = items[3].replace(str[0], "").trim();
            }
          }
        } else {
          const str = items[3].match(/[A-Z]{2}$/g);
          if (str) {
            state = str[0];
            city = items[3].replace(state, "").trim();
            zipcode = items[4].length === 5 ? items[4] : "";
          }
        }
        if (state) {
          partyAddress1 = items[2].replace(/^[A-Z]{2}[0-9]+/g, "").trim();
          data.push({
            caseNumber,
            partyName: defendant,
            partyAddress1,
            city,
            state,
            zip: zipcode,
          });
        }
      }
    }
    return data;
  }

  private processNolleproItem(group: { [key: string]: string }): any[] {
    const data: any[] = [];
    const value = group[1];
    for (let i = 0; i < value.length; i++) {
      const element = value[i];
      const items: string[] = [];
      for (let j = 0; j < Object.values(element).length; j++) {
        const temp = Object.values(element)[j];
        if (temp) {
          items.push(temp);
        }
      }
      let partyAddress1, city, caseNumber, partyName, zip, state;
      caseNumber = items[0].replace(/[A-Z]/g, "").trim();
      if (items[3].match(/[0-9]+/g)) {
        partyAddress1 = items[3];
        partyName = items[1] + ", " + items[2];
        if (items[4].match(/[0-9]+/g) || items[4].length == 2) {
          if (items[4].match(/[0-9]+/g) && items[4].match(/[A-Z]+/g)) {
            city = items[4].replace(/[0-9]+/g, "").trim();
          } else {
            city = items[5];
          }
        } else {
          city = items[4];
        }
      } else {
        partyAddress1 = items[4];
        partyName = items[1] + ", " + items[2] + " " + items[3];
        if (items[5].match(/[0-9]+/g) || items[4].length == 2) {
          city = items[6];
        } else {
          city = items[5];
        }
      }
      zip = items[items.length - 1].replace(/[A-Z]{2}/g, "").trim();
      state = items[items.length - 1].replace(/[0-9]+/g, "").trim();
      data.push({ caseNumber, partyAddress1, partyName, city, state, zip });
    }
    return data;
  }

  private processDailyNolleproItem(group: any): any[] {
    const data: any[] = [];
    const value = group[1];
    for (let i = 0; i < value.length; i++) {
      if (value[i].firstName) {
        data.push({
          ...value[i],
          caseNumber: value[i].caseNumber.replace(/[A-Z]/g, ""),
          partyName:
            value[i].lastName +
            ", " +
            value[i].firstName +
            " " +
            value[i].middleName,
        });
      }
    }
    return data;
  }

  private processMonthlyFelConv(group: any): any[] {
    const data: any[] = [];
    const value = group[1];
    for (let i = 0; i < value.length; i++) {
      if (
        value[i].partyAddress1.includes("HOMELESS") ||
        value[i].partyAddress1.includes("UNKNOWN")
      ) {
        continue;
      }
      data.push({
        partyName: value[i].lastName + ", " + value[i].firstName,
        partyAddress1: value[i].partyAddress1,
        city: value[i].city,
        state: value[i].state,
      });
    }
    return data;
  }

  private processMlyCJIS(group: any): any[] {
    const data: any[] = [];
    const value = group[1];
    for (let i = 0; i < value.length; i++) {
      data.push({
        partyName: value[i].lastName + ", " + value[i].firstName,
        partyAddress1: value[i].partyAddress1,
        city: value[i].city,
        state: value[i].state,
        zip: value[i].zip,
        caseNumber: value[i].caseNumber,
        fillingDate: value[i].fillingDate,
      });
    }
    return data;
  }

  private processMlyCASECHG(group: any): any[] {
    const data: any[] = [];
    const value = group[1].filter((element: any) => element.field2);
    return this.groupByCaseNumber(value);
  }

  private processCJSHIST(group: any): any[] {
    console.log("processing ... ... ...");
    const data: any[] = [];
    for (let i = 0; i < group[1].length; i++) {
      const values = Object.values(group[1][i]).filter((element) => {
        if (element) {
          return element;
        }
      }) as string[];
      let flag = true;
      for (let j = 0; j < values.length; j++) {
        if (
          values[j].includes("UNKNOWN") ||
          values[j].includes("HOMELESS") ||
          values[j].includes("*****") ||
          values[j].includes("HOMESTEAD") ||
          values[j].includes("UNKNONW")
        ) {
          flag = false;
          break;
        }
      }
      if (flag) {
        const caseNumber = values[0].trim();
        const lastName = values[1].replace(/[0-9]+/g, "").trim();
        const firstName = values[2].trim();
        const middleName = /[0-9]+/g.test(values[3]) ? "" : values[3];
        const partyAddress1 = /[0-9]+/g.test(values[3]) ? values[3] : values[4];
        const city = /[0-9]+/g.test(values[3]) ? values[4] : values[5];
        if (/[0-9]+/g.test(city)) {
          continue;
        }
        const temp = /[0-9]+/g.test(values[3]) ? values[5] : values[6];
        let state, zip;
        if (temp) {
          const str = temp.match(/^[A-Z]{2}([0-9]+)?/g);
          if (str) {
            state = str[0].replace(/[0-9]+/g, "") as string;
            zip = str[0].replace(/[A-Z]{2}/g, "") as string;
          }
        }
        const partyName = lastName + ", " + firstName + " " + middleName;
        data.push({ caseNumber, partyName, partyAddress1, city, zip, state });
      }
    }
    console.log(data.length);
    return data;
  }

  private groupByCaseNumber(data: any[]): any[] {
    let obj = {};
    data.map((val) => {
      if (!obj.hasOwnProperty(val["field1"])) {
        obj = {
          ...obj,
          [`${val["field1"]}`]: data.filter(
            (element) => element["field1"] == val["field1"]
          ),
        };
      }
    });

    const arr: any[] = [];

    const results = Object.values(obj);
    for (let i = 0; i < results.length; i++) {
      const elements = results[i] as any[];
      let temp: string[] = [];
      let caseNumber: string = "";
      for (let j = 0; j < elements.length; j++) {
        let element = elements[j];
        caseNumber = element.field1;
        delete element.field1;
        const strs = Object.values(element) as string[];
        temp = [...temp, ...strs];
      }
      const lastName = temp[3];
      const firstName = temp[4];
      const middleName = temp[5];
      const partyName = lastName + ", " + firstName + " " + middleName;
      const partyAddress1 = temp[14];
      const city = temp[16];
      const state = temp[17];
      const zip = temp[18];
      if (
        partyAddress1.includes("UNKNOWN" || partyAddress1.includes("HOMELESS"))
      ) {
        continue;
      }
      arr.push({ caseNumber, partyName, partyAddress1, city, state, zip });
    }
    return arr;
  }

  private processAllCriminals(group: any): SaveData[] {
    const items: SaveData[] = [];
    const values = group[1];
    for (let i = 0; i < values.length; i++) {
      if (values[i].partyAddress1.includes("UNKNOWN", "HOMELESS", "HOMESTEAD"))
        continue;
      let fillingDate = values[i].fillingDate;
      fillingDate = [fillingDate.slice(0, 4), "/", fillingDate.slice(4)].join(
        ""
      );
      fillingDate = [fillingDate.slice(0, 7), "/", fillingDate.slice(7)].join(
        ""
      );
      items.push({
        caseNumber: values[i].caseNumber,
        partyName:
          values[i].lastName +
          ", " +
          values[i].middleName +
          " " +
          values[i].firstName,
        partyAddress1: values[i].partyAddress1,
        fillingDate: fillingDate,
        city: values[i].city,
        state: values[i].state,
        zip: values[i].zip,
      });
    }
    return items;
  }

  public get recordCount() {
    return this.count;
  }
}
