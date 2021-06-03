import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
import db from '../../../../../../models/db';
const parser = require('parse-address');

export default class CivilProducer extends AbstractProducer {
    productId = '';

    sources =
        [
            { url: 'https://aca-pasco.accela.com/pasco/Login.aspx', handler: this.handleSource1 },
            { url: 'https://egov-pasco.com/eTRAKiT3/Search/case.aspx', handler: this.handleSource2 },

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
        // load page
        const isPageLoaded = await this.openPage(page, link, '//input[@id="ctl00_PlaceHolderMain_LoginBox_txtUserId"]');
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
        let email = 'homesalesllc@gmail.com';
        let password = 'test12345'
        await page.goto('https://aca-pasco.accela.com/pasco/Login.aspx');
        await page.waitForXPath('//input[@id="ctl00_PlaceHolderMain_LoginBox_txtUserId"]', { visible: true, timeout: 200000 });
        await page.evaluate(() => {
            // @ts-ignore
            document.querySelector('#ctl00_PlaceHolderMain_LoginBox_txtUserId').value = '';
            // @ts-ignore
            document.querySelector('#ctl00_PlaceHolderMain_LoginBox_txtPassword').value = '';
        })
        await page.type('#ctl00_PlaceHolderMain_LoginBox_txtUserId', email, { delay: 150 });
        await page.type('#ctl00_PlaceHolderMain_LoginBox_txtPassword', password, { delay: 150 });

        let btnLogin = await page.$x('//a[@id="ctl00_PlaceHolderMain_LoginBox_btnLogin"]')
        await btnLogin[0].click();
        await page.waitForXPath('//span[@id="ctl00_PlaceHolderMain_lblHellow"]', { visible: true, timeout: 200000 });

        let counts = 0;
        let dateRange = {
            from: new Date(await this.getPrevCodeViolationId(sourceId, true)),
            to: new Date()
        };
        let fromDate = dateRange.from;
        let toDate = dateRange.to;
        try {
            let valueForSelect = ['Enforcement/Case/Appeal/NA', 'Enforcement/Case/Material/NA', 'Enforcement/Case/Complaint/NA', 'Enforcement/Case/Citation/NA', 'Enforcement/Case/Condemnation/NA', 'Enforcement/Case/Violation/NA'];
            let docTypeArr = ['Appeal', 'Board and Secure', 'Building Complaint', 'Citation/Min Housing', 'File Condemnation', 'Violation'];

            for (let j = 0; j < valueForSelect.length; j++) {
                await page.goto('https://aca-pasco.accela.com/pasco/Cap/CapHome.aspx?module=Enforcement&TabName=Enforcement&TabList=Home%7C0%7CPermits%7C1%7CLicenses%7C2%7CEnforcement%7C3%7CCurrentTabIndex%7C3');
                await page.waitForXPath('//select[@id="ctl00_PlaceHolderMain_generalSearchForm_ddlGSPermitType"]', { visible: true, timeout: 200000 });
                await page.select('#ctl00_PlaceHolderMain_generalSearchForm_ddlGSPermitType', valueForSelect[j]);

                await page.waitForXPath('//div[@id="divGlobalLoading" and contains(@style,"display: block;")]', { visible: true, timeout: 5000 });
                await this.sleep(5000);
                console.log(this.getFormattedDate(fromDate))
                await page.click('input#ctl00_PlaceHolderMain_generalSearchForm_txtGSStartDate', { clickCount: 3 });
                await page.type('input#ctl00_PlaceHolderMain_generalSearchForm_txtGSStartDate', this.getFormattedDate(fromDate));
                await page.click('input#ctl00_PlaceHolderMain_generalSearchForm_txtGSEndDate', { clickCount: 3 });
                await page.type('input#ctl00_PlaceHolderMain_generalSearchForm_txtGSEndDate', this.getFormattedDate(toDate));


                let buttonSearch = await page.$x('//a[@id="ctl00_PlaceHolderMain_btnNewSearch"]');
                await buttonSearch[0]!.click();

                try {
                    await page.waitForXPath('//span[contains(.,"Showing")]', { visible: true, timeout: 8000 });
                } catch (err) {
                    console.log('No Result For ' + docTypeArr[j]);
                    continue
                }
                let flagStop = false;
                while (!flagStop) {
                    await page.waitForXPath('//div[@id="divGlobalLoading" and contains(@style,"display: none;")]', { timeout: 60000 });
                    let casetype = docTypeArr[j];
                    let totalRow = await page.$x('//table[@id="ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList"]/tbody/tr[contains(@class,"ACA_TabRow_Odd") or contains(@class,"ACA_TabRow_Even")]');
                    for (let l = 0; l < totalRow!.length; l++) {
                        let index = l + 1;
                        let [addressXpath] = await page.$x('//table[@id="ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList"]/tbody/tr[contains(@class,"ACA_TabRow_Odd") or contains(@class,"ACA_TabRow_Even")][' + index + ']/td[5]');
                        let property_address;
                        try {
                            property_address = await addressXpath.evaluate(el => el.textContent?.trim());
                        } catch (err) {
                            continue
                        }

                        let [fillingdateXpath] = await page.$x('//table[@id="ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList"]/tbody/tr[contains(@class,"ACA_TabRow_Odd") or contains(@class,"ACA_TabRow_Even")][' + index + ']/td[2]');
                        let fillingdate;
                        try {
                            fillingdate = await fillingdateXpath.evaluate(el => el.textContent?.trim());
                        } catch (err) {
                            continue
                        }
                        const codeViolationId = (new Date(fillingdate!)).getTime();
                        if (await this.saveRecord({ property_address, casetype, sourceId, codeViolationId, fillingdate }))
                            counts++;
                    }
                    try {
                        let btnNext = await page.$x('//a[contains(.,"Next") and contains(@href,"javascript")]');
                        await btnNext[0].click();
                        await this.sleep(2000);
                    } catch (err) {
                        flagStop = true
                    }
                }

            }
        } catch (e) {

        }
        let btnLogout = await page.$x('//span[@id="ctl00_HeaderNavigation_com_headIsLoggedInStatus_label_logout"]')
        await btnLogout[0].click();

        return counts;
    }

    getStartNumberString2(startNum: number, lengthdigit = 4) {
        let result = startNum.toString().padStart(lengthdigit, '0');
        return result;
    }


    async handleSource2(page: puppeteer.Page, link: string, sourceId: number) {
        console.log('============ Checking for ', link);
        let counts = 0;
        let startNum = await this.getPrevCodeViolationId(sourceId, false, 1, true);
        let startCaseCodes = [
            { code: 'CEB', flagStop: false },
        ]

        let login = 'https://egov-pasco.com/eTRAKiT3/';
        const isPageLoaded = await this.openPage(page, login, '//*[@id="ucLogin_txtLoginId"]');
        if (!isPageLoaded) {
            console.log('Page loading is failed, trying next...');
            return counts;
        }
        let username = 'homesalesllc';
        let pass = 'test12345';
        let usernameHandle = await page.$x('//*[@id="ucLogin_txtLoginId"]')
        await usernameHandle[0].click({ clickCount: 3 });
        await usernameHandle[0].press('Backspace');
        await usernameHandle[0].type(username, { delay: 150 });

        let passHandle = await page.$x('//*[@id="ucLogin_RadTextBox2"]')
        await passHandle[0].click({ clickCount: 3 });
        await passHandle[0].press('Backspace');
        await passHandle[0].type(pass, { delay: 150 });

        let loginHandle = await page.$x('//*[@id="ucLogin_btnLogin"]')
        await loginHandle[0].click();

        await page.waitForXPath('//*[@id="ucLogin_lnkBtnLogout"]', { visible: true, timeout: 30000 })

        for (let id = startNum; id < startNum + 200; id++) {
            // get year
            let year = (new Date()).getFullYear();
            let startNumString = this.getStartNumberString2(id);


            for (let caseCode = 0; caseCode < startCaseCodes.length; caseCode++) {
                if (startCaseCodes[caseCode].flagStop) {
                    console.log('Progress another case for id = ' + id);
                    continue
                }
                const isPageLoaded = await this.openPage(page, link, '//*[@id="cplMain_txtSearchString"]');
                if (!isPageLoaded) {
                    console.log('Page loading is failed, trying next...');
                    continue;
                }

                let caseId = startCaseCodes[caseCode].code + year + "-" + startNumString;
                await page.select('#cplMain_ddSearchBy', 'Case_Main.CASE_NO');
                await this.setSearchCriteria2(page, caseId);
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
                    startCaseCodes[caseCode].flagStop = true;
                    continue;
                }
                // get results
                let yearForCode = (new Date()).getFullYear();
                let codeViolationId = parseInt(`${yearForCode}${id.toString().padStart(4, '0')}`);
                counts += await this.getData2(page, sourceId, codeViolationId, caseId);
                await this.sleep(2000);
            }
        }

        let logoutHandle = await page.$x('//*[@id="ucLogin_lnkBtnLogout"]')
        await logoutHandle[0].click();

        return counts;
    }

    async setSearchCriteria2(page: puppeteer.Page, id: string) {

        // choose begin with
        await page.select('#cplMain_ddSearchOper', 'BEGINS WITH');
        // page loaded successfully

        let [input_handle] = await page.$x('//*[@id="cplMain_txtSearchString"]');
        await input_handle.type(id);
    }

    async getData2(page: puppeteer.Page, sourceId: number, codeViolationId: number, caseId: string) {
        let counts = 0;
        const rows = await page.$x('//table[contains(@id, "rgSearchRslts")]/tbody/tr');

        for (const row of rows) {
            let index = 1;
            try {
                let property_address = await page.evaluate(el => el.children[2].textContent, row);
                property_address = property_address.replace(/\s+|\n/, ' ').trim();
                let owner_name = await page.evaluate(el => el.children[5].textContent, row);
                owner_name = owner_name.replace(/\s+|\n/, ' ').trim();
                if (owner_name.indexOf('&') > -1) {
                    owner_name = '';
                }

                const rowCaseType = await page.$x('//table[contains(@id, "rgSearchRslts")]/tbody/tr[' + index + ']');
                await rowCaseType[0].click();
                await page.waitForXPath('//table[@id="cplMain_ctl02_dvCaseInfo"]/tbody/tr/td[contains(.,"' + caseId + '")]', { visible: true, timeout: 30000 });
                let casetypeXpath = '//table[@id="cplMain_ctl02_dvCaseInfo"]/tbody/tr[3]/td[2]';
                let casetype = await this.getTextByXpathFromPage(page, casetypeXpath);
                casetype = casetype.replace(/\s+|\n/, ' ').trim();
                casetype = casetype!.replace('AVA ', 'Abandoned Vehicle Abatement ').trim();
                if (casetype == '' || property_address == '') {
                    index++;
                    continue
                }
                if (casetype == 'AVA') {
                    casetype = 'Abandoned Vehicle Abatement'
                }
                if (casetype == '' || property_address == '') {
                    continue
                }

                let fillingdate = '';
                if (owner_name != '') {
                    if (await this.saveRecord({ property_address, casetype, sourceId, codeViolationId, owner_name, fillingdate })) counts++;
                } else {
                    if (await this.saveRecord({ property_address, casetype, sourceId, codeViolationId, fillingdate })) counts++;
                }
                index++;
            } catch (error) {
                index++;
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
            codeViolationId: record.codeViolationId,
            fillingDate: record.fillingdate
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