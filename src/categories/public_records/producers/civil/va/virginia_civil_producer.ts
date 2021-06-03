import AbstractProducer from "../../abstract_producer";
import db from "../../../../../models/db";
import puppeteer from "puppeteer";
import { IPublicRecordProducer } from '../../../../../models/public_record_producer';
import { resolveRecaptcha2 } from '../../../../../services/general_service';

export default abstract class CountyRecorderAZ extends AbstractProducer {
    url: string = 'https://eapps.courts.state.va.us/gdcourts/';
    abstract state: string;
    abstract fullState: string;
    abstract county: string;
    abstract courtNames: string[];

    
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
            await this.browserPages.generalInfoPage?.waitForSelector('.breadcrumbtoplinks');
            return true;
        } catch (err) {
            console.error('Problem loading page', err);
            return false;
        }
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (!page) return false;
        let records = 0;
        let dateRange = await this.getDateRange(this.fullState, this.county);
        let toDate = dateRange.to;
        let fromDate = dateRange.from;
        try{
            for(const courtName of this.courtNames){
                await page.goto(this.url, {waitUntil: 'networkidle0'});
                let [accept] = await page.$x('//input[@title="Accept"]');
                if(accept){
                    console.log("Resolving captcha...");
                    const captchaSolution: any = await resolveRecaptcha2('6Lf9chsUAAAAAEH2GnfQLWmqsqZM5RdQ9MqSYPtg', await page.url());
                    let recaptchaHandle = await page.$x('//*[@id="g-recaptcha-response"]');
                    await recaptchaHandle[0].evaluate((elem: any, captchaSolution: any) => elem.innerHTML = captchaSolution, captchaSolution);
                    let callback = `onSubmit("${captchaSolution}")`;
                    await page.evaluate(callback);
                    console.log("Done.");
                    await this.sleep(3000);
                }
                await page.click('img#btndropdown1');
                await this.sleep(1000);
                let [selectCourt] = await page.$x('//a[text()="'+courtName+'"]');
                if(selectCourt){
                    await Promise.all([
                        selectCourt.click(),
                        page.waitForNavigation({waitUntil: 'networkidle0'})
                    ]);
                } else {
                    console.log('Court name of the county is not found!!');
                    await AbstractProducer.sendMessage(this.county, this.fullState, records, 'Civil & Lien');
                    return false;
                }
                while (fromDate <= toDate) {
                    let fromDateString = this.getFormattedDate(fromDate);
                    let [searchLink] = await page.$x('//div[@class="civiltab"]//a[text()="Hearing Date Search"]');
                    await Promise.all([
                        searchLink.click(),
                        page.waitForNavigation({waitUntil: 'networkidle0'})
                    ]);
                    await page.type('input#txthearingdate', fromDateString, {delay: 100});
                    let [submitButton] = await page.$x('//input[@name="caseSearch"]');
                    await Promise.all([
                        submitButton.click(),
                        page.waitForNavigation({waitUntil: 'networkidle0'})
                    ]);
                    let [notFound] = await page.$x('//td[contains(text(), "No results found")]');
                    if(notFound){
                        console.log(fromDateString, "=> Not found!");
                        fromDate.setDate(fromDate.getDate()+1);
                        continue;
                    }
                    let nextPage = true;
                    let pageNum = 1;
                    while(nextPage){
                        console.log("Processing", fromDateString, ", page", pageNum);
                        let searchResults = await page.$x('//table[@class="tableborder"]/tbody/tr');
                        searchResults.shift();
                        for(const row of searchResults){
                            let name = await row.evaluate(el => el.children[2].textContent?.trim());
                            let caseType = await row.evaluate(el => el.children[4].textContent?.trim());
                            let parsername: any = this.newParseName(name!);
                            if (parsername.type === 'COMPANY' || parsername.fullName === '') continue;
                            
                            let practiceType = this.getPracticeType(caseType!);
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
                                fillingDate: fromDateString,
                                productId: product.id,
                                originalDocType: caseType
                            };
                            if(await this.civilAndLienSaveToNewSchema(data)){
                                records++;
                            }
                        }
                        let [checkNextPage] = await page.$x('//input[@name="caseInfoScrollForward"]');
                        if(checkNextPage){
                            await Promise.all([
                                checkNextPage.click(),
                                page.waitForNavigation({waitUntil: 'networkidle0'})
                            ]);
                        } else {
                            break;
                        }
                        pageNum++;
                    }
                    fromDate.setDate(fromDate.getDate()+1);
                }
                await AbstractProducer.sendMessage(this.county, this.fullState, records, 'Civil & Lien');
            }
        } catch (e) {
            console.error(e);
            await AbstractProducer.sendMessage(this.county, this.fullState, records, 'Civil & Lien');
            return false;
        }

        return true;
    }
}
