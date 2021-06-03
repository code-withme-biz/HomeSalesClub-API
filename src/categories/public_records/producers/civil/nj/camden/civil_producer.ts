import db from '../../../../../../models/db';
import AbstractProducer from '../../../abstract_producer';
import {IPublicRecordProducer} from '../../../../../../models/public_record_producer';
import axios from 'axios';
import _ from "lodash";

const docTypes: any = {
    'CAN MTG': 'CANCELLED MORTGAGE',
    'DEED': 'DEED',
    'DB': 'DEED BOOK',
    'DEED MUNIC': 'DEED MUNICIPALITY',
    'DIS MTG': 'DISCHARGE OF MORTGAGE',
    'DM': 'DM',
    'MB': 'MB',
    'MTG': 'MORTGAGE',
    'PT REL MTG': 'PARTIAL RELEASE OF MORTGAGE',
    'PUB NOT': 'PUBLIC NOTICE',
    'REL MTG': 'RELEASE OF MORTGAGE',
    'RM': 'RM',
    'SHER DEED': 'SHERIFFS DEED'
}

const removeRowArray = [
    'CITY', 'DEPT', 'CTY', 'UNITED STATES', 'BANK', 'FIA CARD SERVICES NA',
    'FLORIDA PACE FUNDING AGENCY', 'COUNTY', 'CREDIT', 'HOSPITAL', 'FUNDING', 'UNIVERSITY',
    'MEDICAL', 'CONDOMINIUM ASSOCIATION', 'LOTS', 'TEXAS STATE', 'VETERANS', 'SECRETARY', 'DEPARTMENT',
    'INDIVIDUAL', 'INDIVIDUALLY', 'FINANCE', 'CITIBANK', 'MERS'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')

export default class CivilProducer extends AbstractProducer {

    urls = {
        generalInfoPage: 'http://24.246.110.18/SearchAnywhere/'
    };

    documentTypes = ['CAN MTG,DEED,DB,DEED MUNIC,DIS MTG,DM,MB,MTG,PT REL MTG,PUB NOT,REL MTG,RM,SHER DEED'];

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
            await this.browserPages.generalInfoPage.setDefaultTimeout(60000);
            await this.browserPages.generalInfoPage.goto(this.urls.generalInfoPage, {waitUntil: 'load'});
            return true;
        } catch (err) {
            console.warn(err);
            return false;
        }
    }

    async read(): Promise<boolean> {
        try {
            await this.browserPages.generalInfoPage?.waitForXPath('//*[@heading="Document Type" and @active="searchTabs[1]"]');
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    async saveRecord(fillingDate: string, parseName: any, prod: any, originalDocType: string) {

        const data = {
            'Property State': 'NJ',
            'County': 'camden',
            'First Name': parseName.firstName,
            'Last Name': parseName.lastName,
            'Middle Name': parseName.middleName,
            'Name Suffix': parseName.suffix,
            'Full Name': parseName.fullName,
            "vacancyProcessed": false,
            fillingDate: fillingDate,
            productId: prod._id,
            originalDocType: originalDocType
        };

        return await this.civilAndLienSaveToNewSchema(data);
    }

    async getData(dataTable: any, fillingDate: string) {
        let count = 0;
        for (let row of dataTable) {
            try {
                if (row.party_code != 'D') continue;
                const docType = docTypes[row.doc_type]
                let practiceType = this.getPracticeType(docType);
                if (practiceType == 'debt') {
                    if (docType.match(/mtg/i)) {
                        practiceType = 'mortgage-lien';
                    }
                }
                const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                const prod = await db.models.Product.findOne({name: productName}).exec();
                let name
                if (row.party_code != 'D') {
                    name = row.cross_party_name;
                } else {
                    name = row.party_name;
                }
                if (removeRowRegex.test(name)) continue;
                const parseName: any = this.newParseName(name.trim());
                if (parseName.type && parseName.type == 'COMPANY') {
                    continue;
                }
                const saveRecord = await this.saveRecord(fillingDate, parseName, prod, docType);
                saveRecord && count++
            } catch (e) {
            }
        }
        return count
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let countRecords = 0;
        try {
            page.on('dialog', async dialog => {
                await dialog.accept();
            });

            let dateRange = await this.getDateRange('New Jersey', 'Camden');
            let date = dateRange.from;
            let today = dateRange.to;
            let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24)) - 1;
            for (let i = days < 0 ? 1 : days; i >= 0; i--) {
                let dateSearch = new Date();
                dateSearch.setDate(dateSearch.getDate() - i);
                console.log('Start search with date: ', dateSearch.toLocaleDateString('en-US'));
                for (let j = 0; j < this.documentTypes.length; j++) {
                    try {
                        await page.reload({waitUntil: 'load'})
                        await this.sleep(2000)
                        await page.waitForXPath('//*[@heading="Document Type" and @active="searchTabs[1]"]')

                        const [documentSearchTabElement] = await page.$x('//*[@heading="Document Type" and @active="searchTabs[1]"]')
                        await documentSearchTabElement.click()

                        await this.sleep(1000)

                        const [docTypeInput] = await page.$x('//div[@class="tab-content"]/div[position()=2 and contains(@class, "active")]//*[@ng-model="documentService.SearchCriteria.searchDocType"]');
                        await docTypeInput.type(this.documentTypes[j]);

                        const [fromDateElement] = await page.$x('//div[@class="tab-content"]/div[position()=2 and contains(@class, "active")]//*[@ng-model="documentService.SearchCriteria.fromDate"]')
                        await fromDateElement.type(dateSearch.toLocaleDateString('en-US'), {delay: 100})

                        const [toDateElement] = await page.$x('//div[@class="tab-content"]/div[position()=2 and contains(@class, "active")]//*[@ng-model="documentService.SearchCriteria.toDate"]')
                        await toDateElement.type(dateSearch.toLocaleDateString('en-US',), {delay: 100})

                        const [submitBtnElement] = await page.$x('//div[@class="tab-content"]/div[position()=2 and contains(@class, "active")]//*[@ng-click="runSearch(true)"]')
                        const [response] = await Promise.all([
                            page.waitForResponse(response => response.url().includes('/SearchAnywhere/api/search')),
                            submitBtnElement.click(),
                        ]);
                        const dataResponse = await response.json()
                        const count = await this.getData(dataResponse, dateSearch.toLocaleDateString('en-US'));
                        countRecords += count;
                        console.log(`${dateSearch.toLocaleDateString('en-US')} save ${count} records. (Step ${j + 1}/${this.documentTypes.length})`);

                    } catch (e) {
                        console.log('Error occured:');
                        console.log(e)
                        await this.uploadImageOnS3(page);
                    }
                }
                await this.randomSleepIn5Sec();
            }
        } catch (e) {
            console.log(e);
            console.log('Error search');
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Camden', 'New Jersey', countRecords, 'Civil & Lien', errorImage);
            return false;
        }
        await AbstractProducer.sendMessage('Camden', 'New Jersey', countRecords, 'Civil & Lien');
        return true;
    }
}