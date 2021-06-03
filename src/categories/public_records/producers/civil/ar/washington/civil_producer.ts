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
        generalInfoPage: 'http://esearch.co.washington.ar.us/external/LandRecords/protected/SrchDateRange.aspx'
    }

    xpaths = {
        isPAloaded: '//html'
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

    sleep(ms: number) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
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
            'HOMES', 'LOAN', 'FAM', 'PRAYER'
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
        const suffix = name.match(suffixNamesRegex);
        name = name.replace(suffixNamesRegex, '');
        name = name.replace(/\s+/g, ' ');
        let ownersNameSplited: any = name.split(' ');
        ownersNameSplited = ownersNameSplited.filter((val: any) => val !== '');
        const defaultLastName = ownersNameSplited[ownersNameSplited.length - 1].trim();
        ownersNameSplited.pop();
        try {
            const firstName = ownersNameSplited[0].trim();
            ownersNameSplited.shift();
            const middleName = ownersNameSplited.join(' ');
            const fullName = `${defaultLastName}, ${firstName} ${middleName} ${suffix ? suffix[0] : ''}`;
            result = {
                firstName,
                lastName: defaultLastName,
                middleName,
                fullName: fullName.trim(),
                suffix: suffix ? suffix[0] : ''
            }
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

    // This is main function
    async parseAndSave(): Promise<boolean> {
        const civilUrl: string = 'http://esearch.co.washington.ar.us/external/LandRecords/protected/SrchDateRange.aspx';
        let countRecords = 0;

        try {
            let dateRange = await this.getDateRange('Arkansas', 'Washington');
            let page = this.browserPages.generalInfoPage!;

            await page.goto(civilUrl, { timeout: 60000 });

            try {
                await page.waitForXPath('//a[@id="ctl00_cphMain_repCounties_ctl00_lbCounty"]', { visible: true, timeout: 30000 });
                let clickHome = await page.$x('//a[@id="ctl00_cphMain_repCounties_ctl00_lbCounty"]');
                await clickHome[0].click()

                await page.waitForXPath('//input[@id="ctl00_NavMenuIdxRec_btnNav_IdxRec_Date"]', { visible: true, timeout: 200000 });
                let searchByDateRange = await page.$x('//input[@id="ctl00_NavMenuIdxRec_btnNav_IdxRec_Date"]');
                await searchByDateRange[0].click()
            } catch (err) {

            }

            await page.waitForXPath('//input[@id="ctl00_cphMain_SrchDates1_txtFiledFrom"]', { visible: true, timeout: 200000 });
            // console.log(dateStringDay);
            await this.sleep(2000);
            let dateStringFrom = this.getFormattedDate(dateRange.from).replace(/\//g, "");
            let dateStringTo = this.getFormattedDate(dateRange.to).replace(/\//g, "");

            await page.click('input#ctl00_cphMain_SrchDates1_txtFiledFrom', { clickCount: 3 });
            await page.type('input#ctl00_cphMain_SrchDates1_txtFiledFrom', dateStringFrom);
            await page.click('input#ctl00_cphMain_SrchDates1_txtFiledThru', { clickCount: 3 });
            await page.type('input#ctl00_cphMain_SrchDates1_txtFiledThru', dateStringTo);

            const searchButton = await page.$x('//input[@id="ctl00_cphMain_btnSearch"]');
            await searchButton[0].click()

            console.log('This take a few minutes.. please wait')

            await page.waitForXPath('//table[@id="ctl00_cphMain_lrrgResults_cgvResults"]/tbody/tr[1]', { visible: true, timeout: 500000 });

            let totalItemsCountHandle = await page.$x('//caption/strong[2]');
            let totalItemsCount = await totalItemsCountHandle[0].evaluate(el => el.textContent?.trim());

            let numberOfItemsPerPage = 500;
            let numberOfPages = Math.ceil(parseInt(totalItemsCount!) / numberOfItemsPerPage)
            console.log(numberOfPages)
            for (let i = 1; i <= numberOfPages; i++) {
                let start = (i * numberOfItemsPerPage) - (numberOfItemsPerPage - 1);
                let end = Math.min(start + numberOfItemsPerPage - 1, parseInt(totalItemsCount!));
                console.log(i)
                await page.waitForXPath('//caption/strong[contains(.,"' + start + ' - ' + end + '")]', { visible: true, timeout: 200000 });

                let totalRowHandle = await page.$x('//table[@id="ctl00_cphMain_lrrgResults_cgvResults"]/tbody/tr');
                for (let i = 1; i < totalRowHandle!.length; i++) {
                    let recordDateHandle = await page.$x('//table[@id="ctl00_cphMain_lrrgResults_cgvResults"]/tbody/tr[' + i + ']/td[4]');
                    let docTypeHandle = await page.$x('//table[@id="ctl00_cphMain_lrrgResults_cgvResults"]/tbody/tr[' + i + ']/td[6]');
                    let docType;
                    let recordDateArray;
                    try {
                        docType = await docTypeHandle![0].evaluate(el => el.textContent?.trim());
                        recordDateArray = await recordDateHandle![0].evaluate(el => el.innerHTML?.trim());

                    } catch (err) {
                        continue;
                    }

                    let recordDate = recordDateArray.split('<br>');

                    if (docType == '...' || docType == '' || docType == ' ' || recordDate[0]!.length > 10) {
                        continue
                    }

                    const Grantors = await page.$x('//table[@id="ctl00_cphMain_lrrgResults_cgvResults"]/tbody/tr[' + i + ']/td[7]/div/table/tbody/tr/td');
                    const Grantes = await page.$x('//table[@id="ctl00_cphMain_lrrgResults_cgvResults"]/tbody/tr[' + i + ']/td[8]/div/table/tbody/tr/td');
                    let names = [];
                    try {
                        for (let j = 0; j < Grantors.length; j++) {
                            let nameFull = await Grantors[j].evaluate(el => el.textContent);
                            names.push(nameFull!.trim())
                        }
                    } catch (err) {

                    }
                    try {
                        for (let j = 0; j < Grantes.length; j++) {
                            let nameFull = await Grantes[j].evaluate(el => el.textContent);
                            names.push(nameFull!.trim())
                        }
                    } catch (err) {

                    }


                    let practiceType = this.getPracticeType(docType!);
                    for (let name of names) {
                        name = name?.replace(/\(PERS REP\)/, '');
                        if (name == '...' || name == '' || name == ' ' || name == '-----') {
                            continue
                        }
                        const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                        const prod = await db.models.Product.findOne({ name: productName }).exec();
                        const parseName: any = this.newParseName(name!.trim());
                        if (parseName.type && parseName.type == 'COMPANY') {
                            continue;
                        }

                        const data = {
                            'Property State': 'AR',
                            'County': 'Washington',
                            'First Name': parseName.firstName,
                            'Last Name': parseName.lastName,
                            'Middle Name': parseName.middleName,
                            'Name Suffix': parseName.suffix,
                            'Full Name': parseName.fullName,
                            "vacancyProcessed": false,
                            fillingDate: recordDate[0],
                            "productId": prod._id,
                            originalDocType: docType
                        };

                        if (await this.civilAndLienSaveToNewSchema(data)) {
                            countRecords += 1;
                        }
                    }
                }
                if (i < numberOfPages) {
                    let [nextPage] = await page.$x(`//*[contains(text(), "Page:")]/parent::tr[1]//a[contains(@href, "Page$${i+1}")]`);
                    if (nextPage) {
                        await nextPage.click();
                        await this.randomSleepIn5Sec();
                    } else {
                        break;
                    }
                }
            }

            console.log(countRecords)
            await AbstractProducer.sendMessage('Washington', 'Arkansas', countRecords, 'Civil & Lien');
            return true;
        } catch (e) {
            console.log(e);
            await AbstractProducer.sendMessage('Washington', 'Arkansas', countRecords, 'Civil & Lien');
            return false;
        }
    }
}