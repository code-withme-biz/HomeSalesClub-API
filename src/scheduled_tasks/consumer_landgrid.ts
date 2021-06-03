// Landgrid API Example by ADDRESS: https://landgrid.com/api/v1/search.json?query=9808%20NW%2070th%20Court%2033321&context=us/florida/broward/tamarac&token=BbmQh1nSN9T-53kTx282KAdUzp3sFY2zzNpPQLRqxauVoZ2XkN7z2u3AGGmNYNEV

// Landgrid API Example by OWNER NAME: https://landgrid.com/api/v1/search.json?owner=Viglione,Daniel&context=us/florida/broward/tamarac&token=BbmQh1nSN9T-53kTx282KAdUzp3sFY2zzNpPQLRqxauVoZ2XkN7z2u3AGGmNYNEV


require('dotenv').config();
import axios from 'axios';
import { sleep } from '../core/sleepable';
import db from '../models/db';
import { IOwnerProductProperty } from '../models/owner_product_property';
import { IProperty } from '../models/property';
import { IPublicRecordProducer } from '../models/public_record_producer';
import { property } from 'lodash';
import SnsService from '../services/sns_service';
import { count } from 'console';
import { consoleLog, hasZipCode, logOpp, saveToOwnerProductPropertyByConsumer, updateOldProperty, checkPropertyZipOnProperty } from '../services/general_service';
import AddressService from '../services/address_service';
interface INameResp {
    type: string;
    suffix?: string;
    fullName: string;
    firstName?: string;
    lastName?: string;
}

const landgridPaConsumer = async (publicRecordProducer: IPublicRecordProducer, ownerProductProperty: IOwnerProductProperty) => {
    const states = [
        ['Arizona', 'AZ'],
        ['Alabama', 'AL'],
        ['Alaska', 'AK'],
        ['Arkansas', 'AR'],
        ['California', 'CA'],
        ['Colorado', 'CO'],
        ['Connecticut', 'CT'],
        ['Delaware', 'DE'],
        ['Florida', 'FL'],
        ['Georgia', 'GA'],
        ['Hawaii', 'HI'],
        ['Idaho', 'ID'],
        ['Illinois', 'IL'],
        ['Indiana', 'IN'],
        ['Iowa', 'IA'],
        ['Kansas', 'KS'],
        ['Kentucky', 'KY'],
        ['Louisiana', 'LA'],
        ['Maine', 'ME'],
        ['Maryland', 'MD'],
        ['Massachusetts', 'MA'],
        ['Michigan', 'MI'],
        ['Minnesota', 'MN'],
        ['Mississippi', 'MS'],
        ['Missouri', 'MO'],
        ['Montana', 'MT'],
        ['Nebraska', 'NE'],
        ['Nevada', 'NV'],
        ['New Hampshire', 'NH'],
        ['New Jersey', 'NJ'],
        ['New Mexico', 'NM'],
        ['New York', 'NY'],
        ['North Carolina', 'NC'],
        ['North Dakota', 'ND'],
        ['Ohio', 'OH'],
        ['Oklahoma', 'OK'],
        ['Oregon', 'OR'],
        ['Pennsylvania', 'PA'],
        ['Rhode Island', 'RI'],
        ['South Carolina', 'SC'],
        ['South Dakota', 'SD'],
        ['Tennessee', 'TN'],
        ['Texas', 'TX'],
        ['Utah', 'UT'],
        ['Vermont', 'VT'],
        ['Virginia', 'VA'],
        ['Washington', 'WA'],
        ['West Virginia', 'WV'],
        ['Wisconsin', 'WI'],
        ['Wyoming', 'WY'],
    ];

    const applyNameNormalization = (fullNameString: string): INameResp[] => {
        fullNameString = fullNameString.replace(/\(.*\)/g,'');
        let fullNames: string[] = [];
        let symbols = ['&', '/', '+', '*'];
        for (const symbol of symbols) {
            if (fullNameString.indexOf(symbol) > -1) {
                fullNames = fullNameString.split(symbol).filter(name => name.trim() !== '').map(name => name?.trim());
                break;
            }
        }
        if (fullNames.length === 0)
            fullNames = [fullNameString];

        const normalizedNames = [];
        let lastName = '';
        let index = 0;
        for (fullNameString of fullNames) {
            if (index > 0 && fullNameString.indexOf(lastName) === -1) {
                fullNameString = lastName + ' ' + fullNameString;
            }
            const companyIdentifiersArray = [ 'GENERAL', 'TRUSTEES',  'INC', 'ORGANIZATION', 'CORP', 'CORPORATION', 'LLC', 'MOTORS', 'BANK', 'UNITED', 'CO', 'COMPANY', 'FEDERAL', 'MUTUAL', 'ASSOC', 'AGENCY' , 'SECRETARY' , 'DEVELOPMENT' , 'INVESTMENT' , 'ESTATE', 'LLP', 'LP', 'HOLDINGS' , 'LOAN' ,'CONDOMINIUM'];
            const suffixArray = ['II', 'III', 'IV', 'CPA', 'DDS', 'ESQ', 'JD', 'JR', 'LLD', 'MD', 'PHD', 'RET', 'RN', 'SR', 'DO'];
            const removeFromNamesArray = ['ET', 'AS', 'DECEASED', 'DCSD', 'CP\/RS', 'JT\/RS', 'TR', 'TRUSTEE', 'TRUST', 'INT'];
            const companyRegexString = `\\b(?:${companyIdentifiersArray.join('|')})\\b`;
            const companyRegex = new RegExp(companyRegexString, 'i');
            const removeFromNameRegexString = `^(.*?)\\b(?:${removeFromNamesArray.join('|')})\\b.*?$`;
            const removeFromNamesRegex = new RegExp(removeFromNameRegexString, 'i');
            const nameNormalize = `^([^\\s,]+)(?:\\s+|,\\s*)(?:(${suffixArray.join('|')})(?:\\s+|,\\s*))?([^\\s]+)`;
            const nameNormalizeRegex = new RegExp(nameNormalize, 'i');
            let cleanName = fullNameString.match(removeFromNamesRegex);
            if (cleanName) {
                fullNameString = cleanName[1];
            }
            fullNameString = fullNameString.replace(/[^A-Z\s\-]/ig, '').replace(/\s+/g, ' ').trim();
            let normalizedName = fullNameString.match(nameNormalizeRegex)
            let returnObj: INameResp = { type: '', fullName: fullNameString};
            returnObj['suffix'] = '';
            if(fullNameString.match(companyRegex) || !normalizedName) {
                normalizedNames.push({'type': 'company', fullName: fullNameString});
            } else {
                if (normalizedName[2]) {
                    returnObj['suffix'] = normalizedName[2]?.trim();
                }
                returnObj['firstName'] = normalizedName[3]?.trim();
                returnObj['lastName'] = lastName =normalizedName[1]?.trim();
                returnObj['type'] = 'person';
                normalizedNames.push(returnObj);
            }
            index++;
        }
        console.log(normalizedNames);
        return normalizedNames;
    }

    const queryLandgridApi = async (data: any, searchBy: string): Promise<{ [key: string]: any }> => {
        if (searchBy === 'property')
            return await queryLandgridApiByAddress(data);
        else if (searchBy === 'name') {
            const result1 = await queryLandgridApiByName(data);
            const result2 = await queryLandgridApiByName(data, false);
            if (result1.response)
                return result1;
            else if (result2.response) 
                return result2;
            else return result1;
        }
        else throw `expected a searchBy type, got ${searchBy}`;
    }

    const queryLandgridApiByAddress = async(publicRecordAttributes: any): Promise<{ [key: string]: any }> => {
        const baseUrl = 'https://landgrid.com/api/v1/search.json?query=';
        let addressQuery = publicRecordAttributes['Property Address'];
        if (AddressService.detectFullAddress(publicRecordAttributes['Property Address']))
            addressQuery = AddressService.getParsedAddress(publicRecordAttributes['Property Address'])?.street_address;
        
        const { normalizedStateString, normalizedCountyString, normalizedCityString } = normalizedAddressFormat(publicRecordAttributes);

        let context = `us/${normalizedStateString}/${normalizedCountyString}/${normalizedCityString}`;
        let apiToken = "BbmQh1nSN9T-53kTx282KAdUzp3sFY2zzNpPQLRqxauVoZ2XkN7z2u3AGGmNYNEV";

        let reqUrl = baseUrl + addressQuery + '&context=' + context + '&token=' + apiToken + '&strict=1';
        console.log(reqUrl);

        let response: any = { status: 200 };
        let error = '';
        for (let i = 0 ; i < 10 ; i++) {
            try {
                response = await axios.get(reqUrl);
                break;
            } catch(e) {
                response.status = 403; 
                error = e;
                console.log('ERROR = ', reqUrl);
                await sleep(5000);
            };
        }

        if (response.status != 200) {
            console.warn(`Expected response status 200, received ${response.status}!`)
            return {response: false, error: error};
        } else {
            const allProperties: any[] = response.data.results;
            let triangulatedResults: any[] = [];

            if(allProperties.length > 0 ) {
                triangulatedResults = triangulateProperties(allProperties, publicRecordAttributes, normalizedStateString, normalizedCountyString, normalizedCityString );
            }
    
            let resultObjs = [];
            let resultObj: any = {};
            for (let result of triangulatedResults) {
                let resultAddress = getAddressFromFields(result.fields);
                console.log(`Address: ${resultAddress.full_address} \n Owner: ${result.fields.owner}, County: ${result.fields.county}`);
    
                if (result.fields.owner) {
                    const {scity, szip} = result.fields;
                    
                    // address specific
                    resultObj['Property City'] = scity || publicRecordAttributes['Property City'];
                    resultObj['Property Zip'] = szip || publicRecordAttributes['Property Zip'];

                    // vacancy specific 
                    resultObj['yearbuilt'] = result.fields.yearbuilt;
                    resultObj['usps_vacancy'] = result.fields.usps_vacancy;
                    resultObj['usps_vacancy_date'] = result.fields.usps_vacancy_date;
                    resultObj['parcel'] = result.fields.parcel;
                    resultObj['descbldg'] = result.fields.descbldg;
                    
                    // property specific
                    resultObj['improvval'] = result.fields.improvval;
                    resultObj['landval'] = result.fields.landval;
                    resultObj['parval'] = result.fields.parval;
                    resultObj['ll_bldg_footprint_sqft'] = result.fields.ll_bldg_footprint_sqft;
                    resultObj['ll_bldg_count'] = result.fields.ll_bldg_count;
                    resultObj['legaldesc'] = result.fields.legaldesc;
                    resultObj['sqft'] = result.fields.sqft;
                    resultObj['ll_gisacre'] = result.fields.ll_gisacre;
                    resultObj['lbcs_activity_desc'] = result.fields.lbcs_activity_desc;
                    resultObj['lbcs_function_desc'] = result.fields.lbcs_function_desc;
                    resultObj['lbcs_function_desc'] = result.fields.lbcs_function_desc;
                    resultObj['livingarea'] = result.fields.livingarea;
                    resultObj['assessmentyear'] = result.fields.assessmentyear;
                    resultObj['assessmentyear'] = result.fields.assessmentyear;
                    resultObj['assedvalschool'] = result.fields.assedvalschool;
                    resultObj['assedvalnonschool'] = result.fields.assedvalnonschool;
                    resultObj['taxvalschool'] = result.fields.taxvalschool;
                    resultObj['taxvalnonschool'] = result.fields.taxvalnonschool;
                    resultObj['justvalhomestead'] = result.fields.justvalhomestead;

                    // VERY IMPORTANT FIELDS!
                    resultObj['Last Sale Recording Date'] = result.fields.saledate;
                    resultObj['Last Sale Amount'] = result.fields.saleprice;
                    if (resultObj['Last Sale Recording Date']) {
                        let date = new Date(resultObj['Last Sale Recording Date']);
                        if (String(date) !== 'Invalid Date' && getFormattedDate(date)) {
                            resultObj['Last Sale Recording Date'] = getFormattedDate(date);
                        }
                    }

                    let normalizedNames = applyNameNormalization(result.fields.owner);
                    for (let normalizedName of normalizedNames) {
                        if (normalizedName.type == 'person') {
                            const obj = {
                                ...resultObj,
                                'owner_full_name': normalizedName.fullName,
                                'owner_first_name': normalizedName.firstName,
                                'owner_last_name': normalizedName.lastName,
                            };
                            if (normalizedName.suffix) {
                                obj['owner_suffix'] = normalizedName.suffix;
                            }
                            resultObjs.push(obj);
                        }
                    }
                    
                    break;
                }
            }
    
            if(resultObjs.length > 0) {
                console.log(resultObjs);
                return {response: resultObjs};
            } else return {response: false, error: 'No owner_full_name in the response'};
        }
    };

    const queryLandgridApiByName = async(publicRecordAttributes: any, nameorder=true): Promise<{ [key: string]: any }> => {
        const baseUrl = 'https://landgrid.com/api/v1/search.json?owner=';

        let nameQuery: string = '';   
        if (publicRecordAttributes['Full Name']) {
            if (nameorder) {
                if (publicRecordAttributes['Last Name']) 
                    nameQuery = publicRecordAttributes['Last Name'];
                if (publicRecordAttributes['First Name'])
                    nameQuery = (nameQuery ? nameQuery + ' ' : '' )+ publicRecordAttributes['First Name'];
            }
            else {
                if (publicRecordAttributes['First Name']) 
                    nameQuery = publicRecordAttributes['First Name'];
                if (publicRecordAttributes['Last Name'])
                    nameQuery = (nameQuery ? nameQuery + ' ' : '' )+ publicRecordAttributes['Last Name'];
            }
            if (nameQuery === '')
                nameQuery = publicRecordAttributes['Full Name'];

            nameQuery = nameQuery.replace(/\s+/g, ' ').trim();
        }

        if(nameQuery === '') {
            return {error: "No nameQuery"};
        }

        const { normalizedStateString, normalizedCountyString } = normalizedAddressFormat(publicRecordAttributes);
        const context = `us/${normalizedStateString}/${normalizedCountyString}`;

        let apiToken = "BbmQh1nSN9T-53kTx282KAdUzp3sFY2zzNpPQLRqxauVoZ2XkN7z2u3AGGmNYNEV";

        let reqUrl = baseUrl + nameQuery + '&context=' + context + '&token=' + apiToken + '&strict=1';
        console.log('reqUrl: ', reqUrl);

        let response: any = { status: 200 };
        let error = '';
        for (let i = 0 ; i < 10 ; i++) {
            try {
                response = await axios.get(reqUrl);
                break;
            } catch(e) {
                response.status = 403; 
                error = e;
                console.log('ERROR = ', reqUrl);
                await sleep(5000);
            };
        }

        if (response.status != 200) {
            console.warn(`Expected response status 200, received ${response.status}!`)
            return {response: false, error: error};
        } else {
            const allProperties: any[] = response.data.results;
            let triangulatedResults: any[] = [];

            if(allProperties.length > 0 ) {
                triangulatedResults = triangulateProperties(allProperties, publicRecordAttributes, normalizedStateString, normalizedCountyString);
            }

            console.log('the triangulatedResults: ',triangulatedResults.length );

            let resultObj: any = {};
            for (let result of triangulatedResults) {
                let resultAddress = getAddressFromFields(result.fields);
                console.log(`Address: ${resultAddress.full_address} \n Owner: ${result.fields.owner}, County: ${result.fields.county}`);
    
                if (result.fields.owner) {
                    resultObj['owner_full_name'] = result.fields.owner;
                    const {scity, state2, szip} = result.fields;

                    // address specific
                    resultObj['Property Address'] = resultAddress.street_address;
                    resultObj['Property City'] = scity;
                    resultObj['Property State'] = state2 || publicRecordAttributes['Property State'];
                    resultObj['Property Zip'] = szip || publicRecordAttributes['Property Zip'];

                    // Normalize the state, e.g if we got "FLORIDA" instead "FL"
                    if(resultObj['Property State'] && resultObj['Property State'].length > 2){
                        let resultState = '';
                        let stateArr = resultObj['Property State'].split(/\s+/g);
                        for (let word of stateArr){
                            word = word.toLowerCase();
                            word = word[0].toUpperCase() + word.substring(1);
                            resultState +=  word + ' ';
                        }
                        for(let i = 0; i < states.length; i++){
                            if(states[i][0] == resultState.trim()){
                                resultObj['Property State'] = states[i][1];
                                break;
                            }
                        }
                    }

                    // resultObj['Property Zip'] = result.fields.mail_zip;          
                        
                    // vacancy specific 
                    resultObj['yearbuilt'] = result.fields.yearbuilt;
                    resultObj['usps_vacancy'] = result.fields.usps_vacancy;
                    resultObj['usps_vacancy_date'] = result.fields.usps_vacancy_date;
                    resultObj['parcel'] = result.fields.parcel;
                    resultObj['descbldg'] = result.fields.descbldg;
                    
                    // property specific
                    resultObj['improvval'] = result.fields.improvval;
                    resultObj['landval'] = result.fields.landval;
                    resultObj['parval'] = result.fields.parval;
                    resultObj['ll_bldg_footprint_sqft'] = result.fields.ll_bldg_footprint_sqft;
                    resultObj['ll_bldg_count'] = result.fields.ll_bldg_count;
                    resultObj['legaldesc'] = result.fields.legaldesc;
                    resultObj['sqft'] = result.fields.sqft;
                    resultObj['ll_gisacre'] = result.fields.ll_gisacre;
                    resultObj['lbcs_activity_desc'] = result.fields.lbcs_activity_desc;
                    resultObj['lbcs_function_desc'] = result.fields.lbcs_function_desc;
                    resultObj['lbcs_function_desc'] = result.fields.lbcs_function_desc;
                    resultObj['livingarea'] = result.fields.livingarea;
                    resultObj['assessmentyear'] = result.fields.assessmentyear;
                    resultObj['assessmentyear'] = result.fields.assessmentyear;
                    resultObj['assedvalschool'] = result.fields.assedvalschool;
                    resultObj['assedvalnonschool'] = result.fields.assedvalnonschool;
                    resultObj['taxvalschool'] = result.fields.taxvalschool;
                    resultObj['taxvalnonschool'] = result.fields.taxvalnonschool;
                    resultObj['justvalhomestead'] = result.fields.justvalhomestead;

                    // VERY IMPORTANT FIELDS!
                    resultObj['Last Sale Recording Date'] = result.fields.saledate;
                    resultObj['Last Sale Amount'] = result.fields.saleprice;
                    if (resultObj['Last Sale Recording Date']) {
                        let date = new Date(resultObj['Last Sale Recording Date']);
                        if (String(date) !== 'Invalid Date' && getFormattedDate(date)) {
                            resultObj['Last Sale Recording Date'] = getFormattedDate(date);
                        }
                    }

                    break;
                }
            }
    
            if(resultObj.hasOwnProperty('owner_full_name')) {
                consoleLog(resultObj);
                return {response: resultObj};
            } else return {response: false, error: 'No owner_full_name in the response'};
        }
    };

    const getAddressFromFields = (fields: any) => {
        let {saddno, saddstr, saddsttyp, scity, state2, szip} = fields;
        saddno = saddno || '';
        saddstr = saddstr || '';
        saddsttyp = saddsttyp || '';
        scity = scity || '';
        state2 = state2 || '';
        szip = szip || '';
        let street_address = `${saddno} ${saddstr} ${saddsttyp}`;
        street_address = street_address.replace(/\s+/g, ' ').trim();
        let full_address = `${street_address}, ${scity } ${state2} ${szip}`;
        full_address = full_address.replace(/\s+/g, ' ').trim();
        return {
            street_address,
            full_address
        };
    }

    const triangulateProperties = (allProperties: any[], publicRecordAttributes: any, normalizedStateString: string, normalizedCountyString: string, normalizedCityString: string | undefined = ''): any[] => {
        console.log(allProperties.length + ' results found. Triangulating.');
    
        let found = 0;
        let triangulatedResults = [];

        for (let property of allProperties) {
            let resultAddress = getAddressFromFields(property.properties.fields).full_address;
            let searchAddress = AddressService.getFullAddressFromProperty(publicRecordAttributes);
            if (searchAddress) {
                console.log('------------------------------');
                console.log(`Result Address: ${resultAddress}`);
                console.log(`Search Address: ', ${searchAddress}`);
                console.log('------------------------------');
                if (AddressService.compareFullAddress(resultAddress, searchAddress)) {
                    triangulatedResults.push(property.properties);
                }
            }
        }

        // no triangulated results because no property address
        // this will most likely happen when all we have is an owner
        if(triangulatedResults.length === 0) {
            allProperties.forEach( (property: any) => {
                if(property.properties.fields.county && 
                    property.properties.fields.county.toLowerCase().replace(' ','-') === publicRecordAttributes['County'].toLowerCase().replace(' ','-') && 
                    property.properties.fields.state2 && 
                    property.properties.fields.state2.toLowerCase() === publicRecordAttributes['Property State'].toLowerCase()){
                    triangulatedResults.push(property.properties);
                }
            });
        }
        consoleLog('triangulatedResults = ', triangulatedResults)

        return triangulatedResults;
    }

    const normalizedAddressFormat = (publicRecordAttributes: any) => {
        let normalizedStateString = publicRecordAttributes['Property State'].toLowerCase();
        let normalizedCountyString = publicRecordAttributes['County'].toLowerCase().replace(/[^A-Z\s\d-]/ig, '').replace(/\s+/g, '-');

        let normalizedCityString: string = '';
        if(publicRecordAttributes['Property City']) {
            normalizedCityString = publicRecordAttributes['Property City'].toLowerCase().replace(/[^A-Z\s\d-]/ig, '').replace(/\s+/g, '-');
        }

        return {
            normalizedStateString, 
            normalizedCountyString, 
            normalizedCityString
        };
    };
    
    const updateDocumentAddressAttributes = async (lineItem: any, nameData: any, source: string, opp: any) => {
        lineItem['Property Address'] = nameData['Property Address'];
        lineItem['Property City'] = nameData['Property City'];
        lineItem['Property State'] = nameData['Property State'];
        lineItem['Property Zip'] = nameData['Property Zip'];

        return await checkPropertyAppraiserDetails(lineItem, nameData, source, opp);
    }

    const updateDocumentNameAttributes = async (lineItem: any, nameData: any, source: string, opp: any) => {
        lineItem['First Name'] = nameData['owner_first_name'];
        lineItem['Last Name'] = nameData['owner_last_name'];
        lineItem['Name Suffix'] = nameData['owner_suffix'];
        lineItem['Full Name'] = nameData['owner_full_name'];
        
        return await checkPropertyAppraiserDetails(lineItem, nameData, source, opp);
    }

    const updateOnlyAddressAttributes = async (opp: any, data: any): Promise<void> => {
        console.log('updateOnlyAddressAttributes: ', opp.propertyId['_id']);
        const property: IProperty = await db.models.Property.findOne({ _id: opp.propertyId['_id']});
        await updateOldProperty(property, data);
        if (opp.propertyId && opp.ownerId) {
            opp.processed = true;
            if (data['Last Sale Recording Date']) {
                opp.consumed = true;
            }
            await opp.save();
        }
        await property.save();
    }

    const getFormattedDate = (date: Date) => {
        let year: any = date.getFullYear();
        let month: any = (1 + date.getMonth());
        let day: any = date.getDate();
        if (year === NaN || day === NaN || month === NaN) {
            return false;
        }
        month = month.toString().padStart(2, '0');
        day = day.toString().padStart(2, '0');
        return month + '/' + day + '/' + year;
    }

    const normalizeStringForMongo = (sourceString: string) => {
        return sourceString.toLocaleLowerCase().replace('_', '-').replace(/[^A-Z\d\s\-]/ig, '').replace(/\s+/g, '-');
    }

    const saveToNewSchema = async (data: any, source: string, opp: any) => {
        // If the data has full name and property address
        return await saveToOwnerProductPropertyByConsumer(opp, data, source);
    }

    const checkPropertyAppraiserDetails = async (lineItem: any, nameData: any, source: string, opp: any) => {
        lineItem['yearBuilt'] = nameData['yearbuilt'];
        lineItem['vacancy'] = nameData['usps_vacancy'];
        lineItem['vacancyDate'] = nameData['usps_vacancy_date'];
        lineItem['parcel'] = nameData['parcel'];    
        lineItem['descbldg'] = nameData['descbldg'];

        // Est Equity not provided by LandGrid API

        if(!lineItem['Property Type']) {
            lineItem['Property Type'] = nameData['lbcs_function_desc'];
        }

        if(!lineItem['Total Assessed Value']) {
            lineItem['Total Assessed Value'] = nameData['parval'];
        }

        if(!lineItem['Est Value']) {
            lineItem['Est Value'] = nameData['parval'];
        }

        if(!lineItem['Effective Year Built']) {
            lineItem['Effective Year Built'] = nameData['effyearbuilt'];
        }

        if(!lineItem['Last Sale Recording Date']) {
            lineItem['Last Sale Recording Date'] = nameData['Last Sale Recording Date'];
        }
        
        if(!lineItem['Last Sale Amount']) {
            lineItem['Last Sale Amount'] = nameData['Last Sale Amount'];
        }

        // extra useful property fields
        lineItem['improvval'] = nameData['improvval'];
        lineItem['ll_bldg_footprint_sqft'] = nameData['ll_bldg_footprint_sqft'];
        lineItem['ll_bldg_count'] = nameData['ll_bldg_count'];
        lineItem['legaldesc'] = nameData['legaldesc'];
        lineItem['sqft'] = nameData['sqft'];
        lineItem['ll_gisacre'] = nameData['ll_gisacre'];
        lineItem['lbcs_activity_desc'] = nameData['lbcs_activity_desc'];
        lineItem['lbcs_function_desc'] = nameData['lbcs_function_desc'];
        lineItem['livingarea'] = nameData['livingarea'];
        lineItem['assessmentyear'] = nameData['assessmentyear'];
        lineItem['assedvalschool'] = nameData['assedvalschool'];
        lineItem['assedvalnonschool'] = nameData['assedvalnonschool'];
        lineItem['taxvalschool'] = nameData['taxvalschool'];
        lineItem['taxvalnonschool'] = nameData['taxvalnonschool'];
        lineItem['justvalhomestead'] = nameData['justvalhomestead'];
        lineItem['effyearbuilt'] = nameData['effyearbuilt'];

        return await saveToNewSchema(lineItem, source, opp);
    }

    const getLineItemObject = (document: any) => {
        const { _id, __v, createdAt, updatedAt, ..._document } = document.toJSON();
        let lineItem: any = {..._document['ownerId'], ..._document['propertyId'], productId: _document['productId']};
        if (lineItem.hasOwnProperty('_id'))
            delete lineItem['_id'];
        if (lineItem.hasOwnProperty('__v'))
            delete lineItem['__v'];
        if (lineItem.hasOwnProperty('createdAt'))
            delete lineItem['createdAt'];
        if (lineItem.hasOwnProperty('updatedAt'))
            delete lineItem['updatedAt'];
        return lineItem;
    }
  
    let state = publicRecordProducer.state;
    let county = publicRecordProducer.county;
    console.log(`landgrid-pa-consumer: now processing county ${county} in state ${state} at ${new Date()}`);

    // i have validation to ensure either propertyId or ownerId is present, so theoretically this should never happen. However, we did manually remove documents that were junk, thus breaking certain associations
    if(!ownerProductProperty.propertyId && !ownerProductProperty.ownerId) {
        return false;
    }
    if(ownerProductProperty.processed && ownerProductProperty.consumed){
        if(ownerProductProperty.propertyId && checkPropertyZipOnProperty(ownerProductProperty.propertyId)){
            console.log("OPP already completed with PA Consumer:");
            logOpp(ownerProductProperty);
            return ownerProductProperty._id;
        }
    }
    console.log('~~ # ~~ # ~~ # ~~ # ~~ # ~~ # ~~ # ~~ # ~~ # ~~ # ~~ # ~~ # ');
    logOpp(ownerProductProperty);
    let doc = getLineItemObject(ownerProductProperty);
    let result: any;

    if(ownerProductProperty.propertyId && !ownerProductProperty.ownerId) {
        result = await queryLandgridApi(doc, 'property');
        const {response: landGridDatas} = result;    
        consoleLog('#1 => landGridDatas = ', landGridDatas)
        if(landGridDatas) {
            for (const landGridData of landGridDatas) {
                return await updateDocumentNameAttributes(doc, landGridData, 'property', ownerProductProperty);
            }
        }
    } else if(!ownerProductProperty.propertyId && ownerProductProperty.ownerId) {
        result = await queryLandgridApi(doc, 'name');
        const {response: landGridData} = result;    
        consoleLog('#2 => landGridDatas = ', landGridData)
        if(landGridData) {
            return await updateDocumentAddressAttributes(doc, landGridData, 'name', ownerProductProperty);
        }
    } else {
        result = await queryLandgridApi(doc, 'property');
        const {response: landGridDatas} = result; 
        consoleLog('#3 => landGridDatas = ', landGridDatas)
        if(landGridDatas) {
            await updateOnlyAddressAttributes(ownerProductProperty, landGridDatas[0]);
            return ownerProductProperty._id;
        }
    }

    let {response: landGridData, error} = result;
    if(!landGridData){
        ownerProductProperty.processed = true;
        ownerProductProperty.consumed = false;
        await ownerProductProperty.save();
        return false;
    }
};

export default landgridPaConsumer;