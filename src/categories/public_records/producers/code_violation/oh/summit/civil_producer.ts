import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';

export default class CivilProducer extends AbstractProducer {
    sources =
      [
          { url: 'https://commdev.summitcountyco.gov/eTRAKiT3/Search/permit.aspx', handler: this.handleSource1 }
      ];

    async init(): Promise<boolean> {
        console.log("running init")
        this.browser = await this.launchBrowser();
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
        if (!page) return false;

        let sourceId = 0;
        for (const source of this.sources) {
            countRecords += await source.handler.call(this, page, source.url, sourceId);
            sourceId++;
        }

        await AbstractProducer.sendMessage(this.publicRecordProducer.state, this.publicRecordProducer.county ? this.publicRecordProducer.county : this.publicRecordProducer.city, countRecords, 'Code Violation');
        return true;
    }

    async handleSource1(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;
        let startNum = await this.getPrevCodeViolationId(sourceId, false, 0, true);
        let currYear = (new Date()).getFullYear();
        for (let year = startNum===0 ? 2020 : currYear ; year <= currYear ; year++) {
            for (let id = startNum ; id < 100 ; id++) {
                // load page
                const isPageLoaded = await this.openPage(page, link, '//*[@id="cplMain_txtSearchString"]');
                if (!isPageLoaded) {
                    console.log('Page loading is failed, trying next...');
                    continue;
                }
                await this.setSearchCriteria1(page, id, year);
                // click search button
                await page.click('#cplMain_btnSearch');
                // wait for search result
                let result_handle = await Promise.race([
                    page.waitForXPath('//*[@id="cplMain_lblNoSearchRslts"]', {visible: true}),
                    page.waitForXPath('//*[@id="cplMain_hlSearchResults"]', {visible: true})
                ]);
                let result_text = await result_handle.evaluate(el => el.textContent || '');
                if (result_text?.indexOf('no results') > -1) {
                    console.log('No Results Found');
                    break;
                }
                // get results
                let codeViolationId = parseInt(`${year}${id.toString().padStart(2, '0')}`);
                counts += await this.getData1(page, sourceId, codeViolationId);
                await this.sleep(3000);
            }
        }
        return counts;
    }

    async setSearchCriteria1(page: puppeteer.Page, id: number, year: number) {
        // get year
        // choose begin with
        await page.select('#cplMain_ddSearchOper', 'BEGINS WITH');
        // page loaded successfully
        let [input_handle] = await page.$x('//*[@id="cplMain_txtSearchString"]');
        await input_handle.type(`B${year-2000}-${id.toString().padStart(2, '0')}`, {delay: 100});
    }

    async getData1(page: puppeteer.Page, sourceId: number, codeViolationId: number) {
        let counts = 0;
        
        const [firstpagedisabled] = await page.$x('//*[contains(@id, "_btnPageFirst")][@disabled="disabled"]')
        if (!firstpagedisabled) {
            const [firstpage] = await page.$x('//*[contains(@id, "_btnPageFirst")]')
            await firstpage.click();
            await page.waitForXPath('//div[@id="cplMain_rlpSearch"]', {visible: true});
            await page.waitForXPath('//div[@id="cplMain_rlpSearch"]', {hidden: true});
        }
        while (true) {
            const rows = await page.$x('//table[contains(@id, "rgSearchRslts")]/tbody/tr');
            for (const row of rows) {
                try {
                    let casetype = await page.evaluate(el => el.children[3].textContent, row);
                    casetype = casetype.replace(/\s+|\n/, ' ').trim();
                    let property_address = await page.evaluate(el => el.children[1].textContent, row);
                    property_address = property_address.replace(/\s+|\n/, ' ').trim();
                    if (await this.saveRecord({property_address, casetype, sourceId, codeViolationId})) counts++;
                } catch (error) {
                }
            }
            const [nextpagedisabled] = await page.$x('//*[contains(@id, "_btnPageNext")][@disabled="disabled"]')
            if (nextpagedisabled) {
                break;
            } else {
                const [nextpage] = await page.$x('//*[contains(@id, "_btnPageNext")]')
                await nextpage.click();
                await page.waitForXPath('//div[@id="cplMain_rlpSearch"]', {visible: true});
                await page.waitForXPath('//div[@id="cplMain_rlpSearch"]', {hidden: true});
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
            originalDocType: record.casetype,
            sourceId: record.sourceId,
            codeViolationId: record.codeViolationId
        };
        if (record.fillingdate) data = {...data, fillingDate: record.fillingdate};
        if (record.owner_name) {
            // save owner data
            let parseName: any = this.newParseName(record.owner_name.trim());
            if (parseName.type && parseName.type == 'COMPANY') {
                return false;
            }
            data = {
                ...data,
                'First Name': parseName.firstName,
                'Last Name': parseName.lastName,
                'Middle Name': parseName.middleName,
                'Name Suffix': parseName.suffix,
                'Full Name': parseName.fullName,
            }
            if (record.owner_address) {
                data = {
                    ...data,
                    'Mailing Address': record.owner_address
                }
            }
        }
        console.log(data);

        return await this.civilAndLienSaveToNewSchema(data);
    }
}