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
        generalInfoPage: 'https://waynecountymi-web.tylerhost.net/web/user/disclaimer'
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
            this.browserPages.generalInfoPage.setDefaultTimeout(200000);
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

    async getData(page: puppeteer.Page, date: any, name: any, docType: any): Promise<any> {
        const parseName: any = this.newParseName(name.trim())
        if (parseName?.type && parseName?.type == 'COMPANY') return false;
        let practiceType = this.getPracticeType(docType)
        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({name: productName}).exec();
        const data = {
            'Property State': 'MI',
            'County': 'Wayne',
            'First Name': parseName.firstName,
            'Last Name': parseName.lastName,
            'Middle Name': parseName.middleName,
            'Name Suffix': parseName.suffix,
            'Full Name': parseName.fullName,
            "vacancyProcessed": false,
            fillingDate: date,
            productId: prod._id,
            originalDocType: docType.trim()
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }

    async parseAndSave(): Promise<boolean> {
        const civilUrl: string = 'https://waynecountymi-web.tylerhost.net/web/user/disclaimer';
        let page = this.browserPages.generalInfoPage!;
        let countRecords = 0;
        try{
            let dateRange = await this.getDateRange('Michigan', 'Wayne', 60);
            let fromDate = dateRange.from;
            let toDate = dateRange.to;

            while (fromDate <= toDate) {
                let dateStringDay = this.getFormattedDate(new Date(fromDate));
                await page.goto(civilUrl, { timeout: 600000 });
                await page.waitForXPath('//button[@id="submitDisclaimerAccept"]', { visible: true });
                let isAccepted = await page.$x('//button[@id="submitDisclaimerAccept"]');
                await isAccepted[0].click();

                await page.waitForXPath('//a[@class="ss-action ss-action-form ss-utility-box ss-action-page-search ui-link"][1]', { visible: true });
                let SearchByOfficial = await page.$x('//a[@class="ss-action ss-action-form ss-utility-box ss-action-page-search ui-link"][1]');
                await SearchByOfficial[0].click();
                await page.waitForXPath('//a[contains(.,"Document Search")]', { visible: true });
                let SearchByDocument = await page.$x('//a[contains(.,"Document Search")]');
                await SearchByDocument[0].click();

                await page.waitForXPath('//a[@id="searchButton"]', { visible: true });
                let SearchButton = await page.$x('//a[@id="searchButton"]');
                await page.type('input#field_RecordingDateID_DOT_StartDate', dateStringDay);
                await page.type('input#field_RecordingDateID_DOT_EndDate', dateStringDay);
                let documentTypes = ['EASEMENT', 'DEED', 'RENT', 'LIEN', 'MORTGAGE', 'MARRIAGE', 'PENDENS', 'JUDGMENT', 'JUDGEMENT'];
                let inputText = await page.$x('//input[@id="field_selfservice_documentTypes"]');
                inputText[0].click();
                await page.waitForXPath('//ul[@id="field_selfservice_documentTypes-aclist"]//li[contains(text(),"DEED")]', { visible: true });
                for (let i = 0; i < documentTypes.length; i++) {
                    let text = await page.$x('//ul[@id="field_selfservice_documentTypes-aclist"]//li[contains(text(),"' + documentTypes[i] + '")]')
                    for (let j = 0; j < text.length; j++) {
                        let textDocument = await text[j].evaluate(el => el.textContent);
                        let arrStr = textDocument?.split(' ');
                        for (let k = 0; k < arrStr!.length; k++) {
                            for (let l = 0; l < documentTypes!.length; l++) {
                                if (arrStr![k] == documentTypes[l]) {
                                    console.log(textDocument);
                                    try{
                                        await text[j].click();
                                    } catch(e){
                                        //
                                    }
                                    await this.sleep(200);
                                    break;
                                }

                            }
                        }

                    }
                    await this.sleep(500);
                }
                await SearchButton[0].click();
                try {
                    await page.waitForXPath('//ul[@class="selfServiceSearchResultList ui-listview ui-listview-inset ui-corner-all ui-shadow"]', { visible: true, timeout: 50000 });
                } catch (err) {
                    fromDate.setDate(fromDate.getDate() + 1);
                    continue;
                }
                let pageOf = await page.$x('//div[@class="selfServiceSearchResultHeaderLeft"][2]/text()');
                let noPage = await pageOf[0].evaluate(el => el.textContent?.trim().split(/\s+/));
                let pageFrom = parseInt(noPage![2]);
                let pageTo = parseInt(noPage![4]);
                for (let h = pageFrom; h <= pageTo; h++) {
                    try{
                        await page.waitForXPath('//div[contains(.,"Showing page ' + h + '")]', { visible: true, timeout: 50000});

                        let populateUniqueID = await page.$x('//div[@class="selfServiceSearchRowRight"]//h1//text()');
                        for (let i = 0; i < populateUniqueID.length; i++) {
                            let uniqueId = await populateUniqueID[i].evaluate(el => el.textContent?.trim().split(/\s+/));
                            let names = [];
                            let caseUniqueId = uniqueId![0];
                            uniqueId?.pop();
                            uniqueId?.pop();
                            let filingDate = uniqueId?.pop();
                            let grantorNameShow = await page.$x('//ul[contains(@class,"selfServiceSearchResultList")]/li[' + (i + 1) + ']//li[@class="selfServiceSearchResultCollapsed"]/b');
                            let granteNameShow = await page.$x('//ul[contains(@class,"selfServiceSearchResultList")]/li[' + (i + 1) + ']//li[@class="selfServiceSearchResultCollapsed"]/b');
                            let dateRow = await grantorNameShow[0].evaluate(el => el.textContent);
                            let recordDate = dateRow!.split(/\s+/g)[0]
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
                            for (let name of names) {
                                name = name!.replace(/\(PERS REP\)/, '').replace(' MARRIED','').replace(' SINGLE','').replace(' AKA','').replace(' JTWRS','').replace(' DEFT', '');
                                if (name == '...' || name == '' || name == 'N\A' || this.isEmptyOrSpaces(name)) {
                                    continue;
                                }
                                if (await this.getData(page, filingDate, name, docType))
                                    countRecords += 1;
                            }
                        }

                        if (h != pageTo) {
                            let nextButton = await page.$x('//a[contains(.,"Next")]');
                            await nextButton[0].click();
                        }
                    } catch(e){
                        break;
                    }
                }
                fromDate.setDate(fromDate.getDate() + 1);
            }
            console.log(countRecords);
            await AbstractProducer.sendMessage('Wayne', 'Michigan', countRecords, 'Civil & Lien');
            return true;
        } catch(e){
            console.log(e);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Wayne', 'Michigan', countRecords, 'Civil & Lien', errorImage);
            return false;
        }
    }
}