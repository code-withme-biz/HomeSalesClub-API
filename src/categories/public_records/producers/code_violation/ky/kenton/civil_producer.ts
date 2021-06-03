import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
import db from '../../../../../../models/db';

const MONTHSONNUMBER = [
    '01',
    '02',
    '03',
    '04',
    '05',
    '06',
    '07',
    '08',
    '09',
    '10',
    '11',
    '12'
];

export default class CivilProducer extends AbstractProducer {
    productId = '';

    sources =
        [
            { url: 'http://etrakit.pdskc.org/Search/case.aspx', handler: this.handleSource1 }
        ];

    async init(): Promise<boolean> {
        console.log("running init")
        this.browser = await this.launchBrowser();
        this.browserPages.generalInfoPage = await this.browser.newPage();
        this.browserPages.generalInfoPage.setDefaultTimeout(200000);
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
        let startNum = await this.getPrevCodeViolationId(sourceId, false, 1, true);
        let startCaseCodes = [
            { code: 'CE', flagStop: false },
            { code: 'VF', flagStop: false },
        ]
        for (let id = startNum; id < startNum + 200; id++) {
            // load page

            // get year
            let year = (new Date()).getFullYear().toString().substr(-2);
            let startNumString = this.getStartNumberString1(id);


            for (let caseCode = 0; caseCode < startCaseCodes.length; caseCode++) {

                for (let k = 0; k < MONTHSONNUMBER.length; k++) {
                    const isPageLoaded = await this.openPage(page, link, '//*[@id="cplMain_txtSearchString"]');
                    if (!isPageLoaded) {
                        console.log('Page loading is failed, trying next...');
                        continue;
                    }

                    let caseId = startCaseCodes[caseCode].code + year + MONTHSONNUMBER[k] + "-" + startNumString;
                    await Promise.all([
                        page.select('#cplMain_ddSearchBy', 'Case_Main.CASE_NO'),
                        page.waitForNavigation(),
                    ]);
                    await this.setSearchCriteria1(page, caseId);
                    // click search button
                    await page.click('#ctl00_cplMain_btnSearch');

                    // wait for search result
                    let result_handle = await Promise.race([
                        page.waitForXPath('//*[@id="cplMain_lblNoSearchRslts"]', { visible: true }),
                        page.waitForXPath('//*[@id="ctl00_cplMain_hlSearchResults"]', { visible: true })
                    ]);
                    let result_text = await result_handle.evaluate(el => el.textContent || '');
                    if (result_text?.indexOf('no results') > -1) {
                        console.log('No Results Found');
                        continue;
                    }
                    let yearForCode = (new Date()).getFullYear();
                    // get results
                    let codeViolationId = parseInt(`${yearForCode}${id.toString().padStart(4, '0')}`);
                    counts += await this.getData1(page, sourceId, codeViolationId, caseId);
                    await this.sleep(2000);
                }
            }
        }
        return counts;
    }

    getStartNumberString1(startNum: number, lengthdigit = 4) {
        let result = startNum.toString().padStart(lengthdigit, '0');
        return result;
    }

    async setSearchCriteria1(page: puppeteer.Page, id: string) {

        // choose begin with
        await page.select('#cplMain_ddSearchOper', 'BEGINS WITH');
        // page loaded successfully

        let [input_handle] = await page.$x('//*[@id="cplMain_txtSearchString"]');
        await input_handle.type(id);
    }

    async getData1(page: puppeteer.Page, sourceId: number, codeViolationId: number, caseId: string) {
        let counts = 0;
        let index = 1;
        const rows = await page.$x('//table[contains(@id, "rgSearchRslts")]/tbody/tr');
        for (const row of rows) {
            try {
                const rowCaseType = await page.$x('//table[contains(@id, "rgSearchRslts")]/tbody/tr[' + index + ']/td[2]/span');
                let casetype = await page.evaluate(el => el.getAttribute('title'), rowCaseType[0]);
                casetype = casetype.replace(/\s+|\n/, ' ').trim();
                let property_address = await page.evaluate(el => el.children[2].textContent, row);
                property_address = property_address.replace(/\s+|\n/, ' ').trim();
                casetype = casetype.replace(/\s+|\n/, ' ').trim();
                casetype = casetype.replace('RV ', 'RECREATIONAL VEHICLE ').trim();
                if (casetype == '' || property_address == '') {
                    index++;
                    continue
                }
                if (casetype == 'AVA') {
                    casetype = 'Abandoned Vehicle Abatement'
                }
                if (await this.saveRecord({ property_address, casetype, sourceId, codeViolationId })) counts++;
            } catch (error) {
                console.log(error)
            }
            index++
        }
        return counts;
    }

    async saveRecord(record: any) {
        // save property data
        const data = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'Property Address': record.property_address,
            "vacancyProcessed": false,
            "productId": this.productId,
            originalDocType: record.casetype,
            sourceId: record.sourceId,
            codeViolationId: record.codeViolationId
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }
}