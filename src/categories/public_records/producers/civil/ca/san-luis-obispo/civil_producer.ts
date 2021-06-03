import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';

export default class CivilProducer extends AbstractProducer {
    browser: puppeteer.Browser | undefined;
    browserPages = {
        generalInfoPage: undefined as undefined | puppeteer.Page
    };
    urls = {
        generalInfoPage: 'https://crrecords.slocounty.ca.gov/SLOWeb/search/DOCSEARCH262S6'
    }

    xpaths = {
        isPAloaded: '//a[@id="searchButton"]'
    }

    constructor(publicRecordProducer: IPublicRecordProducer) {
        // @ts-ignore
        super();
        this.publicRecordProducer = publicRecordProducer;
        this.stateToCrawl = this.publicRecordProducer?.state || '';
    }

    async init(): Promise<boolean> {
        this.browser = await this.launchBrowser();
        this.browserPages.generalInfoPage = await this.browser.newPage();
        await this.setParamsForPage(this.browserPages.generalInfoPage);
        try {
            await this.browserPages.generalInfoPage.goto(this.urls.generalInfoPage, { waitUntil: 'load' });
            return true;
        } catch (err) {
            console.warn(err);
            return false;
        }
    }

    async read(): Promise<boolean> {
        try {
            await this.browserPages.generalInfoPage?.waitForXPath(this.xpaths.isPAloaded);
            return true;
        } catch (err) {
            console.warn('Problem loading civil producer page.');
            return false;
        }
    }

    // To check empty or space
    isEmptyOrSpaces(str: string) {
        return str === null || str.match(/^\s*$/) !== null;
    }

    async parseAndSave(): Promise<boolean> {
        let countRecords = 0;
        let page = this.browserPages.generalInfoPage!;

        try {
            const civilUrl: string = 'https://crrecords.slocounty.ca.gov/SLOWeb/search/DOCSEARCH262S6';
            let dateRange = await this.getDateRange('Califonia', 'San Luis Obispo');
            let fromDate = dateRange.from;
            let toDate = dateRange.to;
            let fromDateString = this.getFormattedDate(fromDate);
            let toDateString = this.getFormattedDate(toDate);

            await page.goto(civilUrl, { timeout: 600000 });
            await page.waitForXPath('//a[@id="searchButton"]', { visible: true, timeout: 200000 });
            let SearchButton = await page.$x('//a[@id="searchButton"]');
            await page.type('input#field_RecordingDateID_DOT_StartDate', fromDateString);
            await page.type('input#field_RecordingDateID_DOT_EndDate', toDateString);
            let documentTypes = ['AGREE DEED RESTRICT', 'AMEND TO JDGMNT/ABS OF JDGMNT', 'AMEND TO RELEASE MECHANIC LIEN', 'AMEND TO RELEASE OF LIEN', 'AMENT TO SATISFACTN JUDGMENTS',
                'AMEND TO TRUSTEES DEEDS', 'AMENDMENT TO DEED OF TRUST', 'AMENDMENT TO EASEMENT DEED', 'AMENDMENT OF DEED OF TRUST', 'ASSIGNMENT OF MORTGAGE', 'ASSUMPTION OF DEED OF TRUST', 'CERTIFICATE OF LIEN - MUNICIPAL UTILITY DISTRICT', 'CONDITIONAL RELEASE OF LIEN', 'CONSTRUCTION OF DEED OF TRUST', 'DEED OF TRUST', 'DEED (GRANT,JOINT TENANCY,QUIT)', 'EASEMENT DEED', 'EXTENSION LIEN', "FAMILY LAW ATTORNEY'S", 'FICTITIOUS DEED OF TRUST', 'FREE ABSTRACT OFJUDGMENT', 'RELEASE LIS PENDENSJUDGEMENTS/ABSTRACTS OF JDGMNT', 'MECHANICS LIEN', 'MECHANICS LIEN EXTENSION', 'MINERAL DEED (MINERAL RIGHTS)', 'MODIFICATION OF JUDGEMENT', "MODIFICATION OF DEED OF TRUST", 'MORTGAGE', 'NOTICE OF LIEN-STORAGE TANKS', 'NOTICE OF SUPPORT JUDGMENT', 'PARTIAL JUDGEMENT', 'PARTIAL RELEASE JUDGEMENT', 'PARTIAL RELEASE OF JUDGMENT', 'PARTIAL RELEASE OF LIEN', 'PARTIAL SATISFACTN OF JUDGMENT', 'POSTPONED PROPERTY TAX LIEN', 'RELEASE LIS PENDES NOT, ACTN.', 'RELEASE OF JUDGMENT', 'RELEASE OF LIEN (INHERITANCE)', "RELEASE OF MECHANIC'S LIEN", 'RELEASE OF MORTGAGE', 'RELEASE TAX LIEN NON-RESIDENT', 'RELEASE-ERRONEOUS LIEN', "REQUEST COPY TRUSTEE'S DEED", 'RESCISSN TRUSTEE DEED ON SALE', 'REVOCATION / RECISSION OF DEED', 'REVOCATION / RECISSION OF DEED', 'REVOCABLE TRANSFER ON DEATH DEED', 'RIGHT OF WAY DEED', 'REVOCATION/RESCISSION OF CERTIFICATE OF RELEASE OF FEDERAL TAX LIEN', 'REVOCATION OF REVOCABLE TRANSFER ON DEATH DEED', 'SATISFACTION OF JUDGMENT', 'SATISFACTION OF MORTGAGE', 'SUBORDINATN OF FEDERAL TAXLIEN', 'SUBORDN TAX LIEN STATE/CTY/ETC', 'TAX LIEN STATE NON-RESIDENT', 'TAX LIENS - FEDERAL (IRS)', 'TAX LIENS ST, COUNTY, CITY ETC', 'TRUSTEES DEEDS', 'WITHDRAWL FEDERAL TAX LIEN'];
            let inputText = await page.$x('//input[@id="field_selfservice_documentTypes"]');
            inputText[0].click();
            await page.waitForXPath('//ul[@id="field_selfservice_documentTypes-aclist"]//li[contains(text(),"AGREE DEED RESTRICT")]', { visible: true });
            for (let i = 0; i < documentTypes.length; i++) {
                let text = await page.$x('//ul[@id="field_selfservice_documentTypes-aclist"]//li[contains(text(),"' + documentTypes[i] + '")]')
                for (let j = 0; j < text.length; j++) {
                    try {
                        let textDocument = await text[j].evaluate(el => el.textContent);
                        // console.log(textDocument);
                        if (textDocument == documentTypes[i]) {
                            await text[j].click();
                        }
                    } catch (err) {
                        continue
                    }
                }
                await this.sleep(1000);
            }
            await SearchButton[0].click();
            try {
                await page.waitForXPath('//ul[@class="selfServiceSearchResultList ui-listview ui-listview-inset ui-corner-all ui-shadow"]', { visible: true, timeout: 200000 });
            } catch (err) {
                await AbstractProducer.sendMessage('San Luis Obispo', 'California', 0, 'Civil & Lien');
                return true;
            }
            let pageOf = await page.$x('//div[@class="selfServiceSearchResultHeaderLeft"][2]/text()');
            let noPage = await pageOf[0].evaluate(el => el.textContent?.trim().split(/\s+/));
            let pageFrom = parseInt(noPage![2])
            let pageTo = parseInt(noPage![4]);
            // console.log(noPage)
            // console.log(pageFrom)
            // console.log(pageTo)
            for (let h = pageFrom; h <= pageTo; h++) {
                await page.waitForXPath('//div[contains(.,"Showing page ' + h + '")]', { visible: true, timeout: 200000 });

                let populateUniqueID = await page.$x('//div[@class="selfServiceSearchRowRight"]//h1//text()');
                for (let i = 0; i < populateUniqueID.length; i++) {

                    let names = [];

                    let grantorNameShow = await page.$x('//ul[contains(@class,"selfServiceSearchResultList")]/li[' + (i + 1) + ']//li[@class="selfServiceSearchResultCollapsed"]/b');
                    let granteNameShow = await page.$x('//ul[contains(@class,"selfServiceSearchResultList")]/li[' + (i + 1) + ']//li[@class="selfServiceSearchResultCollapsed"]/b');
                    let uniqueId;
                    let dateRow;
                    try {
                        uniqueId = await populateUniqueID[i].evaluate(el => el.textContent?.trim().split(/\s+/));
                        dateRow = await grantorNameShow[0].evaluate(el => el.textContent);

                    } catch (err) {
                        continue
                    }
                    let caseUniqueId = uniqueId![0];
                    let recordDate = dateRow!.split(' ')[0]
                    try {
                        let grantorName = await grantorNameShow[1].evaluate(el => el.textContent);
                        names.push(grantorName);
                    } catch (err) {

                    }
                    try {
                        let granteName = await granteNameShow[2].evaluate(el => el.textContent);
                        names.push(granteName);
                    } catch (err) {

                    }



                    let grantorAndGratorNameHide = await page.$x('//ul[contains(@class,"selfServiceSearchResultList")]/li[' + (i + 1) + ']//li[@class="selfServiceSearchFullResult"]/b');

                    if (grantorAndGratorNameHide.length > 0) {
                        for (let j = 0; j < grantorAndGratorNameHide.length; j++) {
                            try {
                                let grantorOrGranteNameHide = await grantorAndGratorNameHide[j].evaluate(el => el.textContent);
                                names.push(grantorOrGranteNameHide);
                            } catch (err) {
                                continue
                            }

                        }
                    }
                    let docType = '';
                    for (let j = 2; j < uniqueId!.length; j++) {
                        docType += j == uniqueId!.length - 1 ? uniqueId![j] + '' : uniqueId![j] + ' ';
                    }

                    let practiceType = this.getPracticeType(docType);

                    for (let name of names) {
                        name = name!.replace(/\(PERS REP\)/, '');
                        if (name == '...' || name == '' || name == 'N\A' || this.isEmptyOrSpaces(name)) {
                            continue;
                        }

                        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                        const prod = await db.models.Product.findOne({ name: productName }).exec();
                        const parseName: any = this.newParseName(name!.trim());
                        if (parseName.type && parseName.type == 'COMPANY') {
                            continue
                        }
                        const data = {
                            'caseUniqueId': caseUniqueId,
                            'Property State': 'CA',
                            'County': 'San Luis Obispo',
                            'First Name': parseName.firstName,
                            'Last Name': parseName.lastName,
                            'Middle Name': parseName.middleName,
                            'Name Suffix': parseName.suffix,
                            'Full Name': parseName.fullName,
                            "vacancyProcessed": false,
                            fillingDate: recordDate,
                            "productId": prod._id,
                            originalDocType: docType
                        };
                        if (await this.civilAndLienSaveToNewSchema(data))
                            countRecords += 1;
                    }
                }

                if (h != pageTo) {
                    let nextButton = await page.$x('//a[contains(.,"Next")]');
                    nextButton[0].click();
                    this.randomSleepIn5Sec
                }
            }

            await AbstractProducer.sendMessage('San Luis Obispo', 'California', countRecords, 'Civil & Lien');
            return true;
        } catch (err) {
            console.log('Error!' + err);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('San Luis Obispo', 'California', countRecords, 'Civil & Lien', errorImage);
            return false;
        }
    }
}