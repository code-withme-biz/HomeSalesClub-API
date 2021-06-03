import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';

export default class CivilProducer extends AbstractProducer {
    productId = '';
    sources =
      [
        { url: 'https://onbaseweb.ccpa.net/psi/v/search/case?Q=&IncludeSoundsLike=false&Count=20&fromAdv=1&CaseNumber=&LegacyCaseNumber=&ParcelNumber=&CaseType=1003&DateCommencedFrom=12%2F01%2F2020&DateCommencedTo=12%2F27%2F2020&FilingType=&FilingDateFrom=&FilingDateTo=&JudgeID=&Attorney=&AttorneyID=&Grid=true&adv=1', handler: this.handleSource1 }
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

    async setSearchCriteria(page: puppeteer.Page, dateRange: any) {
        // setting date range
        const dateHandle = await page.$x('//input[contains(@id, "DateCommenced")]');
        await dateHandle[0].click({clickCount: 3});
        await dateHandle[0].press('Backspace');
        await dateHandle[0].type(dateRange.from, {delay: 150});

        await dateHandle[1].click({clickCount: 3});
        await dateHandle[1].press('Backspace');
        await dateHandle[1].type(dateRange.to, {delay: 150});
    }

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

    async handleSource1(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;

        let dateRange = {
            from: this.getFormattedDate(new Date(await this.getPrevCodeViolationId(sourceId, true))),
            to: this.getFormattedDate(new Date())
        };
        console.log('loading page')
        const isPageLoaded = await this.openPage(page, link, '//button[@type="submit" and contains(text(), "Search")]');
        if (!isPageLoaded) {
            console.log('Page loading failed');
            return counts;
        }
        await this.setSearchCriteria(page, dateRange);
        
        const submitButton = await page.$x('//button[@type="submit" and contains(text(), "Search")]');
        await Promise.all([
            submitButton[0].click(),
            page.waitForNavigation()
        ]);

        let result_handle = await Promise.race([
            page.waitForXPath('//li[contains(text(), "No results")]', {visible: true}),
            page.waitForXPath('//span[contains(text(), "Displaying: ")]', {visible: true})
        ]);
        
        let result_text = await result_handle.evaluate(el => el.textContent || '');
        if (result_text?.indexOf('No results') > -1) {
            console.log('No Results Found');
            return counts;
        }
        // get results
        counts += await this.getData1(page, sourceId);
        await this.sleep(3000);
        return counts;
    }

    async getData1(page: puppeteer.Page, sourceId: number) {
        let counts = 0, pageNum = 1;

        while (true) {            
            const rowXpath = '//table/tbody/tr';
            const rows = await page.$x(rowXpath);
            for (const row of rows) {
                let fillingDate = await row.evaluate(el => el.children[2].textContent?.trim());
                let originalDocType = await row.evaluate(el => el.children[3].textContent?.trim());
                let ownerName = await row.evaluate(el => el.children[5].textContent?.trim());
                const timestamp = (new Date(fillingDate!)).getTime();
                let record = {
                    property_address: '',
                    caseType: originalDocType,
                    fillingDate,
                    sourceId,
                    codeViolationId: timestamp,
                    name: ownerName
                }
                if (await this.saveRecord(record)) {
                    counts++;
                }
            }
            let nextHandle = await page.$x(`//a[contains(text(), "Next")]`);
            if (nextHandle.length > 0) {
                await Promise.all([
                    nextHandle[0].click(),
                    page.waitForNavigation()
                ])
                pageNum++;
            } else {
                break;
            }            
        }
        return counts;
    }

    async saveRecord(record: any) {
        let data: any = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'Property Address': record.property_address,
            "vacancyProcessed": false,
            "productId": this.productId,
            fillingDate: record.fillingDate,
            originalDocType: record.caseType,
            sourceId: record.sourceId,
            codeViolationId: record.codeViolationId
        };
        if (record.name) {
            // save owner data
            let parseName: any = this.newParseName(record.name.trim());
            if (parseName.type && parseName.type == 'COMPANY') {
                return false;
            }
            data = {
                ...data,
                'First Name': parseName.firstName,
                'Last Name': parseName.lastName,
                'Middle Name': parseName.middleName,
                'Name Suffix': parseName.suffix,
                'Full Name': parseName.fullName
            }
        }
        return await this.civilAndLienSaveToNewSchema(data);
    }
}