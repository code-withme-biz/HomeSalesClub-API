import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import SnsService from '../../../../../../services/sns_service';

export default class CivilProducer extends AbstractProducer {
    browser: puppeteer.Browser | undefined;
    browserPages = {
        generalInfoPage: undefined as undefined | puppeteer.Page
    };
    urls = {
        generalInfoPage: 'https://erss.co.hays.tx.us/web/user/disclaimer'
    }

    xpaths = {
        isPAloaded: '//button[contains(., "I Accept")]'
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

    indexOfAll(array: string[], searchItem: string) {
        var i = array.indexOf(searchItem),
            indexes = [];
        while (i !== -1) {
            indexes.push(i);
            i = array.indexOf(searchItem, ++i);
        }
        return indexes;
    }

    async parseAndSave(): Promise<boolean> {
        const civilUrl: string = 'https://erss.co.hays.tx.us/web/user/disclaimer';
        
        let countRecords = 0;
        try{
            let page = this.browserPages.generalInfoPage!;

            let dateRange = await this.getDateRange('Texas', 'Hays');
            let fromDate = dateRange.from;
            let toDate = dateRange.to;
            let fromDateString = this.getFormattedDate(fromDate);
            let toDateString = this.getFormattedDate(toDate);

            await page.goto(civilUrl, { timeout: 600000 });
            await page.waitForXPath('//button[@id="submitDisclaimerAccept"]', { visible: true });
            let isAccepted = await page.$x('//button[@id="submitDisclaimerAccept"]');
            await isAccepted[0].click();
            await page.waitForXPath('//a[@class="ss-action ss-action-form ss-utility-box ss-action-page-search ui-link"][1]', { visible: true });
            let SearchByOfficial = await page.$x('//a[@class="ss-action ss-action-form ss-utility-box ss-action-page-search ui-link"][1]');
            // console.log(SearchByOfficial)
            await SearchByOfficial[0].click();
            await page.waitForXPath('//a[@id="searchButton"]', { visible: true });
            let SearchButton = await page.$x('//a[@id="searchButton"]');
            await page.type('input#field_RecordingDateID_DOT_StartDate', fromDateString);
            await page.type('input#field_RecordingDateID_DOT_EndDate', toDateString);
            let documentTypes = ['DEED', 'LIEN', 'MORTGAGE', 'CODE', 'MARRIAGE', 'PENDENS', 'JUDGMENT', 'JUDGEMENT', 'PROBATE'];
            let inputText = await page.$x('//input[@id="field_selfservice_documentTypes"]');
            inputText[0].click();
            await page.waitForXPath('//ul[@id="field_selfservice_documentTypes-aclist"]//li[contains(text(),"ABSTRACT")]', { visible: true });
            for (let i = 0; i < documentTypes.length; i++) {
                let text = await page.$x('//ul[@id="field_selfservice_documentTypes-aclist"]//li[contains(text(),"' + documentTypes[i] + '")]')
                for (let j = 0; j < text.length; j++) {
                    let textDocument = await text[j].evaluate(el => el.textContent);
                    // console.log(textDocument);
                    let arrStr = textDocument?.split(' ');
                    fast:
                    for (let k = 0; k < arrStr!.length; k++) {
                        for (let l = 0; l < documentTypes!.length; l++) {
                            if (arrStr![k] == documentTypes[l]) {
                                await text[j].click();
                                break fast;
                            }

                        }
                    }

                }
                await this.sleep(500);
            }
            await SearchButton[0].click();
            try {
                await page.waitForXPath('//ul[@class="selfServiceSearchResultList ui-listview ui-listview-inset ui-corner-all ui-shadow"]', { visible: true, timeout: 200000 });
            } catch (err) {
                await AbstractProducer.sendMessage('Hays', 'Texas', 0, 'Civil & Lien');
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
                    let uniqueId = await populateUniqueID[i].evaluate(el => el.textContent?.trim().split(/\s+/));
                    let names = [];
                    let caseUniqueId = uniqueId![0];
                    let grantorNameShow = await page.$x('//ul[contains(@class,"selfServiceSearchResultList")]/li[' + (i + 1) + ']//li[@class="selfServiceSearchResultCollapsed"]/b');
                    let granteNameShow = await page.$x('//ul[contains(@class,"selfServiceSearchResultList")]/li[' + (i + 1) + ']//li[@class="selfServiceSearchResultCollapsed"]/b');
                    let dateRow = await grantorNameShow[0].evaluate(el => el.textContent);
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
                            let grantorOrGranteNameHide = await grantorAndGratorNameHide[j].evaluate(el => el.textContent);
                            names.push(grantorOrGranteNameHide);

                        }
                    }
                    let delimiterDot = this.indexOfAll(uniqueId!, "•");
                    let docType: any = '';
                    if (delimiterDot.length > 1) {
                        for (let j = delimiterDot[0]; j < delimiterDot[1] - 1; j++) {
                            docType += uniqueId?.[j + 1] + (j == j - 1 ? '' : ' ');
                        }
                    } else {
                        docType = uniqueId?.slice(delimiterDot[0]+1).join(' ').trim();
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
                        if (parseName.type === 'COMPANY' || parseName.fullName === '') continue;
                        const data = {
                            'caseUniqueId': caseUniqueId,
                            'Property State': 'TX',
                            'County': 'Hays',
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
                }
            }

            await AbstractProducer.sendMessage('Hays', 'Texas', countRecords, 'Civil & Lien');
            console.log(`${countRecords} saved`);
            return true;
        } catch(e){
            console.log(e);
            await AbstractProducer.sendMessage('Hays', 'Texas', countRecords, 'Civil & Lien');
            return false;
        }
    }
}