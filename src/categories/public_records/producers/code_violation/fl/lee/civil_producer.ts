import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
import db from '../../../../../../models/db';
const parser = require('parse-address');

export default class CivilProducer extends AbstractProducer {
    productId = '';

    sources =
        [
            { url: 'https://accelaaca.leegov.com/ACA/Cap/CapHome.aspx?module=CodeEnforcement&TabName=CodeEnforcement', handler: this.handleSource1 },
            { url: 'https://etrakit.capecoral.net/etrakit3/Search/case.aspx', handler: this.handleSource2 },
            { url: 'https://cdservices.cityftmyers.com/EnerGovProd/SelfService#/search', handler: this.handleSource3 }
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

        const practiceType = 'code-violation';
        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        this.productId = await db.models.Product.findOne({ name: productName }).exec();

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
        const isPageLoaded = await this.openPage(page, link, '//select[@id="ctl00_PlaceHolderMain_generalSearchForm_ddlGSPermitType"]');
        if (!isPageLoaded) {
            console.log("Website not loaded successfully:", link);
            return counts;
        }

        // get results
        counts += await this.getData1(page, sourceId);
        await this.sleep(3000);
        return counts;
    }

    async getData1(page: puppeteer.Page, sourceId: number) {
        let counts = 0;
        let dateRange = {
            from: new Date(await this.getPrevCodeViolationId(sourceId, true)),
            to: new Date()
        };
        let fromDate = dateRange.from;
        let toDate = dateRange.to;
        console.log(this.getFormattedDate(fromDate))
        while (fromDate <= toDate) {
            try {
                let valueForSelect = ['CodeEnforcement/Complaint/NA/NA', 'CodeEnforcement/Hex/NA/NA', 'CodeEnforcement/Truck Citation/NA/NA', 'CodeEnforcement/Tag and Tow/NA/NA', 'CodeEnforcement/Lot Mowing/NA/NA', 'CodeEnforcement/Minimum Housing/NA/NA', 'CodeEnforcement/Nuisance Accumulation/NA/NA', 'CodeEnforcement/ROW Miscellaneous/NA/NA', 'CodeEnforcement/Unsafe Building/NA/NA'];
                let docTypeArr = ['Code Enforcement Complaint', 'Code Violation', 'Commercial Truck Citation', 'Inoperable/Unregistered Vehicle', 'Lot Mow Violation', 'Minimum Housing Violation', 'Nuisance Accumulation Violation', 'ROW Misc Violation', 'Unsafe Building Violation'];

                for (let j = 0; j < valueForSelect.length; j++) {
                    await page.goto('https://accelaaca.leegov.com/ACA/Cap/CapHome.aspx?module=CodeEnforcement&TabName=CodeEnforcement');
                    await page.waitForXPath('//select[@id="ctl00_PlaceHolderMain_generalSearchForm_ddlGSPermitType"]', { visible: true, timeout: 200000 });
                    await page.evaluate(() => {
                        // @ts-ignore
                        document.querySelector('#ctl00_PlaceHolderMain_generalSearchForm_txtGSStartDate').value = '';
                        // @ts-ignore
                        document.querySelector('#ctl00_PlaceHolderMain_generalSearchForm_txtGSEndDate').value = '';
                    })
                    await page.select('#ctl00_PlaceHolderMain_generalSearchForm_ddlGSPermitType', valueForSelect[j]);

                    await page.waitForXPath('//div[@id="divGlobalLoading" and contains(@style,"display: block;")]', { visible: true, timeout: 5000 });
                    await this.sleep(5000);
                    console.log(this.getFormattedDate(fromDate))
                    await page.type('#ctl00_PlaceHolderMain_generalSearchForm_txtGSStartDate', this.getFormattedDate(fromDate), { delay: 150 });
                    await page.type('#ctl00_PlaceHolderMain_generalSearchForm_txtGSEndDate', this.getFormattedDate(fromDate), { delay: 150 });


                    let buttonSearch = await page.$x('//a[@id="ctl00_PlaceHolderMain_btnNewSearch"]');
                    await buttonSearch[0]!.click();

                    try {
                        await page.waitForXPath('//span[contains(.,"Showing")]', { visible: true, timeout: 8000 });
                    } catch (err) {
                        console.log('No Result For ' + docTypeArr[j]);
                        continue
                    }
                    let flagStop = false;
                    while (!flagStop) {
                        await page.waitForXPath('//div[@id="divGlobalLoading" and contains(@style,"display: none;")]', { timeout: 60000 });
                        let casetype = docTypeArr[j];
                        let fillingdate = fromDate.toLocaleDateString('en-US');
                        let totalRow = await page.$x('//table[@id="ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList"]/tbody/tr[contains(@class,"ACA_TabRow_Odd") or contains(@class,"ACA_TabRow_Even")]');
                        for (let l = 0; l < totalRow!.length; l++) {
                            let index = l + 1;
                            let [addressXpath] = await page.$x('//table[@id="ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList"]/tbody/tr[contains(@class,"ACA_TabRow_Odd") or contains(@class,"ACA_TabRow_Even")][' + index + ']/td[3]');
                            let address;
                            try {
                                address = await addressXpath.evaluate(el => el.textContent?.trim());
                            } catch (err) {
                                continue
                            }

                            let record = {
                                property_address: address,
                                fillingdate,
                                casetype,
                                sourceId,
                                codeViolationId: (new Date(fillingdate!)).getTime()
                            };
                            if (await this.saveRecord(record)) {
                                counts++;
                            }
                        }
                        try {
                            let btnNext = await page.$x('//a[contains(.,"Next") and contains(@href,"javascript")]');
                            await btnNext[0].click();
                            await this.sleep(2000);
                        } catch (err) {
                            flagStop = true
                        }
                    }

                }
                fromDate.setDate(fromDate.getDate() + 1);
            } catch (e) {
                fromDate.setDate(fromDate.getDate() + 1);
                continue
            }
        }
        return counts;
    }

    async handleSource2(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;
        let startNum = await this.getPrevCodeViolationId(sourceId, false, 1, true);
        let startCaseCodes = [
            { code: 'CE', flagStop: false },
            { code: 'FD', flagStop: false },
        ]
        for (let id = startNum; id < startNum + 200; id++) {
            // load page


            // get year
            let year = (new Date()).getFullYear().toString().substr(-2);
            let startNumString = this.getStartNumberString(id);



            for (let caseCode = 0; caseCode < startCaseCodes.length; caseCode++) {
                const isPageLoaded = await this.openPage(page, link, '//*[@id="cplMain_txtSearchString"]');
                if (!isPageLoaded) {
                    console.log('Page loading is failed, trying next...');
                    continue;
                }

                let caseId = startCaseCodes[caseCode].code + year + "-" + startNumString;
                await page.select('#cplMain_ddSearchBy', 'Case_Main.CASE_NO');
                await this.setSearchCriteria2(page, caseId);
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
                    continue;
                }
                let yearForCode = (new Date()).getFullYear();
                let codeViolationId = parseInt(`${yearForCode}${id.toString().padStart(6, '0')}`);
                // get results
                counts += await this.getData2(page, sourceId, codeViolationId);
                await this.sleep(2000);
            }
        }
        return counts;
    }

    getStartNumberString(startNum: number, lengthdigit = 6) {
        let result = startNum.toString().padStart(lengthdigit, '0');
        return result;
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
                const rowCaseType = await page.$x('//table[contains(@id, "rgSearchRslts")]/tbody/tr[' + index + ']/td[4]/span');
                let casetype = await page.evaluate(el => el.getAttribute('title'), rowCaseType[0]);
                casetype = casetype.replace(/\s+|\n/, ' ').trim();
                casetype = casetype.replace("RV ", "Recreational-Vehicle ");
                casetype = casetype.replace(" VHR", " Vacation Home Rentals");
                let property_address = await page.evaluate(el => el.children[2].textContent, row);
                property_address = property_address.replace(/\s+|\n/, ' ').trim();
                if (casetype == '' || property_address == '') {
                    index++;
                    continue
                }
                if (casetype == 'AVA') {
                    casetype = 'Abandoned Vehicle Abatement'
                }
                if (await this.saveRecord({property_address, casetype, sourceId, codeViolationId})) counts++;
            } catch (error) {
            }
            index++
        }
        return counts;
    }

    async handleSource3(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;

        let dateRange = {
            from: this.getFormattedDate(new Date(await this.getPrevCodeViolationId(sourceId, true))),
            to: this.getFormattedDate(new Date())
        };
        console.log('loading page')
        const isPageLoaded = await this.openPage(page, link, '//select[@name="SearchModule"]');
        if (!isPageLoaded) {
            console.log('Page loading failed');
            return counts;
        }

        await this.setSearchCriteria3(page, dateRange);
        await page.click('#button-Search');
        await page.waitForXPath('//div[@id="overlay"]', {visible: true});
        await page.waitForXPath('//div[@id="overlay"]', {hidden: true});

        // get results
        counts += await this.getData3(page, sourceId);
        await this.sleep(3000);
        return counts;
    }

    async setSearchCriteria3(page: puppeteer.Page, dateRange: any) {
        // setting code case
        await this.sleep(20000);
        await page.waitForSelector('#SearchModule', { visible: true });
        await page.select('#SearchModule', 'number:5');
        await page.click('#button-Advanced')
        await page.waitForXPath('//input[@id="OpenedDateFrom"]', {visible: true});
        // setting date range
        const fromDateHandle = await page.$x('//input[@id="OpenedDateFrom"]');
        await fromDateHandle[0].click({clickCount: 3});
        await fromDateHandle[0].press('Backspace');
        await fromDateHandle[0].type(dateRange.from, {delay: 150});

        const toDateHandle = await page.$x('//input[@id="OpenedDateTo"]');
        await toDateHandle[0].click({clickCount: 3});
        await toDateHandle[0].press('Backspace');
        await toDateHandle[0].type(dateRange.to, {delay: 150});
    }

    async getData3(page: puppeteer.Page, sourceId: number) {
        let counts = 0, pageNum = 1;

        while (true) {            
            const rowXpath = '//*[contains(@id, "entityRecordDiv")]';
            const rows = await page.$x(rowXpath);
            for (let i = 0; i < rows.length; i++) {
                let dateHandle = await page.$x(rowXpath + `[${i + 1}]//*[@name="label-OpenedDate"]//span`);
                let fillingDate = await dateHandle[0].evaluate(el => el.textContent?.trim());
                let typeHandle = await page.$x(rowXpath + `[${i + 1}]//*[@name="label-CodeCaseType"]//span`);
                let originalDocType = await typeHandle[0].evaluate(el => el.textContent?.trim());
                let addressHandle = await page.$x(rowXpath + `[${i + 1}]//*[@name="label-Address"]//span`);
                let address = await addressHandle[0].evaluate(el => el.textContent?.trim());
                let record = {
                    property_address: address,
                    fillingdate: fillingDate,
                    casetype: originalDocType,
                    sourceId,
                    codeViolationId: (new Date(fillingDate!)).getTime()
                };
                if (await this.saveRecord(record)) {
                    counts++;
                }
            }
            let nextHandle = await page.$x(`//*[@id="link-NextPage"]`);
            let nextSuperHandle = await page.$x('//*[@id="link-NextPage"]/parent::li');
            let className = await nextSuperHandle[0].evaluate(el => el.getAttribute('class'));
            if (className != "disabled") {
                await nextHandle[0].click();
                await page.waitForXPath('//div[@id="overlay"]', {visible: true});
                await page.waitForXPath('//div[@id="overlay"]', {hidden: true});
                pageNum++;
            } else {
                break;
            }            
        }
        return counts;
    }

    // async saveRecord(address: string, caseType: string, fillingDate: string, sourceId: number, codeViolationId: number) {
    async saveRecord(record: any) {
        const data: any = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'Property Address': record.property_address,
            "vacancyProcessed": false,
            "productId": this.productId,
            originalDocType: record.casetype,
            fillingDate: record.fillingdate,
            sourceId: record.sourceId,
            codeViolationId: record.codeViolationId
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }
}