import AbstractProducer from "../../abstract_producer";
import db from "../../../../../models/db";
import puppeteer from "puppeteer";
import { IPublicRecordProducer } from '../../../../../models/public_record_producer';

const removeRowArray = [
    'CITY', 'DEPT', 'CTY', 'UNITED STATES', 'BANK', 'FIA CARD SERVICES NA',
    'FLORIDA PACE FUNDING AGENCY', 'COUNTY', 'CREDIT', 'HOSPITAL', 'FUNDING', 'UNIVERSITY',
    'MEDICAL', 'CONDOMINIUM ASSOCIATION', 'LOTS', 'TEXAS STATE', 'VETERANS', 'SECRETARY', 'DEPARTMENT',
    'INDIVIDUAL', 'INDIVIDUALLY', 'FINANCE', 'CITIBANK', 'MERS', 'STATE TAX COMMISSION'
];
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i');

export default abstract class CountyRecorderAZ extends AbstractProducer {
    url: string = 'https://www.thecountyrecorder.com/Search.aspx';
    abstract state: string;
    abstract fullState: string;
    abstract county: string;

    
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
            await this.browserPages.generalInfoPage.goto(this.url, {waitUntil: 'load'});
            return true;
        } catch (err) {
            console.error(err);
            return false;
        }
    }

    async read(): Promise<boolean> {
        try {
            await this.browserPages.generalInfoPage?.waitForSelector('#content');
            return true;
        } catch (err) {
            console.error('Problem loading page', err);
            return false;
        }
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (!page) return false;

        let dateRange = await this.getDateRange(this.fullState, this.county);
        const endDate = dateRange.to;
        const startDate = dateRange.from;

        await page.waitFor(1000);
        await page.waitForXPath(`//select/option[text()="${this.fullState.toUpperCase()}"]`);
        const [option_state] = await page.$x(`//select/option[text()="${this.fullState.toUpperCase()}"]`);
        const state_value = await page.evaluate(el => el.value, option_state)
        await page.select('select[name$="cboStates"]', state_value);

        await page.waitForXPath(`//select/option[text()="${this.county.toUpperCase()}"]`);
        const [option_county] = await page.$x(`//select/option[text()="${this.county.toUpperCase()}"]`);
        const county_value = await page.evaluate(el => el.value, option_county)
        await Promise.all([
            page.select('select[name$="cboCounties"]', county_value),
            page.waitForNavigation()
        ]);

        await page.waitForSelector('#TreeView1t6');
        await Promise.all([
            page.click('#TreeView1t6'),
            page.waitForNavigation()
        ]);
        await page.type('input[name$="tbDateStart"]', this.getFormattedDate(startDate), {delay: 100});
        await page.waitFor(1000);
        await page.type('input[name$="tbDateEnd"]', this.getFormattedDate(endDate), {delay: 100});
        await page.waitFor(1000);
        await Promise.all([
            page.click('input[name$="btnSearchDocuments"]'),
            page.waitForNavigation()
        ]);
        const [noresult] = await page.$x('//*[contains(@id, "lblNoDocuments")]');
        if (noresult) {
            console.log('No results found.');
            return false;
        }
        let records = 0;
        await page.waitForXPath('//span[contains(@id, "lblNumberOfResultPages")]');
        let total_pages: any = await page.$x('//span[contains(@id, "lblNumberOfResultPages")]');
        total_pages = await page.evaluate(el => el.textContent.trim(), total_pages[0]);
        total_pages = parseInt(total_pages.slice(3));
        console.log('total_pages = ', total_pages)
        let current_page = 1;
        let results = [];

        try {
            await page.waitForXPath('//table[@class="Results MainBody"]');
            while (true) {
                const rows = await page.$x('//table[@class="Results MainBody"]/tbody/tr[position()>1]');
                for (const row of rows) {
                    let fillingDate = await page.evaluate(el => el.children[2].textContent, row);
                    fillingDate = fillingDate.replace(/\s+|\n/, ' ').trim();
                    let docType = await page.evaluate(el => el.children[3].textContent, row);
                    docType = docType.replace(/\s+|\n/, ' ').trim();
                    let allnames = await page.evaluate(el => el.children[4].innerText, row);
                    allnames = allnames.trim().split('\n').map((name:string) => name.trim());
                    let nametypes = await page.evaluate(el => el.children[5].innerText, row);
                    nametypes = nametypes.trim().split('\n').map((name:string) => name.trim());
                    let names = [];
                    for (let i = 0 ; i < nametypes.length ; i++) {
                        if (nametypes[i] === 'Grantee' || nametypes[i] === '') {
                            names.push(allnames[i]);
                        }
                    }
                    for (const name of names) {
                        if (removeRowRegex.test(name)) continue;
                        const parseName: any = this.newParseName(name.trim())
                        if (parseName?.type && parseName?.type == 'COMPANY') continue;

                        let practiceType = this.getPracticeType(docType)
                        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                        results.push({
                            parseName,
                            fillingDate,
                            docType,
                            productName
                        });
                    }
                }

                current_page++;
                if (current_page > total_pages) break;
                await Promise.all([
                    page.select('select[name$="cboNumberOfResultPages"]', current_page.toString()),
                    page.waitForNavigation()
                ]);
                await this.randomSleepIn5Sec();
            }
            console.log('/////// FINISHED TO FETCH DATA length = ', results.length);
            records = await this.saveRecords(results, this.publicRecordProducer.state, this.publicRecordProducer.county);
            await AbstractProducer.sendMessage(this.county, this.fullState, records, 'Civil & Lien');
        } catch (e) {
            console.error(e);
            records = await this.saveRecords(results, this.publicRecordProducer.state, this.publicRecordProducer.county);
            await AbstractProducer.sendMessage(this.county, this.fullState, records, 'Civil & Lien');
            return false;
        }

        return true;
    }
}
