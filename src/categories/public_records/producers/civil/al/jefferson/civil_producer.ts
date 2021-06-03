import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';


const removeRowArray = [
    'CITY', 'DEPT', 'CTY', 'UNITED STATES', 'BANK', 'FIA CARD SERVICES NA',
    'FLORIDA PACE FUNDING AGENCY', 'COUNTY', 'CREDIT', 'HOSPITAL', 'FUNDING', 'UNIVERSITY',
    'MEDICAL', 'CONDOMINIUM ASSOCIATION', 'LOTS', 'TEXAS STATE', 'VETERANS', 'SECRETARY', 'DEPARTMENT', 'TITLE'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')


export default class CivilProducer extends AbstractProducer {

    urls = {
        generalInfoPage: 'https://landmarkweb.jccal.org/LandmarkWeb/Home/Index'
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
            await this.browserPages.generalInfoPage?.waitForXPath('//a[@title="Go to Record Date Search."]');
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    getDateString(date: Date): string {
        return ("00" + (date.getMonth() + 1)).slice(-2) + "/" + ("00" + date.getDate()).slice(-2) + "/" + date.getFullYear();
    }

    async parseAndSave(): Promise<boolean> {
        let countRecords = 0;
        try {
            const civilUrl: string = 'https://landmarkweb.jccal.org/LandmarkWeb/Home/Index';
            let dateRange = await this.getDateRange('Alabama', 'Jefferson');
            let fromDate = dateRange.from;
            let toDate = dateRange.to;
            let page = this.browserPages.generalInfoPage!;

            await page.goto(civilUrl, { timeout: 60000 });
            await page.waitForXPath('//img[@data-title="Document Search"]', { visible: true });
            let searchByDocument = await page.$x('//img[@data-title="Document Search"]');
            await searchByDocument[0].click();
            await page.waitForSelector('a#idAcceptYes', { visible: true });
            await Promise.all([
                page.waitForNavigation(),
                page.click('a#idAcceptYes')
            ]);
            while (fromDate <= toDate) {
                let dateStringDay = this.getDateString(new Date(fromDate));
                // console.log(dateStringDay);
                let documentTypes = ['Deed', 'Lien', 'Mortgage', 'Marriage License'];
                for (const docTypeSelect of documentTypes) {
                    // console.log(docTypeSelect);
                    let option = (await page.$x('//select[@id="documentCategory-DocumentType"]/option[contains(., "' + docTypeSelect + '")]'))[0];
                    let optionVal: any = await (await option.getProperty('value')).jsonValue();
                    await page.select('#documentCategory-DocumentType', optionVal);
                    await this.sleep(200);
                }
                await page.click('input#beginDate-DocumentType', { clickCount: 3 });
                await page.type('input#beginDate-DocumentType', dateStringDay);
                await page.click('input#endDate-DocumentType', { clickCount: 3 });
                await page.type('input#endDate-DocumentType', dateStringDay);
                await page.select('#numberOfRecords-DocumentType', '2000');
                await page.click('a#submit-DocumentType');
                await page.waitForXPath('//table[@id="resultsTable"]/tbody/tr', { visible: true, timeout: 200000 });
                await page.select('select[name="resultsTable_length"]', '-1');
                let totalRecordsXpath = await page.$x('//div[@id="resultsTable_info"]/b');
                let totalRecordsTemp = await totalRecordsXpath[0].evaluate(el => el.textContent?.split(' '));
                console.log('Please wait, checking there is data or not');
                try {
                    await page.waitForXPath('//td[@class="dataTables_empty"]', { visible: true, timeout: 20000 });
                    console.log('There is no data at this day!')
                    fromDate.setDate(fromDate.getDate() + 1);
                    continue;
                } catch (err) {

                }
                try {
                    await page.waitForXPath('//td[@class="tablecell sorting_1" and contains(text(),"' + totalRecordsTemp![totalRecordsTemp!.length - 1] + '")]', { visible: true, timeout: 200000 });
                } catch (err) {
                    fromDate.setDate(fromDate.getDate() + 1);
                    continue;
                }
                let docTypeHandles;
                while (true) {
                    docTypeHandles = await page.$x('//table[@id="resultsTable"]/tbody/tr/td[9]');
                    let totalRecordsString = await page.$x('//*[@id="resultsTable_info"]/b');
                    let textTotal = await totalRecordsString[0].evaluate(el => el.textContent);
                    let arrayRecords = await textTotal?.split(" ");
                    let totalRecords: any = arrayRecords?.[arrayRecords?.length - 1];
                    if (docTypeHandles.length == parseInt(totalRecords) || totalRecords == 'records') {
                        break;
                    }

                }


                let recordDateHandles = await page.$x('//table[@id="resultsTable"]/tbody/tr/td[8]');
                let uniqueIdHandles = await page.$x('//table[@id="resultsTable"]/tbody/tr/td[13]');
                for (let i = 0; i < docTypeHandles.length; i++) {
                    let indexName = i + 1;
                    let docType = await docTypeHandles[i].evaluate(el => el.textContent?.trim());
                    let recordDate = await recordDateHandles[i].evaluate(el => el.textContent?.trim());
                    let uniqueId = await uniqueIdHandles[i].evaluate(el => el.textContent?.trim());
                    let names = [];
                    let reverseNameHandles = await page.$x('//table[@id="resultsTable"]/tbody/tr[' + indexName + ']/td[7]/text()');
                    let directNameHandles = await page.$x('//table[@id="resultsTable"]/tbody/tr[' + indexName + ']/td[6]/text()');
                    if (docType?.match(/marriage/i) || docType?.match(/deed/i) || docType?.match(/family/i)) {
                        for (let reverseNameHandle of reverseNameHandles) {
                            let reverseName = await reverseNameHandle.evaluate(el => el.textContent?.trim());
                            names.push(reverseName);
                        }
                        for (let directNameHandle of directNameHandles) {
                            let directName = await directNameHandle.evaluate(el => el.textContent?.trim());
                            names.push(directName);
                        }
                    } else if (docType?.match(/mortgage/i) || docType?.match(/probate/i)) {
                        for (let directNameHandle of directNameHandles) {
                            let directName = await directNameHandle.evaluate(el => el.textContent?.trim());
                            names.push(directName);
                        }
                    } else {
                        for (let reverseNameHandle of reverseNameHandles) {
                            let reverseName = await reverseNameHandle.evaluate(el => el.textContent?.trim());
                            names.push(reverseName);
                        }
                    }

                    let practiceType = this.getPracticeType(docType!);
                    for (let name of names) {
                        name = name?.replace(/\(PERS REP\)/, '');
                        if (name == '...') {
                            continue
                        }
                        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                        const prod = await db.models.Product.findOne({ name: productName }).exec();
                        const parseName: any = this.newParseName(name!.trim());
                        if (parseName.type && parseName.type == 'COMPANY') {
                            continue
                        }
                        const data = {
                            'caseUniqueId': uniqueId,
                            'Property State': 'AL',
                            'County': 'Jefferson',
                            'First Name': parseName.firstName,
                            'Last Name': parseName.lastName,
                            'Middle Name': parseName.middleName,
                            'Name Suffix': parseName.suffix,
                            'Full Name': parseName.fullName,
                            "vacancyProcessed": false,
                            practiceType: practiceType,
                            fillingDate: recordDate,
                            "productId": prod._id,
                            originalDocType: docType
                        };
                        if (await this.civilAndLienSaveToNewSchema(data)) {
                            countRecords += 1;
                        }
                    }
                }
                fromDate.setDate(fromDate.getDate() + 1);
            }

            await AbstractProducer.sendMessage('Jefferson', 'Alabama', countRecords, 'Civil & Lien');
            return true;
        } catch (err) {
            console.log(err)
            await AbstractProducer.sendMessage('Jefferson', 'Alabama', countRecords, 'Civil & Lien');
            return false
        }
    }
}