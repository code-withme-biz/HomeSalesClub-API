require('dotenv').config();
import db from '../models/db';
import puppeteer from 'puppeteer';
var addressit = require('addressit');
import { config as CONFIG } from '../config';
import { IConfigEnv } from '../iconfig';
const config: IConfigEnv = CONFIG[process.env.NODE_ENV || 'production'];
import { IOwnerProductProperty } from '../models/owner_product_property';
import { getTextByXpathFromPage, getFormattedDate, sleep, hasLastSaleRecordDate, resolveRecaptcha2, logOpp } from '../services/general_service';
import AddressService from '../services/address_service';

// https://www.realtor.com/realestateandhomes-detail/1423-N-16th-St_Manitowoc_WI_54220_M73893-82178
// https://www.realtor.com/realestateandhomes-detail/M1853086490

const realtorConsumer = async (ownerProductProperty: IOwnerProductProperty, realtor_page: puppeteer.Page) => {

    const getStreetAddress = (full_address:string) => {
        const parsed = addressit(full_address);
        let street_address = (parsed.number ? parsed.number : '') + ' ' + (parsed.street ? parsed.street : '') + ' ' + (parsed.unit ? '#'+parsed.unit : '');
        street_address = street_address.replace(/\s+/, ' ').trim();
        return street_address;
    }
    
    const checkForRecaptcha = async (page: puppeteer.Page) => {
        let [recaptchaSitekeyHandle] = await page.$x('//*[@class="g-recaptcha"]');
        if (recaptchaSitekeyHandle) {
            // captcha
            console.log("Resolving captcha...");
            let siteKey = await recaptchaSitekeyHandle.evaluate((elem: any) => elem.getAttribute('data-sitekey'));
            const captchaSolution: any = await resolveRecaptcha2(siteKey, await page.url());
            let recaptchaHandle = await page.$x('//*[@id="g-recaptcha-response"]');
            await recaptchaHandle[0].evaluate((elem: any, captchaSolution: any) => elem.innerHTML = captchaSolution, captchaSolution);
            console.log("Done.");
            await page.waitFor(3000);
            let js = `solvedCaptcha("${captchaSolution}")`;
            await page.evaluate(js);
            console.log('~~~~~~~~~~~~~~~~~~~');
        }
        return;
    }

    // To check empty or space
    const isEmptyOrSpaces = (str: string) => {
        return str === null || str.match(/^\s*$/) !== null;
    }

    console.log('STARTED - REALTOR !!!');
    let result_flag = false;

    // i have validation to ensure either propertyId or ownerId is present, so theoretically this should never happen. However, we did manually remove documents that were junk, thus breaking certain associations
    if (!ownerProductProperty.propertyId || !ownerProductProperty.ownerId) return false;
    if (hasLastSaleRecordDate(ownerProductProperty.propertyId['Last Sale Recording Date'])) return true;

    let street_address = ownerProductProperty.propertyId['Property Address'];
    const parse_full = getStreetAddress(`${ownerProductProperty.propertyId['Property Address']}, ${ownerProductProperty.propertyId['Property City'] || ''} ${ownerProductProperty.propertyId['Property State'] || ''} ${ownerProductProperty.propertyId['Property Zip'] || ''}`);
    if(!isEmptyOrSpaces(parse_full)){
        street_address = parse_full;
    }
    let statecityzip = (ownerProductProperty.propertyId['Property City'] || '') + ' ' + (ownerProductProperty.propertyId['Property State'] || '') + ' ' + (ownerProductProperty.propertyId['Property Zip'] || '');
    statecityzip = statecityzip.replace(/\s+/g, ' ').trim();
    if (statecityzip === '') {
        console.log('ERROR: no CITY or STATE or ZIP information, Skipping...');
        return false;
    }

    console.log('\n');
    logOpp(ownerProductProperty);
    console.log(`Looking for ${street_address}, ${statecityzip}`);

    const search_value = `${street_address}, ${statecityzip}`;

    // get detail page response
    try {        
        await realtor_page.goto('https://www.realtor.com/realestateforsale', {waitUntil: 'load'});
        await realtor_page.waitForSelector('nav+form #autocomplete-input');
        await sleep(2000);
    
        await realtor_page.click('nav+form #autocomplete-input', {clickCount: 3});
        await realtor_page.keyboard.press('Backspace');
        await realtor_page.type('nav+form #autocomplete-input', search_value, {delay: 150});
        await realtor_page.keyboard.press('Escape');
        await sleep(2000);
        await realtor_page.click('nav+form button[type="button"]');
        await realtor_page.waitForNavigation();

        let address_xpath_1 = '//*[@id="ldp-address"]/*[@itemprop="address"]';
        let address_xpath_2 = '//*[contains(@class, "address-section")]';
        await Promise.race([
            realtor_page.waitForXPath(address_xpath_1),
            realtor_page.waitForXPath(address_xpath_2),
            realtor_page.waitForXPath('//*[@class="g-recaptcha"]')
        ]);
        const [recaptcha] = await realtor_page.$x('//*[@class="g-recaptcha"]');
        if (recaptcha) {
            console.log(await realtor_page.url());
            await checkForRecaptcha(realtor_page);
            await Promise.race([
                realtor_page.waitForXPath(address_xpath_1),
                realtor_page.waitForXPath(address_xpath_2)
            ]);
        }
        let [address_handle_1] = await realtor_page.$x(address_xpath_1);
        let address_xpath = address_handle_1 ? address_xpath_1 : address_xpath_2;
        let address = await getTextByXpathFromPage(realtor_page, address_xpath);
        if(address === ''){
            console.log('Not found!');
            throw 'Not found!';
        }
        address = address.replace(',',' ');
        console.log(`Result Address = ${address}`);
        console.log(`Search Address = ${search_value}`);
        if (!AddressService.compareFullAddress(address, search_value)) {
            console.log('### ERROR - address doesn\'t match with search_address');
            throw '### ERROR - address doesn\'t match with search_address';
        }

        let date = await getTextByXpathFromPage(realtor_page, '//table/tbody/tr[*[contains(text(), "Sold")]][1]/td[1]');
        let price = await getTextByXpathFromPage(realtor_page, '//table/tbody/tr[*[contains(text(), "Sold")]][1]/td[3]');
        let year_built = await getTextByXpathFromPage(realtor_page, '//li[contains(translate(text(), "yearbuilt", "YEARBUILT"), "YEAR BUILT:")]');
        if (year_built === '') {
            year_built = await getTextByXpathFromPage(realtor_page, '//*[@data-label="property-year"]/div[contains(@class, "key-fact-data")]');
        } else {
            year_built = year_built.slice(12).trim();
        }
        console.log(`DATE: ${date} AMOUNT: ${price} YEAR BUILT: ${year_built}`);

        let validDate = date !== '' && price !== '' && hasLastSaleRecordDate(date);
        let validYearBuilt = !!(year_built && year_built.match(/\d/));
        if (validDate || validYearBuilt) {
            console.log('++++++++++ FOUND ++++++++++')
            console.log(`DATE: ${date} AMOUNT: ${price} YEAR BUILT: ${year_built}`);
            console.log('+++++++++++++++++++++++++++');
            try {
                let property = await db.models.Property.findOne({_id: ownerProductProperty.propertyId});
                if (validDate) {
                    property['Last Sale Recording Date'] = getFormattedDate(new Date(date));
                    property['Last Sale Amount'] = price;
                }
                if (validYearBuilt) {
                    property['yearBuilt'] = year_built;
                }
                let bedrooms = parseInt(await getTextByXpathFromPage(realtor_page, '//*[contains(@data-label, "-meta-beds")]/span[1]'));
                let bathrooms = parseInt(await getTextByXpathFromPage(realtor_page, '//*[contains(@data-label, "-meta-bath")]/span[1]'));
                let sqft = parseInt(await getTextByXpathFromPage(realtor_page, '//*[contains(@data-label, "-meta-sqft")]/span[1]'));
                let sqftlot = parseInt(await getTextByXpathFromPage(realtor_page, '//*[contains(@data-label, "-meta-sqftlot")]/span[1]'));
                let propertyType = await getTextByXpathFromPage(realtor_page, '//li[contains(text(), "Property type:")]');
                if (propertyType) propertyType = propertyType.slice(15).trim();
                else propertyType = await getTextByXpathFromPage(realtor_page, '//span[text()="Property Type"]/following-sibling::span[1]');
                    
                if (!isNaN(bedrooms)) property['bedrooms'] = bedrooms;
                if (!isNaN(bathrooms)) property['bathrooms'] = bathrooms;
                if (!isNaN(sqft)) property['sqft'] = sqft;
                if (!isNaN(sqftlot)) property['sqftlot'] = sqftlot;
                if (!property['Property Type'] && propertyType) property['Property Type'] = propertyType;

                await property.save();
                ownerProductProperty.consumed = true;
                await ownerProductProperty.save();
                result_flag = true;
                console.log('OPP UPDATED SUCCESSFULLY');
            } catch (error) {
                console.log('ERROR during updating data on db');
                console.log(error);
            }
        } else {
            console.log('---- NO SALING HISTORY or YEAR BUILT ----');
        }
    } catch (error) {
        console.log(error);
    }
    console.log('========================================//');

    return result_flag;
};

export default realtorConsumer;