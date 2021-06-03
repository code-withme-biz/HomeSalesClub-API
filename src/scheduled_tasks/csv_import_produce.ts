require('dotenv').config();

import { parseIt } from '../routes/import';
import S3Service from '../services/s3_service';
const fs = require('fs');

export const countiesWithCsv: any = {
    "FL":[
        "broward",
        "pinellas",
        "duval",
        "palm-beach",
        "miami-dade"
    ]
};

// example key: 'fl/broward/2021-05-06/MOPROBAT.txt
function getPracticeTypeFromKey(key: any): string {
    if(key.match(/PROBAT/) || key.match(/odyssey-probate/) || key.match(/Decedent/)){
        return 'probate';
    } else if (key.match(/TENANT/) || key.match(/EVICT/) || key.match(/CIVIL_Evictions_Weekly_/) || key.match(/CIVLT[0-9]+\.txt/) || key.match(/CIVLTNTN[0-9]+\.txt/)){
        return 'eviction';
    } else if (key.match(/WKCIVILGAR/) || key.match(/CIVL\.txt/) || key.match(/odyssey-civil/) || key.match(/CivilNewCase/) || key.match(/Civil Case Party/) || key.match(/daily_civil_/) || key.match(/Indebtedness_/) || key.match(/NewCase[0-9]+\.txt/) || key.match(/PRMOEST[0-9]+\.txt/) || key.match(/daily_family_/)){
        return 'civil';
    } else if (key.match(/FELONY/) || key.match(/MISDEM/) || key.match(/odyssey-criminal/) || key.match(/CriminalDisposedExport/) || key.match(/Criminal Data/) || key.match(/FELONY(_[0-9]+)?\.ASC/) || key.match(/NOLLEPRO(_[0-9]+)?\.ASC/) || key.match(/DLY_NOLLE_PROS_/) || key.match(/mly_felconv_/) || key.match(/mly_cjis_filings_closings_/) || key.match(/mly_casechg_/) || key.match(/CJSHIST/)){
        return 'criminal';
    } else if (key.match(/TCDISPO/) || key.match(/TIDISPO/) || key.match(/INFRAC/) || key.match(/TRFFIC/) || key.match(/ALTICKE/) || key.match(/dly_all_accident_/) || key.match(/DWLSNVDLCENT/)){
        return 'traffic';
    } else if (key.match(/Divorce Cases/) || key.match(/Family/)){
        return 'divorce';
    } else if (key.match(/Foreclosure/)){
        return 'foreclosure';
    } else if (key.match(/Marriage Licenses/) || key.match(/wky_mlsapp_/)){
        return 'marriage';
    }
    return '';
}

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

// example key: 'fl/broward/2021-05-06/MOPROBAT.txt
const getCsvString = async (key: any) => {
    const s3Service = new S3Service();
    const object = await s3Service.getObject('clerk-of-courts', key);

    if (object.Body) {
        const csvString = object.Body.toString('utf-8');
        return csvString;
    }
    return false;
}

// example key: 'fl/broward/2021-05-06/MOPROBAT.txt
const downloadFileFromS3 = async (key: any) => {
    const s3Service = new S3Service();
    const object = await s3Service.getObject('clerk-of-courts', key);

    if (object.Body) {
        let path = __dirname + '/' + key.split('/').pop();
        await fs.writeFileSync(path, object.Body);
        return path;
    }
    return false;
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

export const processCsvImport = async (state: string, county: string, setDate: any = false) => {
    try{
        let today = new Date();
        let todayString: any = getFormattedDate(today);
        if(setDate){
            todayString = setDate;
        }
        let folderName = state.toLowerCase() + '/' + county + '/' + todayString;
        let keys = await getKeys(folderName);
        if(keys.length < 1){
            console.log('The folder is empty!');
            return false;
        }
        for (const key of keys){
            console.log("Processing:", key);
            // let csvString = await getCsvString(key);
            let savedPath = await downloadFileFromS3(key);
            if(savedPath){
                let practiceType: string = getPracticeTypeFromKey(key);
                let fileName: string = key?.split('/').pop() || '';
                try{
                    await parseIt(practiceType, state.toLowerCase(), county, fileName, savedPath);
                } catch(e){
                    console.log(e);
                }
                console.log('Done processing:', key);
                // let practiceType: string = getPracticeTypeFromKey(key);
                // let fileName: any = key?.split('/').pop();

                // console.log(practiceType, fileName);
                // if(fileName && practiceType != ''){
                //     await parseCsv(practiceType, state.toLowerCase(), county, csvString, fileName, false);
                // }
            }
        }
        return true;
    } catch(e){
        console.log(e);
        return false;
    }
}

// setTimeout(() => {
//     console.log('Stopped because exceeded the time limit! (3 hours)');
//     process.exit();
// }, 10800000); // 3 hours
// ( async () => {

//     // example folderName: 'fl/broward/2021-05-06'
//     const getKeys = async (folderName: string) => {
//         let keys = [];
//         const s3Service = new S3Service();
//         const params = {
//             Bucket: 'clerk-of-courts',
//             Delimiter: '/',
//             Prefix: folderName + '/'
//         }
//         const data = await s3Service.s3.listObjects(params).promise();
//         if(data && data['Contents']){
//             for (let index = 1; index < data['Contents'].length; index++) {
//                 keys.push(data['Contents'][index]['Key']);
//             }
//         }
//         return keys;
//     }

//     // example key: 'fl/broward/2021-05-06/MOPROBAT.txt
//     const getCsvString = async (key: any) => {
//         const s3Service = new S3Service();
//         const object = await s3Service.getObject('clerk-of-courts', key);

//         if (object.Body) {
//             const csvString = object.Body.toString('utf-8');
//             return csvString;
//         }
//         return false;
//     }

//     function getFormattedDate(date: Date) {
//         let year: any = date.getFullYear();
//         let month: any = (1 + date.getMonth());
//         let day: any = date.getDate();
//         if (year === NaN || day === NaN || month === NaN) {
//             return '';
//         }
//         month = month.toString().padStart(2, '0');
//         day = day.toString().padStart(2, '0');
//         return year + '-' + month + '-' + day;
//     }

//     // example key: 'fl/broward/2021-05-06/MOPROBAT.txt
//     function getPracticeTypeFromKey(key: any): string {
//         if(key.match(/PROBAT/)){
//             return 'probate';
//         } else if (key.match(/TENANT/) || key.match(/EVICT/)){
//             return 'eviction';
//         } else if (key.match(/CIVIL/) || key.match(/CIVL/)){
//             return 'civil';
//         } else if (key.match(/FELONY/) || key.match(/MISDEM/)){
//             return 'criminal';
//         } else if (key.match(/TCDISPO/) || key.match(/TCDISPO/) || key.match(/INFRAC/) || key.match(/TRFFIC/)){
//             return 'traffic';
//         }
//         return '';
//     }

//     let countiesWithCSV: any = {
//         "FL": [ "broward" ]
//     };

//     for(const state in countiesWithCSV){
//         let counties = countiesWithCSV[state];
//         for(const county of counties){
//             let today = new Date();
//             let todayString = getFormattedDate(today);
//             let folderName = state.toLowerCase() + '/' + county + '/' + todayString;
//             let keys = await getKeys(folderName);
//             for (const key of keys){
//                 console.log("Processing:", key);
//                 let csvString = await getCsvString(key);
//                 if(csvString){
//                     let practiceType: string = getPracticeTypeFromKey(key);
//                     let fileName: any = key?.split('/').pop();

//                     console.log(practiceType, fileName);
//                     if(fileName && practiceType != ''){
//                         await parseCsv(practiceType, state.toLowerCase(), county, csvString, fileName, false);
//                     }
//                 }
//             }
//         }
//     }
//     process.exit();
// })();