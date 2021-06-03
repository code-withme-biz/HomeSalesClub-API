// NEED TO RESOLVE CAPTCH



// import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

// import puppeteer from 'puppeteer';
// import db from '../../../../../../models/db';

// export default class CivilProducer extends AbstractProducer {
//     browser: puppeteer.Browser | undefined;
//     browserPages = {
//         generalInfoPage: undefined as undefined | puppeteer.Page
//     };
//     urls = {
//         generalInfoPage: 'https://countyfusion5.kofiletech.us/index.jsp'
//     }

//     xpaths = {
//         isPAloaded: '//a[contains(text(), "Preble")]'
//     }
// constructor(publicRecordProducer: IPublicRecordProducer) {
//   // @ts-ignore
//   super();
//   this.publicRecordProducer = publicRecordProducer;
//   this.stateToCrawl = this.publicRecordProducer?.state || '';
// }
//     async init(): Promise<boolean> {
//         this.browser = await this.launchBrowser();
//         this.browserPages.generalInfoPage = await this.browser.newPage();
//         await this.setParamsForPage(this.browserPages.generalInfoPage);
//         try {
//             await this.browserPages.generalInfoPage.goto(this.urls.generalInfoPage, { waitUntil: 'load' });
//             return true;
//         } catch (err) {
//             console.warn(err);
//             return false;
//         }
//     }

//     discriminateAndRemove(name: string): any {
//         const companyIdentifiersArray = ['GENERAL', 'TRUSTEE', 'TRUSTEES', 'INC', 'ORGANIZATION', 'CORP', 'CORPORATION', 'LLC', 'MOTORS', 'BANK', 'UNITED', 'CO', 'COMPANY', 'FEDERAL', 'MUTUAL', 'ASSOC', 'AGENCY', 'OF', 'SECRETARY', 'DEVELOPMENT', 'INVESTMENTS', 'HOLDINGS', 'ESTATE', 'LLP', 'LP', 'TRUST', 'LOAN', 'CONDOMINIUM', 'CHURCH', 'CITY', 'CATHOLIC', 'D/B/A', 'COCA COLA', 'LTD', 'CLINIC', 'TODAY', 'PAY', 'CLEANING', 'COSMETIC', 'CLEANERS', 'FURNITURE', 'DECOR', 'FRIDAY HOMES', 'SAVINGS', 'PROPERTY', 'PROTECTION', 'ASSET', 'SERVICES', 'L L C', 'NATIONAL', 'ASSOCIATION', 'MANAGEMENT', 'PARAGON', 'MORTGAGE', 'CHOICE', 'PROPERTIES', 'J T C', 'RESIDENTIAL', 'OPPORTUNITIES', 'FUND', 'LEGACY', 'SERIES', 'HOMES', 'LOAN'];
//         const removeFromNamesArray = ['ET', 'AS', 'DECEASED', 'DCSD', 'CP\/RS', 'JT\/RS', 'esq', 'esquire', 'jr', 'jnr', 'sr', 'snr', '2', 'ii', 'iii', 'iv', 'md', 'phd', 'j.d.', 'll.m.', 'm.d.', 'd.o.', 'd.c.', 'p.c.', 'ph.d.', '&'];
//         const companyRegexString = `\\b(?:${companyIdentifiersArray.join('|')})\\b`;
//         const removeFromNameRegexString = `^(.*?)\\b(?:${removeFromNamesArray.join('|')})\\b.*?$`;
//         const companyRegex = new RegExp(companyRegexString, 'i');
//         const removeFromNamesRegex = new RegExp(removeFromNameRegexString, 'i');
//         let isCompanyName = name.match(companyRegex);
//         if (isCompanyName) {
//             return {
//                 type: 'company',
//                 name: name
//             }
//         }

//         let cleanName = name.match(removeFromNamesRegex);
//         if (cleanName) {
//             name = cleanName[1];
//         }
//         return {
//             type: 'person',
//             name: name
//         }
//     }

//     async read(): Promise<boolean> {
//         try {
//             await this.browserPages.generalInfoPage?.waitForXPath(this.xpaths.isPAloaded);
//             return true;
//         } catch (err) {
//             console.warn('Problem loading civil producer page.');
//             return false;
//         }
//     }

//     // To check empty or space
//     isEmptyOrSpaces(str: string) {
//         return str === null || str.match(/^\s*$/) !== null;
//     }

//     getSuffix(name: string): any {
//         const suffixList = ['esq', 'esquire', 'jr', 'jnr', 'sr', 'snr', '2', 'ii', 'iii', 'iv', 'md', 'phd', 'j.d.', 'll.m.', 'm.d.', 'd.o.', 'd.c.', 'p.c.', 'ph.d.'];
//         name = name.toLowerCase();
//         for (let suffix of suffixList) {
//             let regex = new RegExp(' ' + suffix, 'gm');
//             if (name.match(regex)) {
//                 return suffix;
//             }
//         }
//         return '';
//     }

//     sleep(ms: number) {
//         return new Promise((resolve) => {
//             setTimeout(resolve, ms);
//         });
//     }

//     parseName(name: string) {
//         let result;
//         const companyIdentifiersArray = [
//             'GENERAL', 'TRUSTEE', 'TRUSTEES', 'INC', 'ORGANIZATION',
//             'CORP', 'CORPORATION', 'LLC', 'MOTORS', 'BANK', 'UNITED',
//             'CO', 'COMPANY', 'FEDERAL', 'MUTUAL', 'ASSOC', 'AGENCY',
//             'PARTNERSHIP', 'CHURCH', 'CITY', 'TRUST', 'SECRETARY',
//             'DEVELOPMENT', 'INVESTMENT', 'ESTATE', 'LLP', 'LP', 'HOLDINGS',
//             'LOAN', 'CONDOMINIUM', 'CATHOLIC', 'INVESTMENTS', 'D/B/A', 'COCA COLA',
//             'LTD', 'CLINIC', 'TODAY', 'PAY', 'CLEANING', 'COSMETIC', 'CLEANERS',
//             'FURNITURE', 'DECOR', 'FRIDAY HOMES', 'MIDLAND', 'SAVINGS', 'PROPERTY',
//             'ASSET', 'PROTECTION', 'SERVICES', 'TRS', 'ET AL', 'L L C', 'NATIONAL',
//             'ASSOCIATION', 'MANAGMENT', 'PARAGON', 'MORTGAGE', 'CHOICE', 'PROPERTIES',
//             'J T C', 'RESIDENTIAL', 'OPPORTUNITIES', 'FUND', 'LEGACY', 'SERIES',
//             'HOMES', 'LOAN', 'FAM', 'PRAYER'
//         ];
//         const suffixNamesArray = ['I', 'II', 'III', 'IV', 'V', 'ESQ', 'JR', 'SR'];
//         const suffixNamesRegex = new RegExp(`\\b(?:${suffixNamesArray.join('|')})\\b`, 'i');

//         const companyRegexString = `\\b(?:${companyIdentifiersArray.join('|')})\\b`;
//         const companyRegex = new RegExp(companyRegexString, 'i');

//         if (name.match(companyRegex)) {
//             result = {
//                 firstName: '',
//                 lastName: '',
//                 middleName: '',
//                 fullName: name.trim(),
//                 suffix: ''
//             };
//             return result;
//         }
//         const suffix = name.match(suffixNamesRegex);
//         name = name.replace(suffixNamesRegex, '');
//         name = name.replace(/  +/g, ' ');
//         if (name.indexOf(',') > -1) {
//             let fullName = name.trim();
//             let lastName = name.slice(0, name.indexOf(',')).trim();
//             let names = name.slice(name.indexOf(',')+1).trim().split(' ');
//             let firstName = names[0];
//             let middleName = names.length > 1 ? names.slice(1).join(' ').trim() : '';
//             if (middleName !== '' && firstName === '') {
//                 firstName = middleName;
//                 middleName = '';
//             }
//             result = {
//                 firstName,
//                 lastName,
//                 middleName,
//                 fullName,
//                 suffix: suffix ? suffix[0] : ''
//             }
//         }
//         else {
//             let ownersNameSplited: any = name.split(' ');
//             ownersNameSplited = ownersNameSplited.filter((val: any) => val !== '');
//             const defaultLastName = ownersNameSplited[ownersNameSplited.length - 1].trim();
//             ownersNameSplited.pop();
//             try {
//                 const firstName = ownersNameSplited[0].trim();
//                 ownersNameSplited.shift();
//                 const middleName = ownersNameSplited.join(' ');
//                 const fullName = `${defaultLastName}, ${firstName} ${middleName} ${suffix ? suffix[0] : ''}`;
//                 result = {
//                     firstName,
//                     lastName: defaultLastName,
//                     middleName,
//                     fullName: fullName.trim(),
//                     suffix: suffix ? suffix[0] : ''
//                 }
//             } catch (e) {
//             }
//         }
//         if (!result) {
//             result = {
//                 firstName: '',
//                 lastName: '',
//                 middleName: '',
//                 fullName: name.trim(),
//                 suffix: ''
//             };
//         }
//         return result;
//     }

//     // This is main function
//     async parseAndSave(): Promise<boolean> {
//         const civilUrl: string = this.urls.generalInfoPage;
//         let page = this.browserPages.generalInfoPage!;

//         try {
//             // get date range
//             let dateRange = await this.getDateRange('Ohio', 'Preble');
//             let fromDate = dateRange.from;
//             let toDate = dateRange.to;
//             let countRecords = 0;

            
//             let fromDateString = this.getFormattedDate(fromDate);
//             let toDateString = this.getFormattedDate(toDate);
            
//             // choose county
//             const [county_handle] = await page.$x('//a[contains(text(), "Preble")]');
//             await Promise.all([
//                 county_handle.click(),
//                 page.waitForNavigation()
//             ]);
//             await page.waitFor(1000);

//             // click login as public
//             const [login_as_public] = await page.$x('//input[contains(@value, "Login as Guest")]');
//             await Promise.all([
//                 login_as_public.click(),
//                 page.waitForNavigation()
//             ]);

//             // accept disclaimer
//             await page.waitForSelector('iframe[name="bodyframe"]');
//             let accept_button: any = await page.$('iframe[name="bodyframe"]');
//             accept_button = await accept_button.contentFrame();
//             await accept_button.waitForSelector('input#accept');
//             accept_button = await accept_button.$('input#accept');
//             await Promise.all([
//                 accept_button.click(),
//                 page.waitForNavigation()
//             ]);
//             await page.waitFor(1000);
            
//             // click Search Public Records
//             await page.waitForXPath('//iframe[@name="bodyframe"]', {visible: true});
//             let [body_frame]: any = await page.$x('//iframe[@name="bodyframe"]');
//             body_frame = await body_frame.contentFrame();
//             await page.waitFor(3000);
//             await body_frame.waitForXPath('//i[contains(@class, "fa-search")]/ancestor::tr[1]', {visible: true});
//             const [search_public_record] = await body_frame.$x('//i[contains(@class, "fa-search")]/ancestor::tr[1]');
//             let dynSearch_frame: any;
//             let retries = 0;
//             while (true) {
//                 await search_public_record.click();
//                 await page.waitForSelector('iframe[name="bodyframe"]', {visible: true});
//                 body_frame = await page.$('iframe[name="bodyframe"]');
//                 body_frame = await body_frame.contentFrame();

//                 try {
//                     await body_frame.waitForSelector('iframe[name="dynSearchFrame"]', {visible: true});
//                 } catch {
//                     retries++;
//                     console.log(`retrying...${retries}`);
//                     if (retries > 3) return false;
//                     await page.waitFor(1000);
//                     continue;
//                 }
//                 dynSearch_frame = await body_frame.$('iframe[name="dynSearchFrame"]');
//                 dynSearch_frame = await dynSearch_frame.contentFrame();
//                 break;
//             }

//             await dynSearch_frame.waitForSelector('iframe[name="criteriaframe"]', {visible: true});
//             let criteria_frame: any = await dynSearch_frame.$('iframe[name="criteriaframe"]');
//             criteria_frame = await criteria_frame.contentFrame();
            
//             // input date range
//             await criteria_frame.waitForXPath('//span[contains(@class, "datebox")]/input[contains(@class, "textbox-text")]', {visible: true});
//             const inputboxes = await criteria_frame.$x('//span[contains(@class, "datebox")]/input[contains(@class, "textbox-text")]');
//             await page.waitFor(1000);
//             await inputboxes[0].focus();
//             await inputboxes[0].type(fromDateString, {delay: 100});
//             await inputboxes[1].focus();
//             await inputboxes[1].type(toDateString, {delay: 100});
//             let [search_button]: any = await dynSearch_frame.$x(`//a[contains(@onclick, "parent.executeSearchCommand ('search')")]`);
//             await search_button.click();

//             let nextPage = true;
//             while (nextPage) {
//                 await page.waitForXPath('//iframe[@name="bodyframe"]', {visible: true});
//                 let [body_frame]: any = await page.$x('//iframe[@name="bodyframe"]');
//                 body_frame = await body_frame.contentFrame();

//                 try{
//                     await body_frame.waitForXPath('//iframe[@name="progressFrame"]', {hidden: true});
//                 } catch (error) {
//                     await body_frame.waitForXPath('//iframe[@name="progressFrame"]', {hidden: true});
//                 }

//                 try {
//                     await body_frame.waitForXPath('//iframe[@name="resultFrame"]', {visible: true});
//                 } catch (error) {
//                     console.log('Not found');
//                     break;
//                 }

//                 await body_frame.waitForXPath('//iframe[@name="resultFrame"]', {visible: true});
//                 let [result_frame]: any = await body_frame.$x('//iframe[@name="resultFrame"]');
//                 result_frame = await result_frame.contentFrame();
        
//                 await result_frame.waitForXPath('//iframe[@name="resultListFrame"]', {visible: true});
//                 let [result_list_frame]: any = await result_frame.$x('//iframe[@name="resultListFrame"]');
//                 result_list_frame = await result_list_frame.contentFrame();

//                 await result_list_frame.waitForXPath('//table[contains(@class, "datagrid-btable")]/tbody/tr/td/table/tbody/tr', {visible: true});
//                 let resultRows = await result_list_frame.$x('//table[contains(@class, "datagrid-btable")]/tbody/tr/td/table/tbody/tr');

//                 for (const row of resultRows) {
//                     let names = await result_list_frame.evaluate((el: any) => el.children[7].innerText.trim(), row);
//                     console.log(names);
//                     names = names.split('\n');
//                     names = names.filter((name:string) => name.trim() !== '');
//                     let recordDate = await result_list_frame.evaluate((el: any) => el.children[10].textContent.trim(), row);
//                     let caseType = await result_list_frame.evaluate((el: any) => el.children[5].textContent.trim(), row);

//                     let practiceType = 'other-civil';
//                     if (caseType.match(/foreclosure/i)) {
//                         practiceType = 'preforeclosure';
//                     } else if (caseType.match(/eviction/i)) {
//                         practiceType = 'eviction';
//                     } else if (caseType.match(/inheritance/i)) {
//                         practiceType = 'inheritance';
//                     } else if (caseType.match(/probate/i)) {
//                         practiceType = 'probate';
//                     } else if (caseType.match(/hoa.*lien/i)) {
//                         practiceType = 'hoa-lien';
//                     } else if (caseType.match(/irs.*lien/i)) {
//                         practiceType = 'irs-lien';
//                     } else if (caseType.match(/mortgage.*lien/i)) {
//                         practiceType = 'mortgage-lien';
//                     } else if (caseType.match(/pre.*inheritance/i)) {
//                         practiceType = 'pre-inheritance';
//                     } else if (caseType.match(/pre.*probate/i)) {
//                         practiceType = 'pre-probate';
//                     } else if (caseType.match(/divorce/i)) {
//                         practiceType = 'divorce';
//                     } else if (caseType.match(/tax.*delinquency/i)) {
//                         practiceType = 'tax-delinquency';
//                     } else if (caseType.match(/code.*violation/i)) {
//                         practiceType = 'code-violation';
//                     } else if (caseType.match(/marriage/i)) {
//                         practiceType = 'marriage';
//                     } else if (caseType.match(/enforce.*lien/i)) {
//                         practiceType = 'hoa-lien';
//                     } else if (caseType.match(/injury/i)) {
//                         practiceType = 'personal-injury';
//                     } else if (caseType.match(/debt/i)) {
//                         practiceType = 'debt';
//                     }

//                     for (const name of names) {
//                         if (this.isEmptyOrSpaces(name!)) {
//                             continue;
//                         }
//                         const productName = `/ohio/preble/${practiceType}`;
//                         const prod = await db.models.Product.findOne({ name: productName }).exec();
//                         const parseName: any = this.newParseName(name!.trim());
                        // if (parseName.type === 'COMPANY' || parseName.fullName === '') continue;
//                         const data = {
//                             'Property State': 'OH',
//                             'County': 'Preble',
//                             'First Name': parseName.firstName,
//                             'Last Name': parseName.lastName,
//                             'Middle Name': parseName.middleName,
//                             'Name Suffix': parseName.suffix,
//                             'Full Name': parseName.fullName,
//                             "vacancyProcessed": false,
//                             fillingDate: recordDate,
//                             "productId": prod._id
//                         };
//                         if (await this.civilAndLienSaveToNewSchema(data))
//                             countRecords += 1;
//                     }
//                 }
                                    
//                 await result_frame.waitForXPath('//iframe[@name="subnav"]');
//                 let [subnav_frame]: any = await result_frame.$x('//iframe[@name="subnav"]');
//                 subnav_frame = await subnav_frame.contentFrame();

//                 let nextPageEnabled = await subnav_frame.$x(`//a[contains(@onclick, "parent.navigateResults('next')")]`);
//                 if (nextPageEnabled.length === 0) {
//                     nextPage = false;
//                 } else {
//                     let nextPageButton = await subnav_frame.$x(`//a[contains(@onclick, "parent.navigateResults('next')")]`);
//                     await nextPageButton[0].click();
//                     await this.sleep(5000);
//                 }
//             }
            
//             console.log(countRecords);
//             await AbstractProducer.sendMessage('Preble', 'Ohio', countRecords, 'Civil & Lien');
//         } catch (error) {
//             console.log(error);
//             return false;
//         }
//         return true;
//     }
// }