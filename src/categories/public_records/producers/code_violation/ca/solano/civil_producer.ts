import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
export default class CivilProducer extends AbstractProducer {
    sources =
        [
            { url: 'https://permits.cityofvacaville.com/eTRAKiT3/Search/case.aspx', handler: this.handleSource1 },
            { url: 'http://web.ci.vallejo.ca.us/eTRAKiT3/Search/case.aspx', handler: this.handleSource2 },

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

    getStartNumberString(startNum: number, lengthdigit = 4) {
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
        let startCaseCodes = [
            { code: 'CANN', flagStop: false },
            { code: 'CEAC', flagStop: false },
            { code: 'CEAN', flagStop: false },
            { code: 'CEBL', flagStop: false },
            { code: 'CEDB', flagStop: false },
            { code: 'CEGR', flagStop: false },
            { code: 'CEOB', flagStop: false },
            { code: 'CEOT', flagStop: false },
            { code: 'CEPM', flagStop: false },
            { code: 'CEPR', flagStop: false },
            { code: 'CESW', flagStop: false },
            { code: 'CESO', flagStop: false },
            { code: 'CEUH', flagStop: false },
            { code: 'CEVB', flagStop: false },
            { code: 'CEVH', flagStop: false },
            { code: 'CEWA', flagStop: false },
            { code: 'CEWW', flagStop: false },
            { code: 'CEZO', flagStop: false },
            { code: 'COVD', flagStop: false },
        ]
        for (let id = startNum; id < startNum + 200; id++) {
            // load page


            // get year
            let year = (new Date()).getFullYear().toString().substr(-2);
            let startNumString = this.getStartNumberString(id);



            for (let caseCode = 0; caseCode < startCaseCodes.length; caseCode++) {
                if (startCaseCodes[caseCode].flagStop) {
                    console.log('Progress another case for id = ' + id);
                    continue
                }
                const isPageLoaded = await this.openPage(page, link, '//*[@id="cplMain_txtSearchString"]');
                if (!isPageLoaded) {
                    console.log('Page loading is failed, trying next...');
                    continue;
                }

                let caseId = startCaseCodes[caseCode].code + year + "-" + startNumString;

                await this.setSearchCriteria1(page, caseId);
                // click search button
                await page.click('#cplMain_btnSearch');

                // wait for search result
                let result_handle = await Promise.race([
                    page.waitForXPath('//*[@id="cplMain_lblNoSearchRslts"]', { visible: true }),
                    page.waitForXPath('//*[@id="cplMain_hlSearchResults"]', { visible: true })
                ]);
                let result_text = await result_handle.evaluate(el => el.textContent || '');
                if (result_text?.indexOf('no results') > -1) {
                    console.log('No Results Found for : ' + caseId);
                    startCaseCodes[caseCode].flagStop = true;
                    continue;
                }
                // get results
                counts += await this.getData1(page, sourceId, id);
                await this.sleep(2000);
            }
        }
        return counts;
    }

    async handleSource2(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;
        let startNum = await this.getPrevCodeViolationId(sourceId);
        let startCaseCodes = [
            { code: 'CE', flagStop: false },
            { code: 'CV', flagStop: false },
            { code: 'FP', flagStop: false },
            { code: 'PR', flagStop: false },
            { code: 'VA', flagStop: false },
        ]
        for (let id = startNum; id < startNum + 200; id++) {
            // load page

            // get year
            let year = (new Date()).getFullYear().toString().substr(-2);
            let startNumString = this.getStartNumberString(id);


            for (let caseCode = 0; caseCode < startCaseCodes.length; caseCode++) {
                if (startCaseCodes[caseCode].flagStop == true) {
                    console.log('Progress another case for id = ' + id);
                    continue
                }
                const isPageLoaded = await this.openPage(page, link, '//*[@id="cplMain_txtSearchString"]');
                if (!isPageLoaded) {
                    console.log('Page loading is failed, trying next...');
                    continue;
                }

                let caseId = startCaseCodes[caseCode].code + year + "-" + startNumString;
                await page.select('#cplMain_ddSearchBy', 'Case_Main.CASE_NO');
                await this.setSearchCriteria1(page, caseId);
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
                    startCaseCodes[caseCode].flagStop = true;
                    continue;
                }
                // get results
                counts += await this.getData2(page, sourceId, id, caseId);
                await this.sleep(2000);
            }
        }
        return counts;
    }

    async setSearchCriteria1(page: puppeteer.Page, id: string) {

        // choose begin with
        await page.select('#cplMain_ddSearchOper', 'BEGINS WITH');
        // page loaded successfully

        let [input_handle] = await page.$x('//*[@id="cplMain_txtSearchString"]');
        await input_handle.type(id);
    }

    async getData2(page: puppeteer.Page, sourceId: number, codeViolationId: number, caseId: string) {
        let counts = 0;
        let index = 1;
        const rows = await page.$x('//table[contains(@id, "rgSearchRslts")]/tbody/tr');

        for (const row of rows) {
            try {
                const rowCaseType = await page.$x('//table[contains(@id, "rgSearchRslts")]/tbody/tr[' + index + ']');

                let property_address = await page.evaluate(el => el.children[1].textContent, row);
                property_address = property_address.replace(/\s+|\n/, ' ').trim();
                await rowCaseType[0].click();
                await page.waitForXPath('//table[@id="cplMain_ctl02_dvCaseInfo"]/tbody/tr/td[contains(.,"' + caseId + '")]', { visible: true, timeout: 30000 });
                let casetypeXpath = '//table[@id="cplMain_ctl02_dvCaseInfo"]/tbody/tr[3]/td[2]';
                let casetype = await this.getTextByXpathFromPage(page, casetypeXpath);
                casetype = casetype.replace(/\s+|\n/, ' ').trim();
                if (casetype == '' || property_address == '') {
                    index++;
                    continue
                }
                if (casetype == 'AVA') {
                    casetype = 'Abandoned Vehicle Abatement';
                } else if (casetype == 'PMO') {
                    casetype = 'Property Maintenance Ordinance';
                }
                if (await this.saveRecord({ property_address, casetype, sourceId, codeViolationId })) counts++;
            } catch (error) {
            }
            index++
        }
        return counts;
    }

    async getData1(page: puppeteer.Page, sourceId: number, codeViolationId: number) {
        let counts = 0;
        let index = 1;
        const rows = await page.$x('//table[contains(@id, "rgSearchRslts")]/tbody/tr');

        for (const row of rows) {
            try {
                const rowCaseType = await page.$x('//table[contains(@id, "rgSearchRslts")]/tbody/tr[' + index + ']/td[2]/span');
                let casetype = await page.evaluate(el => el.getAttribute('title'), rowCaseType[0]);
                casetype = casetype.replace(/\s+|\n/, ' ').trim();
                let property_address = await page.evaluate(el => el.children[3].textContent, row);
                property_address = property_address.replace(/\s+|\n/, ' ').trim();
                if (casetype == '' || property_address == '') {
                    index++;
                    continue
                }
                if (casetype == 'AVA') {
                    casetype = 'Abandoned Vehicle Abatement'
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