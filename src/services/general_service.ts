import db, { PublicRecordOwner, PublicRecordOwnerProductProperty, PublicRecordProperty, PublicStatus, Purchase } from '../models/db';

// config
import { config as CONFIG } from '../config';
import { IConfigEnv } from '../iconfig';
import { IProperty } from '../models/property';
import { IOwner } from '../models/owner';
import { IStatus } from '../models/status';
import { IPurchase } from '../models/purchase';
const config: IConfigEnv = CONFIG[process.env.NODE_ENV || 'production'];
import AddressService from './address_service';
import SnsService from '../services/sns_service';
import axios from 'axios';
import puppeteer from 'puppeteer';
const nameParsingService = require('../categories/public_records/consumers/property_appraisers/consumer_dependencies/nameParsingServiceNew');
import doctype_to_practicetype_ from './normalize_practice_types.json';
import { PRACTICE_TYPES } from '../scripts/db/public_record_seed_generator';
import { IPublicRecordProducer } from '../models/public_record_producer';
import { IOwnerProductProperty } from '../models/owner_product_property';
import landgridPaConsumer from '../scheduled_tasks/consumer_landgrid';
import realtorConsumer from '../scheduled_tasks/consumer_realtor';
import zillowConsumer from '../scheduled_tasks/consumer_zillow';
import totalviewConsumer from '../scheduled_tasks/consumer_totalview_realestate';
import whitepagesConsumer from '../categories/public_records/consumers/whitepages_consumer';
import title from '../routes/title';

const parseaddress = require('parse-address');

const doctype_to_practicetype: any = doctype_to_practicetype_;

export const sleep = async (ms: number) => {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export const isEmptyOrSpaces = (str: string) => {
    return str === null || str.match(/^\s*$/) !== null;
}

export const getFormattedDate = (date: Date) => {
    let year: any = date.getFullYear();
    let month: any = (1 + date.getMonth());
    let day: any = date.getDate();
    if (isNaN(year) || isNaN(day) || isNaN(month)) {
        return false;
    }
    month = month.toString().padStart(2, '0');
    day = day.toString().padStart(2, '0');
    return month + '/' + day + '/' + year;
}

export const normalizeDate = (date_data: any) => {
    let date = new Date(date_data);
    let formatted = getFormattedDate(date);
    if (String(date) !== 'Invalid Date' && formatted) {
        return formatted;
    }
    return date_data;
}

export const hasLastSaleRecordDate = (data: any) => {
    if (data) {
        let date = new Date(data);
        if (String(date) === 'Invalid Date') {
            let hasDigits = data.match(/\d/) !== null;
            if (!hasDigits) {
                return false;
            }
        }
        return true;
    }
    return false;
}

export const hasZipCode = (data: any) => {
    if (data && !isEmptyOrSpaces(data)) {
        return true;
    }
    return false;
}

export const checkPropertyZipOnOpp = async (_id: any) => {
    let ownerProductProperty = await db.models.OwnerProductProperty.findOne({_id}).populate('ownerId propertyId');
    if(ownerProductProperty && ownerProductProperty.propertyId && ownerProductProperty.propertyId['Property Zip'] && hasZipCode(ownerProductProperty.propertyId['Property Zip'])){
        return true;
    }
    return false;
}

export const checkPropertyZipOnProperty = (property: IProperty) => {
    if(property && property['Property Zip'] && hasZipCode(property['Property Zip'])){
        return true;
    }
    return false;
}

export const parseOwnerName = (name_str: string): any[] => {
    const result: any = {};

    let parserName = nameParsingService.newParseNameFML(name_str);

    result['full_name'] = parserName.fullName;
    result['first_name'] = parserName.firstName;
    result['last_name'] = parserName.lastName;
    result['middle_name'] = parserName.middleName;
    result['suffix'] = parserName.suffix;
    return result;
}

export const normalizeStringForMongo = (sourceString: string) => {
    return sourceString.toLocaleLowerCase().replace('_', '-').replace(/[^A-Z\d\s\-]/ig, '').replace(/\s+/g, '-');
}

const fillData = (data: any, source: any, key: string, defaultValue: any) => {
    if (source[key]) {
        if (!data[key] || data[key] === '') {
            let value = source[key] || defaultValue;
            if (typeof value === 'string') {
                value = value.trim();
            }
            data[key] = value;
        }
    } else {
        data[key] = defaultValue;
    }
    return data;
}

export const updateOldOwner = async (oldOwner: IOwner, data: any): Promise<IOwner> => {
    console.log("=== OLD OWNER:", oldOwner._id, "===");
    oldOwner = fillOwnerData(oldOwner, data);
    try {
        oldOwner = await oldOwner.save()
    } catch (error) {}
    return oldOwner;
}

export const createNewOwner = async (data: any) => {
    console.log("=== CREATING NEW OWNER ===");
    let dataForOwner = {
        'Full Name': data['Full Name'].trim(),
        'County': normalizeStringForMongo(data['County'].trim()),
        'Property State': data['Property State'].trim().toUpperCase(),
        'First Name': (data['First Name'] || '').trim(),
        'Last Name': (data['Last Name'] || '').trim(),
        'Middle Name': (data['Middle Name'] || '').trim(),
        'Name Suffix': (data['Name Suffix'] || '').trim()
    };
    dataForOwner = fillOwnerData(dataForOwner, data);
    let owner = new PublicRecordOwner(dataForOwner);
    owner = await owner.save();

    console.log("=== NEW OWNER:", owner._id, "===");
    return owner;
}

const fillOwnerData = (dataForOwner: any, data: any) => {
    if (data['Mailing Address']) {
        if(data['Mailing Address'].match(/po\s+box|^c\/o|^%\s+/i) || !data['Mailing Address'].match(/\d/)){
            if (data['Property Address']) {
                dataForOwner['Mailing Address'] = data['Property Address'] || '';
                dataForOwner['Mailing Unit #'] = data['Property Unit #'] || '';
                dataForOwner['Mailing City'] = data['Property City'] || '';
                dataForOwner['Mailing State'] = data['Property State'] || '';
                dataForOwner['Mailing Zip'] = data['Property Zip'] || '';
            }
        }
    } else {
        dataForOwner = fillData(dataForOwner, data, 'Mailing Care of Name', '');
        dataForOwner = fillData(dataForOwner, data, 'Mailing Address', '');
        dataForOwner = fillData(dataForOwner, data, 'Mailing Unit #', '');
        dataForOwner = fillData(dataForOwner, data, 'Mailing City', '');
        dataForOwner = fillData(dataForOwner, data, 'Mailing State', '');
        dataForOwner = fillData(dataForOwner, data, 'Mailing Zip', '');
    }
    dataForOwner = fillData(dataForOwner, data, 'Phone', '');
    return dataForOwner;
}

export const updateOldProperty = async (oldProperty: IProperty, data: any) => {
    console.log("=== OLD PROPERTY: UPDATING PROPERTY:",oldProperty._id,"===");
    oldProperty = fillPropertyData(oldProperty, data);
    try {
        oldProperty = await oldProperty.save();
    } catch (error) {}
    return oldProperty;
}

export const createNewProperty = async (data: any) => {
    console.log("=== CREATING NEW PROPERTY ===");

    let property_address = data['Property Address'];
    let property_city = data['Property City'];
    let property_state = data['Property State'];
    let property_zip = data['Property Zip'];
    if (AddressService.detectFullAddress(property_address)) {
        const parsed_address = await AddressService.getParsedAddress(property_address);
        if (parsed_address) {
            property_address = parsed_address.street_address;
            if (!property_city || property_city === '') property_city = parsed_address.city;
            if (!property_state || property_state === '') property_state = parsed_address.state;
            if (!property_zip || property_zip === '') property_zip = parsed_address.zip;
        }
    }
    property_address = AddressService.validateAddress(property_address);
    if (property_address === null) {
        throw "Property Address is inValid";
    }

    let dataForProperty: any = {
        'Property Address': property_address,
        'County': normalizeStringForMongo(data['County']),
        'Property Unit #': data['Property Unit #'] || '',
        'Property City': property_city || '',
        'Property State': (property_state || '').toUpperCase(),
        'Property Zip': property_zip || ''
    };
    dataForProperty = fillPropertyData(dataForProperty, data);
    let newProperty = new PublicRecordProperty(dataForProperty);
    newProperty = await newProperty.save();

    console.log("=== NEW PROPERTY:", newProperty._id, "===");
    return newProperty;
}

const fillPropertyData = (dataForProperty: any, data: any) => {
    dataForProperty = fillData(dataForProperty, data, 'Property City', '');
    dataForProperty = fillData(dataForProperty, data, 'Property Zip', '');
    dataForProperty = fillData(dataForProperty, data, 'Property Unit #', '');
    dataForProperty = fillData(dataForProperty, data, 'Owner Occupied', false);
    dataForProperty = fillData(dataForProperty, data, 'Property Type', '');
    dataForProperty = fillData(dataForProperty, data, 'Total Assessed Value', '');
    dataForProperty = fillData(dataForProperty, data, 'Last Sale Recording Date', '');
    dataForProperty = fillData(dataForProperty, data, 'Last Sale Amount', '');
    dataForProperty = fillData(dataForProperty, data, 'Est. Remaining balance of Open Loans', '');
    dataForProperty = fillData(dataForProperty, data, 'Est Value', '');
    dataForProperty = fillData(dataForProperty, data, 'Effective Year Built', '');
    dataForProperty = fillData(dataForProperty, data, 'Est Equity', '');
    dataForProperty = fillData(dataForProperty, data, 'Lien Amount', '');
    dataForProperty = fillData(dataForProperty, data, 'vacancyProcessed', false);
    dataForProperty = fillData(dataForProperty, data, 'yearBuilt', null);
    dataForProperty = fillData(dataForProperty, data, 'vacancy', null);
    dataForProperty = fillData(dataForProperty, data, 'vacancyDate', null);
    dataForProperty = fillData(dataForProperty, data, 'parcel', null);
    dataForProperty = fillData(dataForProperty, data, 'descbldg', null);
    dataForProperty = fillData(dataForProperty, data, 'listedPrice', null);
    dataForProperty = fillData(dataForProperty, data, 'listedPriceType', null);
    dataForProperty = fillData(dataForProperty, data, 'listedPrice1', '');
    dataForProperty = fillData(dataForProperty, data, 'listedPriceType1', '');
    dataForProperty = fillData(dataForProperty, data, 'sold', false);
    dataForProperty = fillData(dataForProperty, data, 'Sold Date', '');
    dataForProperty = fillData(dataForProperty, data, 'soldAmount','');
    dataForProperty = fillData(dataForProperty, data, 'improvval', null);
    dataForProperty = fillData(dataForProperty, data, 'll_bldg_footprint_sqft', null);
    dataForProperty = fillData(dataForProperty, data, 'll_bldg_count', null);
    dataForProperty = fillData(dataForProperty, data, 'legaldesc', null);
    dataForProperty = fillData(dataForProperty, data, 'sqft', null);
    dataForProperty = fillData(dataForProperty, data, 'bedrooms', null);
    dataForProperty = fillData(dataForProperty, data, 'bathrooms', null);
    dataForProperty = fillData(dataForProperty, data, 'sqftlot', null);
    dataForProperty = fillData(dataForProperty, data, 'll_gisacre', null);
    dataForProperty = fillData(dataForProperty, data, 'lbcs_activity_desc', null);
    dataForProperty = fillData(dataForProperty, data, 'lbcs_function_desc', null);
    dataForProperty = fillData(dataForProperty, data, 'livingarea', null);
    dataForProperty = fillData(dataForProperty, data, 'assessmentyear', null);
    dataForProperty = fillData(dataForProperty, data, 'assedvalschool', null);
    dataForProperty = fillData(dataForProperty, data, 'assedvalnonschool', null);
    dataForProperty = fillData(dataForProperty, data, 'taxvalschool', null);
    dataForProperty = fillData(dataForProperty, data, 'taxvalnonschool', null);
    dataForProperty = fillData(dataForProperty, data, 'justvalhomestead', null);
    dataForProperty = fillData(dataForProperty, data, 'effyearbuilt', null);
    dataForProperty = fillData(dataForProperty, data, 'practiceType', null);
    dataForProperty = fillData(dataForProperty, data, 'Toal Open Loans', null);
    dataForProperty = fillData(dataForProperty, data, 'Tax Lien Year', null);
    dataForProperty = fillData(dataForProperty, data, 'propertyFrom', '');
    if(dataForProperty['Property City'] && dataForProperty['Property Address'] && dataForProperty['Property City'] !== '' && dataForProperty['Property Address'] !== ''){
        const parsed_street = parseaddress.parseLocation(dataForProperty['Property Address']);
        if(parsed_street && parsed_street.type){
            if(dataForProperty['Property City'].toLowerCase() === parsed_street.type.toLowerCase()){ // check if city is like RD, AVE, etc.
                dataForProperty['Property City'] = '';
            }
        }
    }
    return dataForProperty;
}

const preprocess = (data: any) => {
    if (data['Last Sale Recording Date'])
        data['Last Sale Recording Date'] = normalizeDate(data['Last Sale Recording Date']);
    if (data['yearBuilt'] && typeof data['yearBuilt'] !== 'string')
        data['yearBuilt'] = data['yearBuilt'].toString();
    if (data['Property State'])
        data['Property State'] = data['Property State'].toUpperCase();
    for(const key in data){
        if(typeof data[key] === 'string'){
            data[key] = data[key].replace(/\s+/g, ' ').trim();
        }
    }
    if(data['Property Zip'] && data['Mailing Zip']){
        if(data['Property Zip'] == '' && data['Mailing Zip'] != ''){
            if(AddressService.compareFullAddress(data['Property Address'], data['Mailing Address']) && (data['Property State'] == data['Mailing State'])){
                data['Property Zip'] = data['Mailing Zip'];
                if(data['Property City'] && data['Property City'] == '') data['Property City'] = data['Mailing City'] || '';
            }
        }
    }
    return data;
}

export const saveToOwnerProductPropertyByConsumer = async (ownerProductProperty: any, data: any, searchBy: string) => {
    let owner_id = null;
    let property_id = null;
    let product_id = ownerProductProperty.productId;

    data = preprocess(data);
    if(data['Full Name']){
        if(data['Full Name'].match(/^n\s+a$/mi) || !data['Full Name'].match(/\w{2,}/gm)){
            return false;
        }
    }
    data['propertyFrom'] = 'Property Appraiser';
    console.log(data);

    try{
        console.log("=== SAVING TO OWNER PRODUCT PROPERTY ===")
        if (searchBy === 'address' || searchBy === 'property'){ // Search by address
            console.log("=== SEARCHED BY ADDRESS ===");
            let oldOwner = await db.models.Owner.findOne({'Full Name': data['Full Name'], 'County': normalizeStringForMongo(data['County']), 'Property State': data['Property State']});
            if(oldOwner){
                oldOwner = await updateOldOwner(oldOwner, data)
                owner_id = oldOwner._id;
            }
            else {
                let newOwner = await createNewOwner(data);
                owner_id = newOwner._id;
            }

            let property = await db.models.Property.findOne({ _id: ownerProductProperty.propertyId });
            if(hasLastSaleRecordDate(property['Last Sale Recording Date']) && checkPropertyZipOnProperty(property))
                console.log("=== PROPERTY:",property._id,"ALREADY COMPLETED ===");
            else
                property = await updateOldProperty(property, data);
            property_id = property._id;
        }
        else { // Search by name
            console.log("=== SEARCHED BY NAME ===");
            if(ownerProductProperty.ownerId['Full Name'].match(/^n\s+a$/mi) || !ownerProductProperty.ownerId['Full Name'].match(/\w{2,}/gm)){
                return false;
            }
            let oldProperty = await db.models.Property.findOne({ $or: [{ 'Property Address': data['Property Address'] }, { 'Property Address': data['Property Address'].toUpperCase() }], 'County': normalizeStringForMongo(data['County']), 'Property State': data['Property State']});
            if(oldProperty){              
                oldProperty = await updateOldProperty(oldProperty, data);
                property_id = oldProperty._id;
            }
            else {
                let newProperty = await createNewProperty(data);;
                property_id = newProperty._id;
            }

            let owner = await db.models.Owner.findOne({ _id: ownerProductProperty.ownerId });
            if(owner['Mailing Address'] && owner['Mailing Address'] != '' && owner['Phone'] && owner['Phone'] != '') // to avoid overwrite
                console.log("=== OWNER:",owner._id,"ALREADY COMPLETED ===");
            else
                owner = await updateOldOwner(owner, data);
            owner_id = owner._id;
        }

        if (owner_id === null || property_id === null) {
            return false;
        } else {
            let temp = await db.models.OwnerProductProperty.findOne({ ownerId: owner_id, propertyId: property_id, productId: product_id }); 
            let opp_id = null;
            let processed = true;
            let consumed = hasLastSaleRecordDate(data['Last Sale Recording Date']) || !!(data['yearBuilt'] && data['yearBuilt'].match(/\d/) !== null);

            if (temp) {
                temp.processed = processed;
                temp.consumed = consumed;
                await temp.save();
                opp_id = temp._id;
                console.log(`--- REMOVED ORIGINAL OWNER_PRODUCT_PROPERTY id = ${ownerProductProperty._id}`);
                if (consumed && ownerProductProperty._id.toString() !== temp._id.toString()) {
                    await ownerProductProperty.remove();
                }
                await db.models.OwnerProductProperty.deleteOne({ownerId: owner_id, propertyId: null});
                await db.models.OwnerProductProperty.deleteOne({ownerId: null, propertyId: property_id});

                ownerProductProperty = temp;
                console.log(`--- OLD OWNER_PRODUCT_PROPERTY id = ${opp_id}`);
            }
            else {
                if (ownerProductProperty.ownerId !== null && ownerProductProperty.propertyId !== null) {
                    let dataForOwnerProductProperty: any = {
                        ownerId: owner_id,
                        propertyId: property_id,
                        productId: product_id,
                        processed: processed,
                        consumed: consumed
                    };
                    ownerProductProperty = new PublicRecordOwnerProductProperty(dataForOwnerProductProperty);
                    await ownerProductProperty.save();
                    opp_id = ownerProductProperty._id;
                    console.log(`--- NEW OWNER_PRODUCT_PROPERTY id = ${opp_id}`);
                }
                else {
                    ownerProductProperty.processed = processed;
                    ownerProductProperty.consumed = consumed;

                    if (searchBy === 'name')
                        ownerProductProperty.propertyId = property_id;
                    if (searchBy === 'address' || searchBy === 'property')
                        ownerProductProperty.ownerId = owner_id;

                    await ownerProductProperty.save();
                    opp_id = ownerProductProperty._id;
                    console.log(`--- OLD OWNER_PRODUCT_PROPERTY id = ${opp_id}`);
                }
            }
            logOpp(ownerProductProperty);
            console.log("=== DONE SAVED TO OWNER PRODUCT PROPERTY ===");
            console.log('================================================= //');
            return opp_id;
        }
    } catch (error){
        console.log(error);
        console.log('***** Data duplicate or invalid!');
        return false;
    }
}

/**
 * save record to owner_product_properties from producers (civil & code-violation)
 * @param data 
 * @param publicRecordProducer 
 * @param county_page 
 * @param whitepages_page 
 * @param realtor_browser 
 * @param totalview_page 
 * @returns 
 */
export const saveToOwnerProductPropertyByProducer = async (
        data: any, 
        publicRecordProducer: any = false, 
        county_page: puppeteer.Page | undefined = undefined, 
        whitepages_page: puppeteer.Page | undefined = undefined, 
        realtor_page: puppeteer.Page | undefined = undefined, 
        totalview_page: puppeteer.Page | undefined = undefined
    ) => {
    // If the data has full name and property address
    console.log('\n// =============== NEW PUBLIC RECORD ===============');
    try{
        let owner_id = null;
        let property_id = null;
        let owner = null;
        let property = null;
        let product_id = data['productId'];
        data = preprocess(data);
        if(data['Full Name']){
            if(data['Full Name'].match(/^n\s+a$/mi) || !data['Full Name'].match(/\w{2,}/gm)){
                return false;
            }
        }
        
        console.log('///// OWNER');
        if (data['Full Name']) {
            const parseName: any = nameParsingService.newParseName(data['Full Name'].trim())
            if (parseName?.type && parseName?.type == 'COMPANY') return false;

            owner = await db.models.Owner.findOne({ 'Full Name': data['Full Name'], 'County': normalizeStringForMongo(data['County']), 'Property State': data['Property State'] });
            if (!owner) {
                owner = await createNewOwner(data);
                console.log('--- NEW');
            } else {
                owner = await updateOldOwner(owner, data);
                console.log('--- OLD');
            }
            owner_id = owner._id;
            consoleLog(owner);
        }

        console.log('///// PROPERTY');
        if (data['Property Address']) {
            if(!data['propertyFrom']){
                data['propertyFrom'] = 'Civil Scraper';
            }
            property = await db.models.Property.findOne({ $or: [{ 'Property Address': data['Property Address'] }, { 'Property Address': data['Property Address'].toUpperCase() }] , 'County': normalizeStringForMongo(data['County']), 'Property State': data['Property State'] });
            if(!property){
                property = await createNewProperty(data);
                console.log('--- NEW');
            } else {
                property = await updateOldProperty(property, data);
                console.log('--- OLD');
            }
            property_id = property._id;
            consoleLog(property);
        }

        console.log('///// OWNER_PRODUCT_PROPERTY')
        let filledOpp = false; // If the owner doesn't have property but on database already the data with property, it will not run property appraiser.
        if (owner_id === null && property_id === null) {
            return false;
        }
        else {
            let processed = false;
            let consumed = false;
            if (owner_id && property_id) {
                processed = true;
                consumed = hasLastSaleRecordDate(data['Last Sale Recording Date']) || !!(data['yearBuilt'] && data['yearBuilt'].match(/\d/) !== null);
            }
            let opp_id = null;
            let ownerProductProperty = await db.models.OwnerProductProperty.findOne({ ownerId: owner_id, propertyId: property_id, productId: product_id });
            if (!ownerProductProperty) {
                if(property_id === null){
                    let checkOppAgain = await db.models.OwnerProductProperty.findOne({ ownerId: owner_id, propertyId: { $exists: true }, productId: product_id });
                    if(checkOppAgain){
                        opp_id = checkOppAgain._id;
                        console.log(`--- OLD OWNER_PRODUCT_PROPERTY (ALREADY PROCESSED) id = ${opp_id}`);
                        filledOpp = true;
                        ownerProductProperty = checkOppAgain;
                    }
                } else if (owner_id === null){
                    let checkOppAgain = await db.models.OwnerProductProperty.findOne({ ownerId: { $exists: true }, propertyId: property_id, productId: product_id });
                    if(checkOppAgain){
                        opp_id = checkOppAgain._id;
                        console.log(`--- OLD OWNER_PRODUCT_PROPERTY (ALREADY PROCESSED) id = ${opp_id}`);
                        filledOpp = true;
                        ownerProductProperty = checkOppAgain;
                    }
                }
                if(!filledOpp){
                    let dataForOwnerProductProperty = {
                        ownerId: owner_id,
                        propertyId: property_id,
                        productId: product_id,
                        processed: processed,
                        consumed: consumed,
                        fillingDate: data.fillingDate,
                        csvFillingDate: data.csvFillingDate,
                        csvCaseNumber: data.csvCaseNumber,
                        originalDocType: data.originalDocType,
                        sourceId: data.sourceId,
                        codeViolationId: data.codeViolationId
                    }
                    ownerProductProperty = new PublicRecordOwnerProductProperty(dataForOwnerProductProperty);
                    await ownerProductProperty.save();
                    opp_id = ownerProductProperty._id;
                    console.log(`--- NEW OWNER_PRODUCT_PROPERTY id = ${opp_id}`);
                }
            } else {
                if (owner_id !== null && property_id !== null) {
                    await db.models.OwnerProductProperty.deleteOne({ownerId: owner_id, propertyId: null});
                    await db.models.OwnerProductProperty.deleteOne({ownerId: null, propertyId: property_id});
                }
                ownerProductProperty.originalDocType = data.originalDocType;
                ownerProductProperty.fillingDate = data.fillingDate;
                ownerProductProperty.csvFillingDate = data.csvFillingDate;
                ownerProductProperty.csvCaseNumber = data.csvCaseNumber;
                ownerProductProperty.processed = processed;
                // ownerProductProperty.consumed = consumed;
                await ownerProductProperty.save();
                opp_id = ownerProductProperty._id;
                console.log(`--- OLD OWNER_PRODUCT_PROPERTY id = ${opp_id}`);
            }
            consoleLog(ownerProductProperty);
            console.log("=== DONE SAVED TO OWNER PRODUCT PROPERTY ===");
            console.log('================================================= //');

            if(!filledOpp && !consumed && publicRecordProducer && county_page && whitepages_page && realtor_page && totalview_page){
                try{
                    await ( async () => {
                        if(!publicRecordProducer.county){
                            publicRecordProducer.county = normalizeStringForMongo(data['County']);
                        }
                        ownerProductProperty = await db.models.OwnerProductProperty.findOne({ '_id': opp_id }).populate('ownerId propertyId');

                        let result = false;
                        // consume by county_property_appraiser
                        let county_browser = await county_page.browser();
                        opp_id = await consumeByCountyPA(publicRecordProducer, ownerProductProperty, county_browser, county_page) || opp_id;
                        ownerProductProperty = await processOpp(opp_id);
                        result = ownerProductProperty.processed && ownerProductProperty.consumed;
                        if (result && checkPropertyZipOnProperty(ownerProductProperty.propertyId)) {
                            // get phone number with whitepages consumer
                            // opp_id = await whitepagesConsumer(ownerProductProperty, whitepages_page) || opp_id;
                            return opp_id;
                        };
                        
                        // consume by landgrid api
                        if (!ownerProductProperty.processed) {
                            opp_id = await consumeByLandgrid(publicRecordProducer, ownerProductProperty) || opp_id;
                            ownerProductProperty = await processOpp(opp_id);
                            result = ownerProductProperty.processed && ownerProductProperty.consumed;
                        }
                        if (result && checkPropertyZipOnProperty(ownerProductProperty.propertyId)) { return opp_id }; // commented because we need to run whitepages to get phone number

                        // consume by whitepages
                        if (!ownerProductProperty.processed) {
                            if(ownerProductProperty.propertyId){
                                opp_id = await whitepagesConsumer(ownerProductProperty, whitepages_page) || opp_id;
                                ownerProductProperty = await processOpp(opp_id);
                                result = ownerProductProperty.processed && ownerProductProperty.consumed;
                                if (result && checkPropertyZipOnProperty(ownerProductProperty.propertyId)) { return opp_id };
                                if (!ownerProductProperty.processed) {
                                    if (typeof ownerProductProperty.count === 'number') ownerProductProperty.count++; else ownerProductProperty.count = 0;
                                    await ownerProductProperty.save();
                                    return opp_id;
                                }
                            } else {
                                if (typeof ownerProductProperty.count === 'number') ownerProductProperty.count++; else ownerProductProperty.count = 0;
                                await ownerProductProperty.save();
                                return opp_id;
                            }
                        }
                        // consume by totalview
                        let ret = await totalviewConsumer(ownerProductProperty, totalview_page);
                        if (ret) { return opp_id };

                        // consume by realtor
                        ret = await realtorConsumer(ownerProductProperty, realtor_page);
                        if(ret) { return opp_id };

                        if (typeof ownerProductProperty.count === 'number') ownerProductProperty.count++; else ownerProductProperty.count = 0;
                        await ownerProductProperty.save();
                    })();
                } catch(e){
                    console.log(e);
                }
            }
            return opp_id;
        }
    } catch (error){
        // pass duplicates or error data
        console.log('^^^ duplicate')
        return false;
    }
}

// ==========================================
// ========  reCaptcha 
// ==========================================

const TWO_CAPTCHA_KEY = 'f11683621d303b72ca1b1f02b9692ce1'; // config.two_captcha_key;

// reCaptcha2
const initiateCaptcha2Request = async (siteKey: any, pageUrl: any) => {
    const formData = {
        method: 'userrecaptcha',
        googlekey: siteKey,
        key: TWO_CAPTCHA_KEY,
        pageurl: pageUrl,
        json: 1
    };

    try {
        const resp = await axios.post('https://2captcha.com/in.php', formData);
        if (resp.status == 200) {
            const respObj = resp.data;
            console.log(respObj)
            if (respObj.status == 0) {
                return Promise.reject(respObj.request);
            } else {
                return Promise.resolve(respObj.request);
            }
        } else {
            console.warn(`2Captcha request failed, Status Code: ${resp.status}, INFO: ${resp.data}`);
            return Promise.reject('Error');
        }
    } catch (err) {
        return Promise.reject(err);
    }
}

export const resolveRecaptcha2 = async (siteKey: any, pageUrl: any, maxTryNo = 7) => {
    try {
        const reqId = await initiateCaptcha2Request(siteKey, pageUrl);
        console.log('captcha requested. awaiting results.')
        await sleep(20000);
        for (let tryNo = 1; tryNo <= maxTryNo; tryNo++) {
            try {
                const result = await requestCaptcha2Results(reqId);
                console.log(result);
                let status = await db.models.Status.findOne();
                if (!status) {
                    status = new PublicStatus({ recaptcha_balance_zero: false});
                    await status.save();
                }
                if (status.recaptcha_balance_zero) {
                    status.recaptcha_balance_zero = false;
                    await status.save();
                }
                return Promise.resolve(result);
            } catch (err) {
                console.warn(err);
                await sleep(20000);
            }
        }
        Promise.reject('Captcha not found within time limit');
    } catch (err) {
        if (err === 'ERROR_ZERO_BALANCE') {
            let status = await db.models.Status.findOne();
            if (!status) {
                status = new PublicStatus({ recaptcha_balance_zero: false});
                await status.save();
            }
            if (!status.recaptcha_balance_zero) {
                // send sns
                await sendRecaptchaZeroMessage();
            }
            status.recaptcha_balance_zero = true;
            await status.save();
        }
        console.warn(err);
        Promise.reject(err);
    }
}

const requestCaptcha2Results = async (requestId: any) => {
    const url = `http://2captcha.com/res.php?key=${TWO_CAPTCHA_KEY}&action=get&id=${requestId}&json=1`;

    return new Promise(async (resolve, reject) => {
        try{
            const rawResponse = await axios.get(url);
            const resp = rawResponse.data;
            if (resp.status === 0) {
                console.log(resp);
                return reject(resp.request);
            }
            console.log(resp)
            return resolve(resp.request);
        } catch(e){
            console.log(e.message);
            return reject(e.message);
        }
    })
}

// normal captcha
const initiateNormalCaptchaRequest = async (base64String: any) => {
    const formData = {
        method: 'base64',
        key: TWO_CAPTCHA_KEY,
        json: 1,
        body: base64String
    };

    try {
        const resp = await axios.post('https://2captcha.com/in.php', formData);
        if (resp.status == 200) {
            const respObj = resp.data;
            console.log(respObj)
            if (respObj.status == 0) {
                return Promise.reject(respObj.request);
            } else {
                return Promise.resolve(respObj.request);
            }
        } else {
            console.warn(`2Captcha request failed, Status Code: ${resp.status}, INFO: ${resp.data}`);
            return Promise.reject('Error');
        }
    } catch (err) {
        return Promise.reject(err);
    }
}

export const resolveRecaptchaNormal = async (base64String: any, maxTryNo = 7) => {
    try {
        const reqId = await initiateNormalCaptchaRequest(base64String);
        console.log('captcha requested. awaiting results.')
        await sleep(20000);
        for (let tryNo = 1; tryNo <= maxTryNo; tryNo++) {
            try {
                const result = await requestNormalCaptchaResults(reqId);
                console.log(result);
                let status = await db.models.Status.findOne();
                if (!status) {
                    status = new PublicStatus({ recaptcha_balance_zero: false});
                    await status.save();
                }
                if (status.recaptcha_balance_zero) {
                    status.recaptcha_balance_zero = false;
                    await status.save();
                }
                return Promise.resolve(result);
            } catch (err) {
                console.warn(err);
                await sleep(20000);
            }
        }
        Promise.reject('Captcha not found within time limit');
    } catch (err) {
        if (err === 'ERROR_ZERO_BALANCE') {
            let status = await db.models.Status.findOne();
            if (!status) {
                status = new PublicStatus({ recaptcha_balance_zero: false});
                await status.save();
            }
            if (!status.recaptcha_balance_zero) {
                // send sns
                await sendRecaptchaZeroMessage();
            }
            status.recaptcha_balance_zero = true;
            await status.save();
        }
        console.warn(err);
        Promise.reject(err);
    }
}

const requestNormalCaptchaResults = async (requestId: any) => {
    const url = `http://2captcha.com/res.php?key=${TWO_CAPTCHA_KEY}&action=get&id=${requestId}&json=1`;
    return new Promise(async (resolve, reject) => {
        const rawResponse = await axios.get(url);
        const resp = rawResponse.data;
        if (resp.status === 0) {
            console.log(resp);
            return reject(resp.request);
        }
        console.log(resp)
        return resolve(resp.request);
    })
}

const sendRecaptchaZeroMessage = async () => {
    const snsService = new SnsService();
    let topicName = SnsService.RECAPTCHA_ZERO_BALANCE_NAME;
    if (! await snsService.exists(topicName)) {
        await snsService.create(topicName);
    }

    if (! await snsService.subscribersReady(topicName, SnsService.CIVIL_UPDATE_SUBSCRIBERS)) {
        await snsService.subscribeList(topicName);
    }
    let content = 'Resolving reCAPTCHA got failed because You don\'t have funds on your account.';
    await snsService.publish(topicName, content);
}

export const resolveHCaptcha = async (siteKey: any, pageUrl: any, maxTryNo = 7) => {
    try {
        const reqId = await initiateHCaptchaRequest(siteKey, pageUrl);
        console.log('captcha requested. awaiting results.')
        await sleep(20000);
        for (let tryNo = 1; tryNo <= maxTryNo; tryNo++) {
            try {
                const result = await requestCaptcha2Results(reqId);
                console.log(result);
                let status = await db.models.Status.findOne();
                if (!status) {
                    status = new PublicStatus({ recaptcha_balance_zero: false});
                    await status.save();
                }
                if (status.recaptcha_balance_zero) {
                    status.recaptcha_balance_zero = false;
                    await status.save();
                }
                return Promise.resolve(result);
            } catch (err) {
                console.warn(err);
                await sleep(20000);
            }
        }
        Promise.reject('Captcha not found within time limit');
    } catch (err) {
        if (err === 'ERROR_ZERO_BALANCE') {
            let status = await db.models.Status.findOne();
            if (!status) {
                status = new PublicStatus({ recaptcha_balance_zero: false});
                await status.save();
            }
            if (!status.recaptcha_balance_zero) {
                // send sns
                await sendRecaptchaZeroMessage();
            }
            status.recaptcha_balance_zero = true;
            await status.save();
        }
        console.warn(err);
        Promise.reject(err);
    }
}

const initiateHCaptchaRequest = async (siteKey: any, pageUrl: any) => {
    const formData = {
        method: 'hcaptcha',
        sitekey: siteKey,
        key: TWO_CAPTCHA_KEY,
        pageurl: pageUrl,
        json: 1
    };

    try {
        const resp = await axios.post('https://2captcha.com/in.php', formData);
        if (resp.status == 200) {
            const respObj = resp.data;
            console.log(respObj)
            if (respObj.status == 0) {
                return Promise.reject(respObj.request);
            } else {
                return Promise.resolve(respObj.request);
            }
        } else {
            console.warn(`2Captcha request failed, Status Code: ${resp.status}, INFO: ${resp.data}`);
            return Promise.reject('Error');
        }
    } catch (err) {
        return Promise.reject(err);
    }
}

//////////////////////////////////////////
// puppeteer
//////////////////////////////////////////

export const launchBrowser = async (): Promise<puppeteer.Browser> => {
    return await puppeteer.launch({
        headless: config.puppeteer_headless,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        ignoreDefaultArgs: ['--disable-extensions'],
        ignoreHTTPSErrors: true,
        timeout: 60000
    });
}

export const launchTorBrowser = async (): Promise<puppeteer.Browser> => {
    console.log('--= Launching Tor Browser =--');
    return await puppeteer.launch({
        headless: config.puppeteer_headless,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--proxy-server=socks5://52.23.34.138:9050'],
        ignoreDefaultArgs: ['--disable-extensions'],
        ignoreHTTPSErrors: true,
        timeout: 60000
    });
}

export const setParamsForPage = async (page: puppeteer.Page): Promise<void> => {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.0 Safari/537.36');
    await page.setViewport({ height: 800, width: 1200 });
    await page.setDefaultNavigationTimeout(60000);
}  

export const clearPage = async (page: puppeteer.Page) => {
    const client = await page.target().createCDPSession();
    await client.send('Network.clearBrowserCookies');
    await client.send('Network.clearBrowserCache');
}
  
export const getTextByXpathFromPage = async (page: puppeteer.Page, xPath: string) => {
    const [elm] = await page.$x(xPath);
    if (elm == null) {
        return '';
    }
    let text = await page.evaluate(j => j.innerText, elm);
    return text.replace(/\n/g, ' ');
}

export const getTextByXpathFromParent = async (parent: puppeteer.ElementHandle<Element>, xPath: string) => {
    let [content_item] = await parent.$x(xPath);
    if (content_item) {
        let content: any = await content_item.getProperty('textContent');
        content = await content.jsonValue();
        content = content.replace(/\s+|\n/gm, ' ').trim();
        return content;
    }
    return '';
}
///////////////////////////////////////////
// general
///////////////////////////////////////////

export const getRandomInt = (min: number, max: number) => {
    return Math.floor(Math.random() * (max - min) ) + min;
}

export const randomSleep = async (min: number, max: number) => {
    let randInt = getRandomInt(min, max);
    console.log("Sleeping with", randInt, "ms...");
    await sleep(randInt);
}

///////////////////////////////////////////
// practice type
///////////////////////////////////////////

export const getPracticeType = (docType: string) => {
    let practiceType = 'other-civil';
    docType = normalizeStringForMongo(docType);
    docType = docType.replace(/-+/g, '-');

    if (doctype_to_practicetype[docType.trim()]) {
        practiceType = doctype_to_practicetype[docType.trim()];
    } else {
        const practypes = PRACTICE_TYPES;
        for (const practype of practypes) {
            if (docType.indexOf(practype) > -1) {
                practiceType = practype;
                break;
            }
        }
    }
    return practiceType;
}

export const fetchProduct = async (productName: string): Promise<any> => {
    try {
      const {default: Product} = await import(productName);
      return Product;
    } catch (error) {
      return null;
    }
}

const processOpp = async (_id: any) => {
    let ownerProductProperty = await db.models.OwnerProductProperty.findOne({_id}).populate('ownerId propertyId');
    if (ownerProductProperty.propertyId && ownerProductProperty.ownerId) {
        let flag = false;
        if (!ownerProductProperty.processed) {
            ownerProductProperty.processed = true;
            flag = true;
        }
        if (!ownerProductProperty.consumed && hasLastSaleRecordDate(ownerProductProperty.propertyId['Last Sale Recording Date'])) {
            ownerProductProperty.consumed = true;
            flag = true;
        }
        if (flag) await ownerProductProperty.save();
    } else {
        ownerProductProperty.processed = false;
        ownerProductProperty.consumed = false;
        await ownerProductProperty.save();
    }
    return ownerProductProperty;
}

const consumeByCountyPA = async (publicRecordProducer: IPublicRecordProducer, ownerProductProperty: IOwnerProductProperty, browser: puppeteer.Browser, page: puppeteer.Page) => {
    try {
        const state = publicRecordProducer.state.toLowerCase();
        const county = publicRecordProducer.county;
        if (state === 'ca') {
            console.log('No County Property Appraiser Script!!!');
            return false;
        }

        const Product: any = await fetchProduct(`../categories/public_records/consumers/property_appraisers/${state}/${county}/pa_consumer`);
        if (!Product || typeof Product !== 'function') {
            console.log('No County Property Appraiser Script!!!');
            return false;
        }
        return await new Product(publicRecordProducer, ownerProductProperty, browser, page).startParsing();
    } catch (error) {
        console.log('[ERROR - County Consumer] - ', error);
        return false;
    }
}

const consumeByLandgrid = async (publicRecordProducer: IPublicRecordProducer, ownerProductProperty: IOwnerProductProperty) => {
    try {
        let opp = await db.models.OwnerProductProperty.findOne({_id: ownerProductProperty._id});
        if (opp.processed && checkPropertyZipOnProperty(opp.propertyId)) return opp._id;
        return landgridPaConsumer(publicRecordProducer, ownerProductProperty);
    } catch (error) {
        console.log('[ERROR - Landgrid Consumer] - ', error);
        return false;
    }
}

///////////////////////////////////////////
// purchase
///////////////////////////////////////////

export const getPurchaseItems = async (state: string, county: string) => {
    let purchased_items = await db.models.Purchase.find({state: state.toUpperCase(), county: normalizeStringForMongo(county)});
    return purchased_items;
}

export const savePurchasedItem = async (state: string, county: string, data: any) => {
    let { price, title, upload_date } = data;
    let purchased = new Purchase({
        state: state.toUpperCase(),
        county: normalizeStringForMongo(county),
        price: price,
        title: title,
        upload_date: upload_date
    });
    await purchased.save();
}

////////////////////////////////////////////////////////////
// console log
////////////////////////////////////////////////////////////

export const consoleLog = (message?: any, ...optionalParams: any[]) => {
    if (process.env.DEBUG_MODE) {
        console.log(message, ...optionalParams);
    }
}

export const logOpp = (opp: IOwnerProductProperty) => {
    console.log('==x== OwnerProductProperties ==x==')
    if (opp) {
        console.log(`owner_product_property_id = `, opp._id)
        console.log(`ownerId = `, opp.ownerId ? (opp.ownerId['_id'] ? opp.ownerId['_id'] : opp.ownerId) : null);
        console.log(`propertyId = `, opp.propertyId ? (opp.propertyId['_id'] ? opp.propertyId['_id'] : opp.propertyId) : null);
        console.log(`productId = `, opp.productId ? (opp.productId['_id'] ? opp.productId['_id'] : opp.productId) : null);
        console.log(`consumed = `, opp.consumed);
        console.log(`processed = `, opp.processed);
    } else {
        console.log(null);
    }
    console.log('==x============================x==')
}