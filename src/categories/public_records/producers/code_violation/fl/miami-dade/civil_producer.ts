import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
import NAMES from './names.json';
export default class CivilProducer extends AbstractProducer {
    sources =
      [
          { url: 'https://trakit.miamilakes-fl.gov/etrakit/Search/case.aspx', handler: this.handleSource1 },
          { url: 'https://www.miamidade.gov/Apps/RER/RegulationSupportWebViewer/Home/SearchCaseNum', handler: this.handleSource2 },
          { url: 'https://edenweb.coralgables.com/Default.asp?Build=PM.pmPermit.SearchForm&Mode=OpenByKey', handler: this.handleSource3 },
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
        let startNum = await this.getPrevCodeViolationId(sourceId);
        for (let id = startNum ; id < 100 ; id++) {
            // load page
            const isPageLoaded = await this.openPage(page, link, '//*[@id="cplMain_txtSearchString"]');
            if (!isPageLoaded) {
                console.log('Page loading is failed, trying next...');
                continue;
            }
            await this.setSearchCriteria1(page, id);
            // click search button
            await page.click('#ctl00_cplMain_btnSearch');
            // wait for search result
            let result_handle = await Promise.race([
                page.waitForXPath('//*[@id="cplMain_lblNoSearchRslts"]', {visible: true}),
                page.waitForXPath('//*[@id="ctl00_cplMain_hlSearchResults"]', {visible: true})
            ]);
            let result_text = await result_handle.evaluate(el => el.textContent || '');
            if (result_text?.indexOf('no results') > -1) {
                console.log('No Results Found');
                break;
            }
            // get results
            counts += await this.getData1(page, sourceId, id);
            await this.sleep(3000);
        }
        return counts;
    }

    async setSearchCriteria1(page: puppeteer.Page, id: number) {
        // get year
        let year = (new Date()).getFullYear();
        // choose begin with
        await page.select('#cplMain_ddSearchOper', 'BEGINS WITH');
        // page loaded successfully
        let [input_handle] = await page.$x('//*[@id="cplMain_txtSearchString"]');
        await input_handle.type(`C${year}-${id.toString().padStart(2, '0')}`, {delay: 100});
    }

    async getData1(page: puppeteer.Page, sourceId: number, codeViolationId: number) {
        let counts = 0;
        const rows = await page.$x('//table[contains(@id, "rgSearchRslts")]/tbody/tr');
        for (const row of rows) {
            try {
                let casetype = await page.evaluate(el => el.children[1].textContent, row);
                casetype = casetype.replace(/\s+|\n/, ' ').trim();
                let property_address = await page.evaluate(el => el.children[3].textContent, row);
                property_address = property_address.replace(/\s+|\n/, ' ').trim();
                if (await this.saveRecord({property_address, casetype, sourceId, codeViolationId})) counts++;
            } catch (error) {
            }
        }
        return counts;
    }

    async handleSource2(page: puppeteer.Page, link: string, sourceId: number) {
        let counts = 0;
        const detail_url = 'https://www.miamidade.gov/Apps/RER/RegulationSupportWebViewer/NPCase/NPCaseDetails?CaseNum=';
        for (const NAME of NAMES) {
            console.log('Checking for ', NAME);
            const isPageLoaded = await this.openPage(page, link, '//*[@id="violator-tab"]');
            if (!isPageLoaded) {
                console.log('Page loading is failed, trying next...');
                continue;
            }
            await page.click('a#violator-tab');
            await this.sleep(1000);
            await page.type('#querySearchVN', NAME, {delay: 100});
            await Promise.all([
                page.click('#violator button[type="submit"]'),
                page.waitForNavigation()
            ]);
            const result_handle = await Promise.race([
                page.waitForXPath('//*[contains(text(), "CASE NUMBER")]'),
                page.waitForXPath('//*[contains(text(), "did not find")]')
            ]);
            const result_text = await result_handle.evaluate(el => el.textContent) || '';
            if (result_text.indexOf('did not find') > -1) {
                console.log('No results found');
                continue;
            }
            const casenumbers = [];
            const casenumber_handles = await page.$x('//table/tbody/tr/td[2]');
            for (const casenumber_handle of casenumber_handles) {
                let casenumber: any = await casenumber_handle.evaluate(el => el.textContent);
                casenumber = casenumber.replace(/\s+|\n/gm, ' ').trim();
                casenumbers.push(casenumber);
            }
            for (const casenumber of casenumbers) {
                let letter = '';
                let num = parseInt(casenumber);
                if (num === NaN) {
                    letter = casenumber.charAt(0);
                    num = parseInt(casenumber.slice(1));
                }
                // increase
                while (true) {
                    await page.goto(detail_url+letter+num, {waitUntil: 'load'});
                    const [hasresult] = await page.$x('//*[text()="Case Number"]');
                    if (hasresult) {
                        if (await this.getData2(page, sourceId, num)) counts++;
                    } else {
                        break;
                    }
                    num++;
                }
                // decrease
                num = parseInt(casenumber);
                if (num === NaN) {
                    letter = casenumber.charAt(0);
                    num = parseInt(casenumber.slice(1));
                }
                num--;
                while (num > 0) {
                    await page.goto(detail_url+letter+num, {waitUntil: 'load'});
                    const [hasresult] = await page.$x('//*[text()="Case Number"]');
                    if (hasresult) {
                        if (await this.getData2(page, sourceId, num)) counts++;
                    } else {
                        break;
                    }
                    num--;
                }
            }
        }        
        return counts;
    }

    async getData2(page: puppeteer.Page, sourceId: number, num: number) {
        let property_address = await this.getTextByXpathFromPage(page, '//p[*[text()="Property Address"]]/following-sibling::p[1]');
        let owner_name = await this.getTextByXpathFromPage(page, '//p[*[text()="Owner Name"]]/following-sibling::p[1]');
        owner_name = owner_name.split('&')[0];
        owner_name = owner_name.replace(/\(|\)/g, ' ');
        owner_name = owner_name.replace(/\s+/g, ' ').trim();
        if (owner_name.indexOf('Address ') === -1) {
            let owner_address = await this.getTextByXpathFromPage(page, '//p[*[text()="Owner Address"]]/following-sibling::p[1]');
            let casetype = await this.getTextByXpathFromPage(page, '//p[*[text()="Case Type"]]/following-sibling::p[1]');
            let fillingdate = await this.getTextByXpathFromPage(page, '//p[*[text()="Open Date"]]/following-sibling::p[1]');
            let record = {
                property_address, 
                owner_name, 
                owner_address, 
                casetype, 
                fillingdate, 
                sourceId, 
                codeViolationId: num
            };
            return await this.saveRecord(record);
        }
        return false;
    }

    async handleSource3(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;

        let fromDate = await this.getPrevCodeViolationId(sourceId, true);

        const isPageLoaded = await this.openPage(page, link, '//input[@value="Search for Permits"]');
        await this.sleep(1000);
        if (!isPageLoaded) {
            console.log()
            return counts
        }
        
        await this.setSearchCriteria3(page);               
        
        await Promise.all([
            page.click('input[value*="Permits"]'),
            page.waitForNavigation()
        ]);
        
        // get results
        counts += await this.getData3(page, fromDate, sourceId);
        await this.sleep(3000)
        return counts;
    }

    async setSearchCriteria3(page: puppeteer.Page) {
        await page.select('select[name*="pmPermit"]', 'ce501');
    }

    async getData3(page: puppeteer.Page, fromDate: any, sourceId: number) {
        let counts = 0;
        const rowXpath = '//a[contains(@href, "pmPermit.Main")]/parent::td/parent::tr';
        const rows = await page.$x(rowXpath);
        
        for (const row of rows) {
            let fillingDate = await row.evaluate(el => el.children[1].textContent?.trim());
            let originalDocType = await row.evaluate(el => el.children[3].textContent?.trim());
            let address = await row.evaluate(el => el.children[2].textContent?.trim());
            const timestamp = (new Date(fillingDate!)).getTime();
            if (fromDate <= timestamp) {
                let record = {
                    property_address: address, 
                    casetype: originalDocType, 
                    sourceId, 
                    fillingdate: fillingDate,
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
        if (record.fillingdate) data = {...data, fillingDate: record.fillingdate};
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