import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
import db from '../../../../../../models/db';
const parser = require('parse-address');

export default class CivilProducer extends AbstractProducer {
    productId = '';

    sources =
        [
            { url: 'https://data-auroraco.opendata.arcgis.com/datasets/4058e3b882bc4a1cb321525eb58327a7_160/data?geometry=-105.623%2C39.501%2C-103.834%2C39.870&orderBy=violation_date&orderByAsc=false&page=162&selectedAttribute=violation_date', handler: this.handleSource1 },
            { url: 'https://energovweb.centennialco.gov/Energov_prod/selfservice#/search', handler: this.handleSource2 }
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

        const practiceType = 'code-violation';
        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        this.productId = await db.models.Product.findOne({ name: productName }).exec();
        let sourceId = 0;
        for (const source of this.sources) {
            countRecords += await source.handler.call(this, page, source.url, sourceId);
        }
        await AbstractProducer.sendMessage(this.publicRecordProducer.state, this.publicRecordProducer.county ? this.publicRecordProducer.county : this.publicRecordProducer.city, countRecords, 'Code Violation');
        return true;
    }

    async handleSource1(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;
        // load page
        const isPageLoaded = await this.openPage(page, link, '//select[@id="ctl00_PlaceHolderMain_generalSearchForm_ddlGSPermitType"]');
        if (!isPageLoaded) {
            console.log("Website not loaded successfully:", link);
            return counts;
        }

        // get results
        counts += await this.getData1(page, sourceId);
        await this.sleep(3000);
        return counts;
    }


    getFormattedDate(date: Date) {
        let year = date.getFullYear();
        let month = (1 + date.getMonth()).toString().padStart(2, '0');
        let day = date.getDate().toString().padStart(2, '0');

        return month + '/' + day + '/' + year;
    }

    getPageStart(pageSize: number, pageNr: number) {
        return pageSize * pageNr;
    };

    getPageLabel(total: number, pageSize: number, pageNr: number) {
        const start = Math.max(
            this.getPageStart(pageSize, pageNr),
            0
        );
        const end = Math.min(
            this.getPageStart(pageSize, pageNr + 1),
            total
        );

        return `${this.numberWithCommas(start + 1)} to ${this.numberWithCommas(end)}`;
    }

    numberWithCommas(x: number) {
        return x.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",");
    }

    async getData1(page: puppeteer.Page, sourceId: number) {
        let counts = 0;
        try {
            await page.goto('https://data-auroraco.opendata.arcgis.com/datasets/4058e3b882bc4a1cb321525eb58327a7_160/data?geometry=-105.623%2C39.501%2C-103.834%2C39.870&orderBy=violation_date&orderByAsc=false&page=162&selectedAttribute=violation_date');
            try {
                await page.waitForXPath('//table[@class="table table-striped table-bordered table-hover"]/tbody/tr[1]/td', { visible: true, timeout: 200000 });
            } catch (err) {
                console.log('No Data');
            }

            let totalDataXpath = '//h4[@class="table-header pull-left flip"]';
            let totalShowing = await (await this.getTextByXpathFromPage(page, totalDataXpath)).trim().split(' ');
            let totalData = parseInt(totalShowing[totalShowing.length - 1].replace(/,/g, ''));
            let totalPages = Math.ceil(totalData / 10);




            const itemsToShow = Array.from({ length: totalData }, (_, i) => `Item ${i + 1}`);

            const size = 10;
            const pages = Array.from(
                { length: Math.ceil(itemsToShow.length / size) },
                (_, i) => this.getPageLabel(itemsToShow.length, size, i)
            )

            for (let i = 0; i < totalPages; i++) {

                await page.waitForXPath('//h4[contains(.,"Showing ' + pages[i] + '")]', { timeout: 200000 });
                let totalRow = await page.$x('//table[@class="table table-striped table-bordered table-hover"]/tbody/tr');

                for (let l = 0; l < totalRow!.length; l++) {
                    let index = l + 1;
                    let caseTypeXpath = '//table[@class="table table-striped table-bordered table-hover"]/tbody/tr[' + index + ']/td[3]';
                    let addressXpath = '//table[@class="table table-striped table-bordered table-hover"]/tbody/tr[' + index + ']/td[10]';
                    let fillingDateXpath = '//table[@class="table table-striped table-bordered table-hover"]/tbody/tr[' + index + ']/td[6]';
                    let caseType, address, fillingDate;
                    try {
                        caseType = await this.getTextByXpathFromPage(page, caseTypeXpath);
                        address = await this.getTextByXpathFromPage(page, addressXpath);
                        fillingDate = await this.getTextByXpathFromPage(page, fillingDateXpath);
                        fillingDate = fillingDate.split(',')[0];
                    } catch (err) {
                        continue
                    }
                    const timestamp = (new Date(fillingDate)).getTime();
                    counts += (await this.saveRecord(address, caseType, fillingDate, 0, timestamp));


                }
                if (i < (totalPages - 1)) {
                    let btnNext = await page.$x('//a[@aria-label="Next"]')
                    await btnNext[0].click();
                    await this.sleep(2000);
                }
            }

        } catch (e) {
            console.log(e)
        }

        return counts;
    }

    async handleSource2(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;
        let dateRange = {
            from: this.getFormattedDate(new Date(await this.getPrevCodeViolationId(sourceId, true, (new Date('1/1/2020')).getTime()))),
            to: this.getFormattedDate(new Date())
        };

        console.log(dateRange.from, dateRange.to)

        const isPageLoaded = await this.openPage(page, link, '//*[@id="overlay"]');
        if (!isPageLoaded) {
            console.log("Website loading is failed!");
            return counts;
        }
        await page.waitForSelector('#overlay', { hidden: true, timeout: 100000 });
        await page.waitForSelector('#overlay', { visible: true });
        await page.waitForSelector('#overlay', { hidden: true, timeout: 100000 });
        await page.waitForSelector('#SearchModule', { visible: true });
        await page.select('#SearchModule', 'number:5');
        await page.waitForSelector('#collapseFilter', { visible: true });
        await page.waitForSelector('#OpenedDateFrom', { visible: true });
        await page.type('#OpenedDateFrom', dateRange.from, { delay: 500 });
        await page.type('#OpenedDateTo', dateRange.to, { delay: 500 });
        await page.click('#button-Search');
        while (true) {
            await page.waitForXPath('//div[contains(@name,"label-SearchResult")]', { visible: true, timeout: 60000 });
            let fillingdates = await page.$x('//div[@name="label-OpenedDate"]//span[1]');
            let casetypes = await page.$x('//div[@name="label-CodeCaseType"]//span[1]');
            let property_addresses = await page.$x('//div[@name="label-Address"]//span[1]');
            for (let index = 0; index < fillingdates.length; index++) {
                let address: any = await property_addresses[index].evaluate(el => el.textContent);
                address = address.replace(/\s+|\n/gm, ' ').trim();
                let fillingdate: any = await fillingdates[index].evaluate(el => el.textContent);
                fillingdate = fillingdate.replace(/\s+|\n/gm, ' ').trim();
                let casetype: any = await casetypes[index].evaluate(el => el.textContent);
                casetype = casetype.replace(/\s+|\n/gm, ' ').trim();
                let codeViolationId = (new Date(fillingdate)).getTime();
                if (address == '' || casetype == '' || fillingdate == '')
                    continue
                if (casetype == 'EMSA') {
                    casetype = 'Emergency Medical Services Code';
                } else if (casetype == 'NUZO') {
                    casetype = 'Nuisance and Zoning';
                } else if (casetype == 'Summary') {
                    casetype = 'Summary Abate';
                }

                if (await this.saveRecord(address, casetype, fillingdate, sourceId, codeViolationId)) counts++;
            }
            const [endpage] = await page.$x('//li[@class="disabled"]/a[@id="link-NextPage"]');
            if (endpage) {
                break;
            } else {
                const [nextpage] = await page.$x('//a[@id="link-NextPage"]');
                await nextpage.click();
                await page.waitForSelector('#overlay', { visible: true });
                await page.waitForSelector('#overlay', { hidden: true });
                await this.randomSleepIn5Sec();
            }
        }
        return counts;
    }

    async saveRecord(address: string, caseType: string, fillingDate: string, sourceId: number, codeViolationId: number) {
        let count = 0;
        const parsed = parser.parseLocation(address);
        const number = parsed.number ? parsed.number : '';
        const street = parsed.street ? parsed.street : '';
        const type = parsed.type ? parsed.type : '';
        const propertyAddress = number + ' ' + street + ' ' + type;
        const propertyZip = parsed.zip ? parsed.zip : '';
        const propertyCity = parsed.city ? parsed.city : '';
        const data = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'Property Address': propertyAddress,
            'Property City': propertyCity,
            'Property Zip': propertyZip,
            "vacancyProcessed": false,
            "productId": this.productId,
            fillingDate,
            sourceId,
            codeViolationId,
            originalDocType: caseType
        };
        if (await this.civilAndLienSaveToNewSchema(data)) {
            count++;
        }

        return count
    }
}