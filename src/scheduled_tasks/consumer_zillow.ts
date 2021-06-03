require('dotenv').config();
import db from '../models/db';
import axios from 'axios';
import puppeteer from 'puppeteer';
var addressit = require('addressit');
import { config as CONFIG } from '../config';
import { IConfigEnv } from '../iconfig';
const config: IConfigEnv = CONFIG[process.env.NODE_ENV || 'production'];
import SnsService from '../services/sns_service';
import { IPublicRecordProducer } from '../models/public_record_producer';
import { IOwnerProductProperty } from '../models/owner_product_property';
import { getTextByXpathFromPage, sleep, getFormattedDate, hasLastSaleRecordDate, resolveRecaptcha2, logOpp } from '../services/general_service';

const zillowConsumer = async (publicRecordProducer: IPublicRecordProducer, ownerProductProperty: IOwnerProductProperty) => {
    
    const launchBrowser = async (): Promise<puppeteer.Browser> => {
        return await puppeteer.launch({
            headless: config.puppeteer_headless,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            ignoreDefaultArgs: ['--disable-extensions'],
            ignoreHTTPSErrors: true,
            timeout: 60000
        });
    }

    const setParamsForPage = async (page: puppeteer.Page): Promise<void> => {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.0 Safari/537.36');
        await page.setViewport({ height: 800, width: 1200 });
        await page.setDefaultNavigationTimeout(60000);
    }

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
            await page.evaluate((el: any, captchaSolution: string) => {
                console.log('captchaSolution', captchaSolution)
                function getQueryString(name: string, url: string = '') {
                    if (!url) url = window.location.href;
                    name = name.replace(/[\[\]]/g, "\\$&");
                    var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
                        results = regex.exec(url);
                    if (!results) return null;
                    if (!results[2]) return '';
                    return decodeURIComponent(results[2].replace(/\+/g, " "));
                }        
                function handleCaptcha(response: string) {
                    var vid = getQueryString("vid"); // getQueryString is implemented below
                    var uuid = getQueryString("uuid");
                    var name = '_pxCaptcha';
                    var cookieValue =  btoa(JSON.stringify({r:response,v:vid,u:uuid}));
                    var cookieParts = [name, '=', cookieValue, '; path=/'];
                    cookieParts.push('; domain=' + window.location.hostname);
                    cookieParts.push('; max-age=10');//expire after 10 seconds
                    document.cookie = cookieParts.join('');
                    console.log('~~~~~~~~ cookie ~~~~~~~~~~');
                    console.log(document.cookie);
                    var originalURL = getOriginalUrl("url");
                    var originalHost = window.location.host;
                    var newHref = window.location.protocol + "//" + originalHost;
                    originalURL = originalURL || '/';
                    newHref = newHref + originalURL;
                    window.location.href = newHref;
                }
        
                function getOriginalUrl(name: string) {
                    var url = getQueryString(name);
                    if (!url) return null;
                    var regExMatcher = new RegExp("(([^&#@]*)|&|#|$)");
                    var matches = regExMatcher.exec(url);
                    if (!matches) return null;
                    return matches[0];
                }

                handleCaptcha(captchaSolution)
            }, recaptchaHandle[0], captchaSolution);
            console.log('~~~~~~~~~~~~~~~~~~~');
        }
        return;
    }

    // To check empty or space
    const isEmptyOrSpaces = (str: string) => {
        return str === null || str.match(/^\s*$/) !== null;
    }

    console.log('STARTED - ZILLOW!!!');
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
    console.log(`//======================================`);
    logOpp(ownerProductProperty);
    console.log(`Looking for ${street_address}, ${statecityzip}`);

    const search_value = `${street_address}, ${statecityzip}`;

    // launch browser
    const zillow_browser = await launchBrowser();
    const zillow_page = await zillow_browser.newPage();
    // get detail page response
    try {
        await setParamsForPage(zillow_page);

        await zillow_page.goto('https://www.zillow.com/');
        await Promise.race([
            zillow_page.waitForSelector('input#search-box-input'),
            zillow_page.waitForXPath('//*[@class="g-recaptcha"]')
        ]);
        const [handleCaptcha1] = await zillow_page.$x('//*[@class="g-recaptcha"]');
        if (handleCaptcha1) {
            console.log('Detected reCAPTCHA');
            await checkForRecaptcha(zillow_page);
            await zillow_page.waitForSelector('input#search-box-input');
        }
    
        await zillow_page.type('input#search-box-input', search_value, {delay: 150});
        await zillow_page.click('button#search-icon');
        // await zillow_page.goto(homedetail_url, {waitUntil: 'load'});
        await Promise.race([
            zillow_page.waitForXPath('//*[@class="g-recaptcha"]'),
            zillow_page.waitForXPath('//*[text()="Price history"]'),
            zillow_page.waitForXPath('//*[contains(text(), "We could not find this area")]'), // not found xpath
            zillow_page.waitForXPath('//div[contains(@class, "ds-price-change-address-row")]/div/h1/span[1]') // address xpath
        ]);
        const [handleCaptcha2] = await zillow_page.$x('//*[@class="g-recaptcha"]');
        if (handleCaptcha2) {
            console.log('Detected reCAPTCHA');
            await checkForRecaptcha(zillow_page);
            await Promise.race([
                zillow_page.waitForXPath('//*[text()="Price history"]'),
                zillow_page.waitForXPath('//*[contains(text(), "We could not find this area")]'), // not found xpath
                zillow_page.waitForXPath('//div[contains(@class, "ds-price-change-address-row")]/div/h1/span[1]') // address xpath
            ]);
        }

        await sleep(1000);
        let address = await getTextByXpathFromPage(zillow_page, '//div[contains(@class, "ds-price-change-address-row")]/div/h1/span[1]');
        if(address === ''){
            console.log('Not found!');
            throw 'Not found!';
        }
        address = address.replace(',','');
        console.log(`Result Address = ${address}`);
        address = address.replace(/\s+/g, '').toUpperCase();
        street_address = street_address.replace(/\s+/g, '').toUpperCase();
        console.log(address);
        console.log(street_address, address.indexOf(street_address));
        if (address.indexOf(street_address) === -1) {
            console.log('### ERROR - address doesn\'t match with search_address');
            throw '### ERROR - address doesn\'t match with search_address';
        }

        const [soldData] = await zillow_page.$x('//*[text()="Sold"]/ancestor::tr[1]');
        if (soldData) {
            let date = await getTextByXpathFromPage(zillow_page, '//*[text()="Sold"]/ancestor::tr[1]/td[1]');
            let price = await getTextByXpathFromPage(zillow_page, '//*[text()="Sold"]/ancestor::tr[1]/td[3]/span[1]');
            console.log('++++++++++ FOUND ++++++++++')
            console.log(`DATE: ${date} AMOUNT: ${price}`);
            console.log('+++++++++++++++++++++++++++');
            try {
                let property = await db.models.Property.findOne({_id: ownerProductProperty.propertyId});
                property['Last Sale Recording Date'] = getFormattedDate(new Date(date));
                property['Last Sale Amount'] = price;
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
            console.log('---- NO SALING HISTORY ----');
        }
    } catch (error) {
        console.log(error);
    }
    console.log('========================================//');

    await zillow_page.close();
    await zillow_browser.close();
    return result_flag;
};

export default zillowConsumer;