const nameParsingService = require("../categories/public_records/consumers/property_appraisers/consumer_dependencies/nameParsingServiceNew");
import { saveToOwnerProductPropertyByProducer } from "../services/general_service";
import db from "../models/db";

export default abstract class AbstractParser {
  abstract getDelimiter(fileName: string): string;
  hasHeader(): boolean {
    return false;
  }
  abstract parse(csvLine: object): object;

  async saveToOwnerProductPropertyByParser(
    data: any,
    publicRecordProducer: any = false,
    addressSupersede = false
  ) {
    let parserName = nameParsingService.newParseName(data["Full Name"]);
    if (parserName.type && parserName.type == "COMPANY") {
      console.log(data["Full Name"], "=> Identified as business!");
      return false;
    }

    if (addressSupersede) {
      if (
        (!data["Property Address"] || data["Property Address"] == "") &&
        data["csvCaseNumber"]
      ) {
        let opp = await db.models.OwnerProductProperty.findOne({
          productId: data.productId,
          csvCaseNumber: data.csvCaseNumber,
          propertyId: { $ne: null },
        }).populate("ownerId propertyId");
        if (opp) {
          data["Property Address"] = opp.propertyId["Property Address"];
          data["Property State"] = opp.propertyId["Property State"];
          data["Property Unit #"] = opp.propertyId["Property Unit #"] || "";
          data["Property City"] = opp.propertyId["Property City"] || "";
          data["Property Zip"] = opp.propertyId["Property Zip"] || "";
        }
      }
    }

    if (data["Full Name"] && data["Full Name"].trim().slice(-1) == ",") {
      data["Full Name"] = data["Full Name"].trim().slice(0, -1);
    }

    data["propertyFrom"] = "CSV Import";

    let saved_id = await saveToOwnerProductPropertyByProducer(
      data,
      publicRecordProducer
    );

    if (
      saved_id &&
      addressSupersede &&
      data["Property Address"] &&
      data["Property Address"] != ""
    ) {
      let opps = await db.models.OwnerProductProperty.find({
        productId: data.productId,
        csvCaseNumber: data.csvCaseNumber,
        propertyId: null,
      });
      if (opps.length > 0) {
        let saved_opp = await db.models.OwnerProductProperty.findOne({
          _id: saved_id,
        }).populate("ownerId propertyId");
        for (const opp of opps) {
          opp.propertyId = saved_opp.propertyId._id;
          await opp.save();
        }
      }
    }

    return saved_id;
  }
}
