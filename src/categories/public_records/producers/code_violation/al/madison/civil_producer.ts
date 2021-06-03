import puppeteer from 'puppeteer';
import AbstractProducer from '../../abstract_producer';
import db from '../../../../../../models/db';

const parser = require('parse-address');
const namesSplitted = ['AND', 'C/O'];
const namesSplittedRegexString = `,|&|\\b(?:${namesSplitted.join('|')})\\b`;
const namesSplittedRegex = new RegExp(namesSplittedRegexString, 'i');

export default class CivilProducer extends AbstractProducer {
    productId = '';

    sources =
        [
            {
                url: 'https://buildportal.madisonal.gov/eSuite.Permits/AdvancedSearchPage/AdvancedSearch.aspx?permitNumber=&permitType=-1&serviceAddress=',
                handler: this.handleSource1
            }
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
        const isPageLoaded = await this.openPage(page, link, '//*[contains(@id,"txtPermitNumber")]');
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
        let counts = 0;
        let complaintNumber = await this.getPrevCodeViolationId(sourceId, false, 58600);
        let nextFlag;
        let countSkip = 0
        do {
            try {
                nextFlag = true
                await page.goto(`https://buildportal.madisonal.gov/eSuite.Permits/ContractorPermitDetailsPage/ContractorPermitDetails.aspx?id=${complaintNumber}`, {waitUntil: 'load'})
                await page.waitForXPath('//*[contains(@id,"locationDiv")]', {timeout: 10000})
                countSkip = 0
                const [fillingDateElement] = await page.$x('//*[contains(text(),"Status")]/following-sibling::td[1]/span')
                let fillingdate = (await page.evaluate(elem => elem.textContent, fillingDateElement)).replace(/^.*\s/, '')
                const [caseTypeElement] = await page.$x('//*[contains(text(),"Permit Type")]/following-sibling::td[1]/span')
                let casetype = await page.evaluate(elem => elem.textContent, caseTypeElement);
                const [addressElement] = await page.$x('//*[contains(text(),"Address")]/following-sibling::td[1]/span')
                let address = await page.evaluate(elem => elem.textContent, addressElement);
                const [ownerElement] = await page.$x('//*[contains(text(),"Primary Owner")]/following-sibling::td[1]/span')
                let owner = await page.evaluate(elem => elem.textContent, ownerElement);
                let arrayOwners = []
                let ownersNameSplited = owner.split(namesSplittedRegex);
                const defaultLastName = ownersNameSplited[0].trim();

                for (let index = 1; index < ownersNameSplited.length; index++) {
                    arrayOwners.push(`${defaultLastName}, ${ownersNameSplited[index].trim()}`)
                }
                if (arrayOwners.length) {
                    for (let i = 0; i < arrayOwners.length; i++) {
                        if (await this.saveRecord(address!, casetype!, fillingdate, sourceId, complaintNumber,arrayOwners[i]))
                            counts++;
                    }
                } else {
                    if (await this.saveRecord(address!, casetype!, fillingdate, sourceId, complaintNumber,owner))
                        counts++;
                }

                countSkip = 0
            } catch (e) {

                countSkip++
                if (countSkip > 10) nextFlag = false
            }
            complaintNumber++
        } while (nextFlag)
        return counts;
    }

    async saveRecord(address: string, caseType: string, fillingDate: string, sourceId: number, codeViolationId: number, owner: string) {
        let data: any = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'Property Address': address,
            "vacancyProcessed": false,
            "productId": this.productId,
            fillingDate,
            sourceId,
            codeViolationId,
            originalDocType: caseType
        };
        if (owner) {
            // save owner data
            let parseName: any = this.newParseName(owner.trim());
            if (parseName.type && parseName.type == 'COMPANY') {
                return false;
            }
            data = {
                ...data,
                'First Name': parseName.firstName,
                'Last Name': parseName.lastName,
                'Middle Name': parseName.middleName,
                'Name Suffix': parseName.suffix,
                'Full Name': parseName.fullName
            }
        }
        return await this.civilAndLienSaveToNewSchema(data);
    }
}