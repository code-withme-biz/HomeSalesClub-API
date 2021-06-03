import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
import puppeteer from "puppeteer";

const nameParsingService = require('../../consumer_dependencies/nameParsingService')
const parser = require('parse-address');
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'https://slco.org/assessor/new/query.cfm',
    }

    xpaths = {
        isPAloaded: '//*[@id="parcelsearch"]',
    }

    constructor(publicRecordProducer: IPublicRecordProducer, ownerProductProperties: IOwnerProductProperty, browser: puppeteer.Browser, page: puppeteer.Page) {
        super();
        this.publicRecordProducer = publicRecordProducer;
        this.ownerProductProperties = ownerProductProperties;
        this.browser = browser;
        this.browserPages.propertyAppraiserPage = page;
      }

    async getTextByXpathFromPage(page: puppeteer.Page, xPath: string) {
        const [elm] = await page.$x(xPath)
        if (elm == null) {
            return '';
        }
        let text = await page.evaluate(j => j.innerText, elm);
        return text.replace(/\n/g, ' ');
    }

    async parsePage(page: puppeteer.Page, document: IOwnerProductProperty) {
        const rawOwnerName = await this.getTextByXpathFromPage(page, '//*[@id="parcelFieldNames"]//*[contains(text(), "Owner")]/following-sibling::td[1]');
        const processedNamesArray = await nameParsingService.semicolonParseOwnersFullName(rawOwnerName);
        const propertyType = await this.getTextByXpathFromPage(page, '//*[@id="parcelFieldNames"]//*[contains(text(), "Property Type")]/following-sibling::td[1]/a');
        const propertyAddress = await this.getTextByXpathFromPage(page, '//*[@id="parcelFieldNames"]//*[contains(text(), "Address")]/following-sibling::td[1]');
        const estimationValue = await this.getTextByXpathFromPage(page, '//*[@id="parcelFieldNames"]//*[contains(text(), "Market Value")]/following-sibling::td[1]');
        const yearBuild = await this.getTextByXpathFromPage(page, '//*[@id="residencetable"]//*[contains(text(), "Year Built")]/div/a');
        let isOwnerOccupied = await this.getTextByXpathFromPage(page, '//*[@id="residencetable"]//*[contains(text(), "Owner Occupied")]/div/a');
        let dataFromPropertyAppraisers = {
            'Full Name': processedNamesArray[0]['fullName'],
            'First Name': processedNamesArray[0]['firstName'],
            'Last Name': processedNamesArray[0]['lastName'],
            'Middle Name': processedNamesArray[0]['middleName'],
            'Name Suffix': processedNamesArray[0]['suffix'],
            'Mailing Care of Name': '',
            'Mailing Address': '',
            'Mailing Unit #': '',
            'Mailing City': '',
            'Mailing State': '',
            'Mailing Zip': '',
            'Property Address': propertyAddress,
            'Property Unit #': '',
            'Property City': '',
            'Property State': 'UT',
            'Property Zip': '',
            'County': 'Salt Lake',
            'Owner Occupied': isOwnerOccupied == 'Y',
            'Property Type': propertyType ? propertyType : '',
            'Total Assessed Value': '',
            'Last Sale Recording Date': '',
            'Last Sale Amount': '',
            'Est. Remaining balance of Open Loans': '',
            'Est Value': estimationValue,
            'yearBuilt': yearBuild,
            'Est Equity': '',
            'Lien Amount': ''
        };
        try{
            await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
        } catch(e){
            //
        }
    }

    readDocsToParse(): IOwnerProductProperty {
        return this.ownerProductProperties;
    }

    // use this to initialize the browser and go to a specific url.
    // setParamsForPage is needed (mainly for AWS), do not remove or modify it please.
    // return true when page is usable, false if an unexpected error is encountered.
    async init(): Promise<boolean> {
        if (!this.browserPages.propertyAppraiserPage || !this.browser) return false;
        await this.setParamsForPage(this.browserPages.propertyAppraiserPage);
        let retries = 0;
        while (true) {
          try {
            await this.browserPages.propertyAppraiserPage.goto(this.urls.propertyAppraiserPage, { waitUntil: 'load' });
            break;
          } catch (err) {
            console.log(err);
            retries++;
            if (retries > 3) {
                console.log('******** website loading failed');
                return false;
            }
            this.randomSleepIn5Sec();
            console.log(`******** website loading failed, retring... [${retries}]`);
          }
        }
        return true;
    };

    // use this as a middle layer between init() and parseAndSave().
    // this should check if the page is usable or if there was an error,
    // so use an xpath that is available when page is usable.
    // return true when it's usable, false if it errors out.
    async read(): Promise<boolean> {
        try {
            await this.browserPages.propertyAppraiserPage?.waitForXPath(this.xpaths.isPAloaded);
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    // the main parsing function. if read() succeeds, parseAndSave is started().
    // return true after all parsing is complete

    // docsToParse is the collection of all address objects to parse from mongo.
    // !!! Only mutate document objects with the properties that need to be added!
    // if you need to multiply a document object (in case of multiple owners
    // or multiple properties (2-3, not 30) you can't filter down to one, use this.cloneMongoDocument(document);
    // once all properties from PA have been added to the document, call
    async parseAndSave(docsToParse: IOwnerProductProperty): Promise<boolean> {
        const page = this.browserPages.propertyAppraiserPage;
        if (page === undefined) return false;
        let document = docsToParse;

            if (!this.decideSearchByV2(document)) {
                return false;
            }
            

            let first_name = '';
            let last_name = '';
            let owner_name = '';
            let owner_name_regexp = '';
            let address;

            if (this.searchBy === 'name') {
                const nameInfo = this.getNameInfo(document.ownerId, ",");
                first_name = nameInfo.first_name;
                last_name = nameInfo.last_name;
                owner_name = nameInfo.owner_name;
                owner_name_regexp = nameInfo.owner_name_regexp;
                if (owner_name === '') return false;
                console.log(`Looking for owner: ${owner_name}`);
            } else {
                address = parser.parseLocation(document.propertyId["Property Address"]);
                const parseaddr = this.getAddressV2(document.propertyId);
                if(!this.isEmptyOrSpaces(parseaddr.street_address)){
                    address = parser.parseLocation(parseaddr.street_address);
                }
                if(!address || (!address.number && !address.street)){
                    console.log("Street number and street name is missing!");
                    return false;
                }
                console.log(`Looking for address: ${document.propertyId['Property Address']}`);
            }
            try {
                if(this.searchBy == 'address'){
                    address.street = address.street.replace(/\b(?:N|S|W|E|East|West|North|South)\b/gi, '').trim();
                    await page.waitForSelector('#parcelsearch');
                    const [collapseAddressSearch] = await page.$x('//button[contains(text(), "Address Search")]');
                    await collapseAddressSearch.click();
                    if (address.number) {
                        await page.type('#street_Num', address.number, {delay: 50});
                    }
                    await page.type('#street_name', address.street, {delay: 50});
                    await Promise.all([
                        page.click('#SubmitAddress'),
                        page.waitForNavigation({waitUntil: 'networkidle0'})
                    ]);
                } else {
                    const [collapseOwnerSearch] = await page.$x('//button[contains(text(), "Owner Search")]');
                    await collapseOwnerSearch.click();
                    await page.type('#itemname', owner_name, {delay: 50});
                    await Promise.all([
                        page.click('#SubmitName'),
                        page.waitForNavigation({waitUntil: 'networkidle0'})
                    ]);
                }
                const searchResults = await page.$x('//tr[contains(@id, "resultBlock")]');
                if(searchResults.length > 0){
                    const datalinks = [];
                    if(this.searchBy == 'name'){
                        for(const row of searchResults){
                            let id = await row.evaluate(el => el.children[1].children[4].getAttribute('value')?.trim());
                            let link = "https://slco.org/assessor/new/valuationInfoExpanded.cfm?Parcel_id=" + id;
                            let name = await row.evaluate(el => el.children[0].children[1].textContent?.trim());
                            const regexp = new RegExp(owner_name_regexp);
                            if (!regexp.exec(name!.toUpperCase())){
                                continue;
                            }
                            datalinks.push(link);
                        }
                    } else {
                        let id = await searchResults[0].evaluate(el => el.children[1].children[4].getAttribute('value')?.trim());
                        let link = "https://slco.org/assessor/new/valuationInfoExpanded.cfm?Parcel_id=" + id;
                        datalinks.push(link);
                    }
                    for(const datalink of datalinks){
                        await page.goto(datalink, {waitUntil: 'networkidle0'});
                        await this.parsePage(page, document);
                    }
                } else {
                    let foundOne = await page.$x('//div[@id="parcelFieldNames"]')
                    if(foundOne.length > 0){
                        await this.parsePage(page, document);
                    } else {
                        console.log("Not found!");
                    }
                }
            } catch (e) {
                console.log(e);
            }
            await page.goto('https://slco.org/assessor/new/query.cfm');
        return true;
    }
}