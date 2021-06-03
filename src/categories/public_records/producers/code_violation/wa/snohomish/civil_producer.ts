import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
export default class CivilProducer extends AbstractProducer {
    sources =
        [
            { url: 'https://pw.everettwa.gov/eTRAKiT/Search/case.aspx', handler: this.handleSource1 },
            { url: 'https://dbs.lynnwoodwa.gov/apps/selfservice/#/search', handler: this.handleSource2 },
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
        let startNum = await this.getPrevCodeViolationId(sourceId, false, 1, true);
        let startCaseCodes = [
            { code: 'CE', flagStop: false },
        ]
        for (let id = startNum; id < startNum + 200; id++) {
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
                let yearForCode = (new Date()).getFullYear();
                let codeViolationId = parseInt(`${yearForCode}${id.toString().padStart(4, '0')}`);
                counts += await this.getData1(page, sourceId, codeViolationId, caseId);
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

    async getData1(page: puppeteer.Page, sourceId: number, codeViolationId: number, caseId: string) {
        let counts = 0;
        const rows = await page.$x('//table[contains(@id, "rgSearchRslts")]/tbody/tr');

        for (const row of rows) {
            let index = 1;
            try {
                let property_address = await page.evaluate(el => el.children[1].textContent, row);
                property_address = property_address.replace(/\s+|\n/, ' ').trim();
                let owner_name = await page.evaluate(el => el.children[3].textContent, row);
                owner_name = owner_name.replace(/\s+|\n/, ' ').trim();
                if (owner_name.indexOf('&') > -1) {
                    owner_name = '';
                }

                const rowCaseType = await page.$x('//table[contains(@id, "rgSearchRslts")]/tbody/tr[' + index + ']');
                await rowCaseType[0].click();
                await page.waitForXPath('//table[@id="cplMain_ctl02_dvCaseInfo"]/tbody/tr/td[contains(.,"' + caseId + '")]', { visible: true, timeout: 30000 });
                let casetypeXpath = '//table[@id="cplMain_ctl02_dvCaseInfo"]/tbody/tr[3]/td[2]';
                let casetype = await this.getTextByXpathFromPage(page, casetypeXpath);
                casetype = casetype.replace(/\s+|\n/, ' ').trim();
                casetype = casetype!.replace('AVA ', 'Abandoned Vehicle Abatement ').trim();
                if (casetype == '' || property_address == '') {
                    index++;
                    continue
                }
                if (casetype == 'AVA') {
                    casetype = 'Abandoned Vehicle Abatement'
                }
                if (casetype == '' || property_address == '') {
                    continue
                }


                if (owner_name != '') {
                    if (await this.saveRecord({ property_address, casetype, sourceId, codeViolationId, owner_name })) counts++;
                } else {
                    if (await this.saveRecord({ property_address, casetype, sourceId, codeViolationId })) counts++;
                }
                index++;
            } catch (error) {
                index++;
            }
        }
        return counts;
    }

    async handleSource2(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;
        let dateRange = {
            from: this.getFormattedDate(new Date(await this.getPrevCodeViolationId(sourceId, true, (new Date('1/1/2020')).getTime()))),
            to: this.getFormattedDate(new Date())
        };

        const isPageLoaded = await this.openPage(page, link, '//*[@id="overlay"]');
        if (!isPageLoaded) {
            console.log("Website loading is failed!");
            return counts;
        }
        await this.sleep(20000);
        await page.waitForSelector('#SearchModule', { visible: true });
        await page.select('#SearchModule', 'number:5');
        await page.waitForSelector('#collapseFilter', { visible: true });
        await page.waitForSelector('#OpenedDateFrom', { visible: true });
        await page.type('#OpenedDateFrom', dateRange.from, { delay: 100 });
        await page.type('#OpenedDateTo', dateRange.to, { delay: 100 });
        await page.click('#button-Search');
        await page.waitForSelector('#overlay', { visible: true });
        await page.waitForSelector('#overlay', { hidden: true });

        while (true) {
            await page.waitForXPath('//div[contains(@name,"label-SearchResult")]', { visible: true, timeout: 60000 });
            let fillingdates = await page.$x('//div[@name="label-OpenedDate"]//span[1]');
            let casetypes = await page.$x('//div[@name="label-CodeCaseType"]//span[1]');
            let property_addresses = await page.$x('//div[@name="label-Address"]//span[1]');
            for (let index = 0; index < fillingdates.length; index++) {
                let property_address: any = await property_addresses[index].evaluate(el => el.textContent);
                property_address = property_address.replace(/\s+|\n/gm, ' ').trim();
                let fillingdate: any = await fillingdates[index].evaluate(el => el.textContent);
                fillingdate = fillingdate.replace(/\s+|\n/gm, ' ').trim();
                let casetype: any = await casetypes[index].evaluate(el => el.textContent);
                casetype = casetype.replace(/\s+|\n/gm, ' ').trim();
                let codeViolationId = (new Date(fillingdate)).getTime();
                if (property_address == '' || casetype == '' || fillingdate == '')
                    continue
                const record = {
                    property_address,
                    casetype,
                    fillingdate,
                    codeViolationId,
                    sourceId
                };
                if (await this.saveRecord(record)) counts++;
            }
            const [endpage] = await page.$x('//li[@class="disabled"]/a[@id="link-NextPage"]');
            if (endpage) {
                break;
            } else {
                const [nextpage] = await page.$x('//a[@id="link-NextPage"]');
                await nextpage.click();
                await page.waitForSelector('#overlay', { visible: true });
                await page.waitForSelector('#overlay', { hidden: true });
                await this.randomSleepIn5Sec();
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