import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
import db from '../../../../../../models/db';

export default class CivilProducer extends AbstractProducer {
    productId = '';

    sources =
      [
        { url: 'https://cobbca.cobbcounty.org/CitizenAccess/Cap/CapHome.aspx?module=Enforce&TabName=Enforce&TabList=HOME%7C0%7CEnforce%7C1%7CDOT%7C2%7CBuilding%7C3%7CLicenses%7C4%7CPermits%7C5%7CPlanning%7C6%7CCurrentTabIndex%7C1', handler: this.handleSource1 }
      ];

    async init(): Promise<boolean> {
        console.log("running init")
        this.browser = await this.launchBrowser();
        this.browserPages.generalInfoPage = await this.browser.newPage();
        this.browserPages.generalInfoPage.setDefaultTimeout(200000);
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
        const isPageLoaded = await this.openPage(page, link, '//*[text()="Search Code Enforcement Cases"]');
        if (!isPageLoaded) {
            console.log("Website not loaded successfully:", link);
            return counts;
        }

        let year: any = (new Date()).getFullYear();
        year = year.toString().slice(-2);
        // get results
        counts += await this.getData1(page, year, sourceId);
        await this.sleep(3000);
        return counts;
    }

    async getTextByXpathFromPage(page: puppeteer.Page, xPath: string): Promise<string> {
        const [elm] = await page.$x(xPath);
        if (elm == null) {
            return '';
        }
        let text = await page.evaluate(j => j.innerText, elm);
        return text.replace(/\n/g, ' ');
    }

    getStartNumberString(startNum: number, lengthdigit = 5){
        let result = startNum.toString().padStart(lengthdigit, '0');
        return result;
    }

    async getData1(page: puppeteer.Page, year: number, sourceId: number) {
        let counts = 0;
        let startNum = await this.getPrevCodeViolationId(sourceId);

        const caseIdXpath = '//span[@id="ctl00_PlaceHolderMain_lblPermitNumber"]';
        const caseTypeXpath = '//span[@id="ctl00_PlaceHolderMain_lblPermitType"]';
        const addressXpath = '//div[@id="divWorkLocationInfo"]//span[@class="fontbold"]';
        const ownerNameXpath = '//div[@class="div_parent_detail"]//td[@style="vertical-align:top"]';

        while (true) {
            let startNumString = this.getStartNumberString(startNum);
            // let caseId = "COD" + year + "-" + startNumString;
            let caseUrl = "https://cobbca.cobbcounty.org/CitizenAccess/Cap/CapDetail.aspx?Module=Enforce&TabName=Enforce&capID1="+year+"CED&capID2=00000&capID3="+startNumString+"&agencyCode=COBBCO&IsToShowInspection=";
            console.log(caseUrl);
            try{
                await page.goto(caseUrl, {waitUntil: 'networkidle0'});
                let notFound = await page.$x('//span[@id="ctl00_PlaceHolderMain_systemErrorMessage_lblMessageTitle"]');
                if(notFound.length > 0){
                    console.log('Not found!');
                    startNum++;
                    break;
                }
                let caseid = await this.getTextByXpathFromPage(page, caseIdXpath);
                caseid = caseid.replace(/\s+|\n/, ' ').trim();
                let casetype = await this.getTextByXpathFromPage(page, caseTypeXpath);
                casetype = casetype.replace(/\s+|\n/, ' ').trim();
                let address = await this.getTextByXpathFromPage(page, addressXpath);
                address = address.replace(/\s+|\n/, ' ').trim();
                let ownername = await this.getTextByXpathFromPage(page, ownerNameXpath);
                address = address.replace(/\s+|\n/, ' ').trim();
                let year1 = (new Date()).getFullYear();
                let codeViolationId = parseInt(`${year1}${startNum.toString().padStart(5, '0')}`);
                if (await this.saveRecord(address, casetype, ownername, sourceId, codeViolationId))
                    counts++
                startNum++;
            } catch(e){
                startNum++;
                continue;
            }
        }
        return counts;
    }

    async saveRecord(address: string, caseType: string, ownerName: string, sourceId: number, codeViolationId: number) {
        let count = 0;

        // save property data
        let data: any = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'Property Address': address,
            "vacancyProcessed": false,
            "productId": this.productId,
            originalDocType: caseType,
            sourceId,
            codeViolationId
        };
        // save owner data
        let parseName: any = this.newParseName(ownerName);
        if(parseName.type && parseName.type == 'COMPANY'){
            return false;
        }
        data = {
            ...DataCue,
            'First Name': parseName.firstName,
            'Last Name': parseName.lastName,
            'Middle Name': parseName.middleName,
            'Name Suffix': parseName.suffix,
            'Full Name': parseName.fullName
        }
        return await this.civilAndLienSaveToNewSchema(data);
    }
}