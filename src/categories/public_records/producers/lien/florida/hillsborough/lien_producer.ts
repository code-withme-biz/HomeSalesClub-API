import AbstractProducer from '../../../abstract_producer';
import puppeteer from 'puppeteer';
import axios from 'axios';
import moment from 'moment';
import db from '../../../../../../models/db';

export default class CivilProducer extends AbstractProducer {
    browser: puppeteer.Browser | undefined;
    browserPages = {
        generalInfoPage: undefined as undefined | puppeteer.Page
    };
    urls = {
        generalInfoPage: 'https://pubrec6.hillsclerk.com/ORIPublicAccess/customSearch.html'
    }

    xpaths = {
        isPAloaded: '//label[contains(., "Person Type")]'
    }

    async init(): Promise<boolean> {
        this.browser = await this.launchBrowser();
        this.browserPages.generalInfoPage = await this.browser.newPage();
        await this.setParamsForPage(this.browserPages.generalInfoPage);
        try {
            await this.browserPages.generalInfoPage.goto(this.urls.generalInfoPage, { waitUntil: 'load' });
            return true;
        } catch (err) {
            console.warn(err);
            return false;
        }
    }

    discriminateAndRemove(name: string) : any {
        const companyIdentifiersArray = [ 'GENERAL', 'TRUSTEE', 'TRUSTEES', 'INC', 'ORGANIZATION', 'CORP', 'CORPORATION', 'LLC', 'MOTORS', 'BANK', 'UNITED', 'CO', 'COMPANY', 'FEDERAL', 'MUTUAL', 'ASSOC', 'AGENCY' , 'OF' , 'SECRETARY' , 'DEVELOPMENT' , 'INVESTMENTS', 'HOLDINGS', 'ESTATE', 'LLP', 'LP', 'TRUST', 'LOAN', 'CONDOMINIUM', 'CHURCH', 'CITY', 'CATHOLIC', 'D/B/A', 'COCA COLA', 'LTD', 'CLINIC', 'TODAY', 'PAY', 'CLEANING', 'COSMETIC', 'CLEANERS', 'FURNITURE', 'DECOR', 'FRIDAY HOMES', 'SAVINGS', 'PROPERTY', 'PROTECTION', 'ASSET', 'SERVICES', 'L L C', 'NATIONAL', 'ASSOCIATION', 'MANAGEMENT', 'PARAGON', 'MORTGAGE', 'CHOICE', 'PROPERTIES', 'J T C', 'RESIDENTIAL', 'OPPORTUNITIES', 'FUND', 'LEGACY', 'SERIES', 'HOMES', 'LOAN'];
        const removeFromNamesArray = ['ET', 'AS', 'DECEASED', 'DCSD', 'CP\/RS', 'JT\/RS', 'esq','esquire','jr','jnr','sr','snr','2','ii','iii','iv','md','phd','j.d.','ll.m.','m.d.','d.o.','d.c.','p.c.','ph.d.', '&'];
        const companyRegexString = `\\b(?:${companyIdentifiersArray.join('|')})\\b`;
        const removeFromNameRegexString = `^(.*?)\\b(?:${removeFromNamesArray.join('|')})\\b.*?$`;
        const companyRegex = new RegExp(companyRegexString, 'i');
        const removeFromNamesRegex = new RegExp(removeFromNameRegexString, 'i');
        let isCompanyName = name.match(companyRegex);
        if (isCompanyName) {
            return {
                type: 'company',
                name: name
            }
        }
        
        let cleanName = name.match(removeFromNamesRegex);
        if (cleanName) {
            name = cleanName[1];
        }
        return {
            type: 'person',
            name: name
        }
    }

    async read(): Promise<boolean> {
        try {
            await this.browserPages.generalInfoPage?.waitForXPath(this.xpaths.isPAloaded);
            return true;
        } catch (err) {
            console.warn('Problem loading civil producer page.');
            return false;
        }
    }

    // To check empty or space
    isEmptyOrSpaces(str: string){
        return str === null || str.match(/^\s*$/) !== null;
    }

    getSuffix(name: string) : any {
        const suffixList = ['esq','esquire','jr','jnr','sr','snr','2','ii','iii','iv','md','phd','j.d.','ll.m.','m.d.','d.o.','d.c.','p.c.','ph.d.'];
        name = name.toLowerCase();
        for(let suffix of suffixList){
            let regex = new RegExp(' '+suffix, 'gm');
            if (name.match(regex)){
                return suffix;
            }
        }
        return '';
    }

    parseName(name: string) {
        let result;
        const companyIdentifiersArray = [
            'GENERAL', 'TRUSTEE', 'TRUSTEES', 'INC', 'ORGANIZATION',
            'CORP', 'CORPORATION', 'LLC', 'MOTORS', 'BANK', 'UNITED',
            'CO', 'COMPANY', 'FEDERAL', 'MUTUAL', 'ASSOC', 'AGENCY',
            'PARTNERSHIP', 'CHURCH', 'CITY', 'TRUST', 'SECRETARY',
            'DEVELOPMENT', 'INVESTMENT', 'ESTATE', 'LLP', 'LP', 'HOLDINGS',
            'LOAN', 'CONDOMINIUM', 'CATHOLIC', 'INVESTMENTS', 'D/B/A', 'COCA COLA',
            'LTD', 'CLINIC', 'TODAY', 'PAY', 'CLEANING', 'COSMETIC', 'CLEANERS',
            'FURNITURE', 'DECOR', 'FRIDAY HOMES', 'MIDLAND', 'SAVINGS', 'PROPERTY',
            'ASSET', 'PROTECTION', 'SERVICES', 'TRS', 'ET AL', 'L L C', 'NATIONAL',
            'ASSOCIATION', 'MANAGMENT', 'PARAGON', 'MORTGAGE', 'CHOICE', 'PROPERTIES',
            'J T C', 'RESIDENTIAL', 'OPPORTUNITIES', 'FUND', 'LEGACY', 'SERIES',
            'HOMES', 'LOAN', 'FAM', 'PRAYER'
        ];
        const suffixNamesArray = ['I', 'II', 'III', 'IV', 'V', 'ESQ', 'JR', 'SR'];
        const suffixNamesRegex = new RegExp(`\\b(?:${suffixNamesArray.join('|')})\\b`, 'i');

        const companyRegexString = `\\b(?:${companyIdentifiersArray.join('|')})\\b`;
        const companyRegex = new RegExp(companyRegexString, 'i');

        if (name.match(companyRegex)) {
            result = {
                firstName: '',
                lastName: '',
                middleName: '',
                fullName: name.trim(),
                suffix: ''
            };
            return result;
        }
        const suffix = name.match(suffixNamesRegex);
        name = name.replace(suffixNamesRegex, '');
        name = name.replace(/\s+/g, ' ');
        let ownersNameSplited: any = name.split(' ');
        const defaultLastName = ownersNameSplited[0].trim();
        ownersNameSplited.shift();
        try {
            const firstName = ownersNameSplited[0].trim();
            ownersNameSplited.shift();
            const middleName = ownersNameSplited.join(' ');
            const fullName = `${defaultLastName}, ${firstName} ${middleName} ${suffix ? suffix[0] : ''}`;
            result = {
                firstName,
                lastName: defaultLastName,
                middleName,
                fullName: fullName.trim(),
                suffix: suffix ? suffix[0] : ''
            }
        } catch (e) {
        }
        if (!result) {
            result = {
                firstName: '',
                lastName: '',
                middleName: '',
                fullName: name.trim(),
                suffix: ''
            };
        }
        return result;
    }

    // This is main function
    async parseAndSave(): Promise<boolean> {
        let headers = {
            'Connection': 'keep-alive',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.121 Safari/537.36',
            'Content-Type': 'application/json; charset=UTF-8',
            'Origin': 'https://pubrec6.hillsclerk.com',
            'Sec-Fetch-Site': 'same-origin',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Dest': 'empty',
            'Referer': 'https://pubrec6.hillsclerk.com/ORIPublicAccess/customSearch.html',
            'Accept-Language': 'en-US,en;q=0.9,id;q=0.8,ms;q=0.7',
        };

        let getDaysArray = function(start: any, end: any) {
            for(var arr=[],dt=new Date(start); dt<=end; dt.setDate(dt.getDate()+1)){
                arr.push(new Date(dt));
            }
            return arr;
        };

        const practiceType = 'tax-lien';
        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({ name: productName }).exec();
        const lastItemDB = await db.models.PublicRecordLineItem.findOne({
            'Property State': 'FL',
            'County': 'Hillsborough',
            'productId': prod._id,
            fillingDate: {"$exists": true, "$ne": ""}
        }, null, {sort: {createdAt: -1}}); // check last item from DB

        let fromDate;
        if (lastItemDB && lastItemDB.fillingDate) {
            console.log(lastItemDB.fillingDate);
            fromDate = new Date(lastItemDB.fillingDate);
            fromDate.setDate(fromDate.getDate() - 1);
        } else {
            fromDate = new Date();
            fromDate.setDate(fromDate.getDate() - 30);
        }
        let toDate = new Date();
        let dayList = getDaysArray(fromDate,toDate);
        let countRecords = 0;
        // Process day per day to bypass the search limit.
        for (const day of dayList){
            let dayInput = moment(day).format("MM/DD/YYYY");
            console.log("Processing =>",dayInput);
            let formData = {
                "DocType" : ["(LNCORPTX) CORP TAX LIEN FOR STATE OF FLORIDA","(LN) LIEN","(MEDLN) MEDICAID LIEN","(NCL) NOTICE OF CONTEST OF LIEN"],
                "RecordDateBegin": dayInput,
                "RecordDateEnd": dayInput
            }
            let searchPost = await axios.post('https://pubrec6.hillsclerk.com/Public/ORIUtilities/DocumentSearch/api/Search', formData, {headers: headers});
            let searchResults = searchPost.data.ResultList;
            console.log("Found:", searchResults.length);
            if (searchResults.length > 0){
                for(const result of searchResults){
                    let names = result['PartiesTwo'];
                    let caseId = result['Instrument'];
                    let recordDateUnix = result['RecordDate'];
                    let fillingDate = moment.unix(recordDateUnix).format("MM/DD/YYYY");
                    // console.log(fillingDate);
                    for(const name of names){
                        const parseName = this.parseName(name!.trim());
                        const data = {
                            'caseUniqueId': caseId,
                            'Property State': 'FL',
                            'County': 'Hillsborough',
                            'First Name': parseName.firstName,
                            'Last Name': parseName.lastName,
                            'Middle Name': parseName.middleName,
                            'Name Suffix': parseName.suffix,
                            'Full Name': parseName.fullName,
                            "vacancyProcessed": false,
                            fillingDate: fillingDate,
                            "productId": prod._id
                        };
                        await this.civilAndLienSaveToNewSchema(data);
                    }
                }
            }
        }
        
        await AbstractProducer.sendMessage('Hillsborough', 'Florida', countRecords, 'Lien');
        return true;
    }
}