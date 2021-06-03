import puppeteer from 'puppeteer';
import AbstractLandgrid from './landgrid_abstract';
import LandgridAccountChecker from './account_checker';
import containerCalculator from './container_calculator';
import axios, { AxiosResponse } from 'axios';
import Papa from 'papaparse';

import { IPublicRecordAttributes } from '../../../../models/public_record_attributes';
import { PublicRecordLineItem } from '../../../../models/db';

import { config as CONFIG } from '../../../../config';
import { IConfigEnv } from '../../../../iconfig';
const config: IConfigEnv = CONFIG[process.env.NODE_ENV || 'production'];

export default class LandgridCsvDownloader extends AbstractLandgrid {
    constructor() {
        super();
    }

    async getCSV(countyMapPage: puppeteer.Page, browser: puppeteer.Browser, accUser: string, accPass: string): Promise<[AxiosResponse | null, number]> {

        let pageUrl = countyMapPage.url();
        let retryNo = 0;
        while (retryNo < 4) {
            try {

                // log in logic
                let signInHandle = await countyMapPage.$x('//a[contains(@href, "signin")]');
                if (signInHandle.length) {
                    //not signed-in, sign in now:
                    console.log('Not logged in, logging in now.');
                    await signInHandle[0].click();
                    await countyMapPage.waitFor(1500);
                    let userLoginHandle = await countyMapPage.$x('//form//*[@id="user_email"]');
                    let passLoginHandle = await countyMapPage.$x('//form//*[@id="user_password"]');
                    let loginButtonHandle = await countyMapPage.$x('//form//*[@id="user_password"]/../following-sibling::*//*[@type="submit"]');
                    await userLoginHandle[0].type(accUser, { delay: 273 });
                    await passLoginHandle[0].type(accPass, { delay: 273 });
                    await countyMapPage.waitFor(481);
                    await Promise.all([
                        countyMapPage.waitForNavigation({ waitUntil: 'load', timeout: 75000 }),
                        loginButtonHandle[0].click()
                    ]);
                } else {
                    //check if profile handle exists
                    let profileHandle = await countyMapPage.$x('//*[@class="dropdown-toggle"][contains(@data-tip, "my-profile")]');
                    if (!profileHandle.length) {
                        console.warn(`Problem with login!   '//*[@class="dropdown-toggle"][contains(@data-tip, "my-profile")]'   not found in page!`);
                    }
                }

                break;
            } catch (err) {
                retryNo++;
                await countyMapPage.waitFor(1429 * retryNo);
                await countyMapPage.close();
                countyMapPage = (await browser?.newPage()) as puppeteer.Page;
                await this.setParamsForPage(countyMapPage);
                await countyMapPage.goto(pageUrl, { waitUntil: 'load', timeout: 75000 });
            }
        }
        if (retryNo == 4) {
            console.warn(`${pageUrl} failed to load after 4 retries. Skipping this county.`);
            return [null, 0];
        }


        // Filter for data
        await (await countyMapPage.$x('//a[@data-tip="filter"]'))[0].click();

        // USPS Vacancy Indicator
        await countyMapPage.waitForXPath('//*[@data-field="usps_vacancy"]//input[contains(@class, "search__field")]');
        await Promise.all([
            countyMapPage.waitForResponse(res => res.url().includes('autocomplete.json'), { timeout: 75000 }),
            (await countyMapPage.$x('//*[@data-field="usps_vacancy"]//input[contains(@class, "search__field")]'))[0].click()
        ]);
        await countyMapPage.waitFor(280);
        let resultOptionYHandle = await countyMapPage.$x('//*[contains(@class, "results__options")]//li[contains(.//text(), "Y")]');
        let resultOptionNHandle = await countyMapPage.$x('//*[contains(@class, "results__options")]//li[contains(.//text(), "N")]');
        if (resultOptionYHandle.length) {
            await resultOptionYHandle[0].click();
        } else if (resultOptionNHandle.length) {
            console.warn('No option to filter for vacancy data. Site\'s dataset probably does not contain this info for this county.')
            return [null, 0];
        }
        await countyMapPage.waitFor(320);

        // Residential Delivery Indicator
        await Promise.all([
            countyMapPage.waitForResponse(res => res.url().includes('autocomplete.json'), { timeout: 75000 }),
            (await countyMapPage.$x('//*[@data-field="rdi"]//input[contains(@class, "search__field")]'))[0].click()
        ]);
        await countyMapPage.waitFor(280);

        resultOptionYHandle = await countyMapPage.$x('//*[contains(@class, "results__options")]//li[contains(.//text(), "Y")]');
        resultOptionNHandle = await countyMapPage.$x('//*[contains(@class, "results__options")]//li[contains(.//text(), "N")]');

        if (resultOptionYHandle.length) {
            await resultOptionYHandle[0].click();
        } else if (resultOptionNHandle.length) {
            console.warn('No option to filter for RESIDENTIAL vacancy data. Site\'s dataset probably does not contain this info for this county.')
            return [null, 0];
        }
        await countyMapPage.waitFor(320);

        // Click search, wait for response
        await Promise.all([
            countyMapPage.waitForXPath('//*[contains(@class, "description")]//following-sibling::*[contains(@class, "preview-message")][contains(.//text(), "Found")]', { timeout: 75000 }),
            (await countyMapPage.$x('//a[contains(@class, "search")]'))[0].click()
        ]);
        await countyMapPage.waitForXPath('//*[contains(@class, "description")]/following-sibling::*[contains(@class, "preview-message")][contains(.//text(), "Found")]', { timeout: 75000 });

        // Grab residential vacancy data to double-check list number
        let vrNo = 0;
        let vacantResidentialHandle = await countyMapPage.$x('//*[contains(@class, "description")]/following-sibling::*[contains(@class, "preview-message")][contains(.//text(), "Found")]');
        if (vacantResidentialHandle.length) {
            let vrNoString = await vacantResidentialHandle[0].evaluate((el: any) => el.innerText);
            let vrNoStringMatch = vrNoString.match(/Found\s*(.*?)\s*parcels/i);
            if (vrNoStringMatch) {
                vrNo = Number(vrNoStringMatch[1].replace(',', ''));
            }
        } else {
            console.warn('No vacant residential # found!');
        }

        await countyMapPage.waitFor(1300);

        // Go to list
        let listHandle = await countyMapPage.$x('//a[@href="#list"]');
        await Promise.all([
            countyMapPage.waitForResponse(res => res.url().includes('blexts.json'), { timeout: 75000 }),
            listHandle[0].click()
        ]);

        await countyMapPage.waitForXPath('//*[@class="list-controls"]//span[./a[@data-page]]', { timeout: 75000 });

        await countyMapPage.waitFor(3000);

        let listPropsNo = 0;
        let listPropsNoHandle = await countyMapPage.$x('//*[@class="list-controls"]//span[./a[@data-page]]');
        let listPropsNoString = await listPropsNoHandle[0].evaluate(el => el.textContent) || '';
        let listPropsNoMatch = listPropsNoString.match(/\s*([\d,\.]*)\s*properties/i);
        if (listPropsNoMatch) {
            listPropsNo = Number(listPropsNoMatch[1].replace(/(?:,|\.)/, ''));
        }

        if (listPropsNo != vrNo) {
            console.warn(`Warning: Different numbers for filter results (${vrNo}) versus list results (${listPropsNo})!`);
        }

        let dlCsvHandle = await countyMapPage.$x('//*[@class="list-controls"]//*[@class="right"]//a[contains(.//text(), "Download CSV")]');
        await dlCsvHandle[0].evaluate(el => el.removeAttribute('target'));

        let reqHeaders: any = {};
        let reqUrl = '';

        await countyMapPage.setRequestInterception(true);
        countyMapPage.on('request', interceptedReq => {
            if (interceptedReq.url().includes('blexts.csv')) {
                reqHeaders = interceptedReq.headers();
                reqUrl = interceptedReq.url();
                interceptedReq.abort();
            } else {
                interceptedReq.continue();
            }
        });

        let pageCookies = await countyMapPage.cookies();

        await dlCsvHandle[0].click();
        await countyMapPage.waitFor(1500);

        reqHeaders['cookie'] = '';
        for (let cookie of pageCookies) {
            reqHeaders['cookie'] += `${cookie.name}=${cookie.value}; `;
        }

        countyMapPage.removeAllListeners();

        let csvResp = await axios.get(reqUrl, { headers: reqHeaders, timeout: 120000 });
        return [csvResp, listPropsNo];
    }

    async parsePropObjAndSaveToMongo(propObj: any, state: string, county: string) {
        let propAddress = '';
        if (propObj.hasOwnProperty("address") && propObj.address.trim()) {
            propAddress = propObj.address.trim();
            if (propObj.hasOwnProperty("address2") && propObj["address2"].trim()) {
                propAddress += ' ' +propObj["address2"].trim();
            }
        } else if (propObj.hasOwnProperty("address2") && propObj["address2"].trim()) {
            propAddress = propObj["address2"].trim();
        }
        if (!propAddress.trim()) {
            return false;
        }

        let addOwners = [];
        if (propObj.hasOwnProperty(["owner2"])) {
            addOwners.push(propObj["owner2"].trim());
        }
        if (propObj.hasOwnProperty(["owner3"])) {
            addOwners.push(propObj["owner3"].trim());
        }
        if (propObj.hasOwnProperty(["owner4"])) {
            addOwners.push(propObj["owner4"].trim());
        }

        // remove documents with same address, simplest way to handle it
        await this.removeOldLineItemsFromMongo(propAddress, state, county);

        const prodid = (await this.getProductIdFromMongo(state, county))._id
        const lineItem: IPublicRecordAttributes = new PublicRecordLineItem();
        lineItem.productId = prodid;
        lineItem["Property Address"] = propAddress.trim();
        if (propObj.hasOwnProperty("parcelnumb") && propObj["parcelnumb"].trim()) {
            lineItem["parcel"] = propObj["parcelnumb"].trim();
        }
        if (propObj.hasOwnProperty("yearbuilt") && propObj["yearbuilt"].toString().trim()) {
            lineItem["yearBuilt"] = propObj["yearbuilt"].toString().trim();
        }
        if (propObj.hasOwnProperty("usps_vacancy") && propObj["usps_vacancy"].trim()) {
            lineItem["vacancy"] = propObj["usps_vacancy"].trim();
        }
        if (propObj.hasOwnProperty("usps_vacancy_date") && propObj["usps_vacancy_date"].toString().trim()) {
            lineItem["vacancyDate"] = propObj["usps_vacancy_date"].toString().trim();
        }
        if (propObj.hasOwnProperty("sunit") && propObj["sunit"].trim()) {
            lineItem["Property Unit #"] = propObj["sunit"].trim();
        }
        if (propObj.hasOwnProperty("scity") && propObj["scity"].trim()) {
            lineItem["Property City"] = propObj["scity"].trim();
        }
        if (propObj.hasOwnProperty("state2") && propObj["state2"].trim()) {
            lineItem["Property State"] = propObj["state2"].trim();
        } else {
            lineItem["Property State"] = state;
        }
        if (propObj.hasOwnProperty("szip") && propObj["szip"].trim()) {
            lineItem["Property Zip"] = propObj["szip"].trim();
        }
        if (propObj.hasOwnProperty("county") && propObj["county"].trim()) {
            lineItem["County"] = propObj["county"].trim();
        } else {
            lineItem["County"] = county;
        }
        if (propObj.hasOwnProperty("ownfrst") && propObj["ownfrst"].trim()) {
            lineItem["First Name"] = propObj["ownfrst"].trim();
        }
        if (propObj.hasOwnProperty("ownlast") && propObj["ownlast"].trim()) {
            lineItem["Last Name"] = propObj["ownlast"].trim();
        }
        if (propObj.hasOwnProperty("owner") && propObj["owner"].trim()) {
            lineItem["Full Name"] = propObj["owner"].trim();
        }
        if (propObj.hasOwnProperty("careof") && propObj["careof"].trim()) {
            lineItem["Mailing Care of Name"] = propObj["careof"].trim();
        }
        if (propObj.hasOwnProperty("mailadd") && propObj["mailadd"].trim()) {
            lineItem["Mailing Address"] = propObj["mailadd"].trim();
            if (propObj.hasOwnProperty("mail_address2") && propObj["mail_address2"].trim()) {
                lineItem["Mailing Address"] += ' ' +propObj["mail_address2"].trim();
            }
        } else {
            if (propObj.hasOwnProperty("mail_address2") && propObj["mail_address2"].trim()) {
                lineItem["Mailing Address"] = propObj["mail_address2"].trim();
            }
        }
        if (propObj.hasOwnProperty("mail_unit") && propObj["mail_unit"].trim()) {
            lineItem["Mailing Unit #"] = propObj["mail_unit"].trim();
        }
        if (propObj.hasOwnProperty("mail_city") && propObj["mail_city"].trim()) {
            lineItem["Mailing City"] = propObj["mail_city"].trim();
        }
        if (propObj.hasOwnProperty("mail_state2") && propObj["mail_state2"].trim()) {
            lineItem["Mailing State"] = propObj["mail_state2"].trim();
        }
        if (propObj.hasOwnProperty("mail_zip") && propObj["mail_zip"].trim()) {
            lineItem["Mailing Zip"] = propObj["mail_zip"].trim();
        }
        if (propObj.hasOwnProperty("parval") && propObj["parval"].toString().trim()) {
            lineItem["Est Value"] = propObj["parval"].toString().trim();
        }
        if (propObj.hasOwnProperty("saledate") && propObj["saledate"].toString().trim()) {
            lineItem["Last Sale Recording Date"] = propObj["saledate"].toString().trim();
        }
        if (propObj.hasOwnProperty("saleprice") && propObj["saleprice"].toString().trim()) {
            lineItem["Last Sale Amount"] = propObj["saleprice"].toString().trim();
        }
        if (propObj.hasOwnProperty("descbldg") && propObj["descbldg"].toString().trim()) {
            lineItem["descbldg"] = propObj["descbldg"].toString().trim();
        }

        lineItem["practiceType"] = "vacancy";
        lineItem["vacancyProcessed"] = true;

        await lineItem.save();

        for (let additionalOwnerName of addOwners) {
            if (additionalOwnerName.trim()) {
                let newDoc = await this.cloneMongoDocument(lineItem);
                newDoc["Full Name"] = additionalOwnerName;
                await newDoc.save();
            }
        }

        return true;
    }


    async init() {
        this.browser = await this.launchBrowser();
        this.browserPages.landgridPage = await this.browser.newPage();
        await this.setParamsForPage(this.browserPages.landgridPage);
        let pageUrl = 'https://landgrid.com/us';
        try {
            await this.browserPages.landgridPage.goto(pageUrl, { waitUntil: 'load' });
            return true;
        } catch (err) {
            console.warn('Website could not be loaded at this time.');
            return false;
        }
    }

    async read(): Promise<boolean> {
        try {
            await this.browserPages.landgridPage?.waitForXPath('//*[@data-tip="filter"]');
            return true;
        } catch (err) {
            console.warn('!! IDENTIFIER NOT FOUND!! EXPECTED "Filter button".');
            return false;
        }
    }

    async parseAndSave(): Promise<boolean> {
        let containers = await containerCalculator();

        let accountDocs = await this.getLandgridAccountPoolFromMongo({ pro: true });

        if (!accountDocs || !accountDocs.length || accountDocs.length < containers.length) {
            console.log('Rechecking PRO accounts in db.');
            await new LandgridAccountChecker().startParsing();
            accountDocs = await this.getLandgridAccountPoolFromMongo({ pro: true });
            if (!accountDocs || !accountDocs.length || accountDocs.length < containers.length) {
                console.warn(`Not enough PRO accounts found in db. The script requires ${containers.length} PRO accounts to download all CSV data!`);
                return false;
            }
        }

        await this.browser?.close();

        let failedToLoad = 0;
        let unparsedCounties = [];
        for (let i = 0; i < containers.length; i++) {
            this.browser = await this.launchBrowser();

            for (let countyObj of containers[i].countyObjs) {
                let countyMapPage = (await this.browser?.newPage()) as puppeteer.Page;

                console.log(`Working on ${countyObj["normalized_state_name"]}/${countyObj["normalized_county_name"]}. Expecting ${countyObj["vacancy_records"]} records.`);
                console.log(`Using account: ${accountDocs[i].user}`);

                let retryNo = 0;
                while (retryNo < 4) {
                    try {
                        await this.setParamsForPage(countyMapPage);
                        await countyMapPage.goto(countyObj['map_url'], { waitUntil: 'load', timeout: 75000 });
                        break;
                    } catch (err) {
                        retryNo++;
                        await countyMapPage.waitFor(1429 * retryNo);
                        await countyMapPage.close();
                        countyMapPage = (await this.browser?.newPage()) as puppeteer.Page;
                    }
                }
                if (retryNo == 4) {
                    console.warn(`${countyObj['map_url']} failed to load after 4 retries. Skipping this county.`);
                    failedToLoad++;
                    await countyMapPage.waitFor(3642);
                    await countyMapPage.close();
                    unparsedCounties.push(countyObj);
                    continue;
                }

                try {
                    let [csvResp, listPropsNo] = await this.getCSV(countyMapPage, this.browser, accountDocs[i].user, accountDocs[i].pass);

                    if (!csvResp) {
                        unparsedCounties.push(countyObj);
                        await countyMapPage.waitFor(3642);
                        await countyMapPage.close();
                        continue;
                    }

                    if (csvResp.data.length < 300 && csvResp.data.includes('over the monthly limit')) {
                        accountDocs[i]["remaining_records"] = listPropsNo - 1;
                        await accountDocs[i].save();
                        console.warn('County vacancy data exceeds account\'s monthly limit. Will attempt again at the end.');
                        unparsedCounties.push(countyObj);
                    } else {
                        let parsedCSV = Papa.parse(csvResp.data, { header: true, skipEmptyLines: true });
                        console.log(`${parsedCSV.data.length} rows found. ${parsedCSV.errors.length} errors.`)

                        // add to line_items here
                        for (let propObj of parsedCSV.data) {
                            await this.parsePropObjAndSaveToMongo(propObj, countyObj["normalized_state_name"], countyObj["normalized_county_name"]);
                        }

                        countyObj["csv_download_processed"] = true;
                        await countyObj.save();
                        if (accountDocs[i].toObject().hasOwnProperty("remaining_records")) {
                            accountDocs[i]["remaining_records"] = accountDocs[i]["remaining_records"] - listPropsNo;
                        } else {
                            accountDocs[i]["remaining_records"] = 50000 - listPropsNo;
                        }
                        await accountDocs[i].save();
                    }

                    await countyMapPage.waitFor(3642);
                    await countyMapPage.close();
                } catch (err) {
                    console.warn(`Failed to download and parse CSV for ${countyObj['map_url']}\n` + err);
                    await countyMapPage.close();
                }
            }
            await this.browser.close();
        }

        if (failedToLoad) {
            console.warn(`${failedToLoad} counties failed to load.`);
        }
        if (unparsedCounties.length) {
            console.log(`Attempting retries on ${unparsedCounties.length} counties.`);
        }

        let problemCounties = [];
        for (let unparsedCounty of unparsedCounties) {
            let done = false;
            console.log(`Retrying ${unparsedCounty["normalized_state_name"]}/${unparsedCounty["normalized_county_name"]}. Expecting ${unparsedCounty["vacancy_records"]} records.`);

            for (let accountDoc of accountDocs) {
                if (!accountDoc.toObject().hasOwnProperty("remaining_records") || unparsedCounty["vacancy_records"] < accountDoc["remaining_records"]) {
                    this.browser = await this.launchBrowser();

                    let countyMapPage = (await this.browser?.newPage()) as puppeteer.Page;

                    console.log(`Trying with account: ${accountDoc.user}`);

                    let retryNo = 0;
                    while (retryNo < 4) {
                        try {
                            await this.setParamsForPage(countyMapPage);
                            await countyMapPage.goto(unparsedCounty['map_url'], { waitUntil: 'load', timeout: 75000 });
                            break;
                        } catch (err) {
                            retryNo++;
                            await countyMapPage.waitFor(1429 * retryNo);
                            await countyMapPage.close();
                            countyMapPage = (await this.browser?.newPage()) as puppeteer.Page;
                        }
                    }
                    if (retryNo == 4) {
                        console.warn(`${unparsedCounty['map_url']} failed to load after 4 retries. Retrying with another account.`);
                        await countyMapPage.close();
                        await this.browser.close();
                        continue;
                    }

                    try {
                        let [csvResp, listPropsNo] = await this.getCSV(countyMapPage, this.browser, accountDoc.user, accountDoc.pass);

                        if (!csvResp) {
                            await this.browser.close();
                            continue;
                        }

                        if (csvResp.data.length < 300 && csvResp.data.includes('over the monthly limit')) {
                            accountDoc["remaining_records"] = listPropsNo - 1;
                            await accountDoc.save();
                            await this.browser.close();
                            continue;
                        } else {
                            let parsedCSV = Papa.parse(csvResp.data, { header: true, skipEmptyLines: true });
                            console.log(`${parsedCSV.data.length} rows found. ${parsedCSV.errors.length} errors.`)

                            // add to line_items here
                            for (let propObj of parsedCSV.data) {
                                await this.parsePropObjAndSaveToMongo(propObj, unparsedCounty["normalized_state_name"], unparsedCounty["normalized_county_name"]);
                            }

                            unparsedCounty["csv_download_processed"] = true;
                            await unparsedCounty.save();
                            if (accountDoc.toObject().hasOwnProperty("remaining_records")) {
                                accountDoc["remaining_records"] = accountDoc["remaining_records"] - listPropsNo;
                            } else {
                                accountDoc["remaining_records"] = 50000 - listPropsNo;
                            }
                            await accountDoc.save();
                        }

                        done = true;
                        await countyMapPage.waitFor(2127);
                        await this.browser.close();
                        break;
                    } catch (err) {
                        console.warn(`Failed to download and parse CSV for ${unparsedCounty['map_url']} using ${accountDoc.user} :` + err);
                        await countyMapPage.waitFor(2127);
                        await this.browser.close();
                    }
                }
            }

            if (!done) {
                problemCounties.push(unparsedCounty);
                console.warn(`No accounts are able to download the CSV for ${unparsedCounty["normalized_state_name"]}/${unparsedCounty["normalized_county_name"]}. County has ${unparsedCounty["vacancy_records"]} records.`);
            }
        }

        console.log('Finished downloading all CSVs.');
        if (problemCounties.length) {
            let probCounties = '';
            for (let probCounty of problemCounties) {
                probCounties += `${probCounty["normalized_state_name"]}/${probCounty["normalized_county_name"]}  `;
            }
            console.warn(`${problemCounties.length} counties could not be downloaded: ${probCounties}`);
        }

        return true;
    }

}