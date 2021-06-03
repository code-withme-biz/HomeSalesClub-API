import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
export default class CivilProducer extends AbstractProducer {
    sources =
        [
            { url: 'https://bsaonline.com/SiteSearch/SiteSearchResults?SearchFocus=Building+Department&ubUsingAccountNumber=true&ubHideName=false&ubHideAddress=false&ubHideParcelNumber=false&ubHideAccount=false&SearchCategory=Record+Number&SearchText=EN&AddrSearchStreetName=&AddrSearchStreetNumFrom=&AddrSearchStreetNumTo=&UseAdvancedAddrSearch=false&uid=259', handler: this.handleSource1 },
        ];
    username = 'webdev1234';
    password = 'UMNefQ$Q3qn!eQ5';

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

        let startNum = await this.getPrevCodeViolationId(sourceId, false, 1, true);
        console.log('loading page')
        const isPageLoaded = await this.openPage(page, link, '//input[@id="SearchText"]');
        if (!isPageLoaded) {
            console.log('Page loading failed');
            return counts;
        }

        for (let pre = startNum; pre < 100; pre++) {            
            await this.setSearchCriteria1(page, pre);
            
            // click search button
            await Promise.all([
                page.click('input[value="Search"]'),
                page.waitForNavigation()
            ]);

            // wait for search result
            let result_handle = await Promise.race([
                page.waitForXPath('//*[contains(text(), "No records to display.")]', { visible: true }),
                page.waitForXPath('//*[text()="Reference #"]/ancestor::table[1]/tbody/tr', { visible: true })
            ]);
            let result_text = await result_handle.evaluate(el => el.textContent || '');
            if (result_text?.indexOf('no results') > -1) {
                console.log('No Results Found');
                continue;
            }
            // get results
            counts += await this.getData1(page, sourceId, pre);;
            await this.sleep(2000);
        }
        
        await this.sleep(3000);
        return counts;
    }

    async setSearchCriteria1(page: puppeteer.Page, prefix: number) {
        let year = (new Date()).getFullYear().toString().substr(-2);
        let searchKey = `EN${year}-${prefix.toString().padStart(2, '0')}`;
        const searchHandle = await page.$x('//input[@id="SearchText"]');
        await searchHandle[0].click({clickCount: 3});
        await searchHandle[0].press('Backspace');
        await searchHandle[0].type(searchKey, {delay: 150});
    }

    async getData1(page: puppeteer.Page, sourceId: number, pre: any) {
        let counts = 0;
        while (true) {
            const rowXpath = '//*[text()="Reference #"]/ancestor::table[1]/tbody/tr';
            const rows = await page.$x(rowXpath);        
            for (const row of rows) {
                let owner_name: any = await row.evaluate(el => el.children[7].textContent?.trim());
                if (owner_name.indexOf('&') > -1) {
                    owner_name = owner_name.split('&')[0].trim();
                }
                owner_name = owner_name.replace(/[^a-zA-Z\s]+/g, '');
                let address = await row.evaluate(el => el.children[8].textContent?.trim());
                let year = (new Date()).getFullYear();
                let codeViolationId = parseInt(`${year}${pre.toString().padStart(2, '0')}`);
                let record = {
                    property_addresss: address,
                    fillingdate: '',
                    casetype:'',
                    sourceId,
                    codeViolationId,
                    owner_name
                }
                if (await this.saveRecord(record)) {
                    counts++;
                }
            }
            const [nextpage] = await page.$x('//*[text()="next"]/parent::a[1][contains(@href, "/SiteSearch")]');
            if (nextpage) {
                await Promise.all([
                    nextpage.click(),
                    page.waitForNavigation()
                ]);
                await this.sleep(1000);
            } else {
                break;
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
            originalDocType: record.casetype,
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