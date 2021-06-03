import puppeteer from 'puppeteer';
import AbstractLandgrid from './landgrid_abstract';

import { ILandgridCounty } from '../../../../models/landgrid_refresh';
import { LandgridCounty } from "../../../../models/db"
import { config as CONFIG } from '../../../../config';
import { IConfigEnv } from '../../../../iconfig';
const config: IConfigEnv = CONFIG[process.env.NODE_ENV || 'production'];

export default class LandgridRefreshScanner extends AbstractLandgrid {
    constructor() {
        super();
    }


    async init() {
        this.browser = await this.launchBrowser();
        this.browserPages.landgridPage = await this.browser.newPage();
        await this.setParamsForPage(this.browserPages.landgridPage);
        let pageUrl = 'https://landgrid.com/store';
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
            await this.browserPages.landgridPage?.waitForXPath('//*[@class="states"]');
            return true;
        } catch (err) {
            console.warn('!! IDENTIFIER NOT FOUND!! EXPECTED "Parcel data by state"');
            return false;
        }
    }

    async parseAndSave(): Promise<boolean> {
        const products = await this.getProductsFromMongo();

        let statesObj: any = {};

        for (let product of products) {
            const productMatch = product.name.match(/^\/(.*?)\/(.*?)\/vacancy$/);
            let normalizedState = productMatch[1];
            let normalizedCounty = productMatch[2];

            if (Object.keys(statesObj).includes(normalizedState)) {
                statesObj[normalizedState]["counties"][normalizedCounty] = {
                    mongoProductId: product._id
                };
            } else {
                statesObj[normalizedState] = {};
                statesObj[normalizedState]["counties"] = {};

                statesObj[normalizedState]["counties"][normalizedCounty] = {
                    mongoProductId: product._id
                };
            }
        }

        const storePage = this.browserPages.landgridPage as puppeteer.Page;

        let landgridstatesArray = []
        let stateHandles = await storePage.$x('//*[@class="states"]//a');
        for (let stateHandle of stateHandles) {
            let stateName = await stateHandle.evaluate(el => el.textContent);
            let normalizedStateName = stateName?.toLowerCase().replace(/[^a-z]/g, ' ').trim().replace(/\s+/g, ' ').replace(/ /g, '-') || '';
            if (normalizedStateName == 'district-of-columbia') {
                normalizedStateName = 'dc';
            }

            let stateUrl = await stateHandle.evaluate((el: any) => el.href);

            if (statesObj.hasOwnProperty(normalizedStateName)) {
                statesObj[normalizedStateName]["stateUrl"] = stateUrl;
                statesObj[normalizedStateName]["fullStateName"] = stateName;
            }

            landgridstatesArray.push(normalizedStateName);
        }

        let failedToLoad = 0;
        for (let stateKey of Object.keys(statesObj)) {
            // sanity check, ensure all states in mongo products match normalized state names from landgrid
            if (!landgridstatesArray.includes(stateKey)) {
                console.warn(`WARNING! ${stateKey} (from mongo products) not found in Landgrid site. Possibly different name.`);
            } else if (statesObj[stateKey].hasOwnProperty("stateUrl")) {
                await storePage.waitFor(2300);

                let retryNo = 0;
                while (retryNo < 4) {
                    try {
                        await storePage.goto(statesObj[stateKey]["stateUrl"], { waitUntil: 'load', timeout: 75000 });
                        break;
                    } catch (err) {
                        retryNo++;
                        await storePage.waitFor(1219 * retryNo)
                    }
                }
                if (retryNo == 4) {
                    console.warn(`${statesObj[stateKey]["stateUrl"]} failed to load after 4 retries. Skipping this county.`);
                    failedToLoad++;
                    continue;
                }

                let countyHandles = await storePage.$x('//*[contains(@class, "county")]//*[@class="details"]');
                let landgridCountiesArray = [];
                let landgridCitiesArray = [];
                for (let countyHandle of countyHandles) {
                    let countyNameAndUrlHandle = await countyHandle.$x('.//a');
                    let countyStatsHandle = await countyHandle.$x('.//p');

                    let countyName = await countyNameAndUrlHandle[0].evaluate(el => el.textContent);
                    let countyUrl = await countyNameAndUrlHandle[0].evaluate((el: any) => el.href);
                    let countyStats = await countyStatsHandle[0].evaluate(el => el.textContent);
                    let normalizedCountyName = countyName?.replace(/\s+(?:and\s+)?(?:county|parish|borough|census\s*area)/i, "").toLowerCase().replace(/[\-\.]/ig, ' ').replace(/[^A-Z\d\s]/ig, '').replace(/\s+/g, '-') || '';
                    let cityFallbackNormalizedCountyName = normalizedCountyName.replace(/(?:-city|-municipality)(?:-and-?)?/i, "");

                    let refreshDate = '';
                    if (normalizedCountyName?.toLowerCase() == 'district-of-columbia') {
                        normalizedCountyName = 'dc';
                    } else if (normalizedCountyName?.toLowerCase() == 'do-a-ana') {
                        normalizedCountyName = 'doa-ana';
                    }

                    let refreshDateMatch = countyStats?.match(/refreshed\s*(\d+.*?)\s*$/i);
                    if (refreshDateMatch) {
                        refreshDate = refreshDateMatch[1];
                    } else if (statesObj[stateKey]["counties"].hasOwnProperty(normalizedCountyName)) {
                        console.warn(`No refresh date for ${stateKey}/${normalizedCountyName}`);

                        landgridCountiesArray.push(normalizedCountyName);
                        if (cityFallbackNormalizedCountyName != normalizedCountyName) {
                            landgridCitiesArray.push(cityFallbackNormalizedCountyName)
                        }
                        continue;
                    }

                    if (statesObj[stateKey]["counties"].hasOwnProperty(normalizedCountyName)) {
                        statesObj[stateKey]["counties"][normalizedCountyName]["mapUrl"] = countyUrl.replace('/store', '');
                        statesObj[stateKey]["counties"][normalizedCountyName]["refreshDate"] = refreshDate.trim();
                        statesObj[stateKey]["counties"][normalizedCountyName]["normalizedCountyName"] = normalizedCountyName;
                        statesObj[stateKey]["counties"][normalizedCountyName]["normalizedStateName"] = stateKey;
                        statesObj[stateKey]["counties"][normalizedCountyName]["fullCountyName"] = countyName?.replace(/\s+(?:and\s+)?(?:county|parish|borough|census\s*area)/i, "");
                        statesObj[stateKey]["counties"][normalizedCountyName]["fullStateName"] = statesObj[stateKey]["fullStateName"];
                    } else if (statesObj[stateKey]["counties"].hasOwnProperty(cityFallbackNormalizedCountyName) && !statesObj[stateKey]["counties"][cityFallbackNormalizedCountyName].hasOwnProperty("refreshDate")) {
                        statesObj[stateKey]["counties"][cityFallbackNormalizedCountyName]["mapUrl"] = countyUrl.replace('/store', '');
                        statesObj[stateKey]["counties"][cityFallbackNormalizedCountyName]["refreshDate"] = refreshDate.trim();
                        statesObj[stateKey]["counties"][cityFallbackNormalizedCountyName]["normalizedCountyName"] = cityFallbackNormalizedCountyName;
                        statesObj[stateKey]["counties"][cityFallbackNormalizedCountyName]["normalizedStateName"] = stateKey;
                        statesObj[stateKey]["counties"][cityFallbackNormalizedCountyName]["fullCountyName"] = countyName?.replace(/\s+(?:county|parish|borough|census\s*area)/i, "");
                        statesObj[stateKey]["counties"][cityFallbackNormalizedCountyName]["fullStateName"] = statesObj[stateKey]["fullStateName"];

                    }

                    landgridCountiesArray.push(normalizedCountyName);
                    if (cityFallbackNormalizedCountyName != normalizedCountyName) {
                        landgridCitiesArray.push(cityFallbackNormalizedCountyName)
                    }
                }

                for (let countyKey of Object.keys(statesObj[stateKey]["counties"])) {
                    if (!landgridCountiesArray.includes(countyKey) && !landgridCitiesArray.includes(countyKey)) {
                        console.warn(`WARNING! ${countyKey} (${stateKey}) (from mongo products) not found in Landgrid site. Possibly different name.`)
                        console.log(landgridCountiesArray);
                    }
                }
            }
        }


        let notRefreshed = 0;
        let refreshed = 0;
        let newlyAdded = 0;
        let ignored = 0;
        for (let stateKey of Object.keys(statesObj)) {
            for (let countyKey of Object.keys(statesObj[stateKey]["counties"])) {
                let countyObj = statesObj[stateKey]["counties"][countyKey];
                let mongoQueryResult: any = await this.getSpecificLandgridRefreshDataFromMongo({ normalized_county_name: countyObj["normalizedCountyName"], normalized_state_name: countyObj["normalizedStateName"] });
                if (mongoQueryResult) {
                    if (countyObj.refreshDate && (mongoQueryResult["refresh_date"] != countyObj.refreshDate)) {
                        mongoQueryResult["refresh_date"] = countyObj.refreshDate;
                        if (mongoQueryResult["map_url"] != countyObj.mapUrl) {
                            mongoQueryResult["map_url"] = countyObj.mapUrl;
                        }
                        mongoQueryResult["vacancy_records_processed"] = false;
                        mongoQueryResult["csv_download_processed"] = false;
                        mongoQueryResult["llc_processed"] = false;
                        await mongoQueryResult.save();
                        refreshed++;
                    } else {
                        notRefreshed++;
                    }
                } else if (countyObj.refreshDate) {
                    const doc: ILandgridCounty = new LandgridCounty();
                    doc["map_url"] = countyObj.mapUrl;
                    doc["refresh_date"] = countyObj.refreshDate;
                    doc["normalized_county_name"] = countyObj.normalizedCountyName;
                    doc["normalized_state_name"] = countyObj.normalizedStateName;
                    doc["full_county_name"] = countyObj.fullCountyName;
                    doc["full_state_name"] = countyObj.fullStateName;
                    doc["vacancy_records_processed"] = false;
                    doc["csv_download_processed"] = false;
                    doc["llc_processed"] = false;

                    await doc.save();
                    newlyAdded++;
                } else {
                    ignored++;
                }
            }
        }

        console.log("Refresh date check complete.")
        console.log(`Results:
                     - ${notRefreshed} counties with same refresh date as previously.
                     - ${ignored} counties without refresh date/ without data.
                     - ${refreshed} counties with different refresh date than previously.
                     - ${newlyAdded} counties added.
                     - ${failedToLoad} counties failed to load.
                     Total counties to process with subsequent scripts: ${refreshed + newlyAdded}`);


        return true;
    }

}