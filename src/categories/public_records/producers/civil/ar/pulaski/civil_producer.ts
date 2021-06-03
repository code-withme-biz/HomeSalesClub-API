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
        generalInfoPage: 'http://realestatesearch.pulaskiclerk.com/search/index.php'
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

    // This is main function
    async parseAndSave(): Promise<boolean> {
        const civilUrl: string = 'http://realestatesearch.pulaskiclerk.com/search/index.php';
        let countRecords = 0;
        try {
            let dateRange = await this.getDateRange('Arkansas', 'Pulaski');
            let fromDate = dateRange.from;
            let toDate = dateRange.to;
            let page = this.browserPages.generalInfoPage!;


            while (fromDate <= toDate) {
                let dateStringDay = this.getFormattedDate(fromDate);
                console.log('Start : ' + dateStringDay);
                await page.goto(civilUrl, { timeout: 60000 });
                await page.waitForXPath(`//html`, { visible: true });
                try {
                    let clickAccept = await page.$x('//input[@id="Accept"]');
                    await clickAccept[0].click();
                } catch (err) {

                }
                await page.waitForXPath(`//a[@onclick="setSearch('instrumenttype');"]`, { visible: true, timeout: 200000 });
                let clickDocumentType = await page.$x(`//a[@onclick="setSearch('instrumenttype');"]`);
                await clickDocumentType[0].click();
                let codeCheckbox = ['BFD', 'CAD', 'CCL', 'COD', 'COM', 'CRD', 'EAD', 'EXD', 'FTL', 'INT', 'IRM', 'LPL', 'LTD', 'MAD', 'MEL', 'MGM', 'MID', 'MML', 'MRB', 'NJD', 'NJL', 'NOL', 'OTD', 'OTL', 'PRL', 'PRM', 'QCD', 'REL', 'REM', 'RML', 'WAD'];
                for (let k = 0; k < codeCheckbox.length; k++) {
                    try {
                        let checkbox = await page.$x('//div[@id="instrumenttype_category_containerDiv"]/input[@id="' + codeCheckbox[k] + '"]')
                        await checkbox[0].click();
                    } catch (err) {

                    }
                }
                try {
                    await page.waitForXPath('//input[@id="start_date_instrumenttype"]', { visible: true, timeout: 200000 });
                } catch (err) {
                    console.log('Website is slow.')
                    console.log('Restart on the same day : ' + dateStringDay)
                    continue
                }
                let clickFromDate = await page.$x('//input[@id="start_date_instrumenttype"]');
                await clickFromDate[0].click({ clickCount: 3 });
                await clickFromDate[0].press('Backspace');
                await page.keyboard.type(dateStringDay, { delay: 100 });
                let clickToDate = await page.$x('//input[@id="end_date_instrumenttype"]');
                await clickToDate[0].click({ clickCount: 3 });
                await clickToDate[0].press('Backspace');
                await page.keyboard.type(dateStringDay, { delay: 100 });
                await this.sleep(1000);
                let btnSearch = await page.$x('//a[@href="javascript: submitSearch();"]')
                await btnSearch[0].click();
                await this.sleep(1000);
                await page.waitForSelector("iframe", { visible: true, timeout: 200000 });
                const elementHandle = await page.$('div#content_div iframe');
                const frame = await elementHandle!.contentFrame();

                try {
                    await frame!.waitForXPath('//table/tbody/tr', { visible: true, timeout: 50000 });
                    await frame!.waitForXPath('//a[@id="results_first"]', { visible: true, timeout: 200000 });
                } catch (err) {
                    console.log('Website is slow when click search.');
                    console.log('Restart on the same day : ' + dateStringDay);
                    continue
                }
                try {
                    await frame!.waitForXPath('//td[@class="dataTables_empty"]', { visible: true, timeout: 10000 });
                    console.log('There is no data : ' + dateStringDay);
                    fromDate.setDate(fromDate.getDate() + 1);
                    continue
                } catch (err) {
                }
                let flagNext = true;
                while (flagNext) {
                    let countRow = await frame!.$x('//table[@id="results"]/tbody/tr');
                    for (let k = 0; k < countRow!.length; k++) {
                        let index = k + 1;
                        let caseUniqueIdXpath = await frame!.$x(`//table[@id="results"]/tbody/tr[${index}]/td[2]`);
                        let docTypeXpath = await frame!.$x(`//table[@id="results"]/tbody/tr[${index}]/td[3]`);
                        let grantorsXpath = await frame!.$x(`//table[@id="results"]/tbody/tr[${index}]/td[6]`);
                        let grantesXpath = await frame!.$x(`//table[@id="results"]/tbody/tr[${index}]/td[7]`);
                        let names = [];
                        let docType;
                        try {
                            docType = await docTypeXpath[0].evaluate(el => el.textContent?.trim());
                            if (docType == '' || docType == null) {
                                continue
                            }
                        } catch (err) {
                            continue
                        }
                        let caseUniqueId = await caseUniqueIdXpath[0].evaluate(el => el.textContent?.trim());
                        try {
                            let grantorName = await grantorsXpath[0].evaluate(el => el.innerHTML?.trim());
                            let arrGrantor = grantorName?.split('<br>');
                            for (let j = 0; j < arrGrantor!.length; j++) {
                                names.push(arrGrantor![j]);
                            }
                        } catch (err) {

                        }
                        try {
                            let grantesName = await grantesXpath[0].evaluate(el => el.innerHTML?.trim());
                            let arrGrantes = grantesName?.split('<br>');
                            for (let j = 0; j < arrGrantes!.length; j++) {
                                names.push(arrGrantes![j]);
                            }
                        } catch (err) {

                        }
                        let practiceType = this.getPracticeType(docType!);
                        for (let name of names) {
                            name = name?.replace(/\(PERS REP\)/, '');
                            if (name == '...' || name == '' || name == ' ' || name == '&nbsp;') {
                                continue
                            }
                            const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                            const prod = await db.models.Product.findOne({ name: productName }).exec();
                            const parseName: any = this.newParseName(name!.trim());
                            if (parseName.type && parseName.type == 'COMPANY') {
                                continue;
                            }
                            const data = {
                                'caseUniqueId': caseUniqueId,
                                'Property State': 'AR',
                                'County': 'Pulaski',
                                'First Name': parseName.firstName,
                                'Last Name': parseName.lastName,
                                'Middle Name': parseName.middleName,
                                'Name Suffix': parseName.suffix,
                                'Full Name': parseName.fullName,
                                "vacancyProcessed": false,
                                fillingDate: dateStringDay,
                                "productId": prod._id,
                                originalDocType: docType
                            };
                            if (await this.civilAndLienSaveToNewSchema(data)) {
                                countRecords += 1;
                            }
                        }

                    }
                    try {
                        let btnNext = await frame!.$x('//a[@class="paginate_button next"]');
                        await btnNext[0].click()
                        await this.sleep(3000);
                    } catch (er) {
                        flagNext = false;
                    }
                }
                fromDate.setDate(fromDate.getDate() + 1);
                await this.randomSleepIn5Sec();
            }

            console.log(countRecords)
            await AbstractProducer.sendMessage('Pulaski', 'Arkansas', countRecords, 'Civil & Lien');
            return true;
        } catch (e) {
            console.log(e);
            await AbstractProducer.sendMessage('Pulaski', 'Arkansas', countRecords, 'Civil & Lien');
            return false;
        }
    }
}