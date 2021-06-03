import puppeteer from 'puppeteer';
import AbstractProducer from '../abstract_producer';

export default abstract class CodeViolationNJ extends AbstractProducer {
    abstract county: string;
    productId = '';
    sources =
      [
        { url: 'https://www13.state.nj.us/DataMiner/Search/SearchByCategory?isExternal=y&getCategory=y&catName=Compliance+and+Enforcement', handler: this.handleSource }
      ];

    async init(): Promise<boolean> {
        console.log("running init")
        this.browser = await this.launchBrowser();
        this.browserPages.generalInfoPage?.setDefaultTimeout(60000);
        this.browserPages.generalInfoPage = await this.browser.newPage();
        await this.setParamsForPage(this.browserPages.generalInfoPage);
        return true;
    };

    async read(): Promise<boolean> {
      return true;
    };

    async parseAndSave(): Promise<boolean> {
        let countRecords = 0;
        let page = this.browserPages.generalInfoPage;
        if (!page) {
            return false;
        }
        let sourceId = 0;
        for (const source of this.sources) {
            countRecords += await source.handler.call(this, page, source.url, sourceId);
            sourceId++;
        }
        
        console.log('---- ', countRecords);
        await AbstractProducer.sendMessage(this.publicRecordProducer.state, this.publicRecordProducer.county ? this.publicRecordProducer.county : this.publicRecordProducer.city, countRecords, 'Code Violation');
        return true;
    }

    async handleSource(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;

        let dateRange = {
            from: this.getFormattedDate(new Date(await this.getPrevCodeViolationId(sourceId, true))),
            to: this.getFormattedDate(new Date())
        };
        console.log('loading page')
        const isPageLoaded = await this.openPage(page, link, '//*[@id="btnGo"]');
        if (!isPageLoaded) {
            console.log('Page loading failed');
            return counts;
        }
        await page.click('#btnGo');
        await page.waitForSelector('#loading', {hidden: true});
        await page.waitForXPath('//*[text()="Enforcement Actions Issued By County and Date"]', {visible: true});

        const [buttonByCounty] = await page.$x('//*[text()="Enforcement Actions Issued By County and Date"]');
        await buttonByCounty.click();
        await page.waitForSelector('#loading', {hidden: true});
        await page.waitForSelector('select', {visible: true});

        await page.select('select', this.county.charAt(0).toUpperCase() + this.county.slice(1) + ';');
        const [startInput] = await page.$x('//*[@name="2) Enter Start Date of Search:"]')
        await page.evaluate(el => el.value = '', startInput);
        await startInput.type(dateRange.from, {delay: 100});
        const [endInput] = await page.$x('//*[@name="3) Enter End Date of Search:"]')
        await page.evaluate(el => el.value = '', endInput);
        await endInput.type(dateRange.to, {delay: 100});

        await page.click('#btnRunReport');
        await page.waitForSelector('#loading', {hidden: true});
        await page.waitForSelector('#htmlcontentReportRenderer2', {visible: true});

        // get results
        counts += await this.getData1(page, sourceId);
        await this.sleep(3000);
        return counts;
    }

    async getData1(page: puppeteer.Page, sourceId: number) {
        let counts = 0;
        while (true) {            
            let fillingDate = await this.getTextByXpathFromPage(page, '//*[contains(text(), "Current Document")]/ancestor::table[1]/preceding-sibling::table[1]');
            let originalDocType = await this.getTextByXpathFromPage(page, '//*[text()="Document Type:"]/ancestor::table[1]/preceding-sibling::table[1]');
            let address = await this.getTextByXpathFromPage(page, '//*[contains(text(), "Location Address:")]/ancestor::table[1]/preceding-sibling::table[1]');
            
            const timestamp = fillingDate ? (new Date(fillingDate!)).getTime() : (new Date()).getTime();
            if (await this.saveRecord(address!, originalDocType!, fillingDate!, sourceId, timestamp)) {
                counts++;
            }
            let nextHandle = await page.$x(`//*[@rel="next"]`);
            if (nextHandle.length > 0) {
                await nextHandle[0].click();
                await page.waitForSelector('#loading', {hidden: true});
                await page.waitForSelector('#htmlcontentReportRenderer2', {visible: true});
            } else {
                break;
            }            
        }
        return counts;
    }

    async saveRecord(address: string, caseType: string, fillingDate: string, sourceId: number, codeViolationId: number) {
        const data = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'Property Address': address,
            "vacancyProcessed": false,
            "productId": this.productId,
            fillingDate,
            originalDocType: caseType,
            sourceId,
            codeViolationId
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }
}