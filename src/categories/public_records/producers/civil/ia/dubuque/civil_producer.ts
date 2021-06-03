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
        generalInfoPage: 'http://cotthosting.com/iadubuque/LandRecords/protected/SrchDateRange.aspx'
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
            await this.browserPages.generalInfoPage.setDefaultNavigationTimeout(60000);
            const pageLoadResult = await this.waitForSuccessPageLoad(this.browserPages.generalInfoPage, this.urls.generalInfoPage);
            if (!pageLoadResult) {
                return false;
            }
            return true;
        } catch (err) {
            console.warn(err);
            return false;
        }
    }

    async waitForSuccessPageLoad(page: puppeteer.Page, url: string): Promise<boolean> {
        let retry_count = 0;
        while (true) {
            if (retry_count > 30) {
                console.error('Connection/website error for 30 iteration.');
                return false;
            }
            try {
                await page.goto(url, { waitUntil: 'networkidle0' });
                break;
            }
            catch (error) {
                retry_count++;
                console.log(`retrying page loading -- ${retry_count}`);
            }
        }
        return true;
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

    // This is main function
    async parseAndSave(): Promise<boolean> {
        const civilUrl: string = 'http://cotthosting.com/iadubuque/LandRecords/protected/SrchDateRange.aspx';
        let countRecords = 0;

        try {
            let dateRange = await this.getDateRange('Iowa', 'Dubuque');
            let page = this.browserPages.generalInfoPage!;

            await page.goto(civilUrl, { timeout: 60000 });

            try {
                await page.waitForXPath('//input[@id="ctl00_cphMain_blkLogin_btnGuestLogin"]', { visible: true, timeout: 30000 });
                let clickSignAsGuest = await page.$x('//input[@id="ctl00_cphMain_blkLogin_btnGuestLogin"]');
                await clickSignAsGuest[0].click()

                await page.waitForXPath('//input[@id="ctl00_btnEmergencyMessagesClose"]', { visible: true, timeout: 200000 });
                let clickAknowledge = await page.$x('//input[@id="ctl00_btnEmergencyMessagesClose"]');
                await clickAknowledge[0].click()

                await page.waitForXPath('//a[@id="ctl00_cphMain_repModules_ctl00_lbModuleSelect"]', { visible: true, timeout: 200000 });
                let clickLandRecords = await page.$x('//a[@id="ctl00_cphMain_repModules_ctl00_lbModuleSelect"]');
                await clickLandRecords[0].click()

                await page.waitForXPath('//input[@id="ctl00_NavMenuIdxRec_btnNav_IdxRec_Date"]', { visible: true, timeout: 200000 });
                let clickDateRange = await page.$x('//input[@id="ctl00_NavMenuIdxRec_btnNav_IdxRec_Date"]');
                await clickDateRange[0].click()

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
                await page.waitForXPath('//caption/strong[contains(.,"' + start + ' - ' + end + '")]', { visible: true, timeout: 500000 });

                let totalRowHandle = await page.$x('//table[@id="ctl00_cphMain_lrrgResults_cgvResults"]/tbody/tr');
                for (let i = 1; i < totalRowHandle!.length; i++) {
                    let recordDateHandle = await page.$x('//table[@id="ctl00_cphMain_lrrgResults_cgvResults"]/tbody/tr[' + i + ']/td[4]');
                    let docTypeHandle = await page.$x('//table[@id="ctl00_cphMain_lrrgResults_cgvResults"]/tbody/tr[' + i + ']/td[6]');
                    let docType = await docTypeHandle![0].evaluate(el => el.textContent?.trim());
                    let recordDateArray = await recordDateHandle![0].evaluate(el => el.innerHTML?.trim());
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
                            'Property State': 'IA',
                            'County': 'Dubuque',
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
                if (i != numberOfPages) {
                    try {
                        let nextPage = await page.$x('//*[@id="ctl00_cphMain_lrrgResults_cgvResults"]/thead/tr[1]/td/table/tbody/tr[1]/td/table/tbody/tr/td/table/tbody/tr/td/a[contains(text(),"' + (i + 1) + '")]')
                        nextPage[0].click()
                        await this.randomSleepIn5Sec()
                    } catch (err) {
                        let nextPageNext = await page.$x('//*[@id="ctl00_cphMain_lrrgResults_cgvResults"]/thead/tr[1]/td/table/tbody/tr[1]/td/table/tbody/tr/td/table/tbody/tr/td/a[contains(text(),"...")]')
                        if (nextPageNext.length > 1) {
                            nextPageNext[1].click()
                        } else {
                            nextPageNext[0].click()
                        }
                        await this.randomSleepIn5Sec()
                    }
                }
            }

            console.log(countRecords)
            await AbstractProducer.sendMessage('Dubuque', 'Iowa', countRecords, 'Civil & Lien');
            return true;
        } catch (e) {
            console.log(e);
            await AbstractProducer.sendMessage('Dubuque', 'Iowa', countRecords, 'Civil & Lien');
            return false;
        }
    }
}