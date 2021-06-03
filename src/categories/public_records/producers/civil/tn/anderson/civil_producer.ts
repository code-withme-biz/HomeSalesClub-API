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
        generalInfoPage: "https://search.andersondeeds.com/insttype.php"
    };

    xpaths = {
        isPageLoaded: '//*[@name="search"]'
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
        let result = true;

        // console.log(page, 'this is page')
        if (page === undefined) return false;
        await page.setDefaultTimeout(60000);

        try {
            let dateRange = await this.getDateRange('Tennessee', 'Anderson');
            let fromDate: any = this.getSeparateDate(dateRange.from);
            fromDate = fromDate.month + fromDate.day + fromDate.year;
            let toDate: any = this.getSeparateDate(dateRange.to);
            toDate = toDate.month + toDate.day + toDate.year;
            // get case types
            let casetype_handles = await page.$x('//select[@name="itype1"]/option');
            let casetypes = [];
            for (const handle of casetype_handles) {
                const {value, text} = await page.evaluate(el => ({value: el.value, text: el.textContent.trim()}), handle);
                casetypes.push([value, text]);
            }
            console.log(casetypes);
            
            for (let i = 1 ; i < casetypes.length ; i+=3) {
                let retries = 0;
                while (retries < 15) {
                    try {
                        await page.goto(this.urls.generalInfoPage, { waitUntil: 'load' });
                        break;
                    } catch (error) {
                        retries++;
                        console.log(`Page loading is failed, Retrying [${retries}]`);
                        await this.randomSleepIn5Sec();
                    }                    
                }
                if (retries === 15) return false;

                if (i < casetypes.length)
                    await page.select('select[name="itype1"]', casetypes[i][0]);
                if (i+1 < casetypes.length)
                    await page.select('select[name="itype2"]', casetypes[i+1][0]);
                if (i+2 < casetypes.length)
                    await page.select('select[name="itype3"]', casetypes[i+2][0]);

                await page.type('input[name="startdate"]', fromDate, {delay: 150});
                await page.type('input[name="enddate"]', fromDate, {delay: 150});
                await Promise.all([
                    page.click('input[name="search"]'),
                    page.waitForNavigation()
                ]);
                await page.waitFor(3000);

                const result_handle = await Promise.race([
                    page.waitForXPath('//*[contains(text(), "No Instruments")]'),
                    page.waitForXPath('//*[contains(text(), "# Hits")]')
                ]);
                const result_text = await page.evaluate(el => el.textContent, result_handle);
                if (result_text.indexOf('No Instruments') > -1) {
                    console.log('No Results Found');
                    continue;
                }
                
                const rows = await page.$x('//table[3]/tbody/tr');
                console.log(rows.length)
                for (const row of rows) {
                    let names  = await page.evaluate(el => el.children[5].textContent, row);
                    
                    let filling_date = await page.evaluate(el => el.children[6].textContent, row);
                    filling_date = filling_date.replace(/\s+|\n/gm, ' ').trim();
                    
                    let doctype = await page.evaluate(el => el.children[3].textContent, row);
                    doctype = doctype.replace(/\s+|\n/gm, ' ').trim();
                    doctype = casetypes.filter(ct => ct[0] === doctype)[0][1];
    
                    const saveRecord = await this.getData(filling_date, names, doctype);
                    saveRecord && countRecords++;
                }    
            }            
        } catch (error) {
            console.log(error);
            result = false;
        }

        console.log(`SAVED ${countRecords} records`);
        await AbstractProducer.sendMessage('anderson', 'Tennessee', countRecords, 'Civil');
        await page.close();
        await this.browser?.close();

        return result;
    }


}
