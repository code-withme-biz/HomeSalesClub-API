import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';


const removeRowArray = [
    'CITY', 'DEPT', 'CTY', 'UNITED STATES', 'BANK', 'FIA CARD SERVICES NA',
    'FLORIDA PACE FUNDING AGENCY', 'COUNTY', 'CREDIT', 'HOSPITAL', 'FUNDING', 'UNIVERSITY',
    'MEDICAL', 'CONDOMINIUM ASSOCIATION', 'LOTS', 'TEXAS STATE', 'VETERANS', 'SECRETARY', 'DEPARTMENT',
    'INDIVIDUAL', 'INDIVIDUALLY'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')


export default class CivilProducer extends AbstractProducer {

    urls = {
        generalInfoPage: 'http://www.ventura.courts.ca.gov/CivilCaseSearch/CaseDateRange'
    };

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

    parseName(name: string) {
        let result;
        const companyIdentifiersArray = [
            'GENERAL', 'TRUSTEE', 'TRUSTEES', 'INC', 'ORGANIZATION',
            'CORP', 'CORPORATION', 'LLC', 'MOTORS', 'BANK', 'UNITED',
            'CO', 'COMPANY', 'FEDERAL', 'MUTUAL', 'ASSOC', 'AGENCY',
            'PARTNERSHIP', 'CHURCH', 'CITY', 'TRUST', 'SECRETARY',
            'DEVELOPMENT', 'INVESTMENT', 'ESTATE', 'LLP', 'LP', 'HOLDINGS',
            'LOAN', 'CONDOMINIUM', 'CATHOLIC', 'INVESTMENTS', 'D/B/A', 'COCA COLA',
            'LTD', 'CLINIC', 'TODAY', 'PAY', 'CLEANING', 'COSMETIC', 'CLEANERS',
            'FURNITURE', 'DECOR', 'FRIDAY HOMES', 'MIDLAND', 'SAVINGS', 'PROPERTY',
            'ASSET', 'PROTECTION', 'SERVICES', 'TRS', 'ET AL', 'L L C', 'NATIONAL',
            'ASSOCIATION', 'MANAGMENT', 'PARAGON', 'MORTGAGE', 'CHOICE', 'PROPERTIES',
            'J T C', 'RESIDENTIAL', 'OPPORTUNITIES', 'FUND', 'LEGACY', 'SERIES',
            'HOMES', 'LOAN', 'FAM', 'PRAYER', 'DISTRICT', 'OFFICES', 'SPORTS'
        ];
        const suffixNamesArray = ['I', 'II', 'III', 'IV', 'V', 'ESQ', 'JR', 'SR'];
        const suffixNamesRegex = new RegExp(`\\b(?:${suffixNamesArray.join('|')})\\b`, 'i');

        const companyRegexString = `\\b(?:${companyIdentifiersArray.join('|')})\\b`;
        const companyRegex = new RegExp(companyRegexString, 'i');

        if (name.match(companyRegex)) {
            result = {
                firstName: '',
                lastName: '',
                middleName: '',
                fullName: name.trim(),
                suffix: ''
            };
            return result;
        }
        try {
            const suffix = name.match(suffixNamesRegex);
            name = name.replace(suffixNamesRegex, '');
            name = name.replace(/  +/g, ' ');
            let ownersNameSplited = name.split(',');
            const defaultLastName = ownersNameSplited[0].trim();
            let firstNameParser = ownersNameSplited[1].trim().split(/\s+/g);
            const firstName = firstNameParser[0].trim();
            firstNameParser.shift();
            const middleName = firstNameParser.join(' ');
            const fullName = `${defaultLastName}, ${firstName} ${middleName} ${suffix ? suffix[0] : ''}`;
            result = {
                firstName,
                lastName: defaultLastName,
                middleName,
                fullName: fullName.trim(),
                suffix: suffix ? suffix[0] : ''
            };
        } catch (e) {

        }
        if (!result) {
            result = {
                firstName: '',
                lastName: '',
                middleName: '',
                fullName: name.trim(),
                suffix: ''
            };
        }
        return result;
    }

    async read(): Promise<boolean> {
        try {
            await this.browserPages.generalInfoPage?.waitForXPath('//*[@id="SearchFromDate"]');
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    async getData(page: puppeteer.Page) {
        let count = 0;
        let nextPageFlag;
        try {
            await page.waitForSelector('#resultscontainer')
            const [notFound] = await page.$x('//*[@id="resultscontainer"]//*[contains(text(), "No results found")]')
            if (!!notFound) return count;
            let caseNumbers = [];
            await page.waitForSelector('#searchresults');
            do {
                nextPageFlag = false;
                const rows = await page.$x('//*[@id="searchresults"]/tbody/tr/td[4]/a')
                for (let i = 0; i < rows.length; i++) {
                    const number = await page.evaluate(elem => elem.textContent, rows[i]);
                    caseNumbers.push(number);
                }
                const [nextPage] = await page.$x('//a[text()="Next" and not(contains(@class, "disable"))]');
                if (!!nextPage) {
                    await nextPage.click();
                    await this.sleep(3000);
                    nextPageFlag = true;
                }
            } while (nextPageFlag);

            for (let i = 0; i < caseNumbers.length; i++) {
                await page.goto(`http://www.ventura.courts.ca.gov/CivilCaseSearch/CaseReport/${caseNumbers[i]}`);
                await page.waitForSelector('#resultscontainer');
                const [fillingDateElement] = await page.$x('//*[contains(text(),"Filed Date:")]/following-sibling::td[1]');
                const [caseTypeElement] = await page.$x('//*[contains(text(),"Case Type:")]/following-sibling::td[1]');
                const names = await page.$x('//*[@id="participantstable"]//*[contains(text(), "Defendant") or contains(text(), "Respondent")]/preceding-sibling::td[2]');
                const fillingDate = await page.evaluate(elem => elem.textContent, fillingDateElement);
                const caseType = await page.evaluate(elem => elem.textContent, caseTypeElement);
                for (let j = 0; j < names.length; j++) {
                    const name = await page.evaluate(elem => elem.textContent, names[j]);
                    if (removeRowRegex.test(name)) continue;
                    const parseName: any = this.newParseName(name.trim());
                    if (parseName.type && parseName.type == 'COMPANY') {
                        continue
                    }
                    let practiceType = this.getPracticeType(caseType.trim());
                    const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                    const prod = await db.models.Product.findOne({ name: productName }).exec();
                    const data = {
                        'Property State': 'CA',
                        'County': 'Ventura',
                        'First Name': parseName.firstName,
                        'Last Name': parseName.lastName,
                        'Middle Name': parseName.middleName,
                        'Name Suffix': parseName.suffix,
                        'Full Name': parseName.fullName,
                        "vacancyProcessed": false,
                        fillingDate: fillingDate,
                        productId: prod._id,
                        originalDocType: caseType.trim()
                    };
                    if (await this.civilAndLienSaveToNewSchema(data))
                        count++
                }
            }
        } catch (e) {
        }
        return count
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        if (page === undefined) return false;
        let countRecords = 0
        try {
            const dateRange: any = await this.getDateRange('California', 'Ventura');
            const date = dateRange.from;
            const today = dateRange.to;
            let days = Math.ceil((today.getTime() - date.getTime()) / (1000 * 3600 * 24)) - 1;
            for (let i = days < 0 ? 1 : days; i >= 0; i--) {
                try {
                    let dateSearch = new Date();
                    dateSearch.setDate(dateSearch.getDate() - i);
                    await page.goto('http://www.ventura.courts.ca.gov/CivilCaseSearch/CaseDateRange');
                    await page.waitForSelector('#SearchFromDate');
                    await page.evaluate(() => {
                        // @ts-ignore
                        document.querySelector('#SearchFromDate').value = '';
                        // @ts-ignore
                        document.querySelector('#SearchToDate').value = '';
                    })
                    console.log('Start search with date: ', dateSearch.toLocaleDateString('en-US'));
                    await page.type('#SearchFromDate', dateSearch.toLocaleDateString('en-US'), { delay: 100 });
                    await page.type('#SearchToDate', dateSearch.toLocaleDateString('en-US'), { delay: 100 });
                    await page.click('#btnSubmit');
                    const count = await this.getData(page);
                    countRecords += count;
                    console.log(`${dateSearch.toLocaleDateString('en-US')} found ${count} records.`);
                } catch (e) {
                }
            }
        } catch (e) {
            console.log(e)
            console.log('Error search');
            await AbstractProducer.sendMessage('Ventura', 'California', countRecords, 'Civil');
            return false
        }

        await AbstractProducer.sendMessage('Ventura', 'California', countRecords, 'Civil');
        return true;
    }
}