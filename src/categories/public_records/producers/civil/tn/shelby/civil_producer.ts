import AbstractProducer from "../../../abstract_producer";
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import puppeteer from "puppeteer";
import db from "../../../../../../models/db";

const removeRowArray = [
    'CITY', 'DEPT', 'CTY', 'UNITED STATES', 'BANK', 'FIA CARD SERVICES NA',
    'FLORIDA PACE FUNDING AGENCY', 'COUNTY', 'CREDIT', 'HOSPITAL', 'FUNDING', 'UNIVERSITY',
    'MEDICAL', 'CONDOMINIUM ASSOCIATION', 'LOTS', 'TEXAS STATE', 'VETERANS', 'SECRETARY', 'DEPARTMENT',
    'INDIVIDUAL', 'INDIVIDUALLY', 'FINANCE', 'CITIBANK', 'MERS', 'STATE TAX COMMISSION'
];
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i');

export default class CivilProducer extends AbstractProducer {
    urls = {
        generalInfoPage: "https://register.shelby.tn.us/search/index.php"
    };

    xpaths = {
        isPageLoaded: '//*[@id="loadingDIV"]'
    }

    constructor(publicRecordProducer: IPublicRecordProducer) {
        // @ts-ignore
        super();
        this.publicRecordProducer = publicRecordProducer;
        this.stateToCrawl = this.publicRecordProducer?.state || '';
    }

    async init(): Promise<boolean> {
        console.log("running init")
        this.browser = await this.launchBrowser();
        this.browserPages.generalInfoPage = await this.browser.newPage();

        await this.setParamsForPage(this.browserPages.generalInfoPage);

        try {
            await this.browserPages.generalInfoPage.setDefaultTimeout(60000);
            await this.browserPages.generalInfoPage.goto(this.urls.generalInfoPage, {
                waitUntil: "load"
            });
            return true;
        } catch (err) {
            console.log("error loading page")
            console.warn(err);
            return false;
        }
    }

    async read(): Promise<boolean> {
        try {
            await this.browserPages.generalInfoPage?.waitForXPath(this.xpaths.isPageLoaded);
            console.warn('Page Loaded')
            return true;
        } catch (err) {
            console.warn("Problem loading property appraiser page.");
            return false;
        }
    }

    async getData(date: any, names: string[], docType: any): Promise<any> {
        let counts = 0;
        for (const name of names) {
            if (removeRowRegex.test(name)) return false;
            const parseName: any = this.newParseName(name.trim())
            if (parseName?.type && parseName?.type == 'COMPANY') continue;

            let practiceType = this.getPracticeType(docType);
            const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
            const prod = await db.models.Product.findOne({name: productName}).exec();
            const data = {
                'Property State': 'TN',
                'County': 'shelby',
                'First Name': parseName.firstName,
                'Last Name': parseName.lastName,
                'Middle Name': parseName.middleName,
                'Name Suffix': parseName.suffix,
                'Full Name': parseName.fullName,
                "vacancyProcessed": false,
                fillingDate: date,
                productId: prod._id,
                originalDocType: docType
            };
            if (await this.civilAndLienSaveToNewSchema(data)) counts++;
        }
        return counts;
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        let countRecords = 0;

        // console.log(page, 'this is page')
        if (page === undefined) return false;
        await page.setDefaultTimeout(60000);

        await page.waitForXPath('//iframe[@id="content_frame"]');
        let frame_handle = await page.$x('//iframe[@id="content_frame"]');
        let frame: puppeteer.Frame = (await frame_handle[0].contentFrame())!;

        let full_doctypes: any = {};
        await frame.waitForXPath('//*[contains(@name, "instDocType")]/parent::div[1]');
        const instrument_types = await frame.$x('//*[contains(@name, "instDocType")]/parent::div[1]');
        for (const instrument_type of instrument_types) {
            const doctype_abbr = await frame.evaluate(el => el.children[0].value.trim(), instrument_type);
            let doctype_full = await frame.evaluate(el => el.textContent, instrument_type);
            doctype_full = doctype_full.replace(/\s+|\n/gm, ' ').trim();
            full_doctypes[doctype_abbr] = doctype_full;
        }
        
        try {
            let dateRange = await this.getDateRange('Tennessee', 'Shelby');
            let fromDate = dateRange.from;
            let toDate = dateRange.to;

            while (fromDate <= toDate) {
                let dateString = this.getFormattedDate(fromDate);
                console.log('============= Checking for: ', dateString);
                fromDate.setDate(fromDate.getDate() + 1);
                let retries = 0;
                while (retries < 15) {
                    try {
                        await page.goto(this.urls.generalInfoPage, {waitUntil: 'load'});
                        break;
                    } catch (error) {
                        retries++;
                        console.log(`Page loading was failed, retrying now... [${retries}]`);
                        await this.sleep(3000);
                    }
                }
                if (retries === 15) {
                    console.log(`Page loading was failed, tried [${retries}] times`);
                    break;
                }

                await page.waitForXPath('//iframe[@id="content_frame"]');
                let frame_handle = await page.$x('//iframe[@id="content_frame"]');
                let frame: puppeteer.Frame = (await frame_handle[0].contentFrame())!;
                
                await frame.waitForSelector('#start_date');
                const dateFieldStartSelector = "input#start_date";
                const dateFieldStartHandle = await frame.$(dateFieldStartSelector);
                await dateFieldStartHandle?.click({clickCount: 3});
                await dateFieldStartHandle?.press("Backspace");
                await dateFieldStartHandle?.type(dateString, {delay: 100});
                const dateFieldEndSelector = "input#end_date";
                const dateFieldEndHandle = await frame.$(dateFieldEndSelector);
                await dateFieldEndHandle?.click({clickCount: 3});
                await dateFieldEndHandle?.press("Backspace");
                await dateFieldEndHandle?.type(dateString, {delay: 100});
                await this.sleep(1000);
                const [search_button] = await frame.$x('//a[contains(@onclick, "submitSearch()")]');
                await search_button.click();

                frame_handle = await page.$x('//iframe[@id="content_frame"]');
                frame = (await frame_handle[0].contentFrame())!;

                await frame.waitForSelector('#container_list', {visible: true});
                await frame.click('#container_list');
                await this.sleep(1000);

                const result_handle = await Promise.race([
                    frame.waitForXPath('//*[contains(text(), "Showing 0 to 0 of 0 entries")]'),
                    frame.waitForXPath('//*[@id="results_info"]', {visible: true})
                ]);
                const result_text = await frame.evaluate(el => el.textContent, result_handle);
                if (result_text.indexOf('Showing 0 to 0 of 0 entries') > -1) {
                    console.log('No Results Found');
                    continue;
                }

                await frame.waitForXPath('//*[@id="results"]');
                //   // get all results
                await this.randomSleepIn5Sec()
                frame_handle = await page.$x('//iframe[@id="content_frame"]');
                frame = (await frame_handle[0].contentFrame())!;

                await frame.waitForXPath('//*[@id="results"]');
                const rows = await frame.$x('//*[@id="results"]/tbody/tr');
                console.log(rows.length)
                for (const row of rows) {
                    let names  = await frame.evaluate(el => el.children[3].innerText, row);
                    console.log(names)
                    names = names.split('\n').map((name: string) => name.trim()).filter((name: string) => name !== '');
                    console.log(names)
                    let filling_date = await frame.evaluate(el => el.children[1].textContent, row);
                    filling_date = filling_date.replace(/\s+|\n/gm, ' ').trim();
                    let doctype = await frame.evaluate(el => el.children[4].textContent, row);
                    doctype = doctype.replace(/\s+|\n/gm, ' ').trim();

                    const saveRecord = await this.getData(filling_date, names, full_doctypes[doctype] || '');
                    saveRecord && countRecords++;
                }
            }
            await AbstractProducer.sendMessage('shelby', 'Tennessee', countRecords, 'Civil');
            await page.close();
            await this.browser?.close();


            return true;
        } catch (error) {
            console.log(error);
            // return '';
            await AbstractProducer.sendMessage('shelby', 'Tennessee', countRecords, 'Civil');
            return false;
        }
    }


}
