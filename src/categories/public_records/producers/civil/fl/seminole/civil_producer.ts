import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';


const removeRowArray = [
    'CITY', 'DEPT', 'CTY', 'UNITED STATES', 'BANK', 'FIA CARD SERVICES NA',
    'FLORIDA PACE FUNDING AGENCY', 'COUNTY', 'CREDIT', 'HOSPITAL', 'FUNDING', 'UNIVERSITY',
    'MEDICAL', 'CONDOMINIUM ASSOCIATION', 'LOTS', 'TEXAS STATE', 'VETERANS', 'SECRETARY', 'DEPARTMENT',
    'SCHOOL', 'POLICY'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')

export default class CivilProducer extends AbstractProducer {

    urls = {
        generalInfoPage: 'https://courtrecords.seminoleclerk.org/civil/default.aspx'
    };

    constructor(publicRecordProducer: IPublicRecordProducer) {
        // @ts-ignore
        super();
        this.publicRecordProducer = publicRecordProducer;
        this.stateToCrawl = this.publicRecordProducer?.state || '';
    }

    async init(): Promise<boolean> {
        this.browser = await this.launchBrowser();
        this.browserPages.generalInfoPage = await this.browser.newPage();
        await this.setParamsForPage(this.browserPages.generalInfoPage);
        try {
            await this.browserPages.generalInfoPage.goto(this.urls.generalInfoPage, {waitUntil: 'load'});
            return true;
        } catch (err) {
            console.warn(err);
            return false;
        }
    }

    async read(): Promise<boolean> {
        try {
            await this.browserPages.generalInfoPage?.waitForXPath('//*[@id="fromDateTxt"]');
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    parsingDelimitedAddress(fullAddress: string) {
        try {
            const match = /^(.*?)\s*,\s*([A-Z]{2})\s*([\d\-]+)/.exec(fullAddress)
            const normalizeZip = /^(\d{5})/.exec(match![3])![1]
            return {city: match![1], zip: normalizeZip, state: match![2]};
        } catch (e) {
            return {city: '', zip: '', state: ''};
        }
    }

    async getData(page: puppeteer.Page) {
        let count = 0;
        try {
            await page.waitForSelector('#MainContent_grid_results')
            const rows = await page.$x('//*[@id="CaseGrid"]/tbody/tr/td[1]/a')
            let linkArray = []
            for (let i = 1; i < rows.length + 1; i++) {
                try {
                    const [linkElement] = await page.$x(`//*[@id="CaseGrid"]/tbody/tr[${i}]//*[@id="CaseNum"]`);
                    const link = await page.evaluate(elem => elem.getAttribute('href'), linkElement)
                    linkArray.push(link)
                } catch (e) {
                }
            }
            for (let i = 0; i < linkArray.length; i++) {
                await page.goto('https://courtrecords.seminoleclerk.org/civil/' + linkArray[i], {waitUntil: 'load'});
                await page.waitForSelector('#collapseSummary');
                const [caseTypeElement] = await page.$x('//*[@id="MainContent_case_type"]');
                const [fillDateElement] = await page.$x('//*[@id="MainContent_fileDate"]');
                await page.click('#pty_icon');
                await page.waitForSelector('#PartyGrid', {visible: true});
                const nameElements = await page.$x('//*[@id="PartyGrid"]//*[contains(text(), "DEFENDANT")]/parent::td/preceding-sibling::td[1]/span');
                const addressElements = await page.$x('//*[@id="PartyGrid"]//*[contains(text(), "DEFENDANT")]/parent::td/following-sibling::td[1]//tbody');
                const cityAndStateElements = await page.$x('//*[@id="PartyGrid"]//*[contains(text(), "DEFENDANT")]/parent::td/following-sibling::td[1]//tbody/tr[last()]');
                for (let j = 0; j < nameElements.length; j++) {
                    try {
                        let name = await page.evaluate(elem => elem.textContent, nameElements[j]);
                        if (removeRowRegex.test(name)) continue;
                        let address = !!addressElements && addressElements.length != 0 ? await page.evaluate(elem => elem.textContent, addressElements[j]) : '';
                        let cityAndState = !!cityAndStateElements && cityAndStateElements.length ? await page.evaluate(elem => elem.textContent, cityAndStateElements[j]) : '';
                        const caseType = await page.evaluate(elem => elem.textContent, caseTypeElement);
                        const fillingDate = await page.evaluate(elem => elem.textContent, fillDateElement);
                        address = address.replace('Address:', '');
                        address = address.replace(cityAndState, '');
                        name = name.replace(/\(.*$/, '')
                        if (address.match(/\bbox\b/i)) {
                            address = ''
                            cityAndState = ''
                        }
                        const {city, zip} = this.parsingDelimitedAddress(cityAndState.trim())
                        const parseName: any = this.newParseName(name.trim());
                        if (parseName.type && parseName.type == 'COMPANY'){
                            continue;
                        }
                        let practiceType = this.getPracticeType(caseType);
                        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                        const prod = await db.models.Product.findOne({name: productName}).exec();

                        const data = {
                            'Property State': this.publicRecordProducer.state,
                            'County': this.publicRecordProducer.county,
                            'Property Address': address,
                            'Property City': city,
                            'Property Zip': zip,
                            'First Name': parseName.firstName,
                            'Last Name': parseName.lastName,
                            'Middle Name': parseName.middleName,
                            'Name Suffix': parseName.suffix,
                            'Full Name': parseName.fullName,
                            "vacancyProcessed": false,
                            fillingDate: fillingDate,
                            productId: prod._id,
                            originalDocType: caseType
                        };

                        if (await this.civilAndLienSaveToNewSchema(data))
                            count++
                    } catch (e) {
                    }
                }
            }
        } catch (e) {
        }
        return count
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let countRecords = 0;
        try {
            
            let firstSearch = false;
            let dateRange = await this.getDateRange('Florida', 'Seminole');
            let fromDate = dateRange.from;
            let toDate = dateRange.to;
            let days = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 3600 * 24)) - 1;
            if (days > 18) {
                firstSearch = true;
            }
            const step = firstSearch ? 2 : 1
            for (let i = days < 1 ? 1 : days; i >= 0; i -= step) {
                try {
                    let dateSearch = new Date();
                    dateSearch.setDate(dateSearch.getDate() - i);
                    let dateSearchTo = new Date();
                    if (firstSearch) {
                        dateSearchTo.setDate(dateSearchTo.getDate() - (i - 1))
                    } else {
                        dateSearchTo.setDate(dateSearchTo.getDate() - i)
                    }
                    await page.goto('https://courtrecords.seminoleclerk.org/civil/default.aspx');
                    await page.waitForSelector('#fromDateTxt');
                    await page.evaluate(() => {
                        // @ts-ignore
                        document.querySelector('#fromDateTxt').value = '';
                        // @ts-ignore
                        document.querySelector('#toDateTxt').value = '';
                    })
                    console.log('Start search with date: from', dateSearch.toLocaleDateString('en-US'), 'to', dateSearchTo.toLocaleDateString('en-US'))
                    await page.type('#fromDateTxt', dateSearch.toLocaleDateString('en-US'), {delay: 100});
                    await page.type('#toDateTxt', dateSearchTo.toLocaleDateString('en-US'), {delay: 100});
                    await page.click('#dropdownContainer1')
                    const [selectAllCountyType] = await page.$x('//*[@id="dropdownContainer1"]/ul/li[2]')
                    await selectAllCountyType.click()
                    await page.click('#dropdownContainer2')
                    const [selectAllCircuitType] = await page.$x('//*[@id="dropdownContainer2"]/ul/li[2]')
                    await selectAllCircuitType.click()
                    await page.click('#search');
                    const count = await this.getData(page);
                    countRecords += count;
                    if (firstSearch) {
                        console.log(` from ${dateSearch.toLocaleDateString('en-US')} to ${dateSearchTo.toLocaleDateString('en-US')} found ${count} records.`);
                    } else {
                        console.log(`${dateSearch.toLocaleDateString('en-US')} found ${count} records.`);
                    }
                } catch (e) {
                }
            }
        } catch (e) {
            console.log(e)
            console.log('Error search');
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Seminole', 'Florida', countRecords, 'Civil & Lien', errorImage);
            return false
        }

        await AbstractProducer.sendMessage('Seminole', 'Florida', countRecords, 'Civil & Lien');
        return true;
    }
}

