// // largest county Maricopa has 131 zip codes
// // each zip code produces 100 owners
// // 131 * 100 = 13,100 owners for largest county
// // Assume each owner takes 1 second to process (not true)
// // 13,100 seconds / 60 / 60 = 3.6 hours
// // Assume each owner takes 3 seconds to process (more likely)
// // (13100 * 3) / 60 / 60 = 10.9 hours
// // It's highly unlikely most zip codes will take 10 hours (Maricopa outlier)
// // Therefore, a comfortable estimate is 4 hours per county
// // 4 hours * 137 counties / 24 hours = 22.8 days
// // 5 hours * 137 counties / 24 hours = 28.5 days
// // cron(0 */5 1-29 * ? *) -> scrapetorium-landgrid-llc-produce-scheduled-task 
// // cron(0 1 30 * ? *) -> scrapetorium-reset-landgrid-llc-producer-scheduled-task

// require('dotenv').config();
// import db, { PublicRecordLineItem } from '../models/db';
// import puppeteer from 'puppeteer';
// import { IProduct } from '../models/product';
// import { IPublicRecordProducer } from '../models/public_record_producer';
// import { IPublicRecordAttributes } from '../models/public_record_attributes';
// import LandgridService from '../services/landgrid_service';
// import { sleep } from '../core/sleepable';
// import axios from 'axios';
// const landgridHomepage = 'https://landgrid.com';

// import { config as CONFIG } from '../config';
// import { IConfigEnv } from '../iconfig';
// const config: IConfigEnv = CONFIG[process.env.NODE_ENV || 'production'];

// interface INameResp {
//   type: string;
//   suffix?: string;
//   firstName?: string;
//   lastName?: string;
// }


// const normalizeString = (str: string) => {
//   return str.toLowerCase().replace(/[^A-Z\d\s]/ig, '')
// };

// const applyNameNormalization = (fullNameString: string): INameResp => {
//   const companyIdentifiersArray = [ 'GENERAL',  'TRUSTEE',  'TRUSTEES',  'INC', 'ORGANIZATION', 'CORP', 'CORPORATION', 'LLC', 'MOTORS', 'BANK', 'UNITED', 'CO', 'COMPANY', 'FEDERAL', 'MUTUAL', 'ASSOC', 'AGENCY' , 'SECRETARY' , 'DEVELOPMENT' , 'INVESTMENT' , 'ESTATE', 'LLP', 'LP', 'HOLDINGS' ,'TRUST' ,'LOAN' ,'CONDOMINIUM'];
//   const suffixArray = ['II', 'III', 'IV', 'CPA', 'DDS', 'ESQ', 'JD', 'JR', 'LLD', 'MD', 'PHD', 'RET', 'RN', 'SR', 'DO'];
//   const companyRegexString = `\\b(?:${companyIdentifiersArray.join('|')})\\b`;
//   const companyRegex = new RegExp(companyRegexString, 'i');
//   const nameNormalize = `^([^\\s,]+)(?:\\s+|,\\s*)(?:(${suffixArray.join('|')})(?:\\s+|,\\s*))?([^\\s]+)`;
//   const nameNormalizeRegex = new RegExp(nameNormalize, 'i');
//   let normalizedName = fullNameString.match(nameNormalizeRegex)
//   let returnObj: INameResp = { type: ''};
//   returnObj['suffix'] = '';

//   if(fullNameString.match(companyRegex) || !normalizedName) {
//       return {'type': 'company'};
//   } else {
//       if (normalizedName[2]) {
//           returnObj['suffix'] = normalizedName[2];
//       }
//       returnObj['firstName'] = normalizedName[3];
//       returnObj['lastName'] = normalizedName[1];
//       returnObj['type'] = 'person';
//       return returnObj;
//   }
// }

// const TOKEN = 'yX_iEaqzsWiL5hLmNqEh65xW2i5oNCVZyMm4BsmXw5VWbofkzoDJiqZmfkQaiB2Z';
// const LIMIT = 1;

// let publicRecordProducer: IPublicRecordProducer;

// ( async () => {
//   const browser = await puppeteer.launch({
//     headless: config.puppeteer_headless,
//     // slowMo: 30,
//     args: ['--no-sandbox', '--disable-setuid-sandbox'],
//     ignoreDefaultArgs: ['--disable-extensions']
//   });
//   const uaString = (await browser.userAgent()).replace('Headless', '');

//   let page = await browser.newPage();
//   await page.goto(landgridHomepage, { timeout: 0 });
//   const cookies = await page.cookies();
//   await page.close();
  
//   page = await browser.newPage();
//   await page.setCookie(...cookies);
//   await page.setUserAgent(uaString);

//   const fetchProperties = async () => {
//     publicRecordProducer = await db.models.PublicRecordProducer.findOne({ source: 'landgridcom', processed: false });

//     if(publicRecordProducer) {
//         const product: IProduct = await db.models.Product.findOne({name: `/${publicRecordProducer.state}/${publicRecordProducer.county}/absentee-property-owner` }).exec();
//         const landgridService = new LandgridService();
//         const zipcodes = await landgridService.zipcodes(publicRecordProducer.state, publicRecordProducer.county);
//         if (zipcodes.length === 0) {
//           console.log('no available zipcodes - ', product.name);
//           // publicRecordProducer.processed = true;
//           // await publicRecordProducer.save();
//           return;
//         }
//         const product_info = product.name.split('/');
//         const state_abbr = await landgridService.abbr(product_info[1]);
//         const county = product_info[2];
//         const context = `/us/${state_abbr}/${county}`;
//         console.log(`////// zipcodes: ${zipcodes.length}`);

//         for (let zipcode of zipcodes) {
//           console.log('--------------------------------');
//           console.log(`${product.name} (${context}) - ${zipcode}`);
//           console.log('--------------------------------');

//           const url1 = `https://landgrid.com/us/${zipcode}/stats.json`;

//           try {
          
//             await page.goto(url1);
//             const content = await page.content();
//             const innerText = await page.evaluate(() =>  {   
//                 const body = document.querySelector('body');                   
//                 return JSON.parse(body ? body.innerText : '{}'); 
//             }); 
//             const owner_infos = JSON.parse(JSON.stringify(innerText));
//             if (owner_infos['status'] == 'ok') {
//               if (owner_infos['lists']) {
//                 const top_owners = owner_infos['lists']['top_owners'];
//                 console.log(`|  Founds ${top_owners.length} top_owners`);
//                 console.log('-----------------------------------');
    
//                 for (let top_owner of top_owners) {
//                   const owner_name = top_owner[0];
//                   console.log(` | Fetching properties for ${owner_name}`);
                  
//                   try {
//                     const url2 = `https://landgrid.com/api/v1/search.json?owner=${escape(owner_name)}&token=${TOKEN}&limit=${LIMIT}&context=${context}`;
//                     const properties: any = await axios.get(url2);
                    
//                     if (properties['status'] == 200) {
//                       const result = await parseProperties(properties['data']['results'], product, owner_name);
//                       console.log(` | ${result.message}`);
//                     }
//                     else {
//                       console.log(' | [ERROR] Found error during fetching owner\'s properties');
//                     }
//                   }
//                   catch (error) {
//                     console.log(' | [ERROR] Found error during fetching owner\'s properties', error);
//                   }
//                   console.log(' -----------------------------------');
//                 }
//               }
//               else {
//                 console.log('|  Not found top_owners')
//                 console.log('-----------------------------------');
//               }
//           }
//           else {
//             console.log('|  [ERROR] Found error during fetching top_owners');
//           }
//         }
//         catch (error) {
//           console.log('|  [ERROR] Found error during fetching top_owners', error);        
//         }

//         // this script executes once per hour
//         // (3600 seconds/hr) / (200 zip codes at most per county) = 18 seconds/hr at most for each zip code run
//         await sleep( (Math.floor(Math.random() * 18) + 1) * 1000 );
//       }

//       publicRecordProducer.processed = true;
//       await publicRecordProducer.save();

//     } else {
//         console.log('WARNING: no more llcs to crawl');
//         process.exit();
//     }
//   }

//   const parseProperties = async (results: any[], product: IProduct, origin_name: string) => {
//     console.log(` | Founds ${results.length} properties`);
//     let saved = 0;

//     for (let {properties} of results) {
//       const property = properties;
//       if (property.fields === undefined) continue;

//       const owner_full_name = property.fields.owner === '' ? origin_name : property.fields.owner;
//       let owner_first_name = '';
//       let owner_last_name = '';
//       let owner_suffix = '';
//       let normalizedName = owner_full_name ? applyNameNormalization(owner_full_name) : applyNameNormalization('');
      
//       if (normalizedName.type == 'person') {
//           owner_first_name = normalizedName.firstName ? normalizedName.firstName : '';
//           owner_last_name = normalizedName.lastName ? normalizedName.lastName : '';
//           if (normalizedName.suffix) {
//               owner_suffix = normalizedName.suffix;
//           }
//       }
//       let owner_occupied = (property.fields.address == property.fields.mailadd) && 
//                            (property.fields.sunit == property.fields.mail_unit) &&
//                            (property.fields.scity == property.fields.mail_city) &&
//                            (property.fields.state2 == property.fields.mail_state2) &&
//                            (property.fields.szip == property.fields.mail_zip);

//       // check for duplicate
//       let data: IPublicRecordAttributes = await db.models.PublicRecordLineItem.findOne({'Property Address': property.fields.address, 'Full Name': owner_full_name}).exec();
//       let property_record: any = await db.models.Property.findOne({'fields.address': property.fields.address}).exec();
//       const line_item:any = {
//         'Property Address': property.fields.address,
//         'Property Unit #': property.fields.sunit,
//         'Property City': property.fields.scity,
//         'Property State': property.fields.state2,
//         'Property Zip': property.fields.szip,
//         'County': property.fields.county,
//         'Owner Occupied': owner_occupied,
//         'First Name': owner_first_name,
//         'Last Name': owner_last_name,
//         'Middle Name': '',
//         'Name Suffix': owner_suffix,
//         'Full Name': owner_full_name,
//         'Mailing Care of Name': property.fields.careof,
//         'Mailing Address': property.fields.mailadd,
//         'Mailing Unit #': property.fields.mail_unit,
//         'Mailing City': property.fields.mail_city,
//         'Mailing State': property.fields.mail_state2,
//         'Mailing Zip': property.fields.mail_zip,
//         'Property Type': '',
//         'Total Assessed Value': '',
//         'Last Sale Recording Date': '',
//         'Last Sale Amount': '',
//         'Est Value': '',
//         'Est Equity': '',
//         'Effective Year Built': property.fields.effyearbuilt,
//         owner_full_name: owner_full_name,
//         yearBuilt: property.fields.yearbuilt,
//         vacancy: property.fields.usps_vacancy,
//         vacancyDate: property.fields.usps_vacancy_date,
//         parcel: property.fields.parcel,
//         descbldg: property.fields.descbldg,
//         listedPrice: '',
//         listedPriceType: '',
//         practiceType: 'Absentee Property Owner',
//         'Total Open Loans': '',
//         'Lien Amount': '',
//         'Est. Remaining balance of Open Loans': '',
//         'Tax Lien Year': '',
//         productId: product._id,
//         vacancyProcessed: false
//       };
//       try {
//         if (data) {
//           data['Property Address'] = line_item['Property Address'];
//           data['Property Unit #'] = line_item['Property Unit #'];
//           data['Property City'] = line_item['Property City'];
//           data['Property State'] = line_item['Property State'];
//           data['Property Zip'] = line_item['Property Zip'];
//           data['County'] = line_item['County'];
//           data['Owner Occupied'] = line_item['Owner Occupied'];
//           data['First Name'] = line_item['First Name'];
//           data['Last Name'] = line_item['Last Name'];
//           data['Middle Name'] = line_item['Middle Name'];
//           data['Name Suffix'] = line_item['Name Suffix'];
//           data['Full Name'] = line_item['Full Name'];
//           data['Mailing Care of Name'] = line_item['Mailing Care of Name'];
//           data['Mailing Address'] = line_item['Mailing Address'];
//           data['Mailing Unit #'] = line_item['Mailing Unit #'];
//           data['Mailing City'] = line_item['Mailing City'];
//           data['Mailing State'] = line_item['Mailing State'];
//           data['Mailing Zip'] = line_item['Mailing Zip'];
//           data['Property Type'] = line_item['Property Type'];
//           data['Total Assessed Value'] = line_item['Total Assessed Value'];
//           data['Last Sale Recording Date'] = line_item['Last Sale Recording Date'];
//           data['Last Sale Amount'] = line_item['Last Sale Amount'];
//           data['Est Value'] = line_item['Est Value'];
//           data['Est Equity'] = line_item['Est Equity'];
//           data['Effective Year Built'] = line_item['Effective Year Built'];
//           data['owner_full_name'] = line_item['owner_full_name'];
//           data['yearBuilt'] = line_item['yearBuilt'];
//           data['vacancy'] = line_item['vacancy'];
//           data['vacancyDate'] = line_item['vacancyDate'];
//           data['parcel'] = line_item['parcel'];
//           data['descbldg'] = line_item['descbldg'];
//           data['listedPrice'] = line_item['listedPrice'];
//           data['listedPriceType'] = line_item['listedPriceType'];
//           data['practiceType'] = line_item['practiceType'];
//           data['Total Open Loans'] = line_item['Total Open Loans'];
//           data['Lien Amount'] = line_item['Lien Amount'];
//           data['Est. Remaining balance of Open Loans'] = line_item['Est. Remaining balance of Open Loans'];
//           data['Tax Lien Year'] = line_item['Tax Lien Year'];
//           data['productId'] = line_item['productId'];
//           data['vacancyProcessed'] = line_item['vacancyProcessed'];
            
//           // await publicRecordLineItem.save();
//         }
//         else {
//           // await db.models.PublicRecordLineItem.create(line_item);
//         }

//         await db.models.Property.deleteOne({'fields.address': property.fields.address, 'onwer_name': owner_full_name}).exec();
//         await db.models.Property.create(property);
        
//         saved++;
//       }
//       catch (error) {
//         console.log(error);
//       }
//     }
//     return {
//       flag: saved == results.length,
//       message: `Saved ${saved} properties, failed ${results.length - saved} properties`
//     };
//   }

//   await fetchProperties();
//   process.exit();
// })();
