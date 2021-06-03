import AbstractProducer from "../../../abstract_producer";
import db from "../../../../../../models/db";
import puppeteer from "puppeteer";
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

export default class CivilProducer extends AbstractProducer {
    urls = {
        generalInfoPage: 'https://apps.suttercounty.org/apps/recordsquery/clerk/or_date.aspx'
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
            console.error(err);
            return false;
        }
    }

    async read(): Promise<boolean> {
        try {
            await this.browserPages.generalInfoPage?.waitForSelector('#mainContainer');
            return true;
        } catch (err) {
            console.error('Problem loading page', err);
            return false;
        }
    }

    async getData(page: puppeteer.Page, products: any[], otherCivilProduct: any) {
        const sortByDateSelector = '//*[@id="Template_templateControl_OfficialRecordsDataGrid1"]/p/table/tbody/tr[1]/td/table[2]/tbody/tr[1]/td[2]/a';
        await page.waitForXPath(sortByDateSelector);
        const sortByDateLink = await page.$x(sortByDateSelector);
        await sortByDateLink[0].click();

        let gridPage = 0, records = 0, retries = 0;
        while (gridPage >= 0) {
            try {
                await page.waitForXPath('//*[@id="Template_templateControl_OfficialRecordsDataGrid1"]/p/table/tbody/tr[1]/td/table[2]/tbody');
                retries = 0;
                for (let i = 2; i < 12; i++) {
                    const rowSelector = `//*[@id="Template_templateControl_OfficialRecordsDataGrid1"]/p/table/tbody/tr[1]/td/table[2]/tbody/tr[${i}]`
                    const nameEl = await page.$x(`${rowSelector}/td[1]`);
                    const dateEl = await page.$x(`${rowSelector}/td[2]`);
                    const typeEl = await page.$x(`${rowSelector}/td[4]`);
                    if (!nameEl.length || !dateEl.length || !typeEl.length) continue;

                    const name = await page.evaluate(el => el.textContent, nameEl[0]);
                    const date = await page.evaluate(el => el.textContent, dateEl[0]);
                    const type = await page.evaluate(el => el.textContent, typeEl[0]);

                    if (!/.*, .*/.test(name) || !/^[A-Za-z-, ]+$/.test(name)) continue;
                    const parseName: any = this.newParseName(name.trim());
                    if (parseName.type && parseName.type == 'COMPANY') {
                        continue
                    }

                    const nameParts = name.split(' ');
                    const suffixIndex = nameParts.findIndex((part: string) => ['I', 'II', 'III', 'IV', 'V', 'ESQ', 'JR', 'SR'].includes(part));
                    let suffix = null;
                    if (suffixIndex > -1) {
                        suffix = nameParts[suffixIndex];
                        nameParts.splice(suffixIndex, 1);
                    }

                    let practiceType = this.getPracticeType(type);
                    const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                    const prod = await db.models.Product.findOne({ name: productName }).exec();

                    let data = {
                        'Property State': 'CA',
                        'County': 'Sutter',
                        'First Name': parseName.firstName,
                        'Last Name': parseName.lastName,
                        'Middle Name': parseName.middleName,
                        'Name Suffix': parseName.suffix,
                        'Full Name': parseName.fullName,
                        vacancyProcessed: false,
                        fillingDate: date.trim(),
                        productId: prod.id,
                        originalDocType: type
                    }
                    if (await this.civilAndLienSaveToNewSchema(data)) {
                        records++;
                    }


                }

                gridPage++;
                let nextGridPage = gridPage % 6 || 6;
                if (gridPage > 6) nextGridPage++;

                const nextGridPageEl = await page.$x(`//*[@id="Template_templateControl_OfficialRecordsDataGrid1"]/p/table/tbody/tr[1]/td/table[2]/tbody/tr[12]/td/a[${nextGridPage}]`)
                if (!nextGridPageEl.length) break;
                await nextGridPageEl[0].click();
            } catch (e) {
                retries++;
                if (retries > 3) {
                    console.error(e);
                    break;
                }
                console.log('retrying... ', retries);
                await this.sleep(1000);
            }
        }

        await AbstractProducer.sendMessage('Sutter', 'California', records, 'Civil & Lien');
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (!page) return false;

        const startDateSelector = '#Template_templateControl_OfficialRecordsDataGrid1_datePicker1';
        const endDateSelector = '#Template_templateControl_OfficialRecordsDataGrid1_datePicker2';
        const submitButtonSelector = '#Template_templateControl_OfficialRecordsDataGrid1_btnSubmit';

        try {
            await page.evaluate(({ startDateSelector, endDateSelector }) => {
                document.querySelector(startDateSelector)?.removeAttribute('readonly');
                document.querySelector(endDateSelector)?.removeAttribute('readonly');
            }, { startDateSelector, endDateSelector });

            let dateRange = await this.getDateRange('California', 'Sutter');
            let date = dateRange.from;
            let today = dateRange.to;
            let fromDateFix = this.getFormattedDate(date);
            let toDateFix = this.getFormattedDate(today);

            await page.type(startDateSelector, fromDateFix);
            await page.type(endDateSelector, toDateFix);
            await page.click(submitButtonSelector);

            let products = await db.models.Product
                .find({ name: { $regex: '/ca/sutter.*' } })
                .exec();
            products = products.map(product => {
                const prod = { name: product.name.split('/').pop(), id: product._id };
                if (prod.name === 'code-violation') prod.name = 'violation';
                if (prod.name === 'mortgage-lien') prod.name = 'mortgage';
                if (prod.name === 'tax-lien') prod.name = 'tax lien';
                return prod;
            });
            const otherCivilProduct = products.find(prod => prod.name === 'other-civil');

            await this.getData(page, products, otherCivilProduct);
        } catch (e) {
            console.error(e);
            await AbstractProducer.sendMessage('Sutter', 'California', 0, 'Civil & Lien');
            return false;
        }

        return true;
    }
}
