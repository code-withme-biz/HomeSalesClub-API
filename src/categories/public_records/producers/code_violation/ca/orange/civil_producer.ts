import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
import db from '../../../../../../models/db';

export default class CivilProducer extends AbstractProducer {
    productId = '';

    sources =
        [
            { url: 'http://permits.anaheim.net/tm_bin/tmw_cmd.pl?tmw_cmd=StatusViewCasecod&shl_caseno=', handler: this.handleSource1 },
            { url: 'https://hub.arcgis.com/datasets/anaheim::code-enforcement-violations-monthly/data?orderBy=Complaint_Received&orderByAsc=false', handler: this.handleSource2 },
            { url: 'https://epermit.cityoforange.org/etrakit3/Search/case.aspx', handler: this.handleSource3 },
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
        let year = (new Date()).getFullYear();
        let startNum = await this.getPrevCodeViolationId(sourceId, false, 1, true);

        const fillingDateXpath = '//b[@text()="Received Date:"]/ancestor::tr/td[2]';
        const caseTypeXpath = '//b[contains(text(), "Complaint Type")]/ancestor::tbody/tr[2]/td[1]';
        const addressXpath = '//b[contains(text(), "Address:")]/ancestor::tr/td[2]';

        while (true) {
            let startNumString = this.getStartNumberString(startNum);
            let caseId = "COD" + year + "-" + startNumString;
            let caseUrl = link + caseId;
            console.log(caseUrl);
            try {
                await page.goto(caseUrl, { waitUntil: 'networkidle0' });
                let notFound = await page.$x('//*[contains(text(), "Not Allowed")]');
                if (notFound.length > 0) {
                    console.log('Not found!');
                    break;
                }
                let casetype = await this.getTextByXpathFromPage(page, caseTypeXpath);
                casetype = casetype.replace(/\s+|\n/, ' ').trim();
                let address = await this.getTextByXpathFromPage(page, addressXpath);
                address = address.replace(/\s+|\n/, ' ').trim();
                if (address == 'MISCELLANEOUS') {
                    startNum++;
                    continue;
                }
                let fillingdate = await this.getTextByXpathFromPage(page, fillingDateXpath);
                fillingdate = fillingdate.replace(/\s+|\n/, ' ').trim();
                let codeViolationId = parseInt(`${year}${startNum.toString().padStart(5, ' ')}`)
                const record = {
                    property_address: address,
                    casetype,
                    fillingdate,
                    sourceId,
                    codeViolationId
                }
                if (await this.saveRecord(record))
                    counts++;
                startNum++;
            } catch (e) {
                startNum++;
                continue;
            }
        }
        return counts;
        await this.sleep(3000);
        return counts;
    }

    getStartNumberString(startNum: number, lengthdigit = 5) {
        let result = startNum.toString().padStart(lengthdigit, '0');
        return result;
    }

    async handleSource2(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;
        // load page
        const isPageLoaded = await this.openPage(page, link, '//*[text()="Complaint Address"]/ancestor::table[1]/tbody/tr');
        if (!isPageLoaded) {
            console.log("Website not loaded successfully:", link);
            return counts;
        }

        let prevCodeViolationId = await this.getPrevCodeViolationId(sourceId, true, -1);

        while (true) {
            const rows = await page.$x('//*[text()="Complaint Address"]/ancestor::table[1]/tbody/tr');
            let flag = false;
            for (const row of rows) {
                let fillingdate = await row.evaluate(el => el.children[4].textContent) || ''
                fillingdate = fillingdate.replace(/\s+|\n/gm, ' ').trim();
                let codeViolationId = (new Date(fillingdate)).getTime();
                if (prevCodeViolationId > codeViolationId) {
                    flag = true;
                    break;
                }
                let casetype = 'Code Enforcement Violations';
                let property_address = await row.evaluate(el => el.children[3].textContent) || ''
                property_address = property_address.replace(/\s+/gm, ' ').trim();
                let owner_name: any = await row.evaluate((el: any) => el.children[7].textContent) || ''
                if (owner_name.indexOf('&') > -1) {
                    owner_name = owner_name.split('&')[0].trim();
                }
                owner_name = owner_name.replace(/[^a-zA-Z\s]+/g, '');
                const record = {
                    property_address,
                    casetype,
                    fillingdate,
                    sourceId,
                    codeViolationId,
                    owner_name
                }
                if (await this.saveRecord(record))
                    counts++;
            }
            if (flag) break;
            const [hasnextpage] = await page.$x('//a[text()="›"][@aria-label="Next"]');
            if (hasnextpage) {
                await hasnextpage.click();
                await page.waitForXPath('//*[@class="table-responsive"]/following-sibling::div[contains(@class, "loader")]', { hidden: true });
                await this.sleep(500);
            } else {
                break;
            }
        }
        return counts;
    }

    async handleSource3(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;
        let startNum = await this.getPrevCodeViolationId(sourceId, false, 1, true);
        let startCaseCodes = [
            { code: 'CE', flagStop: false },
            { code: 'FD', flagStop: false },
        ]
        for (let id = startNum; id < startNum + 200; id++) {
            // load page

            // get year
            let year = (new Date()).getFullYear().toString().substr(-2);
            let startNumString = this.getStartNumberString3(id);


            for (let caseCode = 0; caseCode < startCaseCodes.length; caseCode++) {
                const isPageLoaded = await this.openPage(page, link, '//*[@id="cplMain_txtSearchString"]');
                if (!isPageLoaded) {
                    console.log('Page loading is failed, trying next...');
                    continue;
                }

                let caseId = startCaseCodes[caseCode].code + year + "-" + startNumString;
                await page.select('#cplMain_ddSearchBy', 'Case_Main.CASE_NO');
                await this.setSearchCriteria3(page, caseId);
                // click search button
                await page.click('#cplMain_btnSearch');

                // wait for search result
                let result_handle = await Promise.race([
                    page.waitForXPath('//*[@id="cplMain_lblNoSearchRslts"]', { visible: true }),
                    page.waitForXPath('//*[@id="cplMain_hlSearchResults"]', { visible: true })
                ]);
                let result_text = await result_handle.evaluate(el => el.textContent || '');
                if (result_text?.indexOf('no results') > -1) {
                    console.log('No Results Found');
                    continue;
                }
                let yearForCode = (new Date()).getFullYear();
                // get results
                let codeViolationId = parseInt(`${yearForCode}${id.toString().padStart(4, '0')}`);
                counts += await this.getData3(page, sourceId, codeViolationId, caseId);
                await this.sleep(2000);
            }
        }
        return counts;
    }

    getStartNumberString3(startNum: number, lengthdigit = 4) {
        let result = startNum.toString().padStart(lengthdigit, '0');
        return result;
    }

    async setSearchCriteria3(page: puppeteer.Page, id: string) {

        // choose begin with
        await page.select('#cplMain_ddSearchOper', 'BEGINS WITH');
        // page loaded successfully

        let [input_handle] = await page.$x('//*[@id="cplMain_txtSearchString"]');
        await input_handle.type(id);
    }

    async getData3(page: puppeteer.Page, sourceId: number, codeViolationId: number, caseId: string) {
        let counts = 0;
        let index = 1;
        const rows = await page.$x('//table[contains(@id, "rgSearchRslts")]/tbody/tr');
        for (const row of rows) {
            try {
                const rowCaseType = await page.$x('//table[contains(@id, "rgSearchRslts")]/tbody/tr[' + index + ']');

                let property_address = await page.evaluate(el => el.children[1].textContent, row);
                property_address = property_address.replace(/\s+|\n/, ' ').trim();
                await rowCaseType[0].click();
                await page.waitForXPath('//table[@id="cplMain_ctl02_dvCaseInfo"]/tbody/tr/td[contains(.,"' + caseId + '")]', { visible: true, timeout: 30000 });
                let casetypeXpath = '//table[@id="cplMain_ctl02_dvCaseInfo"]/tbody/tr[3]/td[2]';
                let casetype = await this.getTextByXpathFromPage(page, casetypeXpath);
                casetype = casetype.replace(/\s+|\n/, ' ').trim();
                casetype = casetype.replace('RV ', 'RECREATIONAL VEHICLE ').trim();
                if (casetype == '' || property_address == '') {
                    index++;
                    continue
                }
                if (casetype == 'AVA') {
                    casetype = 'Abandoned Vehicle Abatement'
                }
                if (await this.saveRecord({ property_address, casetype, sourceId, codeViolationId })) counts++;
            } catch (error) {
                console.log(error)
            }
            index++
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
            if (record.owner_address) {
                data = {
                    ...data,
                    'Mailing Address': record.owner_address
                }
            }
        }
        return await this.civilAndLienSaveToNewSchema(data);
    }
}