import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
import db from '../../../../../../models/db';
const parser = require('parse-address');

export default class CivilProducer extends AbstractProducer {
    productId = '';

    sources =
        [
            // { url: 'https://aca.polk-county.net/aca/Cap/CapHome.aspx?module=Enforcement&TabName=Enforcement', handler: this.handleSource1 },
            { url: 'https://etrakit.lakelandgov.net/eTRAKiT3/Search/case.aspx', handler: this.handleSource2 },
            { url: 'https://winh-trk.aspgov.com/eTRAKIT/Search/case.aspx', handler: this.handleSource3 },
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
                let valueForSelect = ['Enforcement/Complaint/NA/NA'];
                let docTypeArr = ['Complaint'];

                for (let j = 0; j < valueForSelect.length; j++) {
                    await page.goto('https://aca.polk-county.net/aca/Cap/CapHome.aspx?module=Enforcement&TabName=Enforcement');
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
                            let [addressXpath] = await page.$x('//table[@id="ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList"]/tbody/tr[contains(@class,"ACA_TabRow_Odd") or contains(@class,"ACA_TabRow_Even")][' + index + ']/td[5]');
                            let address;
                            try {
                                address = await addressXpath.evaluate(el => el.textContent?.trim());
                            } catch (err) {
                                continue
                            }
                            const timestamp = (new Date(fillingdate)).getTime();
                            if (await this.saveRecord(address!, casetype, fillingdate, sourceId, timestamp))
                                counts++;
                        }

                        try {
                            let btnNext = await page.$x('//a[contains(.,"Next") and contains(@href,"javascript")]');
                            await btnNext[0].click();
                            await this.sleep(2000);
                        } catch (err) {
                            break;
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

    getStartNumberString(startNum: number, lengthdigit = 5) {
        let result = startNum.toString().padStart(lengthdigit, '0');
        return result;
    }

    async handleSource2(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;
        let startNum = await this.getPrevCodeViolationId(sourceId, false, 1, true);

        for (let id = startNum; id < startNum + 200; id++) {
            // load page
            let year = (new Date()).getFullYear().toString().substr(-2);
            let startNumString = this.getStartNumberString(id);

            const isPageLoaded = await this.openPage(page, link, '//*[@id="cplMain_txtSearchString"]');
            if (!isPageLoaded) {
                console.log('Page loading is failed, trying next...');
                continue;
            }

            let caseId = 'LCE' + year + "-" + startNumString;
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
                const rowCaseType = await page.$x('//table[contains(@id, "rgSearchRslts")]/tbody/tr[' + index + ']/td[2]/span');
                let casetype = await page.evaluate(el => el.getAttribute('title'), rowCaseType[0]);
                casetype = casetype.replace(/\s+|\n/, ' ').trim();
                casetype = casetype.replace("RV ", "Recreational-Vehicle ");
                casetype = casetype.replace(" VHR", " Vacation Home Rentals");
                let property_address = await page.evaluate(el => el.children[0].textContent, row);
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
                // console.log(error)
            }
            index++
        }
        return counts;
    }


    getStartNumberString3(startNum: number, lengthdigit = 2) {
        let result = startNum.toString().padStart(lengthdigit, '0');
        return result;
    }
    async handleSource3(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;
        let startNum = await this.getPrevCodeViolationId(sourceId, false, -1, true);
        const isPageLoaded = await this.openPage(page, link, '//*[@id="cplMain_txtSearchString"]');
        if (!isPageLoaded) {
            console.log('Page loading is failed, trying next...');
            return 0;
        }
        await Promise.all([
            page.select('#cplMain_ddSearchBy', 'Case_Main.CASE_NO'),
            page.waitForNavigation(),
        ]);
        await page.select('#cplMain_ddSearchOper', 'BEGINS WITH');
        if (startNum === -1) startNum = 0;
        for (let id = startNum; id < 100; id++) {
            // load page

            // get year
            let year = (new Date()).getFullYear().toString().substr(-2);
            let startNumString = this.getStartNumberString3(id);
            try {
                let caseId = 'CE' + year + "-" + startNumString;
                await this.setSearchCriteria3(page, caseId);
                // click search button
                await page.click('#ctl00_cplMain_btnSearch');

                await page.waitForXPath('//*[@id="cplMain_PageUpdateProgress"]', {visible: true});
                await page.waitForXPath('//*[@id="cplMain_PageUpdateProgress"]', {hidden: true});
                await this.sleep(1000);

                // wait for search result
                let result_handle = await Promise.race([
                    page.waitForXPath('//*[@id="cplMain_lblNoSearchRslts"]', { visible: true }),
                    page.waitForXPath('//*[@id="ctl00_cplMain_hlSearchResults"]', { visible: true })
                ]);
                let result_text = await result_handle.evaluate(el => el.textContent || '');
                if (result_text?.indexOf('no results') > -1) {
                    console.log('No Results Found');
                    break;
                }
                let yearForCode = (new Date()).getFullYear();
                let codeViolationId = parseInt(`${yearForCode}${id.toString().padStart(2, '0')}`);
                // get results
                counts += await this.getData3(page, sourceId, codeViolationId, caseId);
                await this.sleep(2000);
            } catch (e) {}
        }
        return counts;
    }

    async setSearchCriteria3(page: puppeteer.Page, id: string) {

        // choose begin with
        await page.click('#cplMain_txtSearchString', {clickCount: 3});
        await page.keyboard.press('Backspace');
        let [input_handle] = await page.$x('//*[@id="cplMain_txtSearchString"]');
        await input_handle.type(id);
    }

    async getData3(page: puppeteer.Page, sourceId: number, codeViolationId: number, caseId: string) {
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
                    let casetype: any = await row.evaluate(el => el.children[1].textContent);
                    casetype = casetype.replace(/\s+|\n/, ' ').trim();
                    casetype = casetype.replace("RV ", "Recreational-Vehicle ");
                    casetype = casetype.replace(" VHR", " Vacation Home Rentals");
                    let property_address: any = await row.evaluate(el => el.children[2].textContent);
                    property_address = property_address.replace(/\s+|\n/, ' ').trim();
                    if (casetype == '' || property_address == '') {
                        continue
                    }
                    if (casetype == 'AVA') {
                        casetype = 'Abandoned Vehicle Abatement'
                    }
                    if (await this.saveRecord(property_address, casetype, '', sourceId, codeViolationId)) counts++;
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