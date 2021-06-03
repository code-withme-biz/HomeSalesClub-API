import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
export default class CivilProducer extends AbstractProducer {
    sources =
        [
            { url: 'https://roanokeweb.roanokeva.gov/etrakit/Search/case.aspx', handler: this.handleSource1 },
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

    getStartNumberString(startNum: number, lengthdigit = 5) {
        let result = startNum.toString().padStart(lengthdigit, '0');
        return result;
    }

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
        let startNum = await this.getPrevCodeViolationId(sourceId);
 
        for (let pre = startNum; pre < 10000; pre++) {
            // load page
            // get year
            const isPageLoaded = await this.openPage(page, link, '//*[@id="cplMain_txtSearchString"]');
            if (!isPageLoaded) {
                console.log('Page loading is failed, trying next...');
                continue;
            }

            await this.setSearchCriteria1(page, pre);
            // click search button
            await page.click('#cplMain_btnSearch');

            // wait for search result
            let result_handle = await Promise.race([
                page.waitForXPath('//*[@id="cplMain_lblNoSearchRslts"]', { visible: true }),
                page.waitForXPath('//*[@id="cplMain_hlSearchResults"]', { visible: true })
            ]);
            let result_text = await result_handle.evaluate(el => el.textContent || '');
            if (result_text?.indexOf('no results') > -1) {
                console.log('No Results Found');
                continue;
            }
            // get results
            counts += await this.getData1(page, sourceId, pre);
            await this.sleep(2000);
        }
        return counts;
    }

    async setSearchCriteria1(page: puppeteer.Page, pre: string) {
        await page.select('#cplMain_ddSearchBy', `Case_Main.CASE_NO`);
        await page.select('#cplMain_ddSearchOper', 'CONTAINS');
        
        let year = (new Date()).getFullYear().toString().substr(-2);
        let searchKey = `${year}-${pre.toString().padStart(4, '0')}`;
        let [input_handle] = await page.$x('//*[@id="cplMain_txtSearchString"]');
        await input_handle.type(searchKey);
        // page loaded successfully
    }

    async getData1(page: puppeteer.Page, sourceId: number, codeViolationId: number) {
        let counts = 0;
        let index = 1;
        const rows = await page.$x('//table[contains(@id, "rgSearchRslts")]/tbody/tr');

        for (const row of rows) {
            try {
                const rowCaseType = await page.$x('//table[contains(@id, "rgSearchRslts")]/tbody/tr[' + index + ']/td[4]/span');
                let casetype = await page.evaluate(el => el.getAttribute('title'), rowCaseType[0]);
                casetype = casetype.replace(/\s+|\n/, ' ').trim();
                let property_address = await page.evaluate(el => el.children[0].textContent, row);
                property_address = property_address.replace(/\s+|\n/, ' ').trim();
                if (casetype == '' || property_address == '') {
                    index++;
                    continue
                }
                if (await this.saveRecord({ property_address, casetype, sourceId, codeViolationId })) counts++;
            } catch (error) {
            }
            index++
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
        if (record.fillingdate) data = { ...data, fillingDate: record.fillingdate };
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