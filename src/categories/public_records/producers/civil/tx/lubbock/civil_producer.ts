import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';


const removeRowArray = [
    'CITY', 'DEPT', 'CTY', 'UNITED STATES', 'BANK', 'FIA CARD SERVICES NA',
    'FLORIDA PACE FUNDING AGENCY', 'COUNTY', 'CREDIT', 'HOSPITAL', 'FUNDING', 'UNIVERSITY',
    'MEDICAL', 'CONDOMINIUM ASSOCIATION', 'LOTS', 'TEXAS STATE', 'VETERANS', 'SECRETARY', 'DEPARTMENT',
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')


export default class CivilProducer extends AbstractProducer {

    urls = {
        generalInfoPage: 'https://erecord.co.lubbock.tx.us/recorder/eagleweb/docSearch.jsp'
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
            await this.browserPages.generalInfoPage.goto(this.urls.generalInfoPage, { waitUntil: 'load' });
            return true;
        } catch (err) {
            console.warn(err);
            return false;
        }
    }

    async read(): Promise<boolean> {
        try {
            await this.browserPages.generalInfoPage?.waitForXPath('//*[@id="middle_left"]');
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    async getData(page: puppeteer.Page) {
        let count = 0;
        try {
            await page.waitForSelector('#right_column');
            const [noResults] = await page.$x('//*[contains(text(), "No results found")]');
            if (!!noResults) return count;
            await page.waitForSelector('#searchResultsTable');
            let nextPageFlag;
            do {
                const rows = await page.$x('//*[@id="searchResultsTable"]/tbody/tr');
                nextPageFlag = false;
                for (let i = 1; i < rows.length; i++) {
                    const [nameElement] = await page.$x(`//*[@id="searchResultsTable"]/tbody/tr[${i}]//*[contains(text(),"Grantee:")]/parent::td`);
                    const [dateElement] = await page.$x(`//*[@id="searchResultsTable"]/tbody/tr[${i}]//*[contains(text(),"RecordingDate:")]/parent::a`);
                    const [typeElement] = await page.$x(`//*[@id="searchResultsTable"]/tbody/tr[${i}]/td[1]/strong/a`);
                    if (!!nameElement) {
                        let name = (await page.evaluate(e => e.textContent, nameElement))!.trim();
                        name = name.replace('Grantee:', '').trim();
                        let type = (await page.evaluate(e => e.textContent, typeElement))!.trim();
                        type = type.replace(/\n.*$/, '');
                        let date = await page.evaluate(e => e.innerText, dateElement);
                        date = date.replace('RecordingDate:', '').replace(/Grantor:.*$/is, '').trim();
                        const fillingDate = new Date(date).toLocaleDateString('en-US');
                        let practiceType = this.getPracticeType(type);
                        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                        const prod = await db.models.Product.findOne({ name: productName }).exec();
                        const nameArray = name.split(',');
                        for (let j = 0; j < nameArray.length; j++) {
                            if (removeRowRegex.test(nameArray[j])) continue;
                            if (/^\bPUBLIC\b$/i.test(nameArray[j])) continue;
                            const parseName: any = this.newParseName(nameArray[j].trim());
                            if (parseName.type === 'COMPANY' || parseName.fullName === '') continue;
                            const data = {
                                'Property State': 'TX',
                                'County': 'Lubbock',
                                'First Name': parseName.firstName,
                                'Last Name': parseName.lastName,
                                'Middle Name': parseName.middleName,
                                'Name Suffix': parseName.suffix,
                                'Full Name': parseName.fullName,
                                "vacancyProcessed": false,
                                fillingDate: fillingDate,
                                productId: prod._id,
                                originalDocType: type
                            };
                            if(await this.civilAndLienSaveToNewSchema(data)){
                                count++
                            }
                        }
                    }
                }
                const [nextPage] = await page.$x('//a[text()="Next"]');
                if (!!nextPage) {
                    await nextPage.click();
                    await page.waitFor(3000);
                    nextPageFlag = true;
                }
            } while (nextPageFlag)
        } catch (e) {
        }
        return count
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let tryCount = 0;
        let countRecords = 0
        let tryFlag: boolean;
        try {
            do {
                tryFlag = false
                await page.waitForSelector('#middle_left');
                await page.click('input[type="submit"][value="Public Login"][name="submit"]');
                const [searchTable] = await page.$x('//*[id="#searchTable"]');
                if (!searchTable) {
                    await page.reload();
                    tryFlag = true;
                }
            } while (tryCount == 4 || !!tryFlag)
        } catch (e) {
        }
        try {
            let dateRange = await this.getDateRange('Texas', 'Lubbock');
            let date = dateRange.from;
            let today = dateRange.to;
            let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24)) - 1;
            for (let i = days < 0 ? 1 : days; i >= 0; i--) {
                try {
                    let dateSearch = new Date();
                    dateSearch.setDate(dateSearch.getDate() - i);
                    console.log('Start search with date: ', dateSearch.toLocaleDateString('en-US'))
                    await page.goto('https://erecord.co.lubbock.tx.us/recorder/eagleweb/docSearch.jsp');
                    await page.waitForSelector('#searchTable');
                    await page.evaluate(() => {
                        // @ts-ignore
                        document.querySelector('#RecDateIDStart').value = '';
                        // @ts-ignore
                        document.querySelector('#RecDateIDEnd').value = '';
                    })
                    await page.type('#RecDateIDStart', dateSearch.toLocaleDateString('en-US'), { delay: 100 });
                    await page.type('#RecDateIDEnd', dateSearch.toLocaleDateString('en-US'), { delay: 100 });
                    await page.click('input[type="submit"][value="Search"][class="search"]');
                    const count = await this.getData(page);
                    countRecords += count;
                    console.log(`${dateSearch.toLocaleDateString('en-US')} found ${count} records.`);
                } catch (e) {
                }
            }
        } catch (e) {
            console.log(e)
            console.log('Error search');
            await AbstractProducer.sendMessage('Lubbock', 'Texas', countRecords, 'Civil & Lien');
            return false
        }
        
        await AbstractProducer.sendMessage('Lubbock', 'Texas', countRecords, 'Civil & Lien');

        return true;
    }
}

