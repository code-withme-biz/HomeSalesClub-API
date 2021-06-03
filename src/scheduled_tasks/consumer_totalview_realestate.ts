require('dotenv').config();
import db from '../models/db';
import puppeteer from 'puppeteer';
var addressit = require('addressit');
import { IOwnerProductProperty } from '../models/owner_product_property';
import { normalizeDate, hasLastSaleRecordDate, isEmptyOrSpaces, sleep, setParamsForPage, getTextByXpathFromPage, hasZipCode } from '../services/general_service';

const totalviewConsumer = async (ownerProductProperty: IOwnerProductProperty, totalview_page: puppeteer.Page) => {

    const getStreetAddress = (full_address:string) => {
        const parsed = addressit(full_address);
        let street_address = (parsed.number ? parsed.number : '') + ' ' + (parsed.street ? parsed.street : '') + ' ' + (parsed.unit ? '#'+parsed.unit : '');
        street_address = street_address.replace(/\s+/, ' ').trim();
        let zip = parsed.postalcode || '';
        return {
            street_address,
            zip
        };
    }

    console.log('STARTED - TOTALVIEWREALESTATE!!!');
    
    let result_flag = false;
    // i have validation to ensure either propertyId or ownerId is present, so theoretically this should never happen. However, we did manually remove documents that were junk, thus breaking certain associations
    if (!ownerProductProperty.propertyId || !ownerProductProperty.ownerId) return false;
    if (hasLastSaleRecordDate(ownerProductProperty.propertyId['Last Sale Recording Date'])) return true;

    let street_address = ownerProductProperty.propertyId['Property Address'];
    const parse_full = getStreetAddress(`${ownerProductProperty.propertyId['Property Address']}, ${ownerProductProperty.propertyId['Property City'] || ''} ${ownerProductProperty.propertyId['Property State'] || ''} ${ownerProductProperty.propertyId['Property Zip'] || ''}`);
    if(!isEmptyOrSpaces(parse_full.street_address)){
        street_address = parse_full.street_address;
    }
    let city = ownerProductProperty.propertyId['Property City'] || '';
    let state = ownerProductProperty.propertyId['Property State'] || '';
    let zip = ownerProductProperty.propertyId['Property Zip'] || '';

    console.log(`Looking for ${street_address}, ${city} ${state} ${zip}`);
    
    // get detail page response
    try {
        await setParamsForPage(totalview_page);

        let homedetail_url = `http://www.totalviewrealestate.com/index.php?address=${street_address}&city=${city}&state=${state}&zip=${zip}`;
        console.log(homedetail_url);
        await totalview_page.goto(homedetail_url, {waitUntil: 'load'});
        const handle = await Promise.race([
            totalview_page.waitForXPath('//*[contains(text(), "Property Type")]'),
            totalview_page.waitForXPath('//*[contains(text(), "encountered an error")]')
        ]);
        const handle_text = await handle.evaluate(el => el.textContent) || '';
        console.log(handle_text);
        if (handle_text.indexOf('encountered an error') > -1) {
            console.log('ERROR - Cannot fine any property with the address');
            throw 'ERROR - Cannot fine any property with the address';
        }
        await sleep(1000);
        await totalview_page.waitForXPath('//*[@id="propinfo"]/span[1]', {timeout: 60000});
        let result_address: any = await getTextByXpathFromPage(totalview_page, '//*[@id="propinfo"]/span[1]');
        const parseresult = getStreetAddress(result_address);
        if(!isEmptyOrSpaces(parseresult.street_address)){
            result_address = parseresult.street_address;
        }
        result_address = result_address.replace(/\s+|\W/g, '').trim().toUpperCase();
        street_address = street_address.replace(/\s+|\W/g, '').trim().toUpperCase();
        console.log(result_address);
        console.log(street_address);
        if (result_address.indexOf(street_address) === -1) {
            console.log('ERROR - the result address doesn\'t match with the searched address');
            throw 'ERROR - the result address doesn\'t match with the searched address';
        }

        let date = await getTextByXpathFromPage(totalview_page, '//*[contains(text(), "Last Sold On:")]') || '';
        date = date.slice(14).trim();
        let price = await getTextByXpathFromPage(totalview_page, '//*[contains(text(), "Last Sold For:")]');
        price = price.slice(15).trim();
        let year_built = await getTextByXpathFromPage(totalview_page, '//*[contains(text(), "Year Built")]/following-sibling::td[1]');
        console.log(`DATE: ${date} AMOUNT: ${price} YEAR BUILT: ${year_built}`);
        
        let validDate = date !== '' && price !== '' && hasLastSaleRecordDate(date);
        let validYearBuilt = !!(year_built && year_built.match(/\d/));
        if (!validDate && !validYearBuilt && !hasZipCode(parseresult.zip)) {
            throw 'ERROR - NO SOLD DATA or NO YEAR BUILT or PROPERTY ZIP';
        }
        console.log('++++++++++ FOUND ++++++++++')
        console.log(`DATE: ${date} AMOUNT: ${price} YEAR BUILT: ${year_built}`);
        console.log('+++++++++++++++++++++++++++');
        try {
            let property = await db.models.Property.findOne({_id: ownerProductProperty.propertyId});
            if (validDate) {
                property['Last Sale Recording Date'] = normalizeDate(new Date(date));
                property['Last Sale Amount'] = price;
            }
            if (validYearBuilt) {
                property['yearBuilt'] = year_built;
            }
            property['Property Zip'] = parseresult.zip;
            let bedrooms = parseInt(await getTextByXpathFromPage(totalview_page, '//td[normalize-space(text())="Beds:"]/following-sibling::td[1]'));
            let bathrooms = parseInt(await getTextByXpathFromPage(totalview_page, '//td[normalize-space(text())="Baths:"]/following-sibling::td[1]'));
            let sqft = parseInt(await getTextByXpathFromPage(totalview_page, '//td[normalize-space(text())="SqFt:"]/following-sibling::td[1]'));
            let sqftlot = parseInt(await getTextByXpathFromPage(totalview_page, '//td[normalize-space(text())="Lot Size:"]/following-sibling::td[1]'));
            let propertyType = parseInt(await getTextByXpathFromPage(totalview_page, '//td[normalize-space(text())="Property Type:"]/following-sibling::td[1]'));
            if (!isNaN(bedrooms)) property['bedrooms'] = bedrooms;
            if (!isNaN(bathrooms)) property['bathrooms'] = bathrooms;
            if (!isNaN(sqft)) property['sqft'] = sqft;
            if (!isNaN(sqftlot)) property['sqftlot'] = sqftlot;
            if (!property['Property Type'] && propertyType) property['Property Type'] = propertyType;

            await property.save();
            ownerProductProperty.consumed = true;
            await ownerProductProperty.save();
            console.log('OPP UPDATED SUCCESSFULLY');
            result_flag = true;
        } catch (error) {
            console.log('ERROR during updating data on db');
            console.log(error);
        }
    } catch (error) {
        console.log(error);
    }

    console.log('========================================//');
    return result_flag;
};

export default totalviewConsumer;