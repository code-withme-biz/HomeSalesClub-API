import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';

export default class CivilProducer extends AbstractProducer {
    productId = '';
    sources =
      [
        { url: 'http://etrakit.obms.us/eTRAKiT/login.aspx?lt=either&rd=~/Search/case.aspx', handler: this.handleSource1 }
      ];
    username = "webdev";
    password = "Qwer!234";

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

    async openPage(page: puppeteer.Page, link: string, xpath: string) {
        try {
            await page.goto(link, {waitUntil: 'load'});
            await page.$x(xpath);
            return true;
        } catch (error) {
            return false;
        }
    }

    async parseAndSave(): Promise<boolean> {
        let countRecords = 0;
        let page = this.browserPages.generalInfoPage;
        if (!page) {
            return false;
        }
        await page.setDefaultTimeout(60000);
        let sourceId = 0;
        for (const source of this.sources) {
            countRecords += await source.handler.call(this, page, source.url, sourceId);
            sourceId++;
        }
        
        console.log('---- ', countRecords);
        await AbstractProducer.sendMessage(this.publicRecordProducer.state, this.publicRecordProducer.county ? this.publicRecordProducer.county : this.publicRecordProducer.city, countRecords, 'Code Violation');
        return true;
    }

    async handleSource1(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;

        let startNum = await this.getPrevCodeViolationId(sourceId, false, 1, true);
        console.log(startNum)
        const isPageLoaded = await this.openPage(page, link, '//*[@id="cplMain_txtPublicUserName"]');
        await this.sleep(1000);
        if (!isPageLoaded) {
            console.log('Website loading is failed');
            return 0;
        }
        // login
        await page.type('#cplMain_txtPublicUserName', this.username, {delay: 100});
        const password_handle = await page.$('#cplMain_txtPublicPassword');
        await password_handle?.click();
        await password_handle?.type(this.password, {delay: 100});
        await page.keyboard.press('Escape');
        await this.sleep(500);
        await Promise.all([
            page.click('#cplMain_btnPublicLogin'),
            page.waitForNavigation()
        ]);
        await page.select('#cplMain_ddSearchOper', 'BEGINS WITH');

        for (let pre = startNum ; pre < 10000 ; pre ++) {
            await this.setSearchCriteria1(page, pre);               
            
            await page.click('#cplMain_btnSearch');
            await page.waitForXPath('//div[@id="cplMain_rlpSearch"]', {visible: true});
            await page.waitForXPath('//div[@id="cplMain_rlpSearch"]', {hidden: true});

            const [noresult] = await page.$x('//span[contains(text(), "no results")]');
            if (noresult) continue;
            // get results
            if (await this.getData1(page, sourceId, pre)) counts++;
            await this.sleep(200)
        }
        return counts;
    }

    async setSearchCriteria1(page: puppeteer.Page, prefix: number) {
        let year = (new Date()).getFullYear().toString().substr(-2);
        let searchKey = `CE${year}-${prefix.toString().padStart(4, '0')}`;
        const searchHandle = await page.$x('//input[@id="cplMain_txtSearchString"]');
        await searchHandle[0].click({clickCount: 3});
        await searchHandle[0].press('Backspace');
        await searchHandle[0].type(searchKey, {delay: 150});
    }

    async getData1(page: puppeteer.Page, sourceId: number, pre: number) {
        const rowXpath = '//table[contains(@id, "_rgSearchRslts")]/tbody/tr[1]';
        const [row] = await page.$x(rowXpath);        
        if (row === null) return false;
        let address = await row.evaluate(el => el.children[0].textContent?.trim());
        let year = (new Date()).getFullYear();
        let codeViolationId = parseInt(`${year}${pre.toString().padStart(4, '0')}`);
        return await this.saveRecord(address!, '', '', sourceId, codeViolationId);
    }

    async saveRecord(address: string, caseType: string, fillingDate: string, sourceId: number, codeViolationId: number) {
        const data = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'Property Address': address,
            "vacancyProcessed": false,
            "productId": this.productId,
            fillingDate,
            sourceId,
            originalDocType: caseType,
            codeViolationId
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }
}