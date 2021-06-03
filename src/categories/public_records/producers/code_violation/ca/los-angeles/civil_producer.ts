import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';

export default class CivilProducer extends AbstractProducer {

    sources =
      [
        { url: 'http://www.longbeach.gov/lbds/enforcement/current-open-cases/', handler: this.handleSource1 },
        { url: 'https://data.lacity.org/resource/2uz8-3tj3.json?status_of_case=O', handler: this.handleSource2 },
        { url: 'https://data.smgov.net/resource/xird-2kxi.json', handler: this.handleSource3 },
        { url: 'https://aca.torranceca.gov/CitizenAccess/Cap/CapHome.aspx?module=Enforcement&TabName=Home', handler: this.handleSource4 },
        { url: 'https://mypermits.cityofpasadena.net/EnerGov_Prod/SelfService#/search', handler: this.handleSource5 },
        { url: 'https://epicla.lacounty.gov/SelfService/#/search', handler: this.handleSource6 },
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

        await page.setDefaultTimeout(60000);
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
        const isPageLoaded = await this.openPage(page, link, '//*[contains(@class, "panel")]/a');
        if (!isPageLoaded) {
            console.log('Page loading is failed, trying next...');
            return 0;
        }
        const link_handles = await page.$x('//*[contains(@class, "panel")]/a');
        const links: string[] = [];
        for (const link_handle of link_handles) {
            const link = await page.evaluate(el => el.href, link_handle);
            links.push(link);
        }
        for (const link of links) {
            const isPageLoaded = await this.openPage(page, link, '//*[contains(text(), "Active Code Enforcement Cases")]');
            if (!isPageLoaded) {
                console.log('Page loading is failed, trying next...');
                continue;
            }
            // get results
            counts += await this.getData1(page, sourceId);                
        }
        return counts;
    }

    async getData1(page: puppeteer.Page, sourceId: number) {
        let counts = 0;
        let fillingdates = await page.$x('//*[text()="Start Date:"]/following-sibling::td[1]');
        let addresses = await page.$x('//*[text()="Address:"]/following-sibling::td[1]');
        let casetypes = await page.$x('//*[text()="Description:"]/following-sibling::td[1]');
        let casenumbers = await page.$x('//*[text()="Case #:"]/following-sibling::td[1]');
        for (let i = 0 ; i < fillingdates.length ; i++) {
            let property_address: any = await addresses[i].evaluate(el => el.textContent);
            property_address = property_address?.replace(/\s+|\n/gm, ' ').trim();
            let fillingdate: any = await fillingdates[i].evaluate(el => el.textContent);
            fillingdate = fillingdate?.replace(/\s+|\n/gm, ' ').trim();
            let casetype: any = await casetypes[i].evaluate(el => el.textContent);
            casetype = casetype?.replace(/\s+|\n/gm, ' ').trim();
            let caseno: any = await casenumbers[i].evaluate(el => el.textContent);
            caseno = caseno?.replace(/\s+|\n/gm, ' ').trim();
            if (await this.saveRecord({
                property_address,
                fillingdate,
                casetype,
                caseno,
                sourceId,
                codeViolationId: 1
            })) {
                counts++;
            }
        }        
        return counts;
    }

    async handleSource2(page: puppeteer.Page, url: string, sourceId: number) {
        let dateRange = {
            from: new Date(await this.getPrevCodeViolationId(sourceId, true)),
            to: new Date()
        };
        let countRecords = 0;
        let limit = 1000;
        let offset = 0;
    
        while (true) {
            const response = await this.getCodeViolationData(url, limit, offset, 'date_case_generated', dateRange.from, dateRange.to);
            if (response.success) {
                for (const record of response.data) {
                    const { address_house_number, address_street_direction, address_street_name, address_street_suffix, date_case_generated, case_type } = record;
                    const property_address = (address_house_number || ' ') +
                        (address_street_direction || ' ') +
                        (address_street_name || ' ') +
                        (address_street_suffix || ' ');
                    const fillingdate = date_case_generated;
                    const casetype = case_type;
                    const codeViolationId = (new Date(fillingdate)).getTime();
    
                    const res = {
                        property_address,
                        fillingdate,
                        casetype,
                        sourceId,
                        codeViolationId
                    }                    
                    if (await this.saveRecord(res))
                        countRecords++;
                }
                offset += limit;
                if (response.end) break;
                await this.sleep(this.getRandomInt(1000, 2000));
            }
            else {
                break;
            }
        }
        
        return countRecords;
    }

    async handleSource3(page: puppeteer.Page, url: string, sourceId: number) {
        let dateRange = {
            from: new Date(await this.getPrevCodeViolationId(sourceId, true)),
            to: new Date()
        };
        let countRecords = 0;
        let limit = 1000;
        let offset = 0;
    
        while (true) {
            const response = await this.getCodeViolationData(url, limit, offset, 'permit_issuance_date', dateRange.from, dateRange.to);
            if (response.success) {
                for (const record of response.data) {
                    const { address, permit_issuance_date, permit_type } = record;
                    const property_address = JSON.parse(address.human_address).address;
                    const fillingdate = permit_issuance_date;
                    const casetype = permit_type;
                    const codeViolationId = (new Date(fillingdate)).getTime();
    
                    const res = {
                        property_address,
                        fillingdate,
                        casetype,
                        sourceId,
                        codeViolationId
                    }                    
                    if (await this.saveRecord(res))
                        countRecords++;
                }
                offset += limit;
                if (response.end) break;
                await this.sleep(this.getRandomInt(1000, 2000));
            }
            else {
                break;
            }
        }
        
        return countRecords;
    }

    async handleSource4(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;

        let dateRange = {
            from: this.getFormattedDate(new Date(await this.getPrevCodeViolationId(sourceId, true))),
            to: this.getFormattedDate(new Date())
        };
        const isPageLoaded = await this.openPage(page, link, '//*[@id="ctl00_PlaceHolderMain_generalSearchForm_txtGSStartDate"]');
        if (!isPageLoaded) {
            console.log("Web site loading is failed");
            return counts;
        }
        await this.setSearchCriteria4(page, dateRange);
        
        await page.click('div#ctl00_PlaceHolderMain_btnNewSearch_container a[title="Search"]');
        await page.waitForXPath('//div[@id="divGlobalLoading"]', {visible: true});
        await page.waitForXPath('//div[@id="divGlobalLoading"]', {hidden: true});

        let result_handle = await Promise.race([
            page.waitForXPath('//span[contains(text(), "no results")]', {visible: true}),
            page.waitForXPath('//div[@class="ACA_Grid_OverFlow"]//tr[not(contains(@class, "ACA_TabRow_Header")) and contains(@class, "TabRow")]', {visible: true})
        ]);
        
        let result_text = await result_handle.evaluate(el => el.textContent || '');
        if (result_text?.indexOf('no results') > -1) {
            console.log('No Results Found');
            return counts;
        }
        // get results
        counts += await this.getData4(page, sourceId);
        await this.sleep(3000);
        return counts;
    }

    async getData4(page: puppeteer.Page, sourceId: number) {
        let counts = 0;
        const sortHandle1 = await page.$x('//span[text()="Created Date"]/parent::a');
        await sortHandle1[0].click();
        await page.waitForXPath('//div[@id="divGlobalLoading"]', {visible: true});
        await page.waitForXPath('//div[@id="divGlobalLoading"]', {hidden: true});

        const sortHandle2 = await page.$x('//span[text()="Created Date"]/parent::a');
        await sortHandle2[0].click();
        await page.waitForXPath('//div[@id="divGlobalLoading"]', {visible: true});
        await page.waitForXPath('//div[@id="divGlobalLoading"]', {hidden: true});
        
        await this.sleep(5000)

        while (true) {            
            const rowXpath = '//div[@class="ACA_Grid_OverFlow"]//tr[not(contains(@class, "ACA_TabRow_Header")) and contains(@class, "TabRow")]';
            const rows = await page.$x(rowXpath);
            for (const row of rows) {
                let fillingdate = await row.evaluate(el => el.children[1].textContent?.trim());
                let casetype = await row.evaluate(el => el.children[3].textContent?.trim());
                let property_address = await row.evaluate(el => el.children[6].textContent?.trim());
                const codeViolationId = (new Date(fillingdate!)).getTime();
                const res = {
                    property_address,
                    fillingdate,
                    casetype,
                    sourceId,
                    codeViolationId
                }   
                if (await this.saveRecord(res)) {
                    counts++;
                }
            }
            let nextHandle = await page.$x(`//a[contains(text(), "Next")]`);
            if (nextHandle.length > 0) {
                await nextHandle[0].click();
                await page.waitForXPath('//div[@id="divGlobalLoading"]', {visible: true});
                await page.waitForXPath('//div[@id="divGlobalLoading"]', {hidden: true});
            } else {
                break;
            }            
        }
        return counts;
    }

    async setSearchCriteria4(page: puppeteer.Page, dateRange: any) {
        // setting date range
        const fromDateHandle = await page.$x('//input[@id="ctl00_PlaceHolderMain_generalSearchForm_txtGSStartDate"]');
        await fromDateHandle[0].click({clickCount: 3});
        await fromDateHandle[0].press('Backspace');
        await fromDateHandle[0].type(dateRange.from, {delay: 150});

        const toDateHandle = await page.$x('//input[@id="ctl00_PlaceHolderMain_generalSearchForm_txtGSEndDate"]');
        await toDateHandle[0].click({clickCount: 3});
        await toDateHandle[0].press('Backspace');
        await toDateHandle[0].type(dateRange.to, {delay: 150});
    }

    async handleSource5(page: puppeteer.Page, link: string, sourceId: number) {
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

    async handleSource6(page: puppeteer.Page, link: string, sourceId: number) {
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

        await this.setSearchCriteria6(page, dateRange, sourceId);
        await page.click('#button-Search');
        await page.waitForXPath('//div[@id="overlay"]', {visible: true});
        await page.waitForXPath('//div[@id="overlay"]', {hidden: true});

        // get results
        counts += await this.getData6(page, sourceId);
        await this.sleep(3000);
        return counts;
    }

    async setSearchCriteria6(page: puppeteer.Page, dateRange: any, sourceId: number) {
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

    async getData6(page: puppeteer.Page, sourceId: number) {
        let counts = 0, pageNum = 1;

        while (true) {            
            const rowXpath = '//*[contains(@id, "entityRecordDiv")]';
            const rows = await page.$x(rowXpath);
            if (rows.length == 0) {
                break;
            } else {
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
        }
        return counts;
    }

    async saveRecord(record: any) {
        const data = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'Property Address': record.property_address,
            "vacancyProcessed": false,
            "productId": this.productId,
            "caseUniqueId": record.caseno,
            fillingDate: record.fillingdate,
            originalDocType: record.casetype,
            sourceId: record.sourceId,
            codeViolationId: record.codeViolationId
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }
}