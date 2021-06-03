import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';

export default class CivilProducer extends AbstractProducer {

    sources = [
        { url: 'https://public.claycountygov.com/ISynFront/CodeCases.aspx', handler: this.handleSource }
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

    async handleSource(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;

        const isPageLoaded = await this.openPage(page, link, '//*[@id="txtSpecMag"]');
        if (!isPageLoaded) {
            console.log("Website loading is failed!");
            return counts;
        }
        let prevCodeViolationId = await this.getPrevCodeViolationId(sourceId, false, 2015001, true);
        
        let year = (new Date()).getFullYear();
        let startNum = prevCodeViolationId % 1000;
        let num = startNum;
        let onehand = 0;
        while (true) {
            const searchKey = `CE-${(year%100).toString().padStart(2, '0')}-${num.toString().padStart(3, '0')}`;
            const [specMagInput] = await page.$x('//*[@id="txtSpecMag"]');
            await specMagInput.click({clickCount: 3});
            await specMagInput.press('Backspace');
            await page.type('#txtSpecMag', searchKey, {delay: 100});
            await Promise.all([
                page.click('#Button1'),
                await page.waitForNavigation()
            ]);
            const [noresult] = await page.$x('//*[contains(text(), "No Records")]');
            if (noresult) {
                console.log('No results found');
                onehand++;
                if (onehand > 2) break;
            } else {
                onehand = 0;
                let [property_address_handle] = await page.$x(`//*[text()="${searchKey}"]/following-sibling::td[2]`)
                let property_address = await property_address_handle.evaluate(el => el.textContent) || '';
                property_address = property_address.replace(/\s+|\n/gm, ' ').trim();
                let codeViolationId = parseInt(`${year}${num.toString().padStart(3, '0')}`);
                const record = {
                    property_address,
                    casetype: '',
                    fillingdate: '',
                    codeViolationId,
                    sourceId
                };
                if (await this.saveRecord(record)) counts++;
            }
            num++;
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