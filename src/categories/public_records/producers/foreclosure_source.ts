import puppeteer from 'puppeteer';
import AbstractSource from './abstract_producer';
import * as states_and_counties from './producer_dependencies/states_and_counties.json';
import * as zips_to_counties from './producer_dependencies/zips_to_counties.json';
import AbstractProducer from './abstract_producer';

import SqsService from '../../../services/sqs_service';
import db, { PublicRecordOwnerProductProperty, PublicRecordProperty } from '../../../models/db';
import { IPublicRecordProducer } from '../../../models/public_record_producer';
import { IProduct } from '../../../models/product';

// config
import { IConfigEnv } from '../../../iconfig';
import { config as CONFIG } from '../../../config';

const config: IConfigEnv = CONFIG[process.env.NODE_ENV || 'production'];

export default class ForeclosureSource extends AbstractSource {
    constructor(publicRecordProducer: IPublicRecordProducer) {
        super(publicRecordProducer);
    }

    isEnvTesting = this.usingLocalDb();

    acctData = {
        name: config.productConfig.foreclosurecom_user || '',
        pass: config.productConfig.foreclosurecom_pass || ''
    };

    urlsList = [
        ['Alaska', 'AK', 'https://www.foreclosure.com/listing/search?q=Alaska&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=Alaska&view=list&'],
        ['Alabama', 'AL', 'https://www.foreclosure.com/listing/search?q=Alabama&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=Alabama&view=list&'],
        ['Arkansas', 'AR', 'https://www.foreclosure.com/listing/search?q=Arkansas&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=Arkansas&view=list&'],
        ['Arizona', 'AZ', 'https://www.foreclosure.com/listing/search?q=Arizona&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=Arizona&view=list&'],
        ['California', 'CA', 'https://www.foreclosure.com/listing/search?q=California&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=California&view=list&'],
        ['Colorado', 'CO', 'https://www.foreclosure.com/listing/search?q=Colorado&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=Colorado&view=list&'],
        ['Connecticut', 'CT', 'https://www.foreclosure.com/listing/search?q=Connecticut&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=Connecticut&view=list&'],
        ['DC', 'DC', 'https://www.foreclosure.com/listing/search?q=Washington,%20DC&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=District%20OF%20Columbia&view=list&'],
        ['Delaware', 'DE', 'https://www.foreclosure.com/listing/search?q=Delaware&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=Delaware&view=list&'],
        ['Florida', 'FL', 'https://www.foreclosure.com/listing/search?q=Florida&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=Florida&view=list&'],
        ['Georgia', 'GA', 'https://www.foreclosure.com/listing/search?q=Georgia&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=Georgia&view=list&'],
        ['Hawaii', 'HI', 'https://www.foreclosure.com/listing/search?q=Hawaii&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=Hawaii&view=list&'],
        ['Iowa', 'IA', 'https://www.foreclosure.com/listing/search?q=Iowa&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=Iowa&view=list&'],
        ['Idaho', 'ID', 'https://www.foreclosure.com/listing/search?q=Idaho&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=Idaho&view=list&'],
        ['Illinois', 'IL', 'https://www.foreclosure.com/listing/search?q=Illinois&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=Illinois&view=list&'],
        ['Indiana', 'IN', 'https://www.foreclosure.com/listing/search?q=Indiana&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=Indiana&view=list&'],
        ['Kansas', 'KS', 'https://www.foreclosure.com/listing/search?q=Kansas&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=Kansas&view=list&'],
        ['Kentucky', 'KY', 'https://www.foreclosure.com/listing/search?q=Kentucky&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=Kentucky&view=list&'],
        ['Louisiana', 'LA', 'https://www.foreclosure.com/listing/search?q=Louisiana&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=Louisiana&view=list&'],
        ['Massachusetts', 'MA', 'https://www.foreclosure.com/listing/search?q=Massachusetts&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=Massachusetts&view=list&'],
        ['Maryland', 'MD', 'https://www.foreclosure.com/listing/search?q=Maryland&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=Maryland&view=list&'],
        ['Maine', 'ME', 'https://www.foreclosure.com/listing/search?q=Maine&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=Maine&view=list&'],
        ['Michigan', 'MI', 'https://www.foreclosure.com/listing/search?q=Michigan&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=Michigan&view=list&'],
        ['Minnesota', 'MN', 'https://www.foreclosure.com/listing/search?q=Minnesota&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=Minnesota&view=list&'],
        ['Missouri', 'MO', 'https://www.foreclosure.com/listing/search?q=Missouri&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=Missouri&view=list&'],
        ['Mississippi', 'MS', 'https://www.foreclosure.com/listing/search?q=Mississippi&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=Mississippi&view=list&'],
        ['Montana', 'MT', 'https://www.foreclosure.com/listing/search?q=Montana&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=Montana&view=list&'],
        ['North-Carolina', 'NC', 'https://www.foreclosure.com/listing/search?q=North%20Carolina&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=North%20Carolina&view=list&'],
        ['North-Dakota', 'ND', 'https://www.foreclosure.com/listing/search?q=North%20Dakota&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=North%20Dakota&view=list&'],
        ['Nebraska', 'NE', 'https://www.foreclosure.com/listing/search?q=Nebraska&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=Nebraska&view=list&'],
        ['New-Hampshire', 'NH', 'https://www.foreclosure.com/listing/search?q=New%20Hampshire&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=New%20Hampshire&view=list&'],
        ['New-Jersey', 'NJ', 'https://www.foreclosure.com/listing/search?q=New%20Jersey&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=New%20Jersey&view=list&'],
        ['New-Mexico', 'NM', 'https://www.foreclosure.com/listing/search?q=New%20Mexico&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=New%20Mexico&view=list&'],
        ['Nevada', 'NV', 'https://www.foreclosure.com/listing/search?q=Nevada&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=Nevada&view=list&'],
        ['New-York', 'NY', 'https://www.foreclosure.com/listing/search?q=New%20York&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=New%20York&view=list&'],
        ['Ohio', 'OH', 'https://www.foreclosure.com/listing/search?q=Ohio&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=Ohio&view=list&'],
        ['Oklahoma', 'OK', 'https://www.foreclosure.com/listing/search?q=Oklahoma&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=Oklahoma&view=list&'],
        ['Oregon', 'OR', 'https://www.foreclosure.com/listing/search?q=Oregon&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=Oregon&view=list&'],
        ['Pennsylvania', 'PA', 'https://www.foreclosure.com/listing/search?q=Pennsylvania&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=Pennsylvania&view=list&'],
        ['Rhode-Island', 'RI', 'https://www.foreclosure.com/listing/search?q=Rhode%20Island&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=Rhode%20Island&view=list&'],
        ['South-Carolina', 'SC', 'https://www.foreclosure.com/listing/search?q=South%20Carolina&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=South%20Carolina&view=list&'],
        ['South-Dakota', 'SD', 'https://www.foreclosure.com/listing/search?q=South%20Dakota&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=South%20Dakota&view=list&'],
        ['Tennessee', 'TN', 'https://www.foreclosure.com/listing/search?q=Tennessee&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=Tennessee&view=list&'],
        ['Texas', 'TX', 'https://www.foreclosure.com/listing/search?q=Texas&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=Texas&view=list&'],
        ['Utah', 'UT', 'https://www.foreclosure.com/listing/search?q=Utah&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=Utah&view=list&'],
        ['Virginia', 'VA', 'https://www.foreclosure.com/listing/search?q=Virginia&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=Virginia&view=list&'],
        ['Vermont', 'VT', 'https://www.foreclosure.com/listing/search?q=Vermont&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=Vermont&view=list&'],
        ['Washington', 'WA', 'https://www.foreclosure.com/listing/search?q=Washington&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=Washington&view=list&'],
        ['Wisconsin', 'WI', 'https://www.foreclosure.com/listing/search?q=Wisconsin&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=Wisconsin&view=list&'],
        ['West-Virginia', 'WV', 'https://www.foreclosure.com/listing/search?lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=West%20Virginia&view=list&'],
        ['Wyoming', 'WY', 'https://www.foreclosure.com/listing/search?q=Wyoming&lc=preforeclosure&lc=bankruptcy&lc=tax%20lien&lc=foreclosure&ps=100&pg=1&o=dos&ob=desc&loc=Wyoming&view=list&']
    ];

    private parseObjFromStateString = (stateString: string) => {
        for (let stateArray of this.urlsList) {
            if (stateString.trim().toLowerCase() == stateArray[0].trim().toLowerCase() || stateString.trim().toLowerCase() == stateArray[1].trim().toLowerCase()) {
                return {
                    stateName: stateArray[0],
                    abbrev: stateArray[1],
                    url: stateArray[2]
                };
            }
        }
    }

    private getArrayOfCountiesInState = (statesAndCountiesJson: any, stateAbbrev: string) => {
        for (let stateObj of statesAndCountiesJson.states) {
            if (stateObj.abbrev === stateAbbrev) {
                return stateObj.counties;
            }
        }
    }

    private getArrayOfCountyAliasesInState = (statesAndCountiesJson: any, arrayOfCountiesInState: string[]) => {
        let countyAliasesArray = [];
        for (let countyString of arrayOfCountiesInState) {
            if (statesAndCountiesJson['aliasesForCounties'].hasOwnProperty(countyString)) {
                countyAliasesArray.push({
                    "county_name": countyString,
                    "county_aliases": statesAndCountiesJson['aliasesForCounties'][countyString]
                });
            }
        }
        if (countyAliasesArray.length) {
            return countyAliasesArray;
        } else return false;
    }

    private checkIfCountyIsAlias = (countyAliasesArray: any, countyString: string) => {
        for (let countyAliasObj of countyAliasesArray) {
            if (countyAliasObj['county_aliases'].includes(countyString)) {
                return countyAliasObj['county_name'];
            }
        }
        return false;
    }

    private getCountyNameFromZipcode = (zipString: string, zipToCountyObj: any) => {
        //remove possible leading 0s at the start of the zip
        let normalizedZipMatch = zipString.match(/^(\d+)/);
        if (normalizedZipMatch) {
            let normalizedZip = Number(normalizedZipMatch[1]).toString();

            if (zipToCountyObj.hasOwnProperty(normalizedZip)) {
                return zipToCountyObj[normalizedZip];
            }
        }
        return false;
    }


    private fetchCookiesFromBucket = async () => {
        let data = await this.getFileFromS3Bucket('last_scrape_data/foreclosure_com/cookies.json')
        if (data) {
            return JSON.parse(data as string)['cookies'];
        }
        return false;
    }

    private fetchLastCrawledAddressesFromBucket = async (stateAbbrev: string) => {
        let data = await this.getFileFromS3Bucket(`last_scrape_data/foreclosure_com/${stateAbbrev}/prev_crawled_addresses.json`);
        if (data) {
            return JSON.parse(data as string)['addresses'];
        }
        return [];
    }


    private writeLastCrawledAddressesToBucket = async (stateAbbrev: string, addressesArray: string[]) => {
        let result = await this.writeFileToS3Bucket(`last_scrape_data/foreclosure_com/${stateAbbrev}/prev_crawled_addresses.json`, JSON.stringify({ 'addresses': addressesArray }));
        if (result) {
            return true;
        }
        return false;
    }

    private writeCookiesToBucket = async (cookieArray: any) => {
        let result = await this.writeFileToS3Bucket('last_scrape_data/foreclosure_com/cookies.json', JSON.stringify({ 'cookies': cookieArray }));
        if (result) {
            return true;
        }
        return false;
    }


    async init() {
        this.browser = await this.launchBrowser();
        this.browserPages.generalInfoPage = await this.browser.newPage();
        await this.setParamsForPage(this.browserPages.generalInfoPage);
        let pageUrl = this.parseObjFromStateString(this.stateToCrawl);

        if (!this.isEnvTesting) {
            let cookies = await this.fetchCookiesFromBucket();
            if (cookies) {
                console.log('Using cookies from previous crawl.')
                await this.browserPages.generalInfoPage.setCookie(...cookies);
            } else {
                console.log('No previous cookies file found.');
            }
        }

        if (pageUrl) {
            try {
                await this.browserPages.generalInfoPage.goto(pageUrl.url, { waitUntil: 'domcontentloaded' });
                return true;
            } catch (err) {
                console.warn('Website could not be loaded at this time.');
                return false;
            }
        } else {
            console.warn('Input is not a valid state. Please check your spelling. You can use either the name of the state or its 2-letter abbreviation.');
            return false;
        }
    }

    async read(): Promise<boolean> {
        try {
            await this.browserPages.generalInfoPage?.waitForXPath('//*[contains(@class, "navbar-nav")]//a[contains(./text(), "Profile") or contains(./text(), "Sign In")]');
            return true;
        } catch (err) {
            console.warn('!! IDENTIFIER EXPECTED: "Sign In" OR "Profile" HANDLE NOT FOUND IN NAVBAR');
            return false;
        }
    }

    async signinPage(foreclosurePage: puppeteer.Page) {
        // check if sign-in is needed (aka check if cookies expired)
        let loggedInHandle = await foreclosurePage.$x('//*[contains(@class, "navbar-nav")]//a[contains(./text(), "Profile")]');
        let signInHandle = await foreclosurePage.$x('//*[contains(@class, "navbar-nav")]//a[contains(./text(), "Sign In")]');
        if (!loggedInHandle.length) {
            console.log('Not logged in. Logging in now.')
            // not logged in, logging in:
            await Promise.all([
                foreclosurePage.waitForNavigation({ waitUntil: 'load' }),
                signInHandle[0].click()
            ]);

            let emailHandle = await foreclosurePage.$x('//*[@id="login_password"]//input[@name="key"]');
            let passHandle = await foreclosurePage.$x('//*[@id="login_password"]//input[@name="password"]');

            await emailHandle[0].type(this.acctData.name, { delay: 250 });
            await passHandle[0].type(this.acctData.pass, { delay: 250 });

            let clickSignInHandle = await foreclosurePage.$x('//*[@id="login_password"]//input[@type="submit"]');
            await Promise.all([
                foreclosurePage.waitForNavigation({ waitUntil: 'domcontentloaded' }),
                clickSignInHandle[0].click()
            ]);

            // check if we're logged in now
            await foreclosurePage.waitFor(1500);
            let loggedInHandle = await foreclosurePage.$x('//*[contains(@class, "navbar-nav")]//a[contains(./text(), "Profile")]');
            if (!loggedInHandle.length) {
                console.warn('!! STILL NOT LOGGED IN. STOPPING CRAWL.');
                return false;
            } else {
                console.log('Log in successful.');
            }

            let purl = this.parseObjFromStateString(this.stateToCrawl);
            if (purl) {
                await foreclosurePage.goto(purl.url, { waitUntil: 'domcontentloaded', timeout: 90000 })
            }

        } else {
            console.log('Already logged in.');
        }
    }

    async parseAndSave(): Promise<boolean> {
        const foreclosurePage = this.browserPages.generalInfoPage as puppeteer.Page;

        await foreclosurePage.bringToFront();
        const stateAbbrev = this.parseObjFromStateString(this.stateToCrawl)?.abbrev;

        // Quit if parseObjFromStateString returns undefined, it means input state is wrong.
        if (!stateAbbrev) return false;

        await this.signinPage(foreclosurePage);

        let addressesFromLastCrawl = [];
        if (!this.isEnvTesting) {
            addressesFromLastCrawl = await this.fetchLastCrawledAddressesFromBucket(stateAbbrev);
        }

        let addressesFromCurrentCrawl = [];
        let addressesPreviouslyScraped = 0;
        let totalNoOfResults = 0;
        
        let pagenum = 1;
        while (pagenum < 11) {
            let countyPropsObj: any = {};
            // scrape the results page
            let resultHandles = await foreclosurePage.$x('//*[contains(@class, "listingRow")]');
            if (!resultHandles.length) {
                console.warn('!! NO RESULTS FOUND. Something is likely wrong.');
                return false;
            } else {
                // load zips to county json from bucket into a variable
                const zipsToCountyObj = zips_to_counties;
                if (!zipsToCountyObj) {
                    console.warn('!! NO ZIPS TO COUNTY JSON. STOPPING CRAWL.');
                    return false;
                }

                // load states and counties json from bucket into a variable
                const statesCountiesObj = states_and_counties;
                if (!statesCountiesObj) {
                    console.warn('!! NO STATES AND COUNTIES JSON. STOPPING CRAWL.');
                    return false;
                }

                const listOfCounties = this.getArrayOfCountiesInState(statesCountiesObj, stateAbbrev);
                const listOfCountyAliases = this.getArrayOfCountyAliasesInState(statesCountiesObj, listOfCounties);


                // iterate over all results in the page
                for (let resultHandle of resultHandles) {

                    //scrape practice type
                    let practice_type = '';
                    let practiceTypeHandle = await resultHandle.$x('.//*[@class="messajeType"]/text()');
                    if (practiceTypeHandle.length) {
                        practice_type = await practiceTypeHandle[0].evaluate((elem: any) => elem.textContent);
                        practice_type = practice_type.trim();
                    }

                    //scrape listed price
                    let listed_price = '';
                    let listedPriceHandle = await resultHandle.$x('.//*[@class="tdprice"]/strong/text()');
                    if (listedPriceHandle.length) {
                        listed_price = await listedPriceHandle[0].evaluate((elem: any) => elem.textContent);
                    }

                    //scrape listed price type (EMV, List Price, etc.)
                    let listed_price_type = '';
                    let listedPriceTypeHandle = await resultHandle.$x('.//*[@class="priceText"]');
                    if (listedPriceTypeHandle.length) {
                        listed_price_type = await listedPriceTypeHandle[0].evaluate((elem: any) => elem.innerText);
                    }

                    //scrape address
                    // we'll use the JSON instead of HTMLElement, because some addresses in HTMLElement are incomplete
                    let addressObj: any = {};
                    let addressHandle = await resultHandle.$x('.//script[contains(@type, "application/ld+json")]');
                    if (addressHandle.length) {
                        addressObj = await addressHandle[0].evaluate((elem: any) => JSON.parse(elem.textContent).address);
                    }

                    //split address
                    let addressStreet = addressObj.streetAddress;
                    let city = addressObj.addressLocality;
                    let state = addressObj.addressRegion;
                    let zip = addressObj.postalCode;

                    addressesFromCurrentCrawl.push(addressStreet);

                    if (addressesFromLastCrawl.includes(addressStreet)) {
                        addressesPreviouslyScraped++;
                        continue;
                    } else {
                        // reset number of address previously scraped, as we're only interested in consecutive results.
                        addressesPreviouslyScraped = 0;
                    }

                    // check if we've come across addresses that have already been scraped
                    // if we did, we've likely reached the end of the list of new addresses.
                    // using ten consecutive addresses to make sure that one of the addresses hasn't been reposted as new
                    if (addressesPreviouslyScraped < 10) {
                        let county = this.getCountyNameFromZipcode(zip, zipsToCountyObj);
                        if (!county) {
                            console.warn(`No county found for ${zip}`);
                            county = '';
                            continue;
                        }

                        if (listOfCounties.includes(county)) {
                            if (!countyPropsObj.hasOwnProperty(county)) {
                                countyPropsObj[county] = [];
                            }

                            countyPropsObj[county].push({
                                "property_address": addressStreet,
                                "property_city": city,
                                "property_county": county,
                                "property_state": stateAbbrev,
                                "property_zip": zip,
                                "listed_price": listed_price,
                                "listed_price_type": listed_price_type,
                                "practice_type": practice_type
                            });

                        } else if (listOfCountyAliases) {
                            let normalizedCountyName = this.checkIfCountyIsAlias(listOfCountyAliases, county)
                            if (normalizedCountyName) {
                                if (!countyPropsObj.hasOwnProperty(normalizedCountyName)) {
                                    countyPropsObj[normalizedCountyName] = [];
                                }

                                countyPropsObj[normalizedCountyName].push({
                                    "property_address": addressStreet,
                                    "property_city": city,
                                    "property_county": normalizedCountyName,
                                    "property_state": stateAbbrev,
                                    "property_zip": zip,
                                    "listed_price": listed_price,
                                    "listed_price_type": listed_price_type,
                                    "practice_type": practice_type
                                });
                            }
                        }
                    }
                }
                // enqueue address object in mongo, send message to SQS.
                for (let county of Object.keys(countyPropsObj)) {
                    console.log(`${county}: ${countyPropsObj[county].length} new addresses found.`);
                    const normalizedCountyNameForMongo = county.toLowerCase().replace(/[\-\.]/ig, ' ').replace(/[^A-Z\d\s]/ig, '').replace(/\s+/g, '-');
                    const normalizeStateNameForMongo = this.publicRecordProducer.state.toLowerCase().replace(/\s+/g, '-');

                    for (let propertyAddressObj of countyPropsObj[county]) {
                        const normalizePracticeTypeForMongo = propertyAddressObj['practice_type'].toLowerCase().replace(/[\-\.]/ig, ' ').replace(/[^A-Z\d\s]/ig, '').replace(/\s+/g, '-');

                        const productName = `/${normalizeStateNameForMongo}/${normalizedCountyNameForMongo}/${normalizePracticeTypeForMongo}`;
                        console.log('productName: ', productName);
                        const product: IProduct = await db.models.Product.findOne({ name: productName }).exec();

                        let data = {
                            'Property Address' : propertyAddressObj['property_address'],
                            'Property City' : propertyAddressObj['property_city'],
                            'County' : propertyAddressObj['property_county'],
                            'Property State' : propertyAddressObj['property_state'],
                            'Property Zip' : propertyAddressObj['property_zip'],
                            'listedPrice' : propertyAddressObj['listed_price'],
                            'listedPriceType' : propertyAddressObj['listed_price_type'],
                            'practiceType' : propertyAddressObj['practice_type'],
                            'productId': product._id,
                            vacancyProcessed : false
                        }
                        if (await this.civilAndLienSaveToNewSchema(data)) {
                            totalNoOfResults++;
                        }
                    }
                }
            }
            if (addressesPreviouslyScraped > 9) break;
            pagenum++;
            const [nextpage] = await foreclosurePage.$x('//*[@id="pageNextBottom"]');
            if (nextpage) {
                const [nonextpage] = await foreclosurePage.$x('//*[@id="pageNextBottom"][@data-nextpage="-1"]');
                if (nonextpage) {
                    break;
                } else {
                    await nextpage.click();
                }
            } else {
                break;
            }
            await this.sleep(this.getRandomInt(5000, 10000));
        }

        // public record producer will only have a state attribute and not county attribute in this case 
        if (this.publicRecordProducer) {
            this.publicRecordProducer.processed = true;
            await this.publicRecordProducer.save();
        }

        // save the current cookies and crawl list back into the cookies_and_crawled_addresses.json file, end process
        if (!this.isEnvTesting) {
            if (addressesFromCurrentCrawl.length) {
                let writeAddressesToBucket = await this.writeLastCrawledAddressesToBucket(stateAbbrev, addressesFromCurrentCrawl);
                if (writeAddressesToBucket) {
                    console.log('Crawled addresses list written to bucket.');
                } else {
                    console.warn('!! PROBLEM WRITING CRAWLED ADDRESSES TO BUCKET');
                }
            }

            let writeCookiesToBucket = await this.writeCookiesToBucket(await foreclosurePage.cookies());
            if (writeCookiesToBucket) {
                console.log('Cookies written to bucket.');
            } else {
                console.warn('!! PROBLEM WRITING COOKIES TO BUCKET');
            }
        }

        await AbstractProducer.sendMessage(this.publicRecordProducer.state, '', totalNoOfResults, 'Foreclosurecom');

        await foreclosurePage.waitFor(500);
        await foreclosurePage.close();
        
        return true;
    }
}