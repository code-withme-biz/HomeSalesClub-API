import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
import db from '../../../../../../models/db';

export default class CivilProducer extends AbstractProducer {
    productId = '';

    sources =
      [
        { url: 'https://www.citizenserve.com/Sacramento/CitizenController?Action=DisplaySearchPage&CtzPagePrefix=Sa&InstallationID=43', handler: this.handleSource1 }
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
        let startNum = await this.getPrevCodeViolationId(sourceId, false, 1, true);
        let fullyear = (new Date()).getFullYear();
        let year: any = (new Date()).getFullYear();
        year = year.toString().slice(-2);
        const caseInputXpath = '//input[@name="CaseNumber"]';
        const btnSubmitXpath = '//input[@name="BtnSubmit"]';
        const searchResultXpath = '//font[contains(., "Case #")]/ancestor::tbody[1]/tr';
        const fillingDateXpath = '//font[contains(., "Case #")]/ancestor::tbody[1]/tr[2]/td[6]';
        const caseTypeXpath = '//font[contains(., "Case #")]/ancestor::tbody[1]/tr[2]/td[4]';
        const streetNumberXpath = '//font[contains(., "Case #")]/ancestor::tbody[1]/tr[2]/td[2]';
        const streetNameXpath = '//font[contains(., "Case #")]/ancestor::tbody[1]/tr[2]/td[3]';

        while (true) {
            let startNumString = this.getStartNumberString(startNum);
            let caseId = year + "-" + startNumString;
            console.log(caseId);
            try{
                const isPageLoaded = await this.openPage(page, link, caseInputXpath);
                if (!isPageLoaded) {
                    console.log("Website not loaded successfully:", link);
                    return counts;
                }
                await this.inputFromXpath(page, caseInputXpath, caseId);
                let [btnSubmit] = await page.$x(btnSubmitXpath);
                await Promise.all([
                    btnSubmit.click(),
                    page.waitForNavigation()
                ]);
                let searchResult = await page.$x(searchResultXpath);
                if(searchResult.length < 2){
                    console.log('Not found!');
                    break;
                }
                let casetype = await this.getTextByXpathFromPage(page, caseTypeXpath);
                casetype = casetype.replace(/\s+|\n/, ' ').trim();
                let streetnumber = await this.getTextByXpathFromPage(page, streetNumberXpath);
                let streetname = await this.getTextByXpathFromPage(page, streetNameXpath);
                let address = streetnumber + " " + streetname;
                address = address.replace(/\s+|\n/, ' ').trim();
                if(address == 'MISCELLANEOUS'){
                    startNum++;
                    continue;
                }
                let fillingdate = await this.getTextByXpathFromPage(page, fillingDateXpath);
                fillingdate = fillingdate.replace(/\s+|\n/, ' ').trim();
                let codeViolationId = parseInt(`${fullyear}${this.getStartNumberString(startNum)}`);
                if (await this.saveRecord(address, casetype, fillingdate, sourceId, codeViolationId)){
                    counts++;
                }
                startNum++;
            } catch(e){
                startNum++;
                continue;
            }
        }
        // get results
        return counts;
    }

    async inputFromXpath(page: puppeteer.Page, xPath: string, input: string): Promise<boolean>{
        try{
            let [selectInput] = await page.$x(xPath);
            await selectInput.type(input, {delay: 150});
            return true;
        } catch(e){
            console.log(e);
            return false;
        }
    }

    getStartNumberString(startNum: number, lengthdigit = 6){
        let result = startNum.toString();
        return result.padStart(lengthdigit, '0');
    }

    async saveRecord(address: string, caseType: string, fillingDate: string, sourceId: number, codeViolationId: number) {
        const data = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'Property Address': address,
            "vacancyProcessed": false,
            "productId": this.productId,
            fillingDate,
            originalDocType: caseType,
            sourceId,
            codeViolationId
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }
}