import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../abstract_producer';
import axios from 'axios';

export default class CivilProducer extends AbstractProducer {

    sources = [
        // { url: 'https://data.greensboro-nc.gov/resource/v5t4-gjta.json?casestatus=A', handler: this.handleSource1 },
        // { url: 'https://data.greensboro-nc.gov/resource/whix-gx4j.json?casestatus=A', handler: this.handleSource2 },
        // { url: 'https://data.greensboro-nc.gov/resource/26hs-mxmu.json?casestatus=A', handler: this.handleSource3 },
        { url: 'https://accela.guilfordcountync.gov/CitizenAccess/Cap/CapHome.aspx?module=Enforcement&TabName=Enforcement', handler: this.handleSource4 },
        { url: 'https://acceladmz.highpointnc.gov/CHPACA/Cap/CapHome.aspx?module=CodeViolation', handler: this.handleSource5 }
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

    async handleSource1(page: puppeteer.Page, url: string, sourceId: number) {
        let dateRange = {
            from: new Date(await this.getPrevCodeViolationId(sourceId, true, (new Date('1/1/2020')).getTime())),
            to: new Date()
        };
        let countRecords = 0;
        let limit = 1000;
        let offset = 0;

        while (true) {
            const response = await this.getCodeViolationData(url, limit, offset, 'date', dateRange.from, dateRange.to);
            if (response.success) {
                for (const record of response.data) {
                    const property_address = record.fulladdress;
                    const fillingdate = record.date;
                    const casetype = 'Code Compliance Case History 2011 - Present';
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

    async handleSource2(page: puppeteer.Page, url: string, sourceId: number) {
        let dateRange = {
            from: new Date(await this.getPrevCodeViolationId(sourceId, true, (new Date('1/1/2020')).getTime())),
            to: new Date()
        };
        let countRecords = 0;
        let limit = 1000;
        let offset = 0;

        while (true) {
            const response = await this.getCodeViolationData(url, limit, offset, 'entrydate', dateRange.from, dateRange.to);
            if (response.success) {
                for (const record of response.data) {
                    const property_address = record.fulladdress;
                    const fillingdate = record.entrydate;
                    const codeViolationId = (new Date(fillingdate)).getTime();
                    const casetype = 'Code Compliance Cases 2011 - Present';

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
            from: new Date(await this.getPrevCodeViolationId(sourceId, true, (new Date('1/1/2020')).getTime())),
            to: new Date()
        };
        let countRecords = 0;
        let limit = 1000;
        let offset = 0;

        while (true) {
            const response = await this.getCodeViolationData(url, limit, offset, 'issueddate', dateRange.from, dateRange.to);
            if (response.success) {
                for (const record of response.data) {
                    const property_address = (record.stnumber ? record.stnumber : '') + ' ' +
                        (record.stpfxdir ? record.stpfxdir : '') + ' ' +
                        (record.stname ? record.stname : '') + ' ' +
                        (record.sttype ? record.sttype : '') + ' ' +
                        (record.stapt ? '#' + record.stapt : '');
                    const fillingdate = record.issueddate;
                    const casetype = 'Code Compliance Violations 2011 - Present';
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
        // load page
        const isPageLoaded = await this.openPage(page, link, '//select[@id="ctl00_PlaceHolderMain_generalSearchForm_ddlGSPermitType"]');
        if (!isPageLoaded) {
            console.log("Website not loaded successfully:", link);
            return counts;
        }

        // get results
        counts += await this.getData4(page, sourceId);
        await this.sleep(3000);
        return counts;
    }

    async handleSource5(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;

        let dateRange = {
            from: this.getFormattedDate(new Date(await this.getPrevCodeViolationId(sourceId, true, (new Date('1/1/2020')).getTime()))),
            to: this.getFormattedDate(new Date())
        };
        console.log('loading page')
        const isPageLoaded = await this.openPage(page, link, '//span[text()="Search"]/parent::a');
        if (!isPageLoaded) {
            console.log('Page loading failed');
            return counts;
        }
        await this.setSearchCriteria5(page, dateRange);
        
        await page.click('div#ctl00_PlaceHolderMain_btnNewSearch_container a[title="Search"]');
        await page.waitForXPath('//div[@id="divGlobalLoading"]', {visible: true});
        await page.waitForXPath('//div[@id="divGlobalLoading"]', {hidden: true});

        let result_handle = await Promise.race([
            page.waitForXPath('//span[contains(text(), "returned no results")]', {visible: true}),
            page.waitForXPath('//div[@class="ACA_Grid_OverFlow"]//tr[not(contains(@class, "ACA_TabRow_Header")) and contains(@class, "TabRow")]', {visible: true})
        ]);
        
        let result_text = await result_handle.evaluate(el => el.textContent || '');
        if (result_text?.indexOf('no results') > -1) {
            console.log('No Results Found');
            return counts;
        }
        // get results
        counts += await this.getData5(page, sourceId);
        await this.sleep(3000);
        return counts;
    }

    async setSearchCriteria5(page: puppeteer.Page, dateRange: any) {
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

    async getData4(page: puppeteer.Page, sourceId: number) {
        let counts = 0;
        try {
            await page.goto('https://accela.guilfordcountync.gov/CitizenAccess/Cap/CapHome.aspx?module=Enforcement&TabName=Enforcement');


            let dateRange = {
                from: this.getFormattedDate(new Date(await this.getPrevCodeViolationId(sourceId, true, (new Date('1/1/2020')).getTime()))),
                to: this.getFormattedDate(new Date())
            };
            let fromDate = dateRange.from;
            let toDate = dateRange.to;
            await page.waitForXPath('//select[@id="ctl00_PlaceHolderMain_generalSearchForm_ddlGSPermitType"]', { visible: true, timeout: 200000 });
            await page.click('input#ctl00_PlaceHolderMain_generalSearchForm_txtGSStartDate', { clickCount: 3 });
            await page.type('input#ctl00_PlaceHolderMain_generalSearchForm_txtGSStartDate', fromDate);
            await page.click('input#ctl00_PlaceHolderMain_generalSearchForm_txtGSEndDate', { clickCount: 3 });
            await page.type('input#ctl00_PlaceHolderMain_generalSearchForm_txtGSEndDate', toDate);

            await this.sleep(3000);
            let buttonSearch = await page.$x('//a[@id="ctl00_PlaceHolderMain_btnNewSearch"]');
            await buttonSearch[0]!.click();
            try {
                await page.waitForXPath('//span[contains(.,"Showing")]', { visible: true, timeout: 60000 });
            } catch (err) {
                console.log('No Result');
                return counts;
            }
            let flagStop = false;
            while (!flagStop) {
                await page.waitForXPath('//div[@id="divGlobalLoading" and contains(@style,"display: none;")]', { timeout: 60000 });
                let totalRow = await page.$x('//table[@id="ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList"]/tbody/tr[contains(@class,"ACA_TabRow_Odd") or contains(@class,"ACA_TabRow_Even")]');
                for (let l = 0; l < totalRow!.length; l++) {
                    let index = l + 1;
                    let [addressXpath] = await page.$x('//table[@id="ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList"]/tbody/tr[contains(@class,"ACA_TabRow_Odd") or contains(@class,"ACA_TabRow_Even")][' + index + ']/td[6]');
                    let address;
                    try {
                        address = await addressXpath.evaluate(el => el.textContent?.trim());
                    } catch (err) {
                        continue
                    }

                    let [fillingdateXpath] = await page.$x('//table[@id="ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList"]/tbody/tr[contains(@class,"ACA_TabRow_Odd") or contains(@class,"ACA_TabRow_Even")][' + index + ']/td[2]');
                    let fillingdate;
                    try {
                        fillingdate = await fillingdateXpath!.evaluate(el => el.textContent?.trim());
                    } catch (err) {
                        continue
                    }

                    let [casetypeXpath] = await page.$x('//table[@id="ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList"]/tbody/tr[contains(@class,"ACA_TabRow_Odd") or contains(@class,"ACA_TabRow_Even")][' + index + ']/td[4]');
                    let casetype;
                    try {
                        let casetypeArr = await casetypeXpath!.evaluate(el => el.textContent?.split('/'));
                        casetype = casetypeArr![casetypeArr!.length - 1]!.trim();
                    } catch (err) {
                        continue
                    }

                    let [casenoXpath] = await page.$x('//table[@id="ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList"]/tbody/tr[contains(@class,"ACA_TabRow_Odd") or contains(@class,"ACA_TabRow_Even")][' + index + ']/td[3]');
                    let caseno;
                    try {
                        caseno = await casenoXpath!.evaluate(el => el.textContent?.trim());
                    } catch (err) {
                        continue
                    }

                    const codeViolationId = (new Date(fillingdate!)).getTime();
                    if (address != '' && casetype != '' && fillingdate != '') {
                        let record = {
                            address,
                            caseno,
                            casetype,
                            codeViolationId,
                            fillingdate
                        }

                        if (await this.saveRecord(record))
                            counts++
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
        } catch (e) {
        }

        return counts;
    }

    async getData5(page: puppeteer.Page, sourceId: number) {
        let counts = 0, pageNum = 1;

        while (true) {            
            const rowXpath = '//div[@class="ACA_Grid_OverFlow"]//tr[not(contains(@class, "ACA_TabRow_Header")) and contains(@class, "TabRow")]';
            const rows = await page.$x(rowXpath);
            for (const row of rows) {
                let fillingDate = await row.evaluate(el => el.children[2].children[0].children[0].textContent?.trim());
                let originalDocType = await row.evaluate(el => el.children[4].children[0].children[0].textContent?.trim());                
                let address = await row.evaluate(el => el.children[6].children[0].children[0].textContent?.trim());  
               
                const timestamp = (new Date(fillingDate!)).getTime();
                if (await this.saveRecord5(address!, originalDocType!, fillingDate!, sourceId, timestamp)) {
                    counts++;
                }
            }
            let nextHandle = await page.$x(`//a[contains(text(), "Next")]`);
            if (nextHandle.length > 0) {
                await nextHandle[0].click();
                await page.waitForXPath('//div[@id="divGlobalLoading"]', {visible: true});
                await page.waitForXPath('//div[@id="divGlobalLoading"]', {hidden: true});
                pageNum++;
            } else {
                break;
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
        console.log(data)
        return await this.civilAndLienSaveToNewSchema(data);
    }

    async saveRecord5(address: string, caseType: string, fillingDate: string, sourceId: number, codeViolationId: number) {
        const data = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'Property Address': address,
            "vacancyProcessed": false,
            "productId": this.productId,
            fillingDate,
            originalDocType: caseType,
            sourceId,
            codeViolationId
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }
}