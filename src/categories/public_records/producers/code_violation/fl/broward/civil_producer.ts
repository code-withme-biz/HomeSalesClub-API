import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
import db from '../../../../../../models/db';

export default class CivilProducer extends AbstractProducer {
    productId = '';
    isStart = false;
    sources =
      [
        { url: 'http://apps.hollywoodfl.org/ViolationSearch/CEviolations_query.aspx', handler: this.handleSource1 },
        { url: 'https://etrakit.coralsprings.org/etrakit/Search/case.aspx', handler: this.handleSource2 },
        { url: '', installationID: 261, citizenService: true }
    ];

    async init(): Promise<boolean> {
        console.log("running init")
        this.browser = await this.launchBrowser();
        this.browserPages.generalInfoPage?.setDefaultTimeout(60000);
        this.browserPages.generalInfoPage = await this.browser.newPage();
        await this.setParamsForPage(this.browserPages.generalInfoPage);
        return true;
    };

    async read(): Promise<boolean> {
      return true;
    };

    async setSearchCriteria(page: puppeteer.Page, prefix: number) {
        let year = (new Date()).getFullYear().toString().substr(-2);
        await page.click('#radStatusAll');
        let searchKey = `V${year}-${prefix.toString().padStart(2, '0')}`;
        await page.type('#txtCaseNum', searchKey, {delay: 150});
    }

    async parseAndSave(): Promise<boolean> {
        let countRecords = 0;
        let page = this.browserPages.generalInfoPage;
        if (!page) return false;

        let sourceId = 0;
        for (const source of this.sources) {
            if (!source.handler) {
                countRecords += await this.handleCitizenSerice(page, source.installationID, sourceId);
            } else {
                countRecords += await source.handler.call(this, page, source.url, sourceId);
            }
            sourceId++;
        }
        
        await AbstractProducer.sendMessage(this.publicRecordProducer.state, this.publicRecordProducer.county ? this.publicRecordProducer.county : this.publicRecordProducer.city, countRecords, 'Code Violation');
        return true;
    }

    async handleSource1(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;
        let flag = false;
        let prevCodeViolationId = await this.getPrevCodeViolationId(sourceId, true, (new Date('1/1/2020')).getTime());
        let year = (new Date()).getFullYear().toString().slice(0, 2);
        let url = `http://apps.hollywoodfl.org/ViolationSearch/CEviolations_list.aspx?Status=Open&ViolNum=V${year}-`;
        const isPageLoaded = await this.openPage(page, url, '//*[@id="lblRowCount"]');
        if (!isPageLoaded) {
            console.log('Website loading is failed');
            return 0;
        }
        
        const result_count_handle = await page.$('#lblRowCount');
        let result_count = await result_count_handle?.evaluate(el => el.textContent?.trim());
        result_count = result_count?.replace(/^\D+/g, '');
        if (parseInt(result_count!) == 0) {
            return 0;
        } else {
            flag = true;
            counts += await this.getData1(page, prevCodeViolationId, sourceId);
            await this.sleep(3000);
        }

        await Promise.all([
            page.click('#lblSearchBackLink > a'),
            page.waitForNavigation()
        ]);
        return counts;
    }

    async getData1(page: puppeteer.Page, prevCodeViolationId: number, sourceId: number) {
        let counts = 0, pageNum = 1;
        let year = (new Date()).getFullYear().toString();
        const dateSortHandle = await page.$x('//*[@id="Section1"]/form/table/tbody/tr[@valign="middle"]/td[last()]/a');
        await Promise.all([
            dateSortHandle[0].click(),
            page.waitForNavigation()
        ])
        await this.sleep(2000);

        while (true) {            
            const rowXpath = '//*[@id="Section1"]/form/*[@id="dgCEviolationsList"]/tbody/tr[not(@align="center")]';
            const rows = await page.$x(rowXpath);
            let flag = false;
            for (const row of rows) {
                let address = await row.evaluate(el => el.children[2].textContent?.trim());
                let fillingDate = await row.evaluate(el => el.children[5].textContent?.trim());
                let codeViolationId = (new Date(fillingDate!)).getTime();
                if (prevCodeViolationId > codeViolationId) {
                    flag = true;
                    break;
                }
                let originalDocType = await row.evaluate(el => el.children[4].textContent?.trim());
                if (await this.saveRecord(address!, originalDocType!, fillingDate!, sourceId, codeViolationId)) {
                    counts++;
                }
            }
            if (flag) break;
            let nextHandle: puppeteer.ElementHandle<Element>[];
            nextHandle = await page.$x(`//a[text()="${pageNum + 1}"]`);
            if (!nextHandle[0]) {
                nextHandle = await page.$x(pageNum > 11 ? '//a[contains(@href, "dgCEviolationsList$ctl1004$ctl11")]' : '//a[contains(@href, "dgCEviolationsList$ctl1004$ctl10")]');
            }
            if (nextHandle.length > 0) {
                await Promise.all([
                    nextHandle[0].click(),
                    page.waitForNavigation()
                ])
                pageNum++;
            } else {
                break;
            }            
        }
        return counts;
    }

    async handleSource2(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;

        let startNum = await this.getPrevCodeViolationId(sourceId, false, 2000, true);
        const isPageLoaded = await this.openPage(page, link, '//*[@id="cplMain_ddSearchOper"]');
        await this.sleep(1000);
        if (!isPageLoaded) {
            console.log('Website loading is failed');
            return 0;
        }
        await page.select('#cplMain_ddSearchOper', 'BEGINS WITH');

        while (true) {
            await this.setSearchCriteria2(page, startNum);               
            
            await page.click('#ctl00_cplMain_btnSearch');
            await page.waitForXPath('//div[@id="cplMain_rlpSearch"]', {visible: true});
            await page.waitForXPath('//div[@id="cplMain_rlpSearch"]', {hidden: true});

            const [noresult] = await page.$x('//span[contains(text(), "no results")]');
            if (noresult) break;
            // get results
            if (await this.getData2(page, sourceId, startNum)) counts++;
            await this.sleep(200)
            startNum++;
        }
        return counts;
    }

    async setSearchCriteria2(page: puppeteer.Page, prefix: number) {
        let year = (new Date()).getFullYear().toString().slice(2);
        let searchKey = `CC${year}-${prefix.toString().padStart(2, '0')}`;
        const searchHandle = await page.$x('//input[@id="cplMain_txtSearchString"]');
        await searchHandle[0].click({clickCount: 3});
        await searchHandle[0].press('Backspace');
        await searchHandle[0].type(searchKey, {delay: 150});
    }

    async getData2(page: puppeteer.Page, sourceId: number, pre: number) {
        let counts = 0;
        let year = (new Date()).getFullYear().toString();
        const rowXpath = '//table[contains(@id, "_rgSearchRslts")]/tbody/tr[1]';
        while (true) {
            const rows = await page.$x(rowXpath);        
            for (const row of rows) {
                let address = await row.evaluate(el => el.children[3].textContent?.trim());
                let owner_name = await row.evaluate(el => el.children[6].textContent?.trim()) || '';
                if (owner_name.indexOf('&') > -1) {
                    owner_name = owner_name.split('&')[0].trim();
                }
                owner_name = owner_name.replace(/[^a-zA-Z\s]+/g, '');
                let codeViolationId = parseInt(`${year}${pre.toString().padStart(2, '0')}`);
                if (await this.saveRecord(address!, '', '', sourceId, codeViolationId, owner_name)) counts++;
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

    async saveRecord(address: string, caseType: string, fillingDate: string, sourceId: number, codeViolationId: number, owner_name: string = '') {
        let data: any = {
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
        if (owner_name) {
            // save owner data
            let parseName: any = this.newParseName(owner_name.trim());
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
        }
        return await this.civilAndLienSaveToNewSchema(data);
    }
}