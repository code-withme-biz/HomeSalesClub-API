import ParserFactory from '../parsers/factory_parser'
import { groupByKey } from '../core/collectionable';
import { parseCsv } from '../routes/import';
import csv from 'csvtojson'
import S3Service from '../services/s3_service';
import { launchBrowser, setParamsForPage, clearPage, isEmptyOrSpaces, sleep, resolveRecaptcha2, getTextByXpathFromPage } from '../services/general_service';
import { SaveData } from "../types/saveData";
const extract = require("extract-zip");
const fs = require("fs");

setTimeout(() => {
    console.log('Stopped because exceeded the time limit! (3 hours)');
    process.exit();
}, 10800000); // 3 hours

( async () => {
    const parserFactory = new ParserFactory();

    // example folderName: 'fl/broward/2021-05-06'
    const getKeys = async (folderName: string) => {
        let keys = [];
        const s3Service = new S3Service();
        const params = {
            Bucket: 'clerk-of-courts',
            Delimiter: '/',
            Prefix: folderName + '/'
        }
        const data = await s3Service.s3.listObjects(params).promise();
        if(data && data['Contents']){
            for (let index = 1; index < data['Contents'].length; index++) {
                keys.push(data['Contents'][index]['Key']);
            }
        }
        return keys;
    }

    const getAndCreateFile = (params: any, path: string) => {
      const file = require('fs').createWriteStream(path);
      const s3Service = new S3Service();
      return new Promise((resolve, reject) => {
        const pipe = s3Service.s3.getObject(params).createReadStream().pipe(file);
        pipe.on('error', reject);
        pipe.on('close', resolve);
      });
    }

    // example key: 'fl/broward/2021-05-06/MOPROBAT.txt
    const downloadFileFromS3 = async (key: any) => {
        let fileName: any = key?.split('/').pop();
        let path = __dirname + '/' + fileName;
        console.log(path);
        const params = {Bucket: 'clerk-of-courts', Key: key};

        try{
          await getAndCreateFile(params, path);
          return path;
        }catch(e){
          console.log(e);
          return false;
        }
    }

    function getFormattedDate(date: Date) {
        let year: any = date.getFullYear();
        let month: any = (1 + date.getMonth());
        let day: any = date.getDate();
        if (year === NaN || day === NaN || month === NaN) {
            return '';
        }
        month = month.toString().padStart(2, '0');
        day = day.toString().padStart(2, '0');
        return year + '-' + month + '-' + day;
    }

    // example key: 'fl/broward/2021-05-06/MOPROBAT.txt
    function getPracticeTypeFromKey(key: any): string {
        if(key.match(/daily_civil/)){
            return 'civil';
        }
        return '';
    }

    const parseZip = async (
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
        configCases.headers = parser.getHeaders(files[0]);
        jsonCasesArray = await csv(configCases).fromFile(
          filePathOrCsvString + "/" + files[0]
        );
      
        const configCaseTypes: any = {
          noheader: true,
          delimiter: parser.getDelimiter(),
        };
        configCaseTypes.headers = parser.getHeaders(files[1]);
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

        return grouped;
    };

    const getCaseTypeFromClerk = async (page: any, caseNumber: string) => {
        let caseNumberArray = caseNumber.split('-');
        if(caseNumberArray.length != 4){
          console.log('error: Case Number is != 4!');
          return false;
        }

        await page.goto('https://www2.miami-dadeclerk.com/ocs/Search.aspx', {waitUntil: 'networkidle0'});
        let searchByCaseNumber = await page.$x('//a[@href="#localCaseContent"]');
        await searchByCaseNumber[0].click();
        await sleep(1000);
        await page.waitForXPath('//input[@id="txtLCNYearSTD_localCaseContent"]');
        await page.type('#txtLCNYearSTD_localCaseContent', caseNumberArray[0], {delay: 150});
        await page.type('#txtLCNSeqSTD_localCaseContent', caseNumberArray[1], {delay: 150});
        await page.select('#localCaseCodesSelect_localCaseContent', caseNumberArray[2]);
        await page.type('#txtLCNLocSTD_localCaseContent', caseNumberArray[3], {delay: 150});
        await Promise.all([
            page.click('#ctl00_ContentPlaceHolder1_btnlocalCaseTab'),
            page.waitForNavigation()
        ]);
        let [result] = await page.$x('//span[@id="ctl00_ContentPlaceHolder1_lblCaseType_Parties"]');
        if(!result){
          console.log('case Type not found!');
          return false;
        }
        let newCaseType = await getTextByXpathFromPage(page, '//span[@id="ctl00_ContentPlaceHolder1_lblCaseType_Parties"]');
        return newCaseType;
    }

    let countiesWithCSV: any = {
        "FL": [ "miami-dade" ]
    };

    for(const state in countiesWithCSV){
        let counties = countiesWithCSV[state];
        for(const county of counties){
            let today = new Date();
            // today.setDate(today.getDate() - 2);
            let todayString = getFormattedDate(today);
            let folderName = state.toLowerCase() + '/' + county + '/' + todayString;
            let keys = await getKeys(folderName);
            for (const key of keys){
                console.log("Processing:", key);
                let practiceType: string = getPracticeTypeFromKey(key);
                let fileName: any = key?.split('/').pop();

                console.log(practiceType, fileName);
                if(fileName && practiceType != ''){
                    const parser = await parserFactory.getParser(practiceType, state, county);
                    if (!parser) {
                      return false;
                    }
                    if (/daily_civil_[0-9]+\.zip/g.test(fileName)) {
                        try {
                            console.log("unzipping file ... ... ...");
                            let path = await downloadFileFromS3(key);
                            console.log('Done');
                            if(!path){
                              throw new Error('error in downloading s3');
                            }
                            let dirTarget = fileName.split('.')[0].trim();
                            await extract(path, { dir: __dirname + '/' + dirTarget });
                            let filenames = await fs.readdirSync(__dirname + '/' + dirTarget);
                            const newFiles: any[] = [];
                            for(const file of filenames){
                              if (/CASE\w+\.EXP/g.test(file) || /PARTIES\.EXP/g.test(file)) {
                                newFiles.push(file);
                              }
                            }
                            const grouped = await parseZip(
                              practiceType,
                              state,
                              county,
                              __dirname,
                              newFiles
                            );
                            if(grouped){
                              const clerk_browser = await launchBrowser();
                              const clerk_page = await clerk_browser.newPage();
                              await setParamsForPage(clerk_page);

                              await clerk_page.goto('https://www2.miami-dadeclerk.com/PremierServices/login.aspx', {waitUntil: 'networkidle0'});
                              try {
                                const [inputUserName] = await clerk_page.$x('//input[contains(@id, "txtUserName")]');
                                await inputUserName.focus();
                                await clerk_page.keyboard.type('danielhomesales');
                                const [inputPass] = await clerk_page.$x('//input[contains(@id, "txtPassword")]');
                                await inputPass.focus();
                                await clerk_page.keyboard.type('homesales2020');
                                const [clickLogin] = await clerk_page.$x('//input[contains(@id, "btnLogin")]');
                                await clickLogin.click();
                                await clerk_page.waitForSelector('#content');
                              } catch (e) {
                                  throw new Error('error login miami dade clerk');
                              }

                              for (const group of grouped) {
                                let items = group[1];
                                const description = items[0].description;
                                if(description.match(/judgment/i)){
                                  const caseNumber = items[0].caseNumber;
                                  console.log('--- Processing case number:', caseNumber, ', description:', description);
                                  let newCaseType = await getCaseTypeFromClerk(clerk_page, caseNumber);
                                  if(newCaseType){
                                    for(let i = 0; i < items.length; i++){
                                        items[i].description = newCaseType;
                                    }
                                    let newGroup1 = [];
                                    let newGroup = ['', ''];
                                    newGroup[1] = items;
                                    newGroup1.push(newGroup);
                                    await parser.parse(newGroup1);
                                  }
                                }
                                
                              }

                              await clerk_browser.close();
                            }
                        } catch (err) {
                            console.log(err);
                        }
                    }
                }
            }
        }
    }
    process.exit();
})();