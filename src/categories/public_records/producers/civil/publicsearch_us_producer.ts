import AbstractProducer from "../abstract_producer";
import db from "../../../../models/db";
import puppeteer from "puppeteer";

// Abstract producer class with shared logic for the sites having similar structure, like https://ector.tx.publicsearch.us/
export default abstract class PublicSearchUsProducer extends AbstractProducer {
    abstract url: string;
    abstract state: string;
    abstract fullState: string;
    abstract county: string;

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

    async getData(page: puppeteer.Page) {
        let gridPage = 0, records = 0;
        while (gridPage >= 0) {
            try {
                console.log('next_page = ' + gridPage)
                const tableXpath = '//*[@id="page"]/div[3]/div/div[2]/div[1]/table/tbody';
                try {
                    await page.waitForXPath(tableXpath, {timeout: 60000});
                } catch (error) {
                    console.log(error);
                    break;
                }
                
                for (let i = 1; i <= 50; i++) {
                    const [nameEl] = await page.$x(`${tableXpath}/tr[${i}]/td[5]`);
                    const [typeEl] = await page.$x(`${tableXpath}/tr[${i}]/td[6]`);
                    const [dateEl] = await page.$x(`${tableXpath}/tr[${i}]/td[7]`);
                    
                    if (!nameEl || !dateEl || !typeEl) continue;

                    const name = await page.evaluate(el => el.textContent , nameEl);
                    const date = await page.evaluate(el => el.textContent , dateEl);
                    const type = await page.evaluate(el => el.textContent , typeEl);

                    let parsername: any = this.newParseName(name);
                    if (parsername.type === 'COMPANY' || parsername.fullName === '') continue;
                    
                    let practiceType = this.getPracticeType(type);
                    const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                    const product = await db.models.Product.findOne({name: productName}).exec();

                    let data = {
                        'Property State': this.state,
                        'County': this.county,
                        'First Name': parsername.firstName,
                        'Last Name': parsername.lastName,
                        'Middle Name': parsername.middleName,
                        'Name Suffix': parsername.suffix,
                        'Full Name': parsername.fullName,
                        vacancyProcessed: false,
                        fillingDate: date,
                        productId: product.id,
                        originalDocType: type
                    };
                    if(await this.civilAndLienSaveToNewSchema(data)){
                        records++;
                    }
                }

                gridPage++;
                const rows = await page.$x(`${tableXpath}/tr`);
                const [nextButtonDisabled] = await page.$x('//*[@class="pagination__page-jump pagination__disabled"][@aria-label="next page"]')
                if (rows.length < 50 || nextButtonDisabled) break;
                const [nextButtonEl] = await page.$x('//*[@class="pagination__page-jump"][@aria-label="next page"]');
                await Promise.all([
                    nextButtonEl.click(),
                    page.waitForNavigation()
                ]);
            } catch (e) {
                console.error(e);
                break;
            }
        }

        return records;
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (!page) return false;

        const startDateXpath = '//*[@class="react-datepicker-wrapper"][1]//input';
        const endDateXpath = '//*[@class="react-datepicker-wrapper"][2]//input';
        const searchButtonXpath = '//*[@id="page"]/div[3]/div[2]/form/div[1]/button';
        const sortByDateXpath = '//*[@id="page"]/div[3]/div/div[2]/div[1]/table/thead/tr/th[7]'
        let records = 0;
        try {
            let dateRange = await this.getDateRange(this.fullState, this.county);
            const endDate = dateRange.to;
            const startDate = dateRange.from;

            while (startDate < endDate) {
                await page.waitForXPath(startDateXpath);
                await (await page.$x(startDateXpath))[0].type(startDate.toLocaleDateString('en-US'), {delay: 100});
                await page.waitForXPath(endDateXpath);
                await (await page.$x(endDateXpath))[0].type(startDate.toLocaleDateString('en-US'), {delay: 100});
                await page.waitForXPath(searchButtonXpath);
                const [searchButton] = await page.$x(searchButtonXpath);
                await Promise.all([
                    searchButton.click(),
                    page.waitForNavigation()
                ]);
                const result_handle = await Promise.race([
                    page.waitForXPath('//*[contains(text(), "No Results Found")]'),
                    page.waitForXPath(sortByDateXpath)
                ]);
                const result_text = await page.evaluate(el => el.textContent, result_handle);
                if (result_text.indexOf('No Results Found') > -1) {
                    console.log('No Results Found');
                } else {
                    await (await page.$x(sortByDateXpath))[0].click();
                    records += await this.getData(page);
                }
                startDate.setDate(startDate.getDate()+1);
                await page.goto(this.url, {waitUntil: 'load'});
            }
            await AbstractProducer.sendMessage(this.county, this.fullState, records, 'Civil & Lien');
        } catch (e) {
            console.error(e);
            await AbstractProducer.sendMessage(this.county, this.fullState, records, 'Civil & Lien');
            return false;
        }

        return true;
    }
}
