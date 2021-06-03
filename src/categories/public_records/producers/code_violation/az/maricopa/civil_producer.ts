import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../abstract_producer';
import axios from 'axios';
import { countReset } from 'console';

export default class CivilProducer extends AbstractProducer {

    sources =
      [
        { url: 'https://nsdonline.phoenix.gov/CodeEnforcement/Details?caseNum=', handler: this.handleSource1 },
        { url: 'https://eservices.scottsdaleaz.gov/maps/CodeEnf/Summary?id=', handler: this.handleSource2 },
        { url: 'https://citydata.mesaaz.gov/resource/hgf6-yenu.json', handler: this.handleSource3 }
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
        if (!page) return true;

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
        let id = await this.getPrevCodeViolationId(sourceId, false, 46000);
        while (true) {
            // load page
            const _id = id.toString().padStart(5, '0');
            const isPageLoaded = await this.openPage(page, `${link}PEF2020-${_id}`, '//footer');
            if (!isPageLoaded) {
                console.log('Page loading is failed, trying next...');
                continue;
            }
            const [errorMessage] = await page.$x('//*[contains(text(), "Error.")]');
            if (errorMessage) {
                break;
            }
            if (await this.getData1(page, id, sourceId))
                counts++;
            await this.sleep(this.getRandomInt(1000, 2000));
            id++;
        }
        return counts;
    }

    async getData1(page: puppeteer.Page, id: number, sourceId: number) {
        let fillingdate = await this.getTextByXpathFromPage(page, '//*[text()="Case Opened:"]/ancestor::div[1]/following-sibling::div[1]/p');
        let property_address = await this.getTextByXpathFromPage(page, '//*[text()="Address:"]/ancestor::div[1]/following-sibling::div[1]/p');

        return await this.saveRecord({
            property_address,
            fillingdate,
            casetype: '',
            sourceId,
            codeViolationId: id
        });
    }

    async handleSource2(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;
        let id = await this.getPrevCodeViolationId(sourceId, false, 331111);
        let flag = false;
        while (true) {
            // load page
            const _id = id.toString().padStart(6, '0');
            const isPageLoaded = await this.openPage(page, link+_id, '//header');
            if (!isPageLoaded) {
                console.log('Page loading is failed, trying next...');
                continue;
            }
            const result_handle = await Promise.race([
                page.waitForSelector('#codeEnfSummaryError', {visible: true}),
                page.waitForXPath('//*[text()="Complaint Number:"]', {visible: true})
            ]);
            const result_text = await result_handle.evaluate(el => el.textContent?.trim());
            if (result_text === "Complaint Number:") {
                if (await this.getData2(page, id, sourceId))
                    counts++;
                flag = true;
            } else {
                if (flag) break;
            }
            await this.sleep(this.getRandomInt(1000, 2000));
            id++;
        }
        return counts;
    }

    async getData2(page: puppeteer.Page, id: number, sourceId: number) {
        let fillingdate = await this.getTextByXpathFromPage(page, '//*[text()="Received Date:"]/following-sibling::span[1]');
        let property_address = await this.getTextByXpathFromPage(page, '//*[text()="Location:"]/following-sibling::span[1]');
        let casetype = await this.getTextByXpathFromPage(page, '//*[text()="Complaint Type:"]/following-sibling::span[1]');
        
        return await this.saveRecord({
            property_address,
            fillingdate,
            casetype,
            sourceId,
            codeViolationId: id
        });
    }

    async saveRecord(record: any) {
        const data = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'Property Address': record.property_address,
            "vacancyProcessed": false,
            "productId": this.productId,
            fillingDate: record.fillingdate,
            originalDocType: record.casetype,
            sourceId: record.sourceId,
            codeViolationId: record.codeViolationId
        };
        return await this.civilAndLienSaveToNewSchema(data);
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
            const response = await this.getCodeViolationData(url, limit, offset, 'opened_date', dateRange.from, dateRange.to);
            if (response.success) {
                for (const record of response.data) {
                    const property_address = record.case_address;
                    const fillingdate = record.opened_date;
                    const codeViolationId = (new Date(fillingdate)).getTime();
                    const casetype = 'Code Enforcement';

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
}