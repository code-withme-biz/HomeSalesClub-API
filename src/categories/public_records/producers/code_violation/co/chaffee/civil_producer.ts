import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
import db from '../../../../../../models/db';

const parser = require('parse-address');

export default class CivilProducer extends AbstractProducer {
    productId = '';
    sources =
        [
            {
                url: 'https://www.citizenserve.com/Portal/PortalController?Action=showSearchPage&ctzPagePrefix=Portal_&installationID=208&original_iid=0&original_contactID=0',
                handler: this.handleSource1
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
                        if (await this.saveRecord(address!, casetype!, fillingdate!, sourceId, timestamp))
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

    async saveRecord(address: string, caseType: string, fillingDate: string, sourceId: number, codeViolationId: number,) {
        let data: any = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'Property Address': address,
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