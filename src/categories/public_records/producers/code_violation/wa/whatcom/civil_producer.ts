import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';

export default class CivilProducer extends AbstractProducer {
    productId = '';
    sources =
      [
        { url: 'https://permits.cob.org/eTRAKiT/', handler: this.handleSource1 }
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
    async openPage(page: puppeteer.Page, link: string, xpath: string) {
        let retries = 0;
        while (retries < 15) {
            try {
                console.log(link);
                await page.goto(link);
                await page.waitForXPath(xpath);
                return true;
            } catch (error) {
                console.log(error);
                retries++;
                console.log(`Site loading was failed, retrying now... [${retries}]`);
            }
        }
        return false;
    }
    async handleSource1(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;

        let startNum = await this.getPrevCodeViolationId(sourceId, false, 1, true);
        console.log(startNum)
        console.log('!!!!!!!!!!!!!!!!!!!!!!!!!')
        const isPageLoaded = await this.openPage(page, link, '//*[@id="hlSearchViolations"]');
        console.log('!!!!!!!!!!!!!!!!!!!!!!!!!')
        await this.sleep(1000);
        if (!isPageLoaded) {
            console.log('Website loading is failed');
            return 0;
        }
        await page.click('#hlSearchViolations');
        await page.waitForSelector('#cplMain_txtPublicUserName', {visible: true});

        // login
        await page.type('#cplMain_txtPublicUserName', this.username, {delay: 100});
        const password_handle = await page.$('#cplMain_txtPublicPassword');
        await password_handle?.click();
        await password_handle?.type(this.password, {delay: 100});
        await page.keyboard.press('Escape');
        await this.sleep(500);
        await page.click('#cplMain_btnPublicLogin');
        await page.waitForSelector('#cplMain_ddSearchOper');
        await page.select('#cplMain_ddSearchOper', 'BEGINS WITH');

        for (let pre = startNum ; pre < 10000 ; pre ++) {
            await this.setSearchCriteria1(page, pre);               
            
            await page.click('#ctl00_cplMain_btnSearch');
            await page.waitForXPath('//div[@id="cplMain_rlpSearch"]', {visible: true});
            await page.waitForXPath('//div[@id="cplMain_rlpSearch"]', {hidden: true});

            const [noresult] = await page.$x('//span[contains(text(), "no results")]');
            if (noresult) break;
            // get results
            if (await this.getData1(page, sourceId, pre)) counts++;
            await this.sleep(200)
        }
        return counts;
    }

    async setSearchCriteria1(page: puppeteer.Page, prefix: number) {
        let year = (new Date()).getFullYear().toString();
        let searchKey = `CIA${year}-${prefix.toString().padStart(4, '0')}`;
        const searchHandle = await page.$x('//input[@id="cplMain_txtSearchString"]');
        await searchHandle[0].click({clickCount: 3});
        await searchHandle[0].press('Backspace');
        await searchHandle[0].type(searchKey, {delay: 150});
    }

    async getData1(page: puppeteer.Page, sourceId: number, pre: number) {
        let counts = 0;
        const rowXpath = '//table[contains(@id, "_rgSearchRslts")]/tbody/tr';
        const rows = await page.$x(rowXpath);        
        for (const row of rows) {
            let address = await row.evaluate(el => el.children[1].textContent?.trim());
            address = address?.replace(/\s+|\n/gm, ' ').trim();
            let casetype = '';
            let year = (new Date()).getFullYear();
            let codeViolationId = parseInt(`${year}${pre.toString().padStart(4, '0')}`);
            let record = {
                property_addresss: address,
                fillingdate: '',
                casetype,
                sourceId,
                codeViolationId
            }
            if (await this.saveRecord(record)) {
                counts++;
            }
        }
        return counts;
    }

    async saveRecord(record: any) {
        let data: any = {
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
        }
        return await this.civilAndLienSaveToNewSchema(data);
    }
}