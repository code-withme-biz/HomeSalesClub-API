import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
export default class CivilProducer extends AbstractProducer {
    sources =
        [
            { url: 'https://gis.citrusbocc.com/open-code-compliance.html', handler: this.handleSource1 },
        ];

    async init(): Promise<boolean> {
        console.log("running init")
        this.browser = await this.launchBrowser();
        this.browserPages.generalInfoPage = await this.browser.newPage();
        this.browserPages.generalInfoPage.setDefaultNavigationTimeout(60000);
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

        let fromDate = await this.getPrevCodeViolationId(sourceId, true);
        console.log('loading page')
        const isPageLoaded = await this.openPage(page, link, '//div[@id="ccGISMapWidgetDiv"]');
        if (!isPageLoaded) {
            console.log('Page loading failed');
            return counts;
        }

        let retry_count = 0;
        while (true) {
            if (retry_count > 3) {
                return counts;
            }
            try {
                await page.waitForXPath('//div[@id="serviceRequestList"]//tbody/tr', {visible: true});
                break;
            } catch (error) {
                retry_count++;
            }
        }
        // get results
        counts += await this.getData1(page, sourceId, fromDate);
        await this.sleep(3000);
        return counts;
    }

    async getData1(page: puppeteer.Page, sourceId: number, fromDate: number) {
        let counts = 0;
        const rowXpath = '//div[@id="serviceRequestList"]//tbody/tr';
        const rows = await page.$x(rowXpath);
        for (const row of rows) {
            let fillingDate = await row.evaluate(el => el.children[1].textContent?.trim());
            fillingDate = fillingDate?.split(' ')[0];
            let address = await row.evaluate(el => el.children[3].textContent?.trim());
            let caseType = await row.evaluate(el => el.children[2].textContent?.trim());
            const timestamp = (new Date(fillingDate!)).getTime();
            if (fromDate < timestamp) {
                let record = {
                    property_addresss: address,
                    fillingdate: fillingDate!,
                    casetype: caseType,
                    sourceId,
                    codeViolationId: timestamp
                }
                if (await this.saveRecord(record)) {
                    counts++;
                }
            }
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
            originalDocType: record.casetype,
            sourceId: record.sourceId,
            codeViolationId: record.codeViolationId
        };
        if (record.fillingdate) data = { ...data, fillingDate: record.fillingdate };
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
            if (record.owner_address) {
                data = {
                    ...data,
                    'Mailing Address': record.owner_address
                }
            }
        }
        console.log(data);

        return await this.civilAndLienSaveToNewSchema(data);
    }
}