import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../abstract_producer';
import axios from 'axios';
import {countReset} from 'console';

export default class CivilProducer extends AbstractProducer {

    sources =
        [
            {url: 'https://permits.adcogov.org/CitizenAccess/Cap/Caphome.aspx?module=Enforcement&TabName=Enforcement', handler: this.handleSource1 }
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
        let dateRange = {
            from: this.getFormattedDate(new Date(await this.getPrevCodeViolationId(sourceId, true, (new Date('1/1/2020')).getTime()))),
            to: this.getFormattedDate(new Date())
        };
        // load page
        const isPageLoaded = await this.openPage(page, link, '//*[contains(@id,"txtGSStartDate")]');
        if (!isPageLoaded) {
            console.log()
            return 0;
        }
        await this.setSearchCriteria1(page, dateRange);
        // click search button
        const [searchBtn] = await page.$x('//*[contains(@id,"btnNewSearch")]')
        await searchBtn.click();
        await page.waitForXPath('//div[@id="divGlobalLoading"]', {visible: true});
        await page.waitForXPath('//div[@id="divGlobalLoading"]', {hidden: true});
        const [noresult] = await page.$x('//*[contains(text(), "No matching records found.")]');
        if (noresult) return 0;

        await page.waitForXPath('//table[contains(@id, "dvPermitList")]/tbody/tr[position()>2]/td[3]//a');
        // get results
        counts += await this.getData1(page, sourceId);
        return counts;
    }

    async setSearchCriteria1(page: puppeteer.Page, dateRange: any) {
        // page loaded successfully        
        const [startDateInput] = await page.$x('//*[contains(@id,"txtGSStartDate") and @type="text"]')
        await startDateInput.type(dateRange.from, {delay: 100})
        const [endDateInput] = await page.$x('//*[contains(@id,"txtGSEndDate") and @type="text"]')
        await endDateInput.type(dateRange.to, {delay: 100})
    }

    async getData1(page: puppeteer.Page, sourceId: number) {
        let counts = 0;
        let arrayData = [];
        let nextPageFlag
        do {
            await page.waitForXPath('//table[contains(@id, "dvPermitList")]/tbody/tr[position()>2]/td[3]//a');
            nextPageFlag = false
            const rows = await page.$x('//table[contains(@id, "dvPermitList")]/tbody/tr[position()>2]');
            for (const row of rows) {
                try {
                    let fillingdate = await row.$eval('td:nth-child(2) > div > span', elem => elem.textContent);
                    let caseno = await row.$eval('td:nth-child(3) > div > a > strong > span', elem => elem.textContent);
                    // @ts-ignore
                    let link = await row.$eval('td:nth-child(3) > div > a', elem => elem.href);
                    arrayData.push({link, caseno, fillingdate});
                } catch (e) {
                }
            }
            const [nextPageBtn] = await page.$x('//a[text()="Next >"]')
            if (!!nextPageBtn) {
                await nextPageBtn.click();
                await page.waitForXPath('//div[@id="divGlobalLoading"]', {visible: true});
                await page.waitForXPath('//div[@id="divGlobalLoading"]', {hidden: true});
                nextPageFlag = true
            }
        } while (nextPageFlag)

        for (const data of arrayData) {
            const {link, caseno, fillingdate} = data
            try {
                await this.openPage(page, link, '//*[@class="search_results"]');

                let casetype = await this.getTextByXpathFromPage(page, '//*[text()="Violation Code:"]/parent::div[1]/following-sibling::div[1]/span');
                const tableDataElement = await page.$x('//*[text()="Owner:"]/parent::h1[1]/following-sibling::span[1]//table//table/tbody/tr');
                let countIterationSaveAddress = 0
                let property_addresss = ''
                let ownername = ''
                for (let i = tableDataElement.length - 1; i >= 0; i--) {
                    const text = (await tableDataElement[i].$eval('td:nth-child(1)', elem => elem.textContent))?.trim();
                    if (!!text && countIterationSaveAddress < 2) {
                        property_addresss = text + ' ' + property_addresss
                        countIterationSaveAddress++
                        continue;
                    }
                    if (!!text && countIterationSaveAddress >= 2) {
                        ownername = text + ' ' + ownername
                        countIterationSaveAddress++
                        continue;
                    }
                }
                const ownerArray = ownername.split(' AND ')
                let codeViolationId = (new Date(fillingdate!)).getTime();
                for (const owner of ownerArray) {
                    if (await this.saveRecord({
                        name: owner,
                        property_addresss,
                        mailing_address: property_addresss,
                        fillingdate,
                        codeViolationId,
                        casetype,
                        caseno,
                        sourceId
                    })) {
                        counts++;
                    }
                }
            } catch (e) {}
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
            "caseUniqueId": record.caseno,
            fillingDate: record.fillingdate,
            originalDocType: record.casetype,
            sourceId: record.sourceId,
            codeViolationId: record.codeViolationId
        };
        if (record.name) {
            // save owner data
            let parseName: any = this.newParseName(record.name.trim());
            if(parseName.type && parseName.type == 'COMPANY'){
                return false;
            }
            data = {
                ...data,
                'First Name': parseName.firstName,
                'Last Name': parseName.lastName,
                'Middle Name': parseName.middleName,
                'Name Suffix': parseName.suffix,
                'Full Name': parseName.fullName,
                'Mailing Address': record.mailing_address
            }
        }
        return await this.civilAndLienSaveToNewSchema(data);
    }
}