import AbstractProducer from '../../../abstract_producer';
import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import SnsService from '../../../../../../services/sns_service';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

export default class CivilProducer extends AbstractProducer {
    browser: puppeteer.Browser | undefined;
    browserPages = {
        generalInfoPage: undefined as undefined | puppeteer.Page
    };
    urls = {
        generalInfoPage: 'http://meckrod.manatron.com/RealEstate/SearchEntry.aspx?e=newSession'
    }

    xpaths = {
        isPAloaded: '//a[contains(text(),"Click here to acknowledge")]'
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
            let retries = 0;
            while (retries < 15) {
                try {
                    await this.browserPages.generalInfoPage.goto(this.urls.generalInfoPage, { waitUntil: 'load' });
                    break;
                } catch (error) {
                    retries++;
                    await this.randomSleepIn5Sec();
                }                    
            }
            if (retries === 15) {
                console.log('Maybe website is unavailable');
                return false;
            }
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

    async parseAndSave(): Promise<boolean> {
        const civilUrl: string = 'http://meckrod.manatron.com/RealEstate/SearchEntry.aspx?e=newSession';
        let page = this.browserPages.generalInfoPage!;
        let countRecords = 0;

        try {
            let dateRange = await this.getDateRange('North Carolina', 'Mecklenburg');
            let fromDate = dateRange.from;
            let toDate = dateRange.to;

            while (fromDate <= toDate) {
                let dateStringDay = this.getFormattedDate(fromDate);
                console.log(`******* CHECKING FOR ${dateStringDay} *******`);
                let retries = 0;
                while (retries < 15) {
                    try {
                        await page.goto(civilUrl, { timeout: 600000 });
                        break;
                    } catch (error) {
                        retries++;
                        await this.randomSleepIn5Sec();
                    }                    
                }
                if (retries === 15) {
                    console.log('Website loading is failed: 15 times');
                    return false;
                }
                try {
                    await page.waitForXPath('//a[contains(text(),"Click here to acknowledge")]');
                    let btnDisclaimer = await page.$x('//a[contains(text(),"Click here to acknowledge")]');
                    await btnDisclaimer[0].click();
                } catch (err) {

                }
                await page.waitForXPath('//td[@id="cphNoMargin_SearchButtons2_btnSearch__5"]', { visible: true });
                let SearchButton = await page.$x('//td[@id="cphNoMargin_SearchButtons2_btnSearch__5"]');
                const dateFromElement = await page.$x('//*[@id="cphNoMargin_f_ddcDateFiledFrom"]');
                await dateFromElement[0].click();
                await this.sleep(200);
                await page.keyboard.type(dateStringDay, { delay: 100 });
                const dateToElement = await page.$x('//*[@id="cphNoMargin_f_ddcDateFiledTo"]');
                await dateToElement[0].click()
                await this.sleep(200);
                await page.keyboard.type(dateStringDay, { delay: 100 });

                let documentTypes = ['DEED', 'LIEN', 'MORTGAGE', 'MARRIAGE', 'PENDENS', 'PROBATE', 'FORECLOSURE'];
                await page.waitForXPath('//table[@id="cphNoMargin_f_dclDocType"]//label', { visible: true });
                let docTypes = await page.$x('//table[@id="cphNoMargin_f_dclDocType"]//label')
                for (let j = 0; j < docTypes.length; j++) {
                    let textDocument = await docTypes[j].evaluate(el => el.textContent);
                    // console.log(textDocument);
                    let arrStr = textDocument?.split(' ');
                    fast:
                    for (let k = 0; k < arrStr!.length; k++) {
                        if (documentTypes.includes(arrStr![k])) {
                            await docTypes[j].click();
                            break fast;
                        }
                    }

                }
                await SearchButton[0].click()
                // await SearchButton[0].click();
                try {
                    await page.waitForXPath('//div[@id="ctl00_ctl00_cphNoMargin_cphNoMargin_g_G1_ctl00"]', { visible: true, timeout: 20000 });
                } catch (err) {
                    fromDate.setDate(fromDate.getDate() + 1);
                    continue;
                }
                let nextPageFlag;
                do {
                    try {
                        await page.waitForXPath('//*[@mkr="dataTbl.hdn"]');
                    } catch (err) {
                        nextPageFlag = false;
                        break
                    }
                    nextPageFlag = false;
                    const rows = await page.$x('//*[@mkr="dataTbl.hdn"]/tbody/tr[not(@mkr="sizeRow")]');
                    for (let i = 0; i < rows.length; i++) {
                        let clickOnUniqueId = await page.$x(`//*[@mkr="dataTbl.hdn"]/tbody/tr[${i + 2}]/td[5]`);
                        await clickOnUniqueId[0].click();
                        try {
                            await page.waitForXPath('//*[@id="Table1"]/tbody/tr[2]/td/table/tbody/tr[1]/td/span', { visible: true, timeout: 20000 });
                        } catch (err) {
                            await this.sleep(200);
                            await page.goBack();
                            continue;
                        }
                        const caseUniqueIdXpath = await page.$x('//*[@id="Table1"]/tbody/tr[2]/td/table/tbody/tr[1]/td/span');
                        const caseUniqueId = await caseUniqueIdXpath[1].evaluate(el => el.textContent);
                        const fillingDateXpath = await page.$x('//*[@id="Table1"]/tbody/tr[2]/td/table/tbody/tr[4]/td/span');
                        const fillingDateWithTime = await fillingDateXpath[1].evaluate(el => el.textContent);
                        const fillingDate = await fillingDateWithTime!.split(' ')[0];
                        const docTypeXpath = await page.$x('//*[@id="Table1"]/tbody/tr[2]/td/table/tbody/tr[5]/td/span');
                        const docType = await docTypeXpath[1].evaluate(el => el.textContent);
                        const Grantors = await page.$x('//*[@id="Table1"]/tbody/tr[4]/td/table/tbody/tr');
                        const Grantes = await page.$x('//*[@id="Table1"]/tbody/tr[6]/td/table/tbody/tr');
                        let names = [];
                        try {
                            for (let j = 0; j < Grantors.length; j++) {
                                let nameXpath = await page.$x('//*[@id="Table1"]/tbody/tr[4]/td/table/tbody/tr[' + (j + 1) + ']/td/span');
                                let nameFull = '';
                                for (let k = 1; k < nameXpath.length; k++) {
                                    nameFull += await nameXpath[k].evaluate(el => el.textContent) + ' ';
                                }
                                names.push(nameFull.trim())

                            }
                        } catch (err) {

                        }
                        try {
                            for (let j = 0; j < Grantes.length; j++) {
                                let nameXpath = await page.$x('//*[@id="Table1"]/tbody/tr[6]/td/table/tbody/tr[' + (j + 1) + ']/td/span');
                                let nameFull = '';
                                for (let k = 1; k < nameXpath.length; k++) {
                                    nameFull += await nameXpath[k].evaluate(el => el.textContent) + ' ';
                                }
                                names.push(nameFull.trim())
                            }
                        } catch (err) {

                        }
                        let practiceType = this.getPracticeType(docType!);
                        // }
                        for (let name of names) {
                            if (name == '...' || name == '' || name == ' ') {
                                continue
                            }
                            name = name!.replace(/\(PERS REP\)/, '');
                            const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/${practiceType}`;
                            const prod = await db.models.Product.findOne({ name: productName }).exec();
                            const parseName: any = this.newParseName(name!.trim());
                            if (parseName.type && parseName.type == 'COMPANY') {
                                continue
                            }
                            const data = {
                                'caseUniqueId': caseUniqueId,
                                'Property State': 'NC',
                                'County': 'Mecklenburg',
                                'First Name': parseName.firstName,
                                'Last Name': parseName.lastName,
                                'Middle Name': parseName.middleName,
                                'Name Suffix': parseName.suffix,
                                'Full Name': parseName.fullName,
                                "vacancyProcessed": false,
                                fillingDate: fillingDate,
                                "productId": prod._id,
                                originalDocType: docType
                            };
                            if (await this.civilAndLienSaveToNewSchema(data)) {
                                countRecords += 1;
                            }
                        }
                        await this.randomSleepInOneSec();

                        await page.goBack();
                    }

                    const [nextPage] = await page.$x('//*[@id="OptionsBar1_imgNext" and not(@disabled)]');
                    if (!!nextPage) {
                        await nextPage.click();
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        nextPageFlag = true;
                    }
                } while (nextPageFlag)
                fromDate.setDate(fromDate.getDate() + 1);
            }
            console.log(`SAVED ${countRecords} records`);
            await AbstractProducer.sendMessage('Mecklenburg', 'North Carolina', countRecords, 'Civil & Lien');
            return true;
        } catch (err) {
            console.log('Error: Maybe website is unavailable')
            console.log(`SAVED ${countRecords} records`);
            const errorImage = await this.uploadImageOnS3(page);
            await AbstractProducer.sendMessage('Mecklenburg', 'North Carolina', countRecords, 'Civil & Lien', errorImage);
            return false;
        }
    }
}