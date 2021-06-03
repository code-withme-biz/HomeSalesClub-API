// This is a helper for california county, which needed to login
const nameParsingService = require('./nameParsingService');
const addressService = require('./addressService');
const parseAddress = require('parse-address');
const usernameParcelQuest = 'j8fbjkrt';
const passwordParcelQuest = 'qvmxwx';

// This function is for login to https://pqweb.parcelquest.com/ which needed to get CA counties.
// Accept the puppeteer page as an argument.
// Return the page if success, return false if not.
const loginParcelQuest = async (page: any) => {
    const inputUsernameSelector = '#txtName';
    const inputPasswordSelector = '#txtPwd';
    const loginButtonXpath = '//input[@value="Log In"]';
    const inputAddressSelector = '#QuickSearch_StreetAddress';
    await page.goto('https://pqweb.parcelquest.com/', {waitUntil: 'networkidle0'}); // Goto login page
    await page.evaluate(() => {
        // @ts-ignore
        document.getElementById('txtName')!.value = '';
        // @ts-ignore
        document.getElementById('txtPwd')!.value = '';
    })
    await page.type(inputUsernameSelector, usernameParcelQuest);
    await page.type(inputPasswordSelector, passwordParcelQuest);
    let loginButton = await page.$x(loginButtonXpath);
    await loginButton[0].click();
    try {
        await page.waitForSelector(inputAddressSelector);
        return page;
    } catch (error) {
        console.log("Something wrong with the ParcelQuest account.");
        return false;
    }
}

// This function is to get the json data, right after click "View Result" button
// Accept the puppeteer page as an argument.
// Return the data if success, return false if not.
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

// This function is to parse the json data
// Accept the data and property address as an argument
// Return the object
const parseJsonData = async (data: any, propertyAddress: string, county: string) => {
    let processedNamesArray = nameParsingService.parseOwnersFullNameWithoutComma(data.owner1.replace('ET AL', '').trim());
    data.owner2 && processedNamesArray.push(...nameParsingService.parseOwnersFullNameWithoutComma(data.owner2));
    let streetAndNumber = data.m_addr_d;
    const city = data.m_city;
    const state = data.m_st;
    const zip = data.m_zip;
    const isOwnerOccupied = addressService.comparisonAddresses(streetAndNumber, propertyAddress);
    const propertyType = data.usedesc;
    const grossAssessedValue = data.assdvalue;
    const effYearBuilt = data.yreff;
    const lastSaleDate = data.sale1rd;
    const lastSaleAmount = data.sale1sp;
    return {
        'owner_names': processedNamesArray,
        'Unit#': '',
        'Property City': '',
        'Property State': 'California',
        'Property Zip': '',
        'County': county,
        'Owner Occupied': isOwnerOccupied,
        'Mailing Care of Name': '',
        'Mailing Address': `${streetAndNumber} ${city}, ${state} ${zip}`,
        'Mailing Unit #': '',
        'Mailing City': city,
        'Mailing State': state,
        'Mailing Zip': zip,
        'Property Type': propertyType,
        'Total Assessed Value': grossAssessedValue,
        'Last Sale Recoding Date': lastSaleDate,
        'Last Sale Amount': lastSaleAmount,
        'Est. Value': '',
        'yearBuilt': effYearBuilt,
        'Est. Equity': '',
    };
}

//This function searches for an address.
//if address is found return true
//else return false
const searchAddress = async (page: any, county: string, address: string) => {
    try {
        const separateAddress = parseAddress.parseLocation(address);
        if (separateAddress.sec_unit_type && separateAddress.sec_unit_num) {
            const regex = new RegExp(`${separateAddress.sec_unit_type}.*$`, 'i');
            address = address.replace(regex, '');
            address.trim()
        }
        await page.waitFor(5000);
        await page.waitForSelector('#QuickSearch_CountyId', {visible: true});
        await page.select("#QuickSearch_CountyId", county);
        await page.waitForSelector('#QuickSearch_StreetAddress', {visible: true});
        await page.focus('#QuickSearch_StreetAddress');
        await page.keyboard.type(addressService.normalizeAddress(address));
        await page.click('#Quick .btnQuickSearch');
        await page.waitForSelector('#resultsTable', {visible: true});
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

const scrapDataForAddress = async (browser: any, paramsPage: any, selectCounty: string, county: string, document: any, cloneMongoDocument: any) => {
    let page = await browser.newPage();
    await page._client.send('Network.clearBrowserCookies');
    await paramsPage(page);
    await page.setCacheEnabled(false);
    try {
        page = await loginParcelQuest(page);
        if (!page) throw new Error();
        const foundAddress = await searchAddress(page, selectCounty, document["Property Address"]);
        if (!foundAddress) throw new Error();
        const [clickViewResult] = await page.$x('//button[contains(text(),"View Results")]');
        await clickViewResult.click();
        const data = await getJsonDataAfterViewResult(page, document["Property Address"]);
        if (!data) throw new Error();
        const result = await parseJsonData(data, document["Property Address"], county);
        for (let index = 0; index < result['owner_names'].length; index++) {
            const owner_name = result['owner_names'][index];
            if (index == 0) {
                document['Full Name'] = owner_name['fullName'];
                document['First Name'] = owner_name['firstName'];
                document['Last Name'] = owner_name['lastName'];
                document['Middle Name'] = owner_name['middleName'];
                document['Name Suffix'] = owner_name['suffix'];
                document['Owner Occupied'] = result['Owner Occupied'];
                document['Mailing Care of Name'] = '';
                document['Mailing Address'] = result['Mailing Address'];
                document['Mailing City'] = result['Mailing City'];
                document['Mailing State'] = result['Mailing State'];
                document['Mailing Zip'] = result['Mailing Zip'];
                document['Mailing Unit #'] = '';
                document['Property Type'] = result['Property Type'];
                document['Total Assessed Value'] = result['Total Assessed Value'];
                document['Last Sale Recording Date'] = result['Last Sale Recoding Date'];
                document['Last Sale Amount'] = result['Last Sale Amount'];
                document['Est. Remaining balance of Open Loans'] = '';
                document['Est Value'] = result['Est. Value'];
                document['yearBuilt'] = result['yearBuilt'];
                document['Est Equity'] = '';
                console.log(document)
                await document.save();
            } else {
                let newDocument = await cloneMongoDocument(document)
                newDocument['Full Name'] = owner_name['fullName'];
                newDocument['First Name'] = owner_name['firstName'];
                newDocument['Last Name'] = owner_name['lastName'];
                newDocument['Middle Name'] = owner_name['middleName'];
                newDocument['Name Suffix'] = owner_name['suffix'];
                console.log(newDocument)
                await newDocument.save();
            }
        }
        await page!.close();
        return true
    } catch (e) {
        await page!.close();
        return false
    }

}
exports.scrapDataForAddress = scrapDataForAddress;
exports.searchAddress = searchAddress;
exports.loginParcelQuest = loginParcelQuest;
exports.getJsonDataAfterViewResult = getJsonDataAfterViewResult;
exports.parseJsonData = parseJsonData;
