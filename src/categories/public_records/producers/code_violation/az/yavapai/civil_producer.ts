import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
const parser = require('parse-address');

export default class CivilProducer extends AbstractProducer {
    productId = '';
    sources =
        [
            {
                url: 'https://www.citizenserve.com/yavapaicounty',
                handler: this.handleSource1
            },
            { 
                url: 'https://aca-prod.accela.com/PARADISEVLY/Login.aspx?ReturnUrl=%2fPARADISEVLY%2fCap%2fCapHome.aspx%3fmodule%3dEnforcement', 
                handler: this.handleSource2
            }
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
        console.log(countRecords)
        await AbstractProducer.sendMessage(this.publicRecordProducer.state, this.publicRecordProducer.county ? this.publicRecordProducer.county : this.publicRecordProducer.city, countRecords, 'Code Violation');
        return true;
    }

    async handleSource1(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;
        // load page
        const isPageLoaded = await this.openPage(page, link, '//*[@id="header"]//a[contains(text(),"Search")]');
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
        };
        let fromDate = dateRange.from;
        let nextPage
        let endSearchFlag = false;
        page.on('dialog', async dialog => {
            await dialog.accept();
        });
        try {
            await page.waitForXPath('//*[@id="header"]//a[contains(text(),"Search")]')
            await this.sleep(1000)
            const [searchHeaderBtn] = await page.$x('//*[@id="header"]//a[contains(text(),"Search")]')
            await Promise.all([
                searchHeaderBtn.click(),
                page.waitForNavigation()
            ]);
            await page.waitForXPath('//*[@id="filetype"]');
            await this.sleep(1000)
            await page.select('#filetype', 'Code');
            await this.sleep(1000)
            await page.waitForXPath('//*[@id="submitRow"]//button[contains(text(),"Submit")]',{visible:true});
            const [submitSearchBtn] = await page.$x('//*[@id="submitRow"]//button[contains(text(),"Submit")]')
            await Promise.all([
                submitSearchBtn.click(),
                page.waitForNavigation()
            ]);
            await this.sleep(1000)
            do {
                await page.waitForXPath('//*[@id="resultContent"]/table/tbody/tr')
                nextPage = false
                let totalRow = await page.$x('//*[@id="resultContent"]/table/tbody/tr');
                for (let i = 0; i < totalRow!.length; i++) {
                    try {
                        let fillingdate = (await totalRow[i].$eval('td:nth-child(5) ', elem => elem.textContent))?.trim();
                        let casetype = (await totalRow[i].$eval('td:nth-child(3) ', elem => elem.textContent))?.trim();
                        let address = (await totalRow[i].$eval('td:nth-child(2) ', elem => elem.textContent))!.trim();
                        const timestamp = (new Date(fillingdate!)).getTime();
                        const fromTimestamp = fromDate.getTime();
                        if (fromTimestamp > timestamp) endSearchFlag = true;
                        let record = {
                            property_addresss: address,
                            fillingdate,
                            casetype,
                            sourceId,
                            codeViolationId: timestamp
                        }
                        if (await this.saveRecord(record))
                            counts++;
                    } catch (e) {
                    }
                }
                const [nextPageBtnElement] = await page.$x('//*[@id="resultContent"]/div[1]//a')
                if (!!nextPageBtnElement && !endSearchFlag) {
                    nextPageBtnElement.click()
                    await page.waitForResponse((response) => response.url().includes('Portal/PortalController') && response.status() === 200);
                    nextPage = true
                }
            } while (nextPage)
        } catch (e) {
            console.log(e)
        }
        return counts;
    }

    async handleSource2(page: puppeteer.Page, link: string, sourceId: number) {
        let username = 'webdev1234';
        let password = '4DNJ@rW$54dFquF';
        console.log('============ Checking for ', link);
        let counts = 0;

        let dateRange = {
            from: this.getFormattedDate(new Date(await this.getPrevCodeViolationId(sourceId, true))),
            to: this.getFormattedDate(new Date())
        };

        console.log('loading page')
        const isPageLoaded = await this.openPage(page, link, '//span[contains(text(), "Login ")]/parent::a');
        if (!isPageLoaded) {
            console.log('Page loading failed');
            return counts;
        }
        const inputHandles = await page.$x('//input[contains(@id, "LoginBox_txt")]');
        await inputHandles[0].type(username, {delay: 100});
        await inputHandles[1].type(password, {delay: 100});
        await Promise.all([
            page.click('a[id*="LoginBox_btnLogin"]'),
            page.waitForNavigation()
        ]);
        await this.setSearchCriteria2(page, dateRange);
        
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
        counts += await this.getData2(page, sourceId);
        await this.sleep(3000);
        return counts;
    }

    async setSearchCriteria2(page: puppeteer.Page, dateRange: any) {
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

    async getData2(page: puppeteer.Page, sourceId: number) {
        let counts = 0, pageNum = 1;

        while (true) {            
            const rowXpath = '//div[@class="ACA_Grid_OverFlow"]//tr[not(contains(@class, "ACA_TabRow_Header")) and contains(@class, "TabRow")]';
            const rows = await page.$x(rowXpath);
            for (const row of rows) {
                let fillingDate = await row.evaluate(el => el.children[1].children[0].children[0].textContent?.trim());
                let originalDocType = await row.evaluate(el => el.children[3].children[0].children[0].textContent?.trim());
                let address = await row.evaluate(el => el.children[4].children[0].children[0].textContent?.trim());
                const timestamp = (new Date(fillingDate!)).getTime();
                let record = {
                    property_addresss: address,
                    fillingdate: fillingDate,
                    casetype: originalDocType,
                    sourceId,
                    codeViolationId: timestamp
                }
                if (await this.saveRecord(record)) {
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
            'Property Address': record.property_addresss,
            "vacancyProcessed": false,
            "productId": this.productId,
            fillingDate: record.fillingdate,
            originalDocType: record.caseType,
            sourceId: record.sourceId,
            codeViolationId: record.codeViolationId
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }
}