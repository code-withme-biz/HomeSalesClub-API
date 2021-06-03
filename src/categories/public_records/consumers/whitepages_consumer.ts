import puppeteer from 'puppeteer';
var addressit = require('addressit');
var parser = require('parse-address');
import { sleep } from '../../../core/sleepable';
import db, { PublicRecordOwnerProductProperty, PublicRecordProperty, PublicRecordOwner } from '../../../models/db';
const nameParsingService = require('./property_appraisers/consumer_dependencies/nameParsingServiceNew');
import { IGeoData } from '../../../models/geo_data';
import { IProperty } from '../../../models/property';
import { IOwnerProductProperty } from '../../../models/owner_product_property';
import { saveToOwnerProductPropertyByConsumer, launchBrowser, setParamsForPage, clearPage, randomSleep, logOpp, resolveHCaptcha } from '../../../services/general_service';

// config
import { config as CONFIG } from '../../../config';
import { IConfigEnv } from '../../../iconfig';
const config: IConfigEnv = CONFIG[process.env.NODE_ENV || 'production'];


const whitepagesConsumer = async(ownerProductProperty: IOwnerProductProperty, whitepages_page: puppeteer.Page) => {

    const states: any = {
        'AZ': 'Arizona', 
        'AL': 'Alabama', 
        'AK': 'Alaska', 
        'AR': 'Arkansas', 
        'CA': 'California', 
        'CO': 'Colorado', 
        'CT': 'Connecticut', 
        'DE': 'Delaware', 
        'FL': 'Florida', 
        'GA': 'Georgia', 
        'HI': 'Hawaii', 
        'ID': 'Idaho', 
        'IL': 'Illinois', 
        'IN': 'Indiana', 
        'IA': 'Iowa', 
        'KS': 'Kansas', 
        'KY': 'Kentucky', 
        'LA': 'Louisiana', 
        'ME': 'Maine', 
        'MD': 'Maryland', 
        'MA': 'Massachusetts', 
        'MI': 'Michigan', 
        'MN': 'Minnesota', 
        'MS': 'Mississippi', 
        'MO': 'Missouri', 
        'MT': 'Montana', 
        'NE': 'Nebraska', 
        'NV': 'Nevada', 
        'NH': 'New Hampshire', 
        'NJ': 'New Jersey', 
        'NM': 'New Mexico', 
        'NY': 'New York', 
        'NC': 'North Carolina', 
        'ND': 'North Dakota', 
        'OH': 'Ohio', 
        'OK': 'Oklahoma', 
        'OR': 'Oregon', 
        'PA': 'Pennsylvania', 
        'RI': 'Rhode Island', 
        'SC': 'South Carolina', 
        'SD': 'South Dakota', 
        'TN': 'Tennessee', 
        'TX': 'Texas', 
        'UT': 'Utah', 
        'VT': 'Vermont', 
        'VA': 'Virginia', 
        'WA': 'Washington', 
        'WV': 'West Virginia', 
        'WI': 'Wisconsin', 
        'WY': 'Wyoming', 
    };

    // To check empty or space
    const isEmptyOrSpaces = (str: string) => {
        return str === null || str.match(/^\s*$/) !== null;
    }

    const getTextByXpathFromPage = async (page: puppeteer.Page, xPath: string) => {
        const [elm] = await page.$x(xPath);
        if (elm == null) {
            return '';
        }
        let text = await page.evaluate(j => j.innerText, elm);
        return text.replace(/\n/g, ' ');
    }

    const getInnerTextByXpathFromPage = async (page: puppeteer.Page, xPath: string): Promise<string> => {
        const [elm] = await page.$x(xPath);
        if (elm == null) {
            return '';
        }
        let text = await page.evaluate(j => j.innerText, elm);
        return text.trim();
    }

    const getStreetAddress = (full_address:string) => {
        const parsed = addressit(full_address);
        let street_address = (parsed.number ? parsed.number : '') + ' ' + (parsed.street ? parsed.street : '') + ' ' + (parsed.unit ? '#'+parsed.unit : '');
        street_address = street_address.replace(/\s+/, ' ').trim();
        return street_address;
    }

    const parseOwnerName = (name_str: string): any[] => {
        const result: any = {};
  
        let parserName = nameParsingService.newParseNameFML(name_str);
  
        result['full_name'] = parserName.fullName;
        result['first_name'] = parserName.firstName;
        result['last_name'] = parserName.lastName;
        result['middle_name'] = parserName.middleName;
        result['suffix'] = parserName.suffix;
        return result;
    }

    const normalizeStringForMongo = (sourceString: string) => {
        return sourceString.toLocaleLowerCase().replace('_', '-').replace(/[^A-Z\d\s\-]/ig, '').replace(/\s+/g, '-');
    }

    const checkForAccessDenied = async (page: puppeteer.Page) => {
        const [access_denied] = await page.$x('//*[contains(text(), "Access denied")]');
        console.log('------ checking for access denied ------');
        if (access_denied) {
            console.log('----- noticed access denied -----');
            return true;
        }
        return false;
    }

    let searchBy = '';
    let last_saved_opp_id = ownerProductProperty._id;

    // launch browser
    await clearPage(whitepages_page);
    await setParamsForPage(whitepages_page);

    try {       
        logOpp(ownerProductProperty);
        let owner = ownerProductProperty.ownerId;
        let property = ownerProductProperty.propertyId;
        let county = owner ? owner['County'] : property['County'];
        let state =  owner ? owner['Property State'] : property['Property State'];
        let search_value = '';
        
        if (!ownerProductProperty.ownerId && !ownerProductProperty.propertyId) {
            return false;
        }

        let url = '';
        if (ownerProductProperty.ownerId) {
            searchBy = 'name';
            let name = `${owner['First Name'] || ''} ${owner['Middle Name'] || ''} ${owner['Last Name'] || ''}`;
            name = name.trim().replace(/\s+/g, ' ');
            if (name === '') name = owner['Full Name'].trim().replace(/\s+/g, ' ');
            name = name.split(' ').map((s:string)=>s.charAt(0).toUpperCase()+s.slice(1)).join('-');
            search_value = name;
            let location = owner['Property State'].toUpperCase().trim();
            url = `https://www.whitepages.com/name/${name}/${location}`;
            console.log(`Looking for name - ${search_value}`);
            console.log(url);
        }
        else if (ownerProductProperty.propertyId) {
            searchBy = 'address';
            let address = property['Property Address'];
            const parseaddr = getStreetAddress(`${property['Property Address']}, ${property['Property City'] || ''} ${property['Property State'] || ''} ${property['Property Zip'] || ''}`);
            if(!isEmptyOrSpaces(parseaddr)){
                address = parseaddr;
            }
            address = address.trim().replace(/\s+/g, '-');
            search_value = address;
            let location = property['Property City'];
            if (location) {
                location = location.replace(/\s+/g, ' ').trim();
                location = location.split(' ').map((s:string)=>s.charAt(0).toUpperCase()+s.slice(1)).join('-');
                location = `${location}-${property['Property State'].toUpperCase()}`;
            } else {
                location = property['Property State'].toUpperCase();
            }
            url = `https://www.whitepages.com/address/${address}/${location}`;
            console.log(`Looking for address - ${search_value}`);
            console.log(url);
        }
        
        if (url === '') {
            return false;
        }
        await setParamsForPage(whitepages_page);
        await whitepages_page.goto(url, {waitUntil: 'networkidle2'});
        let [checkHCaptcha] = await whitepages_page.$x('//form[@id="challenge-form"]');
        if(checkHCaptcha){
            let [keyHandle] = await whitepages_page.$x('//iframe[contains(@src, "hcaptcha")]');
            let src = await keyHandle.evaluate(el => el.getAttribute('src'));
            let siteKey = src?.split('sitekey=')[1].trim();
            let captchaSolution: any = await resolveHCaptcha(siteKey, whitepages_page.url());
            let recaptchaHandle = await whitepages_page.$x('//*[contains(@id, "h-captcha-response")]');
            await recaptchaHandle[0].evaluate((elem, captchaSolution) => elem.innerHTML = captchaSolution, captchaSolution);
            await Promise.all([
                whitepages_page.evaluate(() => {
                    // @ts-ignore
                    document.querySelector('#challenge-form').submit()
                }),
                whitepages_page.waitForNavigation()
            ]);
            console.log("Done.");
        }
        if (await checkForAccessDenied(whitepages_page)) {
            return false;
        }

        const result_handle = await Promise.race([
            whitepages_page.waitForXPath('//*[contains(text(), "Residents")]'),
            whitepages_page.waitForXPath('//*[contains(text(), "Sorry")]'),
            whitepages_page.waitForXPath('//*[contains(text(),"View Details")]')
        ]);
        const result_text = await result_handle.evaluate(el => el.textContent) || '';
        if (result_text.indexOf('Sorry') > -1 || result_text === '') {
            console.log('No results');
            return false;
        }
        console.log(`=== ${result_text} ===`);

        let resultOwners = [];
        if (result_text.indexOf('Residents') > -1) {
            const residents = await whitepages_page.$x('//*[contains(@class, "resident-card")]');
            for (const resident of residents) {
                const url = await resident.evaluate((el:any) => el.href);
                let full_name: any = await resident.evaluate(el => el.children[0].children[0].textContent) || '';
                full_name = full_name.trim().replace(/\s+|\n/gm, ' ').split(' Age ')[0].trim();
                console.log('FULL_NAME = ', full_name);
                let yearBuilt = await getTextByXpathFromPage(whitepages_page, '//*[contains(text(), "Year Built")]/following-sibling::p[1]');
                let owner_name: any = parseOwnerName(full_name);
                let dataFromPropertyAppraisers = {
                    'Full Name': owner_name['full_name'],
                    'First Name': owner_name['first_name'],
                    'Last Name': owner_name['last_name'],
                    'Middle Name': owner_name['middle_name'],
                    'Name Suffix': owner_name['suffix'],
                    'Mailing Care of Name': '',
                    'Mailing Address': '',
                    'Mailing Unit #': '',
                    'Mailing City': '',
                    'Mailing State': '',
                    'Mailing Zip': '',
                    'Phone': '',
                    'Property Address': property['Property Address'],
                    'Property Unit #': '',
                    'Property City': property['Property City'],
                    'Property State': property['Property State'],
                    'Property Zip': property['Property Zip'],
                    'County': county,
                    'Owner Occupied': false,
                    'yearBuilt': yearBuilt
                };
                console.log(dataFromPropertyAppraisers);
                last_saved_opp_id = await saveToOwnerProductPropertyByConsumer(ownerProductProperty, dataFromPropertyAppraisers, searchBy);
                break;
            }
        } else {
            const url = await whitepages_page.url();
            let name = search_value.toUpperCase();
            resultOwners.push({url, name, hasProperty: false});

            await randomSleep(1000, 3000);

            for (const resultOwner of resultOwners) {
                let flag = false;
                console.log(`** checking for ${resultOwner.name} - ${resultOwner.url}`)
                await setParamsForPage(whitepages_page);
                await whitepages_page.goto(resultOwner.url, {waitUntil: 'load'});
                if (await checkForAccessDenied(whitepages_page)) {
                    return false;
                }
                await randomSleep(1000, 3000);
                const name_detail_handles = await whitepages_page.$x('//a[contains(@href, "/name/")][contains(@class, "card-link")]');
                for (const name_detail_handle of name_detail_handles) {
                    await randomSleep(1000, 3000);
                    try {
                        const link = await name_detail_handle.evaluate((el:any)=>el.href) || '////';
                        let link_splited = link.split('/');
                        let name = link_splited[4].toUpperCase();
                        name = name.replace(/-/g, ' ');
                        let name_regexp = `${resultOwner.name.toUpperCase().split('-').join(',?(\\s+)?(\\w+)?(\\s+)?')}|${resultOwner.name.toUpperCase().split('-').reverse().join(',?(\\s+)?(\\w+)?(\\s+)?')}`;

                        console.log(`Name = ${name} <| = |> ${resultOwner.name}`)
                        let location = link_splited[5];
                        const regexp = new RegExp(name_regexp);
                        if (!regexp.exec(name.toUpperCase())) continue;
                        let city = location.slice(0, location.length-3).replace(/-/g, ' ').toLowerCase();
                        city = city.charAt(0).toUpperCase()+city.slice(1);
                        const geoData: IGeoData = await db.models.GeoData.findOne({ state: states[state.toUpperCase()], city: city });
                        if (!geoData) {
                            console.log(`Not found county - ${city} ${states[state.toUpperCase()]} <| = |> ${county}`);
                            continue;
                        }
                        const county1 = normalizeStringForMongo(geoData.county);
                        console.log('County = ', county1, county);
                        if (county !== county1) continue;

                        // found
                        let detailPage = await whitepages_page.browser().newPage()!;
                        try {
                            await clearPage(whitepages_page);
                            await setParamsForPage(whitepages_page);
                            await detailPage.goto(link, {waitUntil: 'load'});
                            if (await checkForAccessDenied(detailPage)) {
                                await detailPage.close();
                                return false;
                            }
                            // --- name
                            let full_name = await getTextByXpathFromPage(detailPage, '//*[@id="person-details"]//h1');
                            console.log('FULL_NAME = ', full_name);
                            let owner_name: any = parseOwnerName(full_name);
                            // --- mailing address
                            let mailing_address_full: any = await getInnerTextByXpathFromPage(detailPage, '//*[@id="current-address"]//*[contains(@href, "/address/")]');
                            mailing_address_full = mailing_address_full.split('\n').map((s:string)=>s.trim()).filter((s:string)=>s!=='');
                            let mailing_address = mailing_address_full[0];
                            let mailing_zip = '';
                            let mailing_state = '';
                            let mailing_city = '';
                            let mailing_address_parsed = parser.parseLocation(mailing_address_full.join(' '));
                            if(mailing_address_parsed){
                                mailing_zip = mailing_address_parsed.zip ? mailing_address_parsed.zip : '';
                                mailing_state = mailing_address_parsed.state ? mailing_address_parsed.state : '';
                                mailing_city = mailing_address_parsed.city ? mailing_address_parsed.city : '';
                            }
                            console.log('MAILING_ADDRESS = ', mailing_address);
                            // --- phone number
                            const phone_number = await getTextByXpathFromPage(detailPage, '//*[@id="details-layout"]/div[1]//*[contains(@href, "/phone")]') || '';
                            let dataFromPropertyAppraisers = {
                                'Full Name': owner_name['full_name'],
                                'First Name': owner_name['first_name'],
                                'Last Name': owner_name['last_name'],
                                'Middle Name': owner_name['middle_name'],
                                'Name Suffix': owner_name['suffix'],
                                'Mailing Care of Name': '',
                                'Mailing Address': mailing_address,
                                'Mailing Unit #': '',
                                'Mailing City': mailing_city,
                                'Mailing State': mailing_state,
                                'Mailing Zip': mailing_zip,
                                'Phone': phone_number,
                                'Property Address': resultOwner.hasProperty ? property['Property Address'] : mailing_address,
                                'Property Unit #': '',
                                'Property City': resultOwner.hasProperty ? property['Property City'] : mailing_city,
                                'Property State': resultOwner.hasProperty ? property['Property State'] : mailing_state,
                                'Property Zip': resultOwner.hasProperty ? property['Property Zip'] : mailing_zip,
                                'County': county,
                                'Owner Occupied': resultOwner.hasProperty ? property['Property Address']===mailing_address : true
                            };
                            console.log(dataFromPropertyAppraisers);
                            last_saved_opp_id = await saveToOwnerProductPropertyByConsumer(ownerProductProperty, dataFromPropertyAppraisers, searchBy);
                            flag = true;
                        } catch (error) {
                            console.log('[ERROR] - @@@');
                            console.log(error);
                        }
                        await detailPage.close();
                        if (flag) break;
                    } catch (error) {
                        console.log('[ERROR] - @@');
                        console.log(error);
                    }
                }
            }
        }
    } catch (error) {
        console.log('[ERROR] - @');
        console.log(error);
    }
    return last_saved_opp_id;
};

export default whitepagesConsumer;