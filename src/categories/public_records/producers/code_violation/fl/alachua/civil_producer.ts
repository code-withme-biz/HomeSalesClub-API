import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../abstract_producer';
import axios from 'axios';
import {countReset} from 'console';

export default class CivilProducer extends AbstractProducer {

    sources = [
        { url: 'https://data.cityofgainesville.org/resource/vu9p-a5f7.json?status=Opened', handler: this.handleSource, casetype: 'Code Complaints & Violations'},
        { url: 'https://data.cityofgainesville.org/resource/mbv5-fyig.json?status=Opened', handler: this.handleSource, casetype: 'Heat Map of House Code Violations'},
        { url: 'https://data.cityofgainesville.org/resource/y6su-758z.json?status=Opened', handler: this.handleSource, casetype: 'Where Top 3 Code Violations Occur'},
        { url: 'https://data.cityofgainesville.org/resource/vt4i-fx67.json?status=Opened', handler: this.handleSource, casetype: 'Top Three Violations'},
        {
            url: 'https://egov.cityofgainesville.org/citizenaccess/publicAccess.zul',
            handler: this.handleSource1,
            casetype: ''
        },
        { url: '', installationID: 228, citizenService: true },
        { url: '', installationID: 318, citizenService: true }
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
            if (!source.handler) {
                countRecords += await this.handleCitizenSerice(page, source.installationID, sourceId);
            } else {
                countRecords += await source.handler.call(this, page, source.url, sourceId, source.casetype);
            }
            sourceId++;
        }

        await AbstractProducer.sendMessage(this.publicRecordProducer.state, this.publicRecordProducer.county ? this.publicRecordProducer.county : this.publicRecordProducer.city, countRecords, 'Code Violation');
        return true;
    }

    async handleSource(page: puppeteer.Page, url: string, sourceId: number, casetype: string) {
        let dateRange = {
            from: new Date(await this.getPrevCodeViolationId(sourceId, true)),
            to: new Date()
        };
        let countRecords = 0;
        let limit = 1000;
        let offset = 0;

        while (true) {
            const response = await this.getCodeViolationData(url, limit, offset, 'compliance_date', dateRange.from, dateRange.to);
            if (response.success) {
                for (const record of response.data) {
                    const property_address = record.address;
                    const fillingdate = record.compliance_date;
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
            } else {
                break;
            }
        }

        return countRecords;
    }

    async handleSource1(page: puppeteer.Page, link: string, sourceId: number, _: string) {
        console.log('============ Checking for ', link);
        let counts = 0;
        // load page
        const isPageLoaded = await this.openPage(page, link, '//button[@type="button" and text()="cases"]');
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
        const [casesBtn] = await page.$x('//button[@type="button" and text()="cases"]')
        await casesBtn.click();
        await page.waitForXPath('//label[@class="z-radio-cnt" and text()="Case Number"]')
        const [radioBtn] = await page.$x('//label[@class="z-radio-cnt" and text()="Case Number"]')
        await radioBtn.click()
        await page.waitForXPath('//span[text()="Enter Case Number (contains search):"]')

        let counts = 0;
        let complaintNumber = await this.getPrevCodeViolationId(sourceId, false, 2002745);
        let nextFlag;
        do {
            try {
                const number = complaintNumber.toString().slice(2)
                const keyYear = complaintNumber.toString().slice(0, 2)
                let caseNumberSearch = `CE-${keyYear}-${number}`
                nextFlag = true
                await this.sleep(1000)
                const [inputCaseNumber] = await page.$x('//span[text()="Enter Case Number (contains search):"]/parent::td[1]/following-sibling::td[2]/input')
                await page.evaluate(elem => elem.value = "", inputCaseNumber)
                await inputCaseNumber.type(caseNumberSearch, {delay: 100})
                const [searchBtn] = await page.$x('//span[text()="Enter Case Number (contains search):"]/parent::td[1]/following-sibling::td[4]/button')
                 searchBtn.click()
                await page.waitForResponse(response => response.url().includes('citizenaccess/zkau') && response.status() === 200);
                await this.sleep(500)
                const [fillingDateElement] = await page.$x('//div[@class="z-listbox-body"]//table/tbody[contains(@id,"rows")]/tr[1]/td[2]/div')
                let fillingdate = await page.evaluate(elem => elem.textContent, fillingDateElement)
                const [caseTypeElement] = await page.$x('//div[@class="z-listbox-body"]//table/tbody[contains(@id,"rows")]/tr[1]/td[4]/div')
                let casetype = await page.evaluate(elem => elem.textContent, caseTypeElement);
                const [addressElement] = await page.$x('//div[@class="z-listbox-body"]//table/tbody[contains(@id,"rows")]/tr[1]/td[3]/div')
                let address = await page.evaluate(elem => elem.textContent, addressElement);
                if (await this.saveRecord({property_address:address, casetype, fillingdate, sourceId, codeViolationId: complaintNumber}))
                    counts++;

            } catch (e) {
                console.log(e)
                nextFlag = false
            }
            complaintNumber++
        } while (nextFlag)
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