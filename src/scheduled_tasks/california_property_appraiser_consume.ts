import { config as CONFIG } from '../config';
import { IConfigEnv } from '../iconfig';
const config: IConfigEnv = CONFIG[process.env.NODE_ENV || 'production'];
import puppeteer from 'puppeteer';
const nameParsingService = require('../categories/public_records/consumers/property_appraisers/consumer_dependencies/nameParsingService');
const addressService = require('../categories/public_records/consumers/property_appraisers/consumer_dependencies/addressService');
const parseAddress = require('parse-address');
import db, { PublicRecordOwner, PublicRecordOwnerProductProperty, PublicRecordProperty } from '../models/db';
import { IProperty } from '../models/property';
const addressit = require('addressit');
import { sleep } from '../core/sleepable';
import SnsService from '../services/sns_service';
import { logOpp, saveToOwnerProductPropertyByConsumer } from '../services/general_service';

const paConsumerCA = async(county: string, propertyType: string = '') => {
    const usernameParcelQuest = 'j8fbjkrt';
    const passwordParcelQuest = 'qvmxwx';
    const limit = 290; // 24 * 60 / 5 = 288 times in one day
    let countLimit = 0;
    let limitFromWebFlag = false;

    // for success rate notification
    let countSuccess: number = 0;
    let countSale: number = 0;

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

    const saveToNewSchema = async (data: any, source: string, opp: string) => {
        // If the data has full name and property address
        return await saveToOwnerProductPropertyByConsumer(opp, data, source);
    }

    async function launchBrowser(): Promise<puppeteer.Browser> {
        return await puppeteer.launch({
            headless: config.puppeteer_headless,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            ignoreDefaultArgs: ['--disable-extensions'],
            ignoreHTTPSErrors: true
        });
    }

    async function setParamsForPage(page: puppeteer.Page): Promise<void> {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.0 Safari/537.36');
        await page.setViewport({ height: 800, width: 1200 });
    }

    const loginParcelQuest = async (page: any) => {
        const inputUsernameSelector = '#txtName';
        const inputPasswordSelector = '#txtPwd';
        const loginButtonXpath = '//input[@value="log in"]';
        const inputAddressSelector = '#QuickSearch_StreetAddress';
        await page.goto('https://pqweb.parcelquest.com/', {waitUntil: 'networkidle0', timeout: 100000}); // Goto login page
        await page.evaluate(() => {
            // @ts-ignore
            document.getElementById('txtName')!.value = '';
            // @ts-ignore
            document.getElementById('txtPwd')!.value = '';
        })
        try{
            await page.type(inputUsernameSelector, usernameParcelQuest);
            await page.type(inputPasswordSelector, passwordParcelQuest);
            let loginButton = await page.$x(loginButtonXpath);
            await loginButton[0].click();
        } catch(e){
            console.log(await page.content());
            console.log(e);
            return false;
        }
        try {
            await page.waitForSelector(inputAddressSelector);
            return page;
        } catch (error) {
            console.log("Something wrong with the ParcelQuest account.");
            return false;
        }
    }

    // To check empty or space
    const isEmptyOrSpaces = (str: string) =>  {
        return str === null || str.match(/^\s*$/) !== null;
    }

    const sendMessage = async (message: string) => {
        const snsService = new SnsService();
        let topicName = SnsService.CIVIL_TOPIC_NAME;
        if (! await snsService.exists(topicName)) {
            await snsService.create(topicName);
        }

        if (! await snsService.subscribersReady(topicName, SnsService.CIVIL_UPDATE_SUBSCRIBERS)) {
            await snsService.subscribeList(topicName);
        }
        await snsService.publish(topicName, message);
    }

    const searchAddress = async (page: any, county: string, address: string, propertyDoc: IProperty) => {
        try {
            const full_address = `${propertyDoc['Property Address']}, ${propertyDoc['Property City']}, ${propertyDoc['Property State']} ${propertyDoc['Property Zip']}`
            const parsedv2 = addressit(full_address.trim());
            let street_address = (parsedv2.number ? parsedv2.number : '') + ' ' + (parsedv2.street ? parsedv2.street : '') + ' ' + (parsedv2.unit ? '#'+parsedv2.unit : '');
            street_address = street_address.replace(/\s+/, ' ').trim();
            let separateAddress = parseAddress.parseLocation(address);
            if(!isEmptyOrSpaces(street_address)){
                separateAddress = parseAddress.parseLocation(street_address);
                address = street_address;
            }
            if (separateAddress.sec_unit_type && separateAddress.sec_unit_num) {
                const regex = new RegExp(`${separateAddress.sec_unit_type}.*$`, 'i');
                address = address.replace(regex, '');
                address.trim()
            }
            await page.waitFor(5000);
            await page.waitForSelector('#QuickSearch_CountyId', {visible: true});
            let option = (await page.$x('//select[@id="QuickSearch_CountyId"]/option[contains(., "' + normalizeForSelect(county) + '")]'))[0];
            let optionVal: any = await (await option.getProperty('value')).jsonValue();
            await page.select("#QuickSearch_CountyId", optionVal);
            await page.waitForSelector('#QuickSearch_StreetAddress', {visible: true});
            await page.click('#QuickSearch_StreetAddress', { clickCount: 3 });
            console.log(addressService.normalizeAddress(address));
            await page.type('#QuickSearch_StreetAddress',addressService.normalizeAddress(address));
            await page.click('#Quick .btnQuickSearch');
            try{
                await page.waitForSelector('#resultsTable', {visible: true});
            } catch(e){
                limitFromWebFlag = true;
                return false;
            }
            const [totalFoundElement] = await page.$x('//*[@id="resultsTotal"]/span');
            const totalFound = await page.evaluate((j: any) => j.innerText, totalFoundElement);
            if (totalFound == 0) {
                return false;
            }
            await page.waitForXPath('//button[contains(text(),"View Results")]', {visible: true});
            return true;
        } catch (e) {
            console.log(e);
            console.log('Search error');
            return false;
        }
    }

    const searchName = async (page: any, county: string, name: string) => {
        try {
            await page.waitFor(5000);
            await page.waitForSelector('#QuickSearch_CountyId', {visible: true});
            let option = (await page.$x('//select[@id="QuickSearch_CountyId"]/option[contains(., "' + normalizeForSelect(county) + '")]'))[0];
            let optionVal: any = await (await option.getProperty('value')).jsonValue();
            await page.select("#QuickSearch_CountyId", optionVal);
            await page.waitForSelector('#QuickSearch_StreetAddress', {visible: true});
            await page.click('#QuickSearch_OwnerName', { clickCount: 3 });
            console.log(name);
            await page.type('#QuickSearch_OwnerName', name);
            await page.click('#Quick .btnQuickSearch');
            try{
                await page.waitForSelector('#resultsTable', {visible: true});
            } catch(e){
                limitFromWebFlag = true;
                return false;
            }
            const [totalFoundElement] = await page.$x('//*[@id="resultsTotal"]/span');
            const totalFound = await page.evaluate((j: any) => j.innerText, totalFoundElement);
            if (totalFound == 0) {
                return false;
            }
            await page.waitForXPath('//button[contains(text(),"View Results")]', {visible: true});
            return true;
        } catch (e) {
            console.log('Search error');
            return false;
        }
    }

    function normalizeForSelect(county: string){
        county = county.toLowerCase().replace('-',' ');
        let countyArr = county.split(/\s+/g);
        let result = '';
        for(let word of countyArr){
            word = word[0].toUpperCase() + word.substring(1);
            result += word + ' ';
        }
        return result.trim();
    }

    const normalizeStringForMongo = (sourceString: string) => {
        return sourceString.toLocaleLowerCase().replace('_', '-').replace(/[^A-Z\d\s\-]/ig, '').replace(/\s+/g, '-');
    }

    const getJsonDataAfterViewResult = async (page: any, propertyAddress: string) => {
        const separateAddress = parseAddress.parseLocation(propertyAddress);
        await page.setRequestInterception(true);
        const finalResponse = await page.waitForResponse((response: any) =>
            response.url().includes('api/breeze/Parcels') &&
            !response.url().includes('SrchId%20eq%20%270%27') &&
            response.url().includes('results') &&
            response.status() === 200);
        const data = await finalResponse.json();
        if (data.page.length == 0) {
            console.log("Json is no data.");
            return false;
        } else {
            if (separateAddress.sec_unit_type && separateAddress.sec_unit_num) {
                const foundData = data.page.find((item: any) => item.s_unit == separateAddress.sec_unit_num);
                return foundData;
            }
            return data.page[0];
        }
    }

    const getJsonDataAfterViewName = async (page: any) => {
        await page.setRequestInterception(true);
        const finalResponse = await page.waitForResponse((response: any) =>
            response.url().includes('api/breeze/Parcels') &&
            !response.url().includes('SrchId%20eq%20%270%27') &&
            response.url().includes('results') &&
            response.status() === 200);
        const data = await finalResponse.json();
        if (data.page.length == 0) {
            console.log("Json is no data.");
            return false;
        } else {
            return data.page[0];
        }
    }

    const parseJsonData = async (data: any, county: string) => {
        let processedNamesArray = nameParsingService.parseOwnersFullNameWithoutComma(data.owner1.replace('ET AL', '').trim());
        data.owner2 && processedNamesArray.push(...nameParsingService.parseOwnersFullNameWithoutComma(data.owner2));
        const mailing_streetAndNumber = data.m_addr_d;
        const mailing_city = data.m_city;
        const mailing_state = data.m_st;
        const mailing_zip = data.m_zip;
        const property_streetAndNumber = data.s_streetaddr;
        const property_zip = data.zipcode;
        const property_city = data.s_city;
        const isOwnerOccupied = addressService.comparisonAddresses(mailing_streetAndNumber, property_streetAndNumber);
        const propertyType = data.usedesc;
        const grossAssessedValue = data.assdvalue;
        const effYearBuilt = data.yreff;
        const lastSaleDate = data.sale1rd;
        const lastSaleAmount = data.sale1sp;
        return {
            'owner_names': processedNamesArray,
            'Unit#': '',
            'Property Address':  property_streetAndNumber,
            'Property Unit #': '',
            'Property City': property_city,
            'Property Zip': property_zip,
            'Property State': 'CA',
            'County': county,
            'Owner Occupied': isOwnerOccupied,
            'Mailing Care of Name': '',
            'Mailing Address': mailing_streetAndNumber,
            'Mailing Unit #': '',
            'Mailing City': mailing_city,
            'Mailing State': mailing_state,
            'Mailing Zip': mailing_zip,
            'Property Type': propertyType,
            'Total Assessed Value': grossAssessedValue,
            'Last Sale Recoding Date': lastSaleDate,
            'Last Sale Amount': lastSaleAmount,
            'Est. Value': '',
            'yearBuilt': effYearBuilt,
            'Est. Equity': '',
        };
    }

    const startParsing = async (browser: any, opp: any, source: string) => {
        let page = await browser.newPage();
        await setParamsForPage(page);
        await page.setCacheEnabled(false);
        let login = await loginParcelQuest(page);
        if(!login){
            await page.close();
            return false;
        }
        if(source == 'property'){
            console.log("==== SEARCHED BY ADDRESS ====");
            console.log("Searching for Property Address:",opp.propertyId['Property Address']);
        } else {
            console.log("==== SEARCHED BY NAME ====");
            console.log("Searching for Name:", normalizeNameForSearch(opp.ownerId['Full Name']));
        }
        try {
            let dataFromPropertyAppraisers: any = {};
            let foundSearch: any;
            if(source == 'property'){
                foundSearch = await searchAddress(page, opp.propertyId['County'], opp.propertyId["Property Address"], opp.propertyId);
            } else {
                foundSearch = await searchName(page, opp.ownerId['County'], normalizeNameForSearch(opp.ownerId['Full Name']));
            }
            if(!foundSearch){
                console.log("Not found!");
                await page.close();
                return false;
            }
            const [clickViewResult] = await page.$x('//button[contains(text(),"View Results")]');
            await clickViewResult.click();
            let data: any;
            if(source == 'property'){
                data = await getJsonDataAfterViewResult(page, opp.propertyId["Property Address"]);
            } else {
                data = await getJsonDataAfterViewName(page);
            }
            if (!data) throw new Error();
            let result: any = {};
            if(source == 'property'){
                result = await parseJsonData(data, opp.propertyId['County']);
            } else {
                result = await parseJsonData(data, opp.ownerId['County']);
            }
            if(result['owner_names']){
                const owner_name = result['owner_names'][0];
                dataFromPropertyAppraisers['Full Name'] = owner_name['fullName'];
                dataFromPropertyAppraisers['First Name'] = owner_name['firstName'];
                dataFromPropertyAppraisers['Last Name'] = owner_name['lastName'];
                dataFromPropertyAppraisers['Middle Name'] = owner_name['middleName'];
                dataFromPropertyAppraisers['Name Suffix'] = owner_name['suffix'];
                dataFromPropertyAppraisers['Owner Occupied'] = result['Owner Occupied'];
                dataFromPropertyAppraisers['Mailing Care of Name'] = '';
                dataFromPropertyAppraisers['Mailing Address'] = result['Mailing Address'];
                dataFromPropertyAppraisers['Mailing City'] = result['Mailing City'];
                dataFromPropertyAppraisers['Mailing State'] = result['Mailing State'];
                dataFromPropertyAppraisers['Mailing Zip'] = result['Mailing Zip'];
                dataFromPropertyAppraisers['Mailing Unit #'] = '';
                dataFromPropertyAppraisers['Property Type'] = result['Property Type'];
                dataFromPropertyAppraisers['Property Address'] = result['Property Address'];
                dataFromPropertyAppraisers['Property Unit #'] = result['Property Unit #'];
                dataFromPropertyAppraisers['Property City'] = result['Property City'];
                dataFromPropertyAppraisers['Property State'] = result['Property State'];
                dataFromPropertyAppraisers['Property Zip'] = result['Property Zip'];
                dataFromPropertyAppraisers['County'] = result['County'];
                dataFromPropertyAppraisers['Est Equity'] = '';
                dataFromPropertyAppraisers['Total Assessed Value'] = result['Total Assessed Value'];
                dataFromPropertyAppraisers['Last Sale Recording Date'] = result['Last Sale Recoding Date'];
                dataFromPropertyAppraisers['Last Sale Amount'] = result['Last Sale Amount'];
                dataFromPropertyAppraisers['Est. Remaining balance of Open Loans'] = '';
                dataFromPropertyAppraisers['Est Value'] = result['Est. Value'];
                dataFromPropertyAppraisers['yearBuilt'] = result['yearBuilt'];
                console.log(dataFromPropertyAppraisers)
                try{
                    await saveToNewSchema(dataFromPropertyAppraisers, source, opp);
                } catch {
                    // pass it
                }
            }
            await page.close();
            return true;
        } catch (e) {
            console.log(e);
            await page.close();
            return false;
        }
        
    };

    function normalizeNameForSearch(name: string){
        return name.replace(",","").toUpperCase().trim();
    }

    function getRandomInt(min: number, max: number) {
        return Math.floor(Math.random() * (max - min) ) + min;
    }

    try{
        let browser = await launchBrowser();
        let date = new Date();
        date.setDate(date.getDate() - 30);
        const regex = propertyType ? `/ca/${county}/${propertyType}` : `/ca/${county}/((?!other).)*$`;
        console.log(regex);
        const productIds = (await db.models.Product.find({ name: {$regex: new RegExp(regex, 'gm')} })).map( (doc: any) =>  doc._id );
        let condition: any = {
            processed: { $ne: true },
            consumed: { $ne: true },
            productId: {$in: productIds}, 
            createdAt: {$gte: date} 
        };
        console.log(condition);
        //@ts-ignore
        let cursor = db.models.OwnerProductProperty.find(condition).populate('ownerId propertyId').cursor({batchSize: 5}).addCursorFlag('noCursorTimeout',true);
        for (let opp = await cursor.next(); opp != null; opp = await cursor.next()) {
            if(countLimit > limit){
                console.log("Limit is reached. Breaking the loop...");
                break;
            }
            if(limitFromWebFlag){
                console.log("Possible limit from the website, breaking the loop. Please login to the account and try to click search!");
                break;
            }
            if((opp.propertyId && !opp.ownerId) || (opp.propertyId && opp.ownerId)) {
                if(opp.propertyId['Property State'] != 'CA'){
                    continue;
                }
                console.log("Currently processing:");
                logOpp(opp);
                let result = await startParsing(browser, opp, 'property');

            } else if(!opp.propertyId && opp.ownerId) {
                if(opp.ownerId['Property State'] != 'CA'){
                    continue;
                }
                console.log("Currently processing:");
                logOpp(opp);
                let result = await startParsing(browser, opp, 'name');
            } else {
                continue;
            }

            countLimit++;
            let randInt = getRandomInt(180000,300000);
            console.log("Sleeping with", randInt, "ms...");
            await sleep(randInt);
        };

        await browser.close();
        let percentageSuccessLookup = ((countSuccess / countLimit) * 100).toFixed(2);
        let percentageSuccessGetSale = ((countSale / countLimit) * 100).toFixed(2);
        let message = `PA ${county}, CA | Total processed: ${countLimit}, success: ${countSuccess}, with sale date: ${countSale} | Success rate: ${percentageSuccessLookup}%, sale date rate: ${percentageSuccessGetSale}%`;
        await sendMessage(message);
        process.exit();
    } catch(e){
        console.log(e);
        process.exit();
    }
};

export default paConsumerCA;