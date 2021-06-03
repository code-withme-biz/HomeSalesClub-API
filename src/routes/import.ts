const fs = require("fs");
const extract = require("extract-zip");
import { verifyToken } from "../services/jwt_service";
import csv from "csvtojson";
import ParserFactory from "../parsers/factory_parser";
import { groupByKey } from "../core/collectionable";
import { SaveData } from "../types/saveData";
import xml2js from "xml2js";
import { xlsxToCsv } from "../services/xlsx_service";

const parserFactory = new ParserFactory();

export const parseCsv = async (
  practiceType: string,
  state: string,
  county: string,
  filePathOrCsvString: string,
  fileName: string,
  fromFile = true
) => {
  const parser = await parserFactory.getParser(practiceType, state, county);
  if (!parser) {
    return false;
  }
  try {
    if (
      fileName == "SUPROBAT.txt" ||
      fileName == "MOPROBAT.txt" ||
      fileName == "TUPROBAT.txt" ||
      fileName == "WEPROBAT.txt" ||
      fileName == "THPROBAT.txt" ||
      fileName == "FRPROBAT.txt" ||
      fileName == "SAPROBAT.txt"
    ) {
      let data = "";

      if (fromFile) {
        await fs
          .readFileSync(filePathOrCsvString, "utf-8")
          .split(/\r?\n/)
          .forEach(async function (line: any) {
            let fixedLine = line.replace(/\s{2,}/g, "|");
            console.log(fixedLine);
            data += fixedLine + "\n";
          });
        await fs.writeFileSync(filePathOrCsvString, data);
      } else {
        filePathOrCsvString.split(/\r?\n/).forEach(async function (line: any) {
          let fixedLine = line.replace(/\s{2,}/g, "|");
          console.log(fixedLine);
          data += fixedLine + "\n";
        });
        filePathOrCsvString = data;
      }
    }
  } catch (e) {
    console.log("error");
    console.log(e);
    return false;
  }

  const config: any = {
    noheader: true,
    delimiter: parser.getDelimiter(fileName),
  };
  if (!parser.hasHeader()) {
    config.headers = parser.getHeaders(fileName);
  }
  console.log("parsing ... ... ...");

  let jsonArray;
  if (fromFile) {
    if (fileName.match(/.xlsx$/i)) {
      filePathOrCsvString = xlsxToCsv(filePathOrCsvString);
    }
    jsonArray = await csv(config).fromFile(filePathOrCsvString);
  } else {
    jsonArray = await csv(config).fromString(filePathOrCsvString);
  }
  console.log("parsed ... ... ...");
  console.log("grouping ... ... ... ");
  let grouped = groupByKey(jsonArray, "caseNumber");
  console.log("grouped ... ... ...");
  const parsedResult = await parser.parse(grouped);

  return true;
};

export const parseMiameDailyZip = async (
  practiceType: string,
  state: string,
  county: string,
  filePathOrCsvString: string,
  files: any[],
  fromFile = true
) => {
  console.log("processing ... ... ...");
  const parser = await parserFactory.getParser(practiceType, state, county);
  if (!parser) {
    return false;
  }
  let jsonCasesArray, jsonCaseTypesArray, jsonPartyArray;
  const configCases: any = {
    noheader: true,
    delimiter: parser.getDelimiter(),
  };
  configCases.headers = parser.getHeaders(files[0], "civil");
  jsonCasesArray = await csv(configCases).fromFile(
    filePathOrCsvString + "/" + files[0]
  );

  const configCaseTypes: any = {
    noheader: true,
    delimiter: parser.getDelimiter(),
  };
  configCaseTypes.headers = parser.getHeaders(files[1], "civil");
  jsonCaseTypesArray = await csv(configCaseTypes).fromFile(
    filePathOrCsvString + "/" + files[1]
  );

  let caseArray = [];
  for (let i = 0; i < jsonCasesArray.length; i++) {
    for (let j = 0; j < jsonCaseTypesArray.length; j++) {
      if (jsonCasesArray[i].judgeCode == jsonCaseTypesArray[j].caseTypeCode) {
        caseArray.push({
          ...jsonCasesArray[i],
          description: jsonCaseTypesArray[j].description,
        });
      }
    }
  }

  const configParties: any = {
    noheader: true,
    delimiter: parser.getDelimiter(),
  };
  configParties.headers = parser.getHeaders(files[2]);
  jsonPartyArray = await csv(configParties).fromFile(
    filePathOrCsvString + "/" + files[2]
  );

  let jsonArray = [];
  for (let i = 0; i < caseArray.length; i++) {
    for (let j = 0; j < jsonPartyArray.length; j++) {
      if (caseArray[i].caseID === jsonPartyArray[j].caseID) {
        const data: SaveData = {
          caseID: caseArray[i].caseID,
          caseNumber: caseArray[i].caseNumber,
          fillingDate: caseArray[i].fillingDate,
          description: caseArray[i].description,
          partyName: jsonPartyArray[j].partyName,
          partyType: jsonPartyArray[j].partyType,
          partyAddress1: jsonPartyArray[j].address1,
          partyAddress2: jsonPartyArray[j].address2,
          dispositionCode: jsonPartyArray[j].dispositionCode,
          dispositionDate: jsonPartyArray[j].dispositionDate,
          city: jsonPartyArray[j].city,
          state: jsonPartyArray[j].state,
          zip: jsonPartyArray[j].zip,
        };
        jsonArray.push(data);
      }
    }
  }

  let grouped = groupByKey(jsonArray, "caseNumber");
  const parsedResult = await parser.parse(grouped);

  return true;
};

export const parseMiameIndebtednessZip = async (
  practiceType: string,
  state: string,
  county: string,
  filePathOrCsvString: string,
  files: any[],
  fromFile = true
) => {
  const parser = await parserFactory.getParser(practiceType, state, county);
  if (!parser) {
    return false;
  }
  console.log("processing ... ... ...");
  const config: any = {
    noheader: true,
    delimiter: parser.getDelimiter(),
  };
  config.headers = parser.getHeaders(files[0], "indebtedness");
  const rows = await csv(config).fromFile(filePathOrCsvString + "/" + files[0]);
  console.log("processing done");
  let jsonArray = [];
  for (let i = 0; i < rows.length; i++) {
    const element = rows[i];
    const data: SaveData = {
      caseNumber: element.caseNumber,
      fillingDate: element.fileDate,
      plaintiff: element.plaintiffName,
      defendant: element.defendantName,
      dispositionCode: element.dispoCode,
      dispositionDate: element.dispoDate,
      description: element.dispoDescription,
      partyAddress1: element.partyStreet,
      city: element.partyCity,
      state: element.partyState,
      zip: element.partyZip,
    };
    jsonArray.push(data);
  }

  for (let i = 0; i < jsonArray.length; i++) {
    const element = jsonArray[i];
    let grouped = groupByKey([element], "caseNumber");
    const parsedResult = await parser.parseIndebtedness(grouped);
  }
  return true;
};

export const parseDuvalZip = async (
  practiceType: string,
  state: string,
  county: string,
  filePathOrCsvString: string,
  files: any[],
  fromFile = true
) => {
  const parser = await parserFactory.getParser(practiceType, state, county);
  if (!parser) {
    return false;
  }

  for (const file of files) {
    let parserxml = new xml2js.Parser();
    const data = fs.readFileSync(__dirname + "/" + file);
    let jsonContent = await parserxml.parseStringPromise(data);
    let jsonArray = [];

    if (practiceType == "criminal" && file.match(/CriminalDisposed/)) {
      for (let i = 0; i < jsonContent["Cases"]["Case"].length; i++) {
        const element = jsonContent["Cases"]["Case"][i];
        const data: any = {
          caseNumber: element.CaseNumber[0],
          caseType: element.Charge
            ? element.Charge[0].InitialStatuteDescription
              ? element.Charge[0].InitialStatuteDescription[0]
              : ""
            : "",
          fillingDate: element.ModifyDate[0],
          partyName: "",
          partyLastName: element.Party[0].LastName[0],
          partyFirstName: element.Party[0].FirstName[0],
          partyMiddleName: element.Party[0].MiddleName[0],
          partyTypeCode: element.Party[0].PartyTypeDescription[0],
          partyAddress1: element.Party[0].address1[0],
          partyCity: element.Party[0].city[0],
          partyZip: element.Party[0].zip[0],
          partyState: element.Party[0].state[0],
        };
        jsonArray.push(data);
      }
    } else {
      for (let i = 0; i < jsonContent["Cases"]["Case"].length; i++) {
        const element = jsonContent["Cases"]["Case"][i];
        if (element.Party) {
          for (const party of element.Party) {
            const data: any = {
              caseNumber: element.CaseID[0],
              caseType: element.CaseTypeDescription[0],
              fillingDate: element.DispositionDate
                ? element.DispositionDate[0]
                : "",
              partyName: "",
              partyLastName: party.LastName[0],
              partyFirstName: party.FirstName[0],
              partyMiddleName: party.MiddleName[0],
              partyTypeCode: party.PartyTypeDescription1[0],
              partyAddress1: party.PartyAddress1[0],
              partyAddress2: party.PartyAddress2[0],
              partyCity: party.PartyCity[0],
              partyZip: party.PartyZip[0],
              partyState: party.PartyState[0],
            };
            jsonArray.push(data);
          }
        }
      }
    }

    let grouped = groupByKey(jsonArray, "caseNumber");
    const parsedResult = await parser.parse(grouped);
    return true;
  }
};

export const parseMiamiFamilyZip = async (
  practiceType: string,
  state: string,
  county: string,
  filePathOrCsvString: string,
  files: any[],
  fromFile = true
) => {
  console.log("processing ... ... ...");
  const parser = await parserFactory.getParser(practiceType, state, county);
  if (!parser) {
    return false;
  }
  let jsonCaseArray, jsonPartyArray;
  const configCases: any = {
    noheader: true,
    delimiter: "^",
    headers: parser.getHeaders(files[0], "family"),
  };
  jsonCaseArray = await csv(configCases).fromFile(
    filePathOrCsvString + "/" + files[0]
  );
  const configParties: any = {
    noheader: true,
    delimiter: "^",
    headers: parser.getHeaders(files[1], "family"),
  };
  jsonPartyArray = await csv(configParties).fromFile(
    filePathOrCsvString + "/" + files[1]
  );
  let jsonArray = [];
  for (let i = 0; i < jsonCaseArray.length; i++) {
    for (let j = 0; j < jsonPartyArray.length; j++) {
      if (jsonCaseArray[i].caseID === jsonPartyArray[j].caseID) {
        const data: SaveData = {
          caseID: jsonCaseArray[i].caseID,
          caseNumber: jsonCaseArray[i].caseNumber,
          fillingDate: jsonCaseArray[i].fillingDate,
          description: jsonPartyArray[j].dispositionCode,
          partyName: jsonPartyArray[j].partyName,
          partyType: jsonPartyArray[j].partyType,
          partyAddress1: jsonPartyArray[j].address1,
          partyAddress2: jsonPartyArray[j].address2,
          dispositionCode: jsonPartyArray[j].dispositionCode,
          dispositionDate: jsonPartyArray[j].dispositionDate,
          city: jsonPartyArray[j].city,
          state: jsonPartyArray[j].state,
          zip: jsonPartyArray[j].zip,
        };
        jsonArray.push(data);
      }
    }
  }
  let grouped = groupByKey(jsonArray, "caseNumber");
  const parsedResult = await parser.parseFamily(grouped);
  return true;
};

export const parseIt = async (
  practiceType: string,
  state: string,
  county: string,
  fileName: string,
  filePath: string
) => {
  if (/daily_civil_[0-9]+\.zip/g.test(fileName)) {
    try {
      console.log("unzipping file ... ... ...");
      await extract(filePath, { dir: __dirname });
      fs.readdir(__dirname, async function (err: string, files: any[]) {
        //handling error
        if (err) {
          return false;
        }
        //listing all files using forEach
        const newFiles: any[] = [];
        files.forEach(function (file: any) {
          if (/CASE\w+\.EXP/g.test(file) || /PARTIES\.EXP/g.test(file)) {
            newFiles.push(file);
          }
        });
        const parse = await parseMiameDailyZip(
          practiceType,
          state,
          county,
          __dirname,
          newFiles
        );
        if (parse) {
          return true;
        }
        return false;
      });
    } catch (err) {
      return false;
    }
  } else if (/Indebtedness_[0-9]+\.zip/g.test(fileName)) {
    try {
      console.log("unzipping file ... ... ...");
      await extract(filePath, { dir: __dirname });
      fs.readdir(__dirname, async function (err: string, files: any[]) {
        //handling error
        if (err) {
          return false;
        }
        //listing all files using forEach
        const newFiles: any[] = [];
        files.forEach(function (file: any) {
          if (/Indebtedness_[0-9]+\.txt/g.test(file)) {
            newFiles.push(file);
          }
        });
        const parse = await parseMiameIndebtednessZip(
          practiceType,
          state,
          county,
          __dirname,
          newFiles
        );
        if (parse) {
          return true;
        }
        return false;
      });
    } catch (err) {
      return false;
    }
  } else if (
    /CriminalDisposedExport1.*\.zip/g.test(fileName) ||
    /CivilNewCase.*\.zip/g.test(fileName)
  ) {
    try {
      console.log("unzipping file ... ... ...");
      await extract(filePath, { dir: __dirname });
      fs.readdir(__dirname, async function (err: string, files: any[]) {
        //handling error
        if (err) {
          return false;
        }
        //listing all files using forEach
        const newFiles: any[] = [];
        files.forEach(function (file: any) {
          if (
            /CriminalDisposedExport1.*\.xml/g.test(file) ||
            /CivilNewCase.*\.xml/g.test(file)
          ) {
            newFiles.push(file);
          }
        });
        const parse = await parseDuvalZip(
          practiceType,
          state,
          county,
          __dirname,
          newFiles
        );
        if (parse) {
          return true;
        }
        return false;
      });
    } catch (err) {
      return false;
    }
  } else if (/daily_family_[0-9]+\.zip/g.test(fileName)) {
    try {
      console.log("unzipping file ... ... ...");
      await extract(filePath, { dir: __dirname });
      fs.readdir(__dirname, async function (err: string, files: any[]) {
        //handling error
        if (err) {
          return false;
        }
        //listing all files using forEach
        const newFiles: any[] = [];
        files.forEach(function (file: any) {
          if (/CASE\.EXP/g.test(file) || /PARTIES\.EXP/g.test(file)) {
            newFiles.push(file);
          }
        });
        const parse = await parseMiamiFamilyZip(
          practiceType,
          state,
          county,
          __dirname,
          newFiles
        );
        if (parse) {
          return true;
        }
        return false;
      });
    } catch (err) {
      return false;
    }
  } else {
    const parse = parseCsv(practiceType, state, county, filePath, fileName);
    if (await parse) {
      return true;
    }
    return false;
  }
};

export default async (req: any, res: any) => {
  try {
    const timeout = 30 * 60 * 1000;
    req.setTimeout(timeout);
    res.setTimeout(timeout);

    const token = req.query.token;
    const { valid }: any = await verifyToken(token);
    if (valid) {
      const practiceType = req.body.practiceType;
      const state = req.body.state;
      const county = req.body.county;
      const fileName = req.files.file.name;
      const filePath = req.files.file.path;

      if (await parseIt(practiceType, state, county, fileName, filePath)) {
        return res.sendStatus(200);
      }
      return res
        .sendStatus(404)
        .send(`No parser found for ${practiceType} ${county}`);
    }
  } catch (err) {
    console.trace(err);
    res.status(500).send(err);
  }
};
