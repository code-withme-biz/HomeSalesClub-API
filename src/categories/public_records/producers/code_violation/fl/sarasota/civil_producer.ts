import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
import db from '../../../../../../models/db';

const parser = require('parse-address');

export default class CivilProducer extends AbstractProducer {
    productId = '';

    sources =
        [
            { url: 'https://building.scgov.net/PublicPortal/Sarasota/SearchPermits.jsp', handler: this.handleSource1 },
            { url: 'https://trakit.venicegov.com/eTRAKiT/Search/case.aspx', handler: this.handleSource2 }
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
        // load page
        const isPageLoaded = await this.openPage(page, link, '//*[@id="IssueDate1"]');
        if (!isPageLoaded) {
            console.log("Website not loaded successfully:", link);
            return counts;
        }

        // get results
        counts += await this.getData1(page, sourceId);
        await this.sleep(3000);
        return counts;
    }

    getStartNumberString(startNum: number, lengthdigit = 5) {
        let result = startNum.toString().padStart(lengthdigit, '0');
        return result;
    }

    async handleSource2(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;
        let startNum = await this.getPrevCodeViolationId(sourceId, false, 1, true);

        for (let id = startNum; id < startNum + 200; id++) {
            // get year
            let year = (new Date()).getFullYear().toString().substr(-2);
            let startNumString = this.getStartNumberString(id);

            const isPageLoaded = await this.openPage(page, link, '//*[@id="cplMain_txtSearchString"]');
            if (!isPageLoaded) {
                console.log('Page loading is failed, trying next...');
                continue;
            }

            let caseId = 'CEEN' + year + "-" + startNumString;
            await Promise.all([
                page.select('#cplMain_ddSearchBy', 'Case_Main.CASE_NO'),
                page.waitForNavigation(),
            ]);
            await this.setSearchCriteria2(page, caseId);
            // click search button
            await page.click('#ctl00_cplMain_btnSearch');

            // wait for search result
            let result_handle = await Promise.race([
                page.waitForXPath('//*[@id="cplMain_lblNoSearchRslts"]', { visible: true }),
                page.waitForXPath('//*[@id="ctl00_cplMain_hlSearchResults"]', { visible: true })
            ]);
            let result_text = await result_handle.evaluate(el => el.textContent || '');
            if (result_text?.indexOf('no results') > -1) {
                console.log('No Results Found for : ' + caseId);
                break;
            }
            let yearForCode = (new Date()).getFullYear();
            let codeViolationId = parseInt(`${yearForCode}${id.toString().padStart(5, '0')}`);
            // get results
            counts += await this.getData2(page, sourceId, codeViolationId);
            await this.sleep(2000);
        }
        return counts;
    }

    async getData1(page: puppeteer.Page, sourceId: number) {
        let counts = 0;
        let dateRange = {
            from: new Date(await this.getPrevCodeViolationId(sourceId, true, (new Date('1/1/2020')).getTime())),
            to: new Date()
        };
        let fromDate = dateRange.from;
        let toDate = dateRange.to;
        while (fromDate <= toDate) {
            try {
                await page.goto('https://building.scgov.net/PublicPortal/Sarasota/SearchPermits.jsp', { waitUntil: 'load' })
                await page.waitForXPath('//*[@id="IssueDate1"]')

                await page.evaluate(() => {
                    // @ts-ignore
                    document.querySelector('#IssueDate1').value = '';
                    // @ts-ignore
                    document.querySelector('#IssueDate2').value = '';
                });
                console.log(this.getFormattedDate(fromDate))
                await page.type('#IssueDate1', this.getFormattedDate(fromDate), { delay: 150 });
                await page.type('#IssueDate2', this.getFormattedDate(fromDate), { delay: 150 });

                let buttonSearch = await page.$x('//*[@id="btnSearch"]');
                await buttonSearch[0]!.click();

                await page.waitForXPath('//*[@id="table1"]', { timeout: 60000 });
                let fillingdate = fromDate.toLocaleDateString('en-US');
                let totalRow = await page.$x('//table[@id="table1"]/tbody/tr[contains(@class,"FormtableData")]');
                for (let i = 0; i < totalRow!.length; i++) {
                    let casetype = (await totalRow[i].$eval('td:nth-child(6)', elem => elem.textContent))?.trim();
                    let address = await totalRow[i].$eval('td:nth-child(7)', elem => elem.textContent);
                    const timestamp = (new Date(fillingdate)).getTime();
                    if (await this.saveRecord(address!, casetype!, fillingdate, sourceId, timestamp))
                        counts++;
                }
                fromDate.setDate(fromDate.getDate() + 1);
            } catch (e) {
                fromDate.setDate(fromDate.getDate() + 1);
                continue
            }
        }
        return counts;
    }

    async setSearchCriteria2(page: puppeteer.Page, id: string) {

        // choose begin with
        await page.select('#cplMain_ddSearchOper', 'BEGINS WITH');
        // page loaded successfully

        let [input_handle] = await page.$x('//*[@id="cplMain_txtSearchString"]');
        await input_handle.type(id);
    }

    async getData2(page: puppeteer.Page, sourceId: number, codeViolationId: number) {
        let counts = 0;
        let index = 1;
        const rows = await page.$x('//table[contains(@id, "rgSearchRslts")]/tbody/tr');

        for (const row of rows) {
            try {
                const rowCaseType = await page.$x('//table[contains(@id, "rgSearchRslts")]/tbody/tr[' + index + ']/td[3]/span');
                let casetype = await page.evaluate(el => el.getAttribute('title'), rowCaseType[0]);
                casetype = casetype.replace(/\s+|\n/, ' ').trim();
                let property_address = await page.evaluate(el => el.children[4].textContent, row);
                property_address = property_address.replace(/\s+|\n/, ' ').trim();
                if (casetype == '' || property_address == '') {
                    index++;
                    continue
                }
                if (casetype == 'AVA') {
                    casetype = 'Abandoned Vehicle Abatement'
                }
                if (await this.saveRecord(property_address, casetype, '', sourceId, codeViolationId)) counts++;
            } catch (error) {
            }
            index++
        }
        return counts;
    }

    async saveRecord(address: string, caseType: string, fillingDate: string, sourceId: number, codeViolationId: number) {
        const parsed = parser.parseLocation(address);
        const number = parsed.number ? parsed.number : '';
        const street = parsed.street ? parsed.street : '';
        const type = parsed.type ? parsed.type : '';
        const propertyAddress = number + ' ' + street + ' ' + type;
        const propertyZip = parsed.zip ? parsed.zip : '';
        const propertyCity = parsed.city ? parsed.city : '';
        const data = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'Property Address': propertyAddress,
            'Property City': propertyCity,
            'Property Zip': propertyZip,
            "vacancyProcessed": false,
            "productId": this.productId,
            fillingDate,
            sourceId,
            codeViolationId,
            originalDocType: caseType
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }
}