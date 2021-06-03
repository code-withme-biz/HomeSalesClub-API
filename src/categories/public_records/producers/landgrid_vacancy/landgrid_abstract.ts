import puppeteer from 'puppeteer';
import db from '../../../../models/db';
import { IPublicRecordAttributes } from '../../../../models/public_record_attributes';
import { PublicRecordLineItem } from '../../../../models/db';
import { IProduct } from '../../../../models/product';
import { Document } from 'mongoose';

// config
import { config as CONFIG } from '../../../../config';
import { IConfigEnv } from '../../../../iconfig';
const config: IConfigEnv = CONFIG[process.env.NODE_ENV || 'production'];


export default abstract class AbstractLandgrid {
    browser: puppeteer.Browser | undefined;
    browserPages = {
        landgridPage: undefined as undefined | puppeteer.Page
    };

    abstract async init(): Promise<boolean>;
    abstract async read(): Promise<boolean>;
    abstract async parseAndSave(): Promise<boolean>;

    async startParsing(finishScript?: Function) {
        try {
            // initiate pages
            let initialized = await this.init();
            if (initialized) {
                // check read
                console.log('Checking source availability: ', await this.read());
            } else {
                return false;
            }
            // call parse and save
            let success = await this.parseAndSave();
            return success;
        } catch (error) {
            console.log(error);
            return false;
        } finally {
            //end the script and close the browser regardless of result
            if (this.browser) {
                await this.browser.close();
            }
            if (finishScript) finishScript();
        }
    }

    async launchBrowser(): Promise<puppeteer.Browser> {
        return await puppeteer.launch({
            headless: config.puppeteer_headless,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            ignoreDefaultArgs: ['--disable-extensions']
        });
    }

    async setParamsForPage(page: puppeteer.Page): Promise<void> {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.0 Safari/537.36');
        await page.setViewport({ height: 800, width: 1200 });
    }

    async getProductsFromMongo(): Promise<any[]> {
        return (await db.models.Product.find({name: /vacancy/i}).exec());
    }

    async getProductIdFromMongo(normalizedStateName: string, normalizedCountyName: string): Promise<IProduct> {
        return (await db.models.Product.findOne({name: `/${normalizedStateName}/${normalizedCountyName}/vacancy`}).exec());
    }

    async removeOldLineItemsFromMongo(addr: string, normalizedStateName: string, normalizedCountyName: string) {
        const prod: IProduct = await db.models.Product.findOne({name: `/${normalizedStateName}/${normalizedCountyName}/vacancy`}).exec();
        const res = await db.models.LineItem.deleteMany({productId: prod._id, 'Property Address': addr}).exec();
        return res.deletedCount;
    }

    async cloneMongoDocument(initialDocument: Document) {
        const { _id, __v, createdAt, updatedAt, ...clonedDocumentObj } = initialDocument.toObject();
        if (clonedDocumentObj.hasOwnProperty('First Name')) {
            delete clonedDocumentObj["First Name"];
        }
        if (clonedDocumentObj.hasOwnProperty('Last Name')) {
            delete clonedDocumentObj["Last Name"];
        }
        if (clonedDocumentObj.hasOwnProperty('Middle Name')) {
            delete clonedDocumentObj["Middle Name"];
        }
        if (clonedDocumentObj.hasOwnProperty('Name Suffix')) {
            delete clonedDocumentObj["Name Suffix"];
        }
        if (clonedDocumentObj.hasOwnProperty('Full Name')) {
            delete clonedDocumentObj["Full Name"];
        }
        const clonedDocument = new PublicRecordLineItem(clonedDocumentObj);
        return clonedDocument;
    }

    async getAllLandgridRefreshDataFromMongo(query: any): Promise<any[]> {
        return (await db.models.LandgridCounty.find(query).exec());
    }

    async getSpecificLandgridRefreshDataFromMongo(query: any): Promise<any[]>{
        return (await db.models.LandgridCounty.findOne(query).exec());
    }

    async getLandgridAccountPoolFromMongo(query: any): Promise<any[]>{
        return (await db.models.LandgridAccount.find(query).exec());
    }

}