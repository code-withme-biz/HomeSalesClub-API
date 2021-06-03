import puppeteer from 'puppeteer';
import AbstractLandgrid from './landgrid_abstract';
import LandgridAccountChecker from './account_checker';

import { config as CONFIG } from '../../../../config';
import { IConfigEnv } from '../../../../iconfig';
const config: IConfigEnv = CONFIG[process.env.NODE_ENV || 'production'];

export default class LandgridVacancyScanner extends AbstractLandgrid {
    constructor() {
        super();
    }


    async getVacantResidential(page: puppeteer.Page): Promise<number> {
        // Wait for stats page to load
        try {
            await page.waitForXPath('//*[@class="stats-container"]//*[@class="numeric"]', { timeout: 60000 });
        } catch (err) {
            () => {};
        }
        

        let vrNo = 0;

        // Check if we have "Vacant Residential" data in overview
        let vacantResidentialDataHandle = await page.$x('//*[@class="highcharts-legend"]//*[contains(@class, "highcharts-legend-item")][contains(.//text(), "Vacant Residential")]');
        let numericStatsHandle = await page.$x('//*[@class="stats-container"]//*[@class="numeric"]');

        if (vacantResidentialDataHandle.length) {
            // Found data in overview, grab and return
            let vrNoString = await vacantResidentialDataHandle[0].evaluate(el => el.textContent) || '';
            let vrNoStringMatch = vrNoString.match(/:\s*(.*?)$/i);
            if (vrNoStringMatch) {
                vrNo = Number(vrNoStringMatch[1].replace(',', ''));
                return vrNo;
            } else {
                console.warn(`Unable to grab number from string in overview: ${vrNoString}\nURL: ${page.url()}`);
            }
        } else if (numericStatsHandle.length) {
            // No Vacant Residential data in overview, we need to use filters
            await (await page.$x('//a[@data-tip="filter"]'))[0].click();

            // USPS Vacancy Indicator
            await page.waitForXPath('//*[@data-field="usps_vacancy"]//input[contains(@class, "search__field")]');
            await Promise.all([
                page.waitForResponse(res => res.url().includes('autocomplete.json')),
                (await page.$x('//*[@data-field="usps_vacancy"]//input[contains(@class, "search__field")]'))[0].click()
            ]);
            await page.waitFor(280);
            let resultOptionYHandle = await page.$x('//*[contains(@class, "results__options")]//li[contains(.//text(), "Y")]');
            let resultOptionNHandle = await page.$x('//*[contains(@class, "results__options")]//li[contains(.//text(), "N")]');
            if (resultOptionYHandle.length) {
                await resultOptionYHandle[0].click();
            } else if (resultOptionNHandle.length) {
                console.warn(`No option to filter for vacancy data. Site\'s dataset probably does not contain this info for this county.\n Defaulting to 0 for URL ${page.url()}`)
                return 0;
            }
            await page.waitFor(320);

            // Residential Delivery Indicator
            await Promise.all([
                page.waitForResponse(res => res.url().includes('autocomplete.json')),
                (await page.$x('//*[@data-field="rdi"]//input[contains(@class, "search__field")]'))[0].click()
            ]);
            await page.waitFor(280);

            resultOptionYHandle = await page.$x('//*[contains(@class, "results__options")]//li[contains(.//text(), "Y")]');
            resultOptionNHandle = await page.$x('//*[contains(@class, "results__options")]//li[contains(.//text(), "N")]');

            if (resultOptionYHandle.length) {
                await resultOptionYHandle[0].click();
            } else if (resultOptionNHandle.length) {
                console.warn(`No option to filter for RESIDENTIAL vacancy data. Site\'s dataset probably does not contain this info for this county.\n Defaulting to 0 for URL ${page.url()}`)
                return 0;
            }
            await page.waitFor(320);

            // Click search, wait for response
            await Promise.all([
                page.waitForXPath('//*[contains(@class, "description")]//following-sibling::*[contains(@class, "preview-message")][contains(.//text(), "Found")]'),
                (await page.$x('//a[contains(@class, "search")]'))[0].click()
            ]);
            await page.waitForXPath('//*[contains(@class, "description")]/following-sibling::*[contains(@class, "preview-message")][contains(.//text(), "Found")]');

            // Grab and return residential vacancy data

            let vacantResidentialHandle = await page.$x('//*[contains(@class, "description")]/following-sibling::*[contains(@class, "preview-message")][contains(.//text(), "Found")]');
            if (vacantResidentialHandle.length) {
                let vrNoString = await vacantResidentialHandle[0].evaluate((el: any) => el.innerText) || '';
                let vrNoStringMatch = vrNoString.match(/Found\s*(.*?)\s*parcels/i)
                if (vrNoStringMatch) {
                    vrNo = Number(vrNoStringMatch[1].replace(',', ''));
                    return vrNo;
                } else {
                    console.warn(`Unable to grab number from string after filtering: ${vrNoString}\nURL: ${page.url()}`);
                }
            } else {
                console.warn(`No vacant residential # found!\n Defaulting to 0 for URL ${page.url()}`);
            }
            return vrNo;
        } else {
            console.warn(`Error: Unable to grab overview data from page. vacantResidentialDataHandle & numericStatsHandle both empty.\n Defaulting to 0 for URL ${page.url()}`);
            return 0;
        }
        return vrNo;
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
        let countyDocs = await this.getAllLandgridRefreshDataFromMongo({ vacancy_records_processed: false });
        if (!countyDocs || !countyDocs.length) {
            console.log('No counties in need of vacancy record refreshing.');
            return true;
        }

        let accountDocs = await this.getLandgridAccountPoolFromMongo({ pro: true });
        if (!accountDocs || !accountDocs.length) {
            console.log('Rechecking accounts in db.');
            await new LandgridAccountChecker().startParsing();
            accountDocs = await this.getLandgridAccountPoolFromMongo({ pro: true });
            if (!accountDocs || !accountDocs.length) {
                console.warn('No PRO accounts found in db. This script requires a PRO account!');
                return false;
            }
        }

        await this.browserPages.landgridPage?.close();

        let failedToLoad = 0;
        for (let countyDoc of countyDocs) {
            let countyMapPage = (await this.browser?.newPage()) as puppeteer.Page;

            let retryNo = 0;
            while (retryNo < 4) {
                try {
                    await this.setParamsForPage(countyMapPage);
                    await countyMapPage.goto(countyDoc.map_url, { waitUntil: 'load', timeout: 75000 });
                    break;
                } catch (err) {
                    retryNo++;
                    await countyMapPage.waitFor(1382 * retryNo);
                    await countyMapPage.close();
                    countyMapPage = (await this.browser?.newPage()) as puppeteer.Page;
                }
            }
            if (retryNo == 4) {
                console.warn(`${countyDoc.map_url} failed to load after 4 retries. Skipping this county.`);
                failedToLoad++;
                countyDoc["vacancy_records_processed"] = false;
                countyDoc["csv_download_processed"] = true;
                await countyDoc.save();
                await countyMapPage.close();
                continue;
            }

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
                await userLoginHandle[0].type(accountDocs[0].user, { delay: 273 });
                await passLoginHandle[0].type(accountDocs[0].pass, { delay: 273 });
                await countyMapPage.waitFor(481);
                await Promise.all([
                    countyMapPage.waitForNavigation({ waitUntil: 'load' }),
                    loginButtonHandle[0].click()
                ]);
            } else {
                //check if profile handle exists
                let profileHandle = await countyMapPage.$x('//*[@class="dropdown-toggle"][contains(@data-tip, "my-profile")]');
                if (!profileHandle.length) {
                    console.warn(`Problem with login!   '//*[@class="dropdown-toggle"][contains(@data-tip, "my-profile")]'   not found in page!`);
                }
            }

            await countyMapPage.waitFor(1000);
            let vacantResidential = await this.getVacantResidential(countyMapPage);
            countyDoc["vacancy_records"] = vacantResidential;
            if (vacantResidential == 0) {
                countyDoc["vacancy_records_processed"] = false;
                countyDoc["csv_download_processed"] = true;
            } else {
                countyDoc["vacancy_records_processed"] = true;
                countyDoc["csv_download_processed"] = false;
            }
            await countyDoc.save();

            await countyMapPage.waitFor(3642);
            await countyMapPage.close();
        }
        if (failedToLoad) {
            console.warn(`${failedToLoad} counties failed to load during the vacancy scan process.`);
        }
        return true;
    }

}