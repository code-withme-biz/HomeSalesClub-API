// Created by Pamela<pamela.prasc@gmail.com>

import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

import { IProduct } from '../../../../../../models/product';
import { int } from 'aws-sdk/clients/datapipeline';
import { integer } from 'aws-sdk/clients/cloudfront';

const removeRowArray = [
    'CITY', 'DEPT', 'CTY', 'UNITED STATES', 'BANK', 'FIA CARD SERVICES NA',
    'FLORIDA PACE FUNDING AGENCY', 'COUNTY', 'CREDIT', 'HOSPITAL', 'FUNDING', 'UNIVERSITY',
    'MEDICAL', 'CONDOMINIUM ASSOCIATION', 'Does', 'In Official Capacity', 'Judge', 'All persons unknown',
    'as Trustees', 'Medical', 'School', 'Management', 'The People', 'US Currency', 'as Trustee', 'Services Foundation',
    'Department', 'BUTTE', 'CALIFORNIA'
]
const removeRowRegex = new RegExp(`\\b(?:${removeRowArray.join('|')})\\b`, 'i')

export default class CivilProducer extends AbstractProducer {


    urls = {
        generalInfoPage: 'http://www.eldoradocourt.org/caseindex/case_index_civil.aspx'
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
            await this.browserPages.generalInfoPage.goto(this.urls.generalInfoPage, { waitUntil: 'load', timeout: 60000 });
            return true;
        } catch (err) {
            console.warn(err);
            return false;
        }
    }

    async read(): Promise<boolean> {
        try {
            await this.browserPages.generalInfoPage?.waitForXPath('//table[@class="MasterTable_Default"]');
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    async delay(time:integer) {
        return new Promise(function(resolve) {
            setTimeout(resolve, time)
        });
    }

    async getData(page: puppeteer.Page) {
        let count = 0;
        try {
            var flag = true
            //let selector = 'input[name="ctl00$centerBody$RadGrid1$ctl00$ctl03$ctl01$ctl15"]';
            let selector = 'input[title="Next Page"]';

            while ( flag == true)
            {
                await page.click(selector);
                var process=false
                while (process == false)
                {
                    if(await  page.$('div[id="ctl00_centerBody_RadAjaxLoadingPanel1ctl00_centerBody_RadGrid1"]') !== null)
                        await this.delay(5000)
                    else
                        process = true
                }
                
                const data = await page.evaluate(() => {
                const tds = Array.from(document.querySelectorAll('table tr td:first-child'))
                    return tds.map(td => (<HTMLElement>td).innerText.trim())
                });
                const fillingDateElem = await page.evaluate(() => {
                    const tds = Array.from(document.querySelectorAll('table tr td:last-child'))
                    return tds.map(td => (<HTMLElement>td).innerText.trim())
                });
                //et [docTypeElem] = "/ca/el-dorado/other-civil";
                for (let index = 33; index < data.length; index++) {
                    let fullName = data[index];
                    let parseName = fullName.split(" ");
                    
                    const fillingDate = fillingDateElem[index];
                    //console.log(parseName[0]);
                // let docType = await page.evaluate(element => element.textContent, docTypeElem);
                    const productName = `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/other-civil`;
                    var product = await db.models.Product.findOne({ name: productName });
                    const _data = {
                        'Property State': 'CA',
                        'County': 'El Dorado',
                        'First Name': parseName[0],
                        'Last Name': parseName[2],
                        'Middle Name': parseName[1],
                        'Name Suffix': "",
                        'Full Name': fullName,
                        "vacancyProcessed": false,
                        fillingDate: fillingDate,
                        productId: product._id
                        //5f89a3e616ddb85ac982ec0b
                    };
                    if (await this.civilAndLienSaveToNewSchema(_data))
                        count++;
                } 
                        
            }
            if (await page.$(selector) == null) flag = false;        
        }catch(e){
            console.log(e);
        }
        return count
    }

    async parseAndSave(): Promise<boolean> {
        const page = this.browserPages.generalInfoPage;
        let count = 0;
        if (page === undefined) return false;
        try {            
            count = await this.getData(page);
            
            await AbstractProducer.sendMessage('El Dorado', 'California', count, 'Civil');
        } catch (e) {
            console.log(e)
            console.log('Error search');
            await AbstractProducer.sendMessage('El Dorado', 'California', count, 'Civil');
            return false
        }
        return true;
    }
}
