import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
const parser = require('parse-address');
const nameParsingService = require('../../../../consumers/property_appraisers/consumer_dependencies/nameParsingServiceNew');
var addressit = require('addressit');

export default class CivilProducer extends AbstractProducer {
    url = 'https://www.broward.realforeclose.com/index.cfm?zaction=AUCTION&Zmethod=PREVIEW&AUCTIONDATE=';

    async init(): Promise<boolean> {
        console.log("running init")
        this.browser = await this.launchBrowser();
        this.browserPages.generalInfoPage = await this.browser.newPage();
        this.browserPages.generalInfoPage.setDefaultNavigationTimeout(60000);
        await this.setParamsForPage(this.browserPages.generalInfoPage);
        return true;
    };
    async read(): Promise<boolean> {
        return true;
    };

    /**
     * Parse owner names
     * @param name_str : string
     * @param address : string
     */
    parseOwnerName(name_str: string): any[] {
        const result: any = {};
  
        let parserName = nameParsingService.newParseName(name_str);
  
        result['full_name'] = parserName.fullName;
        result['first_name'] = parserName.firstName;
        result['last_name'] = parserName.lastName;
        result['middle_name'] = parserName.middleName;
        result['suffix'] = parserName.suffix;
        return result;
    }
    getStreetAddress(full_address:string): any {
        const parsed = addressit(full_address);
        let street_address = (parsed.number ? parsed.number : '') + ' ' + (parsed.street ? parsed.street : '') + ' ' + (parsed.unit ? '#'+parsed.unit : '');
        street_address = street_address.replace(/\s+/, ' ').trim();
        return street_address;
    }

    compareAddress(mailing_address: string, property_address: string) {
        const mailing_address1 = mailing_address.replace(/\W|\s+|\n/gm, '').toUpperCase();
        const property_address1 = property_address.replace(/\W|\s+|\n/gm, '').toUpperCase();
        return mailing_address1 === property_address1;
    }

    async parseAndSave(): Promise<boolean> {
        let countRecords = 0;
        let page = this.browserPages.generalInfoPage;
        if (!page) return false;

        let toDate = new Date();
        let fromDate =  new Date();
        fromDate.setDate(fromDate.getDate()-30);
        while (fromDate <= toDate) {
            console.log(`Checking For ${this.getFormattedDate(fromDate)}`);
            const url = this.url + this.getFormattedDate(fromDate);
            const isPageLoaded = await this.openPage(page, url, '//*[contains(@class,"BLHeaderDateDisplay")]');
            if (!isPageLoaded) {
                console.log("Website not loaded successfully:", url);
                return false;
            }
            await this.sleep(2000);
            const status_classes = ['Head_R', 'Head_W', 'Head_C'];
            for (const status_class of status_classes) {
                while (true) {
                    const rows = await page.$x(`//*[@class="${status_class}"]//*[contains(@id, "AITEM_")]`);
                    if (rows.length > 0) {
                        let data: any = {};
                        for (let index = 1 ; index < rows.length+1 ; index++) {
                            const final_amount = await this.getTextByXpathFromPage(page, `//*[@class="${status_class}"]//*[contains(@id, "AITEM_")][${index}]//*[text()="Final Judgment Amount:"]/following-sibling::td[1]`)
                            const max_bid_amount = await this.getTextByXpathFromPage(page, `//*[@class="${status_class}"]//*[contains(@id, "AITEM_")][${index}]//*[text()="Plaintiff Max Bid:"]/following-sibling::td[1]`);
                            const auction_status = await this.getTextByXpathFromPage(page, `//*[@class="${status_class}"]//*[contains(@id, "AITEM_")][${index}]//*[@class="ASTAT_MSGA ASTAT_LBL"]`);
                            let sold = false;
                            let sold_date = '';
                            let sold_amount = '';
                            if (status_class === 'Head_C') {
                                if (auction_status.indexOf('Sold') > -1) {
                                    sold = true;
                                    sold_date = await this.getTextByXpathFromPage(page, `//*[@class="${status_class}"]//*[contains(@id, "AITEM_")][${index}]//*[@class="ASTAT_MSGB Astat_DATA"]`);
                                    sold_amount = await this.getTextByXpathFromPage(page, `//*[@class="${status_class}"]//*[contains(@id, "AITEM_")][${index}]//*[@class="ASTAT_MSGD Astat_DATA"]`);
                                }
                            }
                            
                            let [parcel_link_handle] = await page.$x(`//*[@class="${status_class}"]//*[contains(@id, "AITEM_")][${index}]//*[text()="Parcel ID:"]/following-sibling::td[1]/a`);
                            let parcel_id = await this.getTextByXpathFromPage(page, `//*[@class="${status_class}"]//*[contains(@id, "AITEM_")][${index}]//*[text()="Parcel ID:"]/following-sibling::td[1]/a`);
                            if (parcel_id === 'Property Appraiser') continue;
                            let parcel_link = await page.evaluate(el => el.getAttribute('href'), parcel_link_handle);

                            let detailPage = await this.browser?.newPage()!;
                            await detailPage.goto(parcel_link, {waitUntil: 'load'});
                            const url = await detailPage.url();
                            if (url.indexOf('URL_Folio') === -1) {
                                await detailPage.close();
                                continue;
                            }
                            let owner_name: any = await this.getInnerTextByXpathFromPage(detailPage, '//*[contains(text(), "Property Owner")]/parent::td[1]/following-sibling::td[1]');
                            owner_name = owner_name.split('\n').map((s:string)=>s.trim()).filter((s:string)=>s!=='')[0];
                            owner_name = owner_name.replace(/\W/g, ' ').trim();
                            owner_name = this.parseOwnerName(owner_name);
                            
                            // property_address
                            let property_address = await this.getTextByXpathFromPage(detailPage, '//*[contains(text(), "Site Address")]/parent::td[1]/following-sibling::td[1]');
                            let property_address_parsed = parser.parseLocation(property_address);
                            property_address = this.getStreetAddress(property_address);
                            let property_zip = '';
                            let property_city = '';
                            if(property_address_parsed){
                                property_zip = property_address_parsed.zip ? property_address_parsed.zip : '';
                                property_city = property_address_parsed.city ? property_address_parsed.city : '';
                            }
                            // mailing address
                            let mailing_address = await this.getTextByXpathFromPage(detailPage, '//*[contains(text(), "Mailing Address")]/parent::td[1]/following-sibling::td[1]')
                            let mailing_address_parsed = parser.parseLocation(mailing_address);
                            mailing_address = this.getStreetAddress(mailing_address);
                            let mailing_zip = '';
                            let mailing_state = '';
                            let mailing_city = '';
                            if(mailing_address_parsed){
                                mailing_zip = mailing_address_parsed.zip ? mailing_address_parsed.zip : '';
                                mailing_state = mailing_address_parsed.state ? mailing_address_parsed.state : '';
                                mailing_city = mailing_address_parsed.city ? mailing_address_parsed.city : '';
                            }
                            let owner_occupied  = this.compareAddress(mailing_address, property_address);
                            // value, sales
                            let total_assessed_value = await this.getTextByXpathFromPage(detailPage, '//*[contains(text(), "Book/Page or CIN")]/ancestor::table[1]/tbody/tr[3]/td[3]');
                            let est_value = await this.getTextByXpathFromPage(detailPage, '//*[contains(text(), "Just Value")]/ancestor::td[1]/following-sibling::td[1]/span');
                            let last_sale_recording_date = await this.getTextByXpathFromPage(detailPage, '//*[contains(text(), "Book/Page or CIN")]/ancestor::table[1]/tbody/tr[3]/td[3]');
                            let last_sale_amount = await this.getTextByXpathFromPage(detailPage, '//*[contains(text(), "Book/Page or CIN")]/ancestor::table[1]/tbody/tr[3]/td[1]');
                            data = {
                                ...data,
                                owner_name,
                                property_address,
                                property_zip,
                                property_city,
                                mailing_address,
                                mailing_zip,
                                mailing_state,
                                mailing_city,
                                owner_occupied,
                                total_assessed_value,
                                est_value,
                                last_sale_recording_date,
                                last_sale_amount,
                                final_amount,
                                max_bid_amount,
                                sold
                            };
                            if (sold) {
                                data = {
                                    ...data,
                                    sold_amount,
                                    sold_date
                                };
                            }
                            if (this.saveRecord(data)) {
                                countRecords++;
                            }
                            await detailPage.close();
                            await this.sleep(1000);
                        }
                        const [curPageHandle] = await page.$x(`//*[@class="${status_class}"]//input[@id="curPCA"]`);
                        let currPage = await page.evaluate(el => el.getAttribute('curpg'), curPageHandle);
                        currPage = parseInt(currPage.trim());
                        let maxPage = parseInt(await this.getTextByXpathFromPage(page, `//*[@class="${status_class}"]//span[@id="maxCA"]`));
                        if (maxPage === currPage) break;
                        console.log(maxPage, currPage+1)
                        const [nextpage] = await page.$x(`//*[@class="${status_class}"]//span[contains(@class, "PageRight")]`);
                        await nextpage.click();
                        await page.waitForXPath(`//*[@class="${status_class}"]//input[@curpg="${currPage+1}"]`);
                    } else {
                        console.log('No results found');
                        break;
                    }                   
                }
            }
            fromDate.setDate(fromDate.getDate()+1);
        }

        await AbstractProducer.sendMessage(this.publicRecordProducer.state, this.publicRecordProducer.county ? this.publicRecordProducer.county : this.publicRecordProducer.city, countRecords, 'RealForeclosure');
        return true;
    }

    async saveRecord(record: any) {
        if (record['last_sale_recording_date']) {
            let date = new Date(record['last_sale_recording_date']);
            if (String(date) !== 'Invalid Date' && this.getFormattedDate(date)) {
                record['last_sale_recording_date'] = this.getFormattedDate(date);
            }
        }

        let data = {
            'Full Name': record['owner_name']['full_name'],
            'First Name': record['owner_name']['first_name'],
            'Last Name': record['owner_name']['last_name'],
            'Middle Name': record['owner_name']['middle_name'],
            'Name Suffix': record['owner_name']['suffix'],
            'Mailing Care of Name': '',
            'Mailing Address': record['mailing_address'] || '',
            'Mailing Unit #': '',
            'Mailing City': record['mailing_city'] || '',
            'Mailing State': record['mailing_state'] || '',
            'Mailing Zip': record['mailing_zip'] || '',
            'Property Address': record['property_address'],
            'Property Unit #': '',
            'Property City': record['property_city'] || '',
            'Property State': this.publicRecordProducer.state,
            'Property Zip': record['property_zip'] || '',
            'County': this.publicRecordProducer.county,
            'Owner Occupied': record['owner_occupied'],
            'Property Type': record['property_type'] || '',
            'Total Assessed Value': record['total_assessed_value'],
            'Last Sale Recording Date': record['last_sale_recording_date'],
            'Last Sale Amount': record['last_sale_amount'],
            'Est. Remaining balance of Open Loans': '',
            'Est Value': record['est_value'],
            'yearBuilt': '',
            'Est Equity': '',
            'Lien Amount': '',
            'listedPrice': record['final_amount'] || '',
            'listedPriceType': 'Final Judgment Amount',
            'listedPrice1': record['max_bid_amount'],
            'listedPriceType1': 'Plaintiff Max Bid',
            'sold': record['sold_amount'] ? true : false,
            'Sold Date': record['sold_date'],
            'soldAmount': record['sold_amount'],
            productId: this.productId,
            originalDocType: 'auction'
        };
        console.log(data);
        return await this.saveToOwnerProductProperty(data);
    }
}