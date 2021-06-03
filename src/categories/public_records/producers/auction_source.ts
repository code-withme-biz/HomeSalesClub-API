import puppeteer from 'puppeteer';
import AbstractSource from './abstract_producer';
import * as states_and_counties from './producer_dependencies/states_and_counties.json';
import AbstractProducer from './abstract_producer';

import SqsService from '../../../services/sqs_service';
import db, { PublicRecordOwnerProductProperty, PublicRecordProperty } from '../../../models/db';
import { IPublicRecordProducer } from '../../../models/public_record_producer';
import { IPublicRecordAttributes } from '../../../models/public_record_attributes';
import { IProduct } from '../../../models/product';

export default class AuctionSource extends AbstractSource {
    constructor(publicRecordProducer: IPublicRecordProducer) {
        super(publicRecordProducer);
    }

    isEnvTesting = this.usingLocalDb();

    private getStateObjFromSearchString = (statesAndCountiesJson: any, searchString: string) => {
        for (let stateObj of statesAndCountiesJson.states) {
            let stateNameNormalized = stateObj.name.toLowerCase().trim().replace(/[^A-Z\d\s]/ig, '').replace(/\s+/g, '-')
            if (searchString.toLowerCase().trim() == stateObj.abbrev.toLowerCase().trim() ||
                searchString.toLowerCase().trim() == stateObj.name.toLowerCase().trim() ||
                searchString.toLowerCase().trim() == stateNameNormalized) {
                return stateObj;
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

    private mutateApiUrl = (initialApiUrl: string, stateToSearch: string) => {
        // check for and mutate the API url as needed.
        if (initialApiUrl) {
            const mutatedApiUrl = new URL(initialApiUrl);
            const searchParams = mutatedApiUrl.searchParams;

            // set the property search limit to maximum (200)
            searchParams.set('limit', '200');
            searchParams.set('property_state', stateToSearch);

            // workaround for broken layout homepage
            if (searchParams.get('search')) {
                searchParams.delete('search');
            }

            // set sorting by auction activation (publishing) date
            let sortParam = searchParams.get('sort');
            if (sortParam) {
                let stringToKeep = sortParam.match(/^.*?(,.*?)$/);
                if (stringToKeep) {
                    sortParam = 'asset_activation_dt_sort' + stringToKeep[1];
                }
                searchParams.set('sort', sortParam);
            }
            console.log(`Mutated API URL: ${mutatedApiUrl.href}`);
            return mutatedApiUrl.href;

        } else {
            console.error('!! NO API URL FOUND. SOMETHING IS WRONG !!')
        }
    }


    private fetchStopAtDateFromBucket = async (stateAbbrev: string) => {
        let data = await this.getFileFromS3Bucket(`last_scrape_data/auction_com/${stateAbbrev}/last_crawled_date.json`);
        if (data) {
            return JSON.parse(data as string)['stop_at_date'];
        }
        return '';
    }

    private writeStopAtDateToBucket = async (stateAbbrev: string, futurestopAtDate: string) => {
        let result = await this.writeFileToS3Bucket(`last_scrape_data/auction_com/${stateAbbrev}/last_crawled_date.json`, JSON.stringify({ 'stop_at_date': futurestopAtDate }));
        if (result) {
            return true;
        }
        return false;
    }


    async init() {
        this.browser = await this.launchBrowser();
        this.browserPages.generalInfoPage = await this.browser.newPage();
        await this.setParamsForPage(this.browserPages.generalInfoPage);
        let pageUrl = 'https://www.auction.com/';
        try {
            await this.browserPages.generalInfoPage.goto(pageUrl, { waitUntil: 'load' });
            return true;
        } catch (err) {
            console.warn('Website could not be loaded at this time.');
            return false;
        }
    }

    async read(): Promise<boolean> {
        try {
            await this.browserPages.generalInfoPage?.waitForXPath('//input[@name="Search"]');
            return true;
        } catch (err) {
            console.warn('!! IDENTIFIER EXPECTED: "Search bar"');
            await this.browserPages.generalInfoPage?.reload();
            await this.browserPages.generalInfoPage?.waitForXPath('//input[@name="Search"]');
            return false;
        }
    }

    async parseAndSave(): Promise<boolean> {
        const statesAndCountiesJson = states_and_counties;
        const auctionPage = this.browserPages.generalInfoPage as puppeteer.Page;

        await auctionPage.bringToFront();
        const stateObj = await this.getStateObjFromSearchString(statesAndCountiesJson, this.stateToCrawl);
        if (!stateObj) {
            console.warn('Input is not a valid state. Please check your spelling. You can use either the name of the state or its 2-letter abbreviation.')
            return false;
        }

        let lastStopAtDate;
        let dateFromBucket;
        if (!this.isEnvTesting) {
            dateFromBucket = await this.fetchStopAtDateFromBucket(stateObj.abbrev);
        }

        if (!dateFromBucket) {
            // if no date file is found in bucket, we'll use 'two months ago' as last date.
            console.log('No stop at date. Falling back to two months ago.')
            let today = new Date();
            lastStopAtDate = new Date(today.setMonth(today.getMonth() - 2));
        } else {
            lastStopAtDate = new Date(dateFromBucket);
        }

        // close the notification handle, if it pops up.
        const closeNotificationHandle = await auctionPage.$x('//*[contains(@data-elm-id, "home_onboarding_drawer_close_button")]');
        if (closeNotificationHandle.length)
            await closeNotificationHandle[0].click();

        let apiUrl;
        // search for something (Florida), wait till suggestions pop up
        const searchHandle = await auctionPage.$x('//input[@name="Search"]');
        await searchHandle[0].click();
        await searchHandle[0].type('Florida', { delay: 200 });
        try {
            await auctionPage.waitForXPath('//*[contains(@class, "results")][contains(@class, "visible")]//*[contains(@class, "autosuggest-text")][contains(./text(), "Florida")]/following-sibling::*[contains(@class, "autosuggest-sublabel")][contains(.//text(), "state")]/parent::*');
            await auctionPage.waitFor(850);
            const clickHandle = await auctionPage.$x('//*[contains(@class, "results")][contains(@class, "visible")]//*[contains(@class, "autosuggest-text")][contains(./text(), "Florida")]/following-sibling::*[contains(@class, "autosuggest-sublabel")][contains(.//text(), "state")]/parent::*')

            // set up a listener for the api url
            auctionPage.on('request', interceptedRequest => {
                if (interceptedRequest.url().includes('/api/') && interceptedRequest.url().includes('/search/assets')) {
                    apiUrl = interceptedRequest.url();
                }
            });

            // click the suggestion
            await Promise.all([
                auctionPage.waitForNavigation({ waitUntil: 'load' }),
                clickHandle[0].click()
            ])
        } catch (err) {
            // workaround for broken layout homepage

            // set up a listener for the api url
            auctionPage.on('request', interceptedRequest => {
                if (interceptedRequest.url().includes('/api/') && interceptedRequest.url().includes('/search/assets')) {
                    apiUrl = interceptedRequest.url();
                }
            });
            await Promise.all([
                auctionPage.waitForNavigation({ waitUntil: 'load' }),
                searchHandle[0].press('Enter')
            ])
        }

        await auctionPage.waitFor(2500);

        const apiPage = await this.browser?.newPage();

        auctionPage.removeAllListeners('request');

        if (!apiUrl) {
            console.warn('Api URL problem.')
            return false;
        }
        // mould API URL string, add listener for json response, then go to URL
        const apiReqUrl = this.mutateApiUrl(apiUrl, stateObj.abbrev);
        await apiPage?.goto(apiReqUrl as string, { waitUntil: 'load' });
        // waiting for a couple of seconds ensures jsonData object is complete and parse-able
        await apiPage?.waitFor(2000);
        if (!apiPage) return false;

        let [pre] = await apiPage.$x('//pre');;
        let jsonData: any = JSON.parse(await pre.evaluate((el:any) => el.textContent));

        // save the resulting object array, get counties array in state
        const propertyArray = jsonData.result.assets.asset;
        const listOfCounties = stateObj.counties
        const listOfCountyAliases = this.getArrayOfCountyAliasesInState(statesAndCountiesJson, listOfCounties);

        let totalNoOfResults = 0;
        let countyPropsObj: any = {};

        // get the activation_date of the first object in the assets array to be used as delimiter for future crawls.
        let futureStopAtDate = propertyArray[0]['activation_date'];

        // iterate over each propertyObj entry in the json, if county is of interest, save it
        for (let propertyObj of propertyArray) {

            // check if property activation_date is less than the date of the last crawl. if it is, stop scraping.
            let postDate = new Date(propertyObj['activation_date']);
            if (postDate <= lastStopAtDate) {
                continue;
            }

            if (postDate > new Date(futureStopAtDate)) {
                console.log('Weird ordering. Contact Bogdan!')
            }


            if (listOfCounties.includes(propertyObj['property_county'])) {
                if (!countyPropsObj.hasOwnProperty(propertyObj['property_county'])) {
                    countyPropsObj[propertyObj['property_county']] = [];
                }
                countyPropsObj[propertyObj['property_county']].push({
                    "property_address": propertyObj['property_address'],
                    "property_city": propertyObj['property_city'],
                    "property_county": propertyObj['property_county'],
                    "property_state": stateObj.abbrev,
                    "property_zip": propertyObj['property_zip'],
                    "property_type": propertyObj['property_type'],
                    "year_built": propertyObj['year_built'],
                    "practice_type": 'auction'
                });
            } else if (listOfCountyAliases) {
                let normalizedCountyName = this.checkIfCountyIsAlias(listOfCountyAliases, propertyObj['property_county'])
                if (normalizedCountyName) {
                    if (!countyPropsObj.hasOwnProperty(normalizedCountyName)) {
                        countyPropsObj[normalizedCountyName] = [];
                    }

                    countyPropsObj[normalizedCountyName].push({
                        "property_address": propertyObj['property_address'],
                        "property_city": propertyObj['property_city'],
                        "property_county": normalizedCountyName,
                        "property_state": stateObj.abbrev,
                        "property_zip": propertyObj['property_zip'],
                        "property_type": propertyObj['property_type'],
                        "year_built": propertyObj['year_built'],
                        "practice_type": 'auction'
                    });
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
                    'yearBuilt': propertyAddressObj['year_built'],
                    'productId': product._id,
                    vacancyProcessed : false
                }
                if (await this.civilAndLienSaveToNewSchema(data)) totalNoOfResults++;
            }
        }

        // public record producer will only have a state attribute and not county attribute in this case 
        if (this.publicRecordProducer) {
            this.publicRecordProducer.processed = true;
            await this.publicRecordProducer.save();
        }

        // write first activation_date back to bucket to be used for future crawls on this state.
        if (!this.isEnvTesting) {
            let writeStopAtDateToBucket = await this.writeStopAtDateToBucket(stateObj.abbrev, futureStopAtDate);
            if (writeStopAtDateToBucket) {
                console.log('Activation date written to bucket successfully');
            } else console.log('Failed to write activation date to bucket');
        }

        // remove all listeners from the page to avoid memleaks when >10 states are scraped.
        apiPage?.removeAllListeners('response');
        await AbstractProducer.sendMessage(this.publicRecordProducer.state, '', totalNoOfResults, 'Auctioncom');

        return true;
    }
}