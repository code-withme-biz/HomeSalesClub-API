import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../../abstract_producer';
import {IPublicRecordProducer} from '../../../../../../models/public_record_producer';

const removeRowArray = [
    'CITY', 'DEPT', 'CTY', 'UNITED STATES', 'BANK', 'FIA CARD SERVICES NA',
    'FLORIDA PACE FUNDING AGENCY', 'COUNTY', 'CREDIT', 'HOSPITAL', 'FUNDING', 'UNIVERSITY',
    'MEDICAL', 'CONDOMINIUM ASSOCIATION', 'LOTS', 'TEXAS STATE', 'VETERANS', 'SECRETARY', 'DEPARTMENT', 'TITLE',
    'FIRSTBANK',
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')


export default class CivilProducer extends AbstractProducer {

    urls = {
        generalInfoPage: 'https://cvpublicaccess.co.clark.nv.us/eservices/home.page.2'
    };

    casTypeArray = [
        ['CIVIL BOC', 'CIVIL BOC CONFESSION OF JUDGMENT', 'CIVIL BUN', 'CIVIL BUN CONFESSION OF JUDGMENT', 'CIVIL BUN DISTRICT COURT TRANSFER'],
        ['CIVIL GSP', 'CIVIL GSP CONFESSION OF JUDGMENT', 'CIVIL HND', 'CIVIL HND CONFESSION OF JUDGMENT', 'CIVIL HND DISTRICT COURT TRANSFER'],
        ['CIVIL LAU', 'CIVIL LAU CONFESSION OF JUDGMENT', 'CIVIL MES', 'CIVIL MES CONFESSION OF JUDGMENT', 'CIVIL MOA'],
        ['CIVIL MOA CONFESSION OF JUDGMENT', 'CIVIL MVL', 'CIVIL MVL CONFESSION OF JUDGMENT', 'CIVIL NLV', 'CIVIL NLV CONFESSION OF JUDGMENT'],
        ['CIVIL SLT', 'CIVIL SLT CONFESSION OF JUDGMENT', 'EVICTIONS BOTC', 'EVICTIONS LATC', 'EVICTIONS METC'],
        ['GARNISHMENT HNTC', 'GARNISHMENT LVTC', 'GARNISHMENT NLTC', 'GARNISHMENTS BOTC', 'GARNISHMENTS LATC'],
        ['GARNISHMENTS METC', 'LANDLORD/TENANT BOC', 'LANDLORD/TENANT BUN', 'LANDLORD/TENANT GSP', 'LANDLORD/TENANT HND'],
        ['LANDLORD/TENANT LAU', 'LANDLORD/TENANT MES', 'LANDLORD/TENANT MOA', 'LANDLORD/TENANT MVL', 'LANDLORD/TENANT NLV'],
        ['LANDLORD/TENANT SLT', 'NON-CASE RECEIPTING', 'NON-CASE RECEIPTING BOC', 'NON-CASE RECEIPTING BUN', 'NON-CASE RECEIPTING GSP'],
        ['NON-CASE RECEIPTING HND', 'NOTICES BOTC', 'NOTICES LATC', 'NOTICES METC', 'PROBABLE CAUSE BOC'],
        ['PROBABLE CAUSE BUN', 'PROBABLE CAUSE GSP', 'PROBABLE CAUSE HND', 'PROBABLE CAUSE LAU', 'PROBABLE CAUSE MES'],
        ['PROBABLE CAUSE MOA', 'PROBABLE CAUSE MVL', 'PROBABLE CAUSE NLV', 'PROBABLE CAUSE SLT', 'REMOVAL BOC'],
        ['REMOVAL HND', 'REMOVAL MES', 'REMOVAL NLV', 'SEALED CIVIL GSP', 'SERVICE OF PROCESS BOTC'],
        ['SERVICE OF PROCESS HNTC', 'SERVICE OF PROCESS LATC', 'SERVICE OF PROCESS LVTC', 'SERVICE OF PROCESS METC', 'SERVICE OF PROCESS NLTC'],
        ['SMALL CLAIMS BOC', 'SMALL CLAIMS BOTC', 'SMALL CLAIMS BUN', 'SMALL CLAIMS FINANCIAL HND', 'SMALL CLAIMS GSP'],
        ['SMALL CLAIMS HND', 'SMALL CLAIMS HNTC', 'SMALL CLAIMS LATC', 'SMALL CLAIMS LAU', 'SMALL CLAIMS LVTC'],
        ['SMALL CLAIMS MES', 'SMALL CLAIMS METC', 'SMALL CLAIMS MOA', 'SMALL CLAIMS MVL', 'SMALL CLAIMS NLTC'],
        ['SMALL CLAIMS NLV', 'SMALL CLAIMS SLT', 'SW/CORINQ BOC', 'SW/CORINQ BUN', 'TRAFFIC CITATION JUVENILE  BOC'],
        ['TRAFFIC CITATION JUVENILE  BUN', 'TRAFFIC CITATION JUVENILE  LAU', 'TRAFFIC CITATION JUVENILE  MES', 'TRAFFIC CITATION JUVENILE  MOA', 'TRAFFIC CITATION JUVENILE  MVL'],
        ['TRAFFIC CITATION JUVENILE  SLT', 'TRAFFIC OR MISDEMEANOR CITATION BOC', 'TRAFFIC OR MISDEMEANOR CITATION BUN', 'TRAFFIC OR MISDEMEANOR CITATION GSP', 'TRAFFIC OR MISDEMEANOR CITATION HND'],
        ['TRAFFIC OR MISDEMEANOR CITATION LAU', 'TRAFFIC OR MISDEMEANOR CITATION MES', 'TRAFFIC OR MISDEMEANOR CITATION MOA', 'TRAFFIC OR MISDEMEANOR CITATION MVL', 'TRAFFIC OR MISDEMEANOR CITATION NLV']
    ]

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
            await this.browserPages.generalInfoPage.goto(this.urls.generalInfoPage, {waitUntil: 'load'});
            return true;
        } catch (err) {
            console.warn(err);
            return false;
        }
    }

    async read(): Promise<boolean> {
        try {
            await this.browserPages.generalInfoPage?.waitForXPath('//*[contains(text(), "Click Here")]');
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    async saveRecord(fillingDate: string, parseName: any, prod: any, originalDocType: string, caseUniqueId: string) {

        const data = {
            'Property State': 'NV',
            'County': 'Clark',
            'First Name': parseName.firstName,
            'Last Name': parseName.lastName,
            'Middle Name': parseName.middleName,
            'Name Suffix': parseName.suffix,
            'Full Name': parseName.fullName,
            "vacancyProcessed": false,
            'caseUniqueId': caseUniqueId,
            fillingDate: fillingDate,
            productId: prod._id,
            originalDocType: originalDocType
        };

        return await this.civilAndLienSaveToNewSchema(data);
    }

    async getData(page: puppeteer.Page, fillingDate: string) {
        let count = 0;
        let nextPageFlag;
        try {
            await this.sleep(1000)
            const [noResult] = await page.$x('//*[@id="srchResultNoticeNomatch"]')
            if (!!noResult) {
                console.log('No result')
                return count
            }
            do {
                nextPageFlag = false;
                await page.waitForXPath('//*[@id="grid"]');
                const rows = await page.$x('//*[@id="grid"]/tbody/tr');
                for (let i = 1; i < rows.length; i++) {
                    const nameType = (await rows[i].$eval('td:nth-child(8) > span > a >span', elem => elem.textContent))!.trim();
                    if (/PLAINTIFF/i.test(nameType)) continue;
                    const name = (await rows[i].$eval('td:nth-child(7) > span > a >span', elem => elem.textContent))!.trim();
                    if (removeRowRegex.test(name)) continue;
                    const docType = (await rows[i].$eval('td:nth-child(4) > span > a >span', elem => elem.textContent))!.trim();
                    if (/death/i.test(docType) || /birth/i.test(docType)) continue;
                    let caseUniqueId = (await rows[i].$eval('td:nth-child(3) > span > a >span', elem => elem.textContent))!.trim();
                    let practiceType = this.getPracticeType(docType);
                    const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                    const prod = await db.models.Product.findOne({name: productName}).exec();
                    const parseName: any = this.newParseName(name);
                    if (parseName.type === 'COMPANY' || parseName.fullName === '') continue;
                    const saveRecord = await this.saveRecord(fillingDate, parseName, prod, docType, caseUniqueId);
                    saveRecord && count++
                }
                const [nextPage] = await page.$x('//a[@title="Go to next page"]');

                if (!!nextPage) {
                    await Promise.all([
                        nextPage.click(),
                        page.waitForNavigation()
                    ]);
                    nextPageFlag = true;
                }
            } while (nextPageFlag)
        } catch (e) {
        }
        return count
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let countRecords = 0;
        try {
            await page.waitForXPath('//*[contains(text(), "Click Here")]')
            const [clickButton] = await page.$x('//*[contains(text(), "Click Here")]')
            await Promise.all([
                clickButton.click(),
                page.waitForNavigation()
            ])
            const isMac = /Mac|iPod|iPhone|iPad|darwin/.test( process.platform );
            let keyCtrl = isMac ?  "Meta": "Control" ;
            await page.waitForXPath('//*[@class="tab-row"]//*[contains(text(),"Case Type")]')
            const [caseTypeButton] = await page.$x('//*[@class="tab-row"]//*[contains(text(),"Case Type")]')
            await Promise.all([
                caseTypeButton.click(),
                page.waitForNavigation()
            ])
            let dateRange = await this.getDateRange('Nevada', 'Clark');
            let date = dateRange.from;
            let today = dateRange.to;
            let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24)) - 1;
            for (let i = days < 0 ? 1 : days; i >= 0; i--) {
                let dateSearch = new Date();
                dateSearch.setDate(dateSearch.getDate() - i);
                let countPerDay = 0
                console.log('Start search with date: ', dateSearch.toLocaleDateString('en-US'))
                for (let caseArray of this.casTypeArray) {
                    try {
                        await page.waitForXPath('//*[contains(@data, "dateInputBegin")]')

                        const [inputBegin] = await page.$x('//*[contains(@data, "dateInputBegin")]')

                        await inputBegin.click();
                        await inputBegin.focus();
                        await inputBegin.click({clickCount: 3});
                        await inputBegin.press('Backspace');

                        await inputBegin.type(dateSearch.toLocaleDateString('en-US', {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit"
                        }), {delay: 100})

                        await this.randomSleepIn5Sec()
                        await page.waitForXPath('//*[contains(@data, "dateInputEnd")]')

                        const [inputEnd] = await page.$x('//*[contains(@data, "dateInputEnd")]')

                        await inputEnd.click();
                        await inputEnd.focus();
                        await inputEnd.click({clickCount: 3});
                        await inputEnd.press('Backspace');

                        await inputEnd.type(dateSearch.toLocaleDateString('en-US', {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit"
                        }), {delay: 100})
                        await page.select('select[name="bodyLayout:topSearchPanel:pageSize"]', '3')
                        await this.randomSleepIn5Sec()
                        let firstCaseClick = false
                        for (let caseType of caseArray) {
                            await this.sleep(500)
                            const [caseTypeElement] = await page.$x(`//option[contains(text(),"${caseType}")]`)
                            if (!!caseTypeElement) {
                                firstCaseClick && await page.keyboard.down(keyCtrl);
                                await caseTypeElement.click();
                                firstCaseClick && await page.keyboard.up(keyCtrl);
                            }
                            firstCaseClick = true
                        }
                        await this.randomSleepIn5Sec()
                        await Promise.all([
                            page.click('input[type="submit"][value="Search"][name="submitLink"]'),
                            page.waitForNavigation()
                        ]);
                        await this.randomSleepIn5Sec()

                        const count = await this.getData(page, dateSearch.toLocaleDateString('en-US'));
                        countPerDay += count;
                        const [backPage] = await page.$x('//*[@id="navigationSectionLeft"]//*[contains(text(),"Search")]')
                        await Promise.all([
                            backPage.click(),
                            page.waitForNavigation()
                        ]);
                    } catch (e) {
                    }
                }
                console.log(`${dateSearch.toLocaleDateString('en-US')} found ${countPerDay} records.`);
                countRecords += countPerDay;
            }
            await AbstractProducer.sendMessage('Clark', 'Nevada', countRecords, 'Civil & Lien');
            await page.close();
            await this.browser?.close();
            return true;
        } catch (e) {
            console.log('Error:', e)
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Clark', 'Nevada', countRecords, 'Civil & Lien', errorImage);
        }
        return false;
    }
}