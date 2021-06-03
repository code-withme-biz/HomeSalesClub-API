import puppeteer from 'puppeteer';
import db, { PublicRecordOwner, PublicRecordOwnerProductProperty, PublicRecordProperty } from '../../../../models/db';
import { IOwnerProductProperty } from '../../../../models/owner_product_property';
import { Document } from 'mongoose';
import axios from 'axios';
import { sleep } from '../../../../core/sleepable';
import SnsService from '../../../../services/sns_service';
var addressit = require('addressit');
const parseaddress = require('parse-address');
import { logOpp, saveToOwnerProductPropertyByConsumer } from '../../../../services/general_service';
import AddressService from '../../../../services/address_service';

// config
import { config as CONFIG } from '../../../../config';
import { IConfigEnv } from '../../../../iconfig';
import { IPublicRecordAttributes } from '../../../../models/public_record_attributes';
import { IProperty } from '../../../../models/property';
const config: IConfigEnv = CONFIG[process.env.NODE_ENV || 'production'];

export default abstract class AbstractPAConsumer {
    browser: puppeteer.Browser | undefined;
    browserPages = {
        propertyAppraiserPage: undefined as undefined | puppeteer.Page
    };
    abstract readDocsToParse(): IOwnerProductProperty;
    abstract async init(): Promise<boolean>;
    abstract async read(): Promise<boolean>;
    abstract async parseAndSave(docsToParse: IOwnerProductProperty): Promise<boolean>;

    searchBy: string = 'address';
    countSuccess: number = 0;
    countSale: number = 0;
    countyMsg: string = '';
    stateMsg: string = '';
    last_save_opp_id: any = null;

    async startParsing(finishScript?: Function) {
        try {
            // read documents from mongo
            const docsToParse = this.readDocsToParse();
            // let docsAtStart = docsToParse.length;
            if (!docsToParse) {
                console.log('No documents to parse in DB.');
                return true;
            }
            // initiate pages
            let initialized = await this.init();
            if (initialized) {
                // check read
                console.log('Checking PA site status: ', await this.read());
            } else {
                return false;
            }
            // call parse and save
            await this.parseAndSave(docsToParse);

            // let percentageSuccessLookup = ((this.countSuccess / docsAtStart) * 100).toFixed(2);
            // let percentageSuccessGetSale = ((this.countSale / docsAtStart) * 100).toFixed(2);
            // console.log('Script is finished!');
            // let message = `PA - ${this.countyMsg}, ${this.stateMsg} | Total processed: ${docsAtStart}, success: ${this.countSuccess}, with sale date: ${this.countSale} | Success rate: ${percentageSuccessLookup}%, sale date rate: ${percentageSuccessGetSale}%`;
            // await this.sendMessage(message);
            // console.log(message);
            // await this.formatRecordingDates();
            
            return this.last_save_opp_id;
        } catch (error) {
            console.log(error);
            return false;
        } finally {
            //end the script and close the browser regardless of result
            if (finishScript) finishScript();
        }
    }

    async launchBrowser(): Promise<puppeteer.Browser> {
        return await puppeteer.launch({
            headless: config.puppeteer_headless,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            ignoreDefaultArgs: ['--disable-extensions'],
            ignoreHTTPSErrors: true
        });
    }

    async setParamsForPage(page: puppeteer.Page): Promise<void> {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.0 Safari/537.36');
        await page.setViewport({ height: 800, width: 1200 });
    }

    protected normalizeStringForMongo(sourceString: string) {
        return sourceString.toLocaleLowerCase().replace('_', '-').replace(/[^A-Z\d\s\-]/ig, '').replace(/\s+/g, '-');
    }

    protected cloneDocument(document: any) {
        const initialDocument: any = {...document};
        if (initialDocument.hasOwnProperty('First Name')) {
            delete initialDocument["First Name"];
        }
        if (initialDocument.hasOwnProperty('Last Name')) {
            delete initialDocument["Last Name"];
        }
        if (initialDocument.hasOwnProperty('Middle Name')) {
            delete initialDocument["Middle Name"];
        }
        if (initialDocument.hasOwnProperty('Name Suffix')) {
            delete initialDocument["Name Suffix"];
        }
        if (initialDocument.hasOwnProperty('Full Name')) {
            delete initialDocument["Full Name"];
        }        
        return initialDocument;
    }

    protected cloneDocumentV2(document: any) {
        const initialDocument: any = {...document};
        if (initialDocument.owner.hasOwnProperty('First Name')) {
            delete initialDocument.owner["First Name"];
        }
        if (initialDocument.owner.hasOwnProperty('Last Name')) {
            delete initialDocument.owner["Last Name"];
        }
        if (initialDocument.owner.hasOwnProperty('Middle Name')) {
            delete initialDocument.owner["Middle Name"];
        }
        if (initialDocument.owner.hasOwnProperty('Name Suffix')) {
            delete initialDocument.owner["Name Suffix"];
        }
        if (initialDocument.owner.hasOwnProperty('Full Name')) {
            delete initialDocument.owner["Full Name"];
        }        
        return initialDocument;
    }

    protected async getTextContent(elemHandle: puppeteer.ElementHandle[]): Promise<string> {
        let retStr = '';

        if (elemHandle.length) {
            for (let singleElemHandle of elemHandle) {
                retStr += (await singleElemHandle.evaluate(elem => elem.textContent))?.trim() + ' ';
            }
            return retStr.trim();
        } else {
            return '';
        }
    }

    protected async getTextContentByXpathFromPage(page: puppeteer.Page, xPath: string) {
        const [elm] = await page.$x(xPath);
        if (elm == null) {
            return '';
        }
        let text = await page.evaluate(j => j.textContent, elm);
        return text.replace(/\n/g, ' ');
    }

    getFormattedDate(date: Date) {
        let year: any = date.getFullYear();
        let month: any = (1 + date.getMonth());
        let day: any = date.getDate();
        if (year === NaN || day === NaN || month === NaN) {
            return false;
        }
        month = month.toString().padStart(2, '0');
        day = day.toString().padStart(2, '0');
        return month + '/' + day + '/' + year;
    }

    getNameInfo(document: any, separated_by: string = ' ') {
        const owner = document;
        let first_name = owner['First Name'] || '';
        first_name = first_name.replace(/[^\w|\s]|\s+/gs, ' ').trim();
        let last_name =  owner['Last Name'] || '';
        last_name = last_name.replace(/[^\w|\s]|\s+/gs, ' ').trim();
        let middle_name = owner['Middle Name'] || '';
        middle_name = middle_name.replace(/[^\w|\s]|\s+/gs, ' ').trim();
        let full_name = owner['Full Name'] || '';
        full_name = full_name.replace(/[^\w|\s]|\s+/gs, ' ').trim();
        let owner_name = full_name;
        let owner_name_regexp = '';
        
        if (first_name === '' && last_name === '')  {
            if (full_name !== '') {
                owner_name = full_name;
                last_name = full_name;
            }
        }
        else {
            owner_name = last_name + separated_by + ' ' + first_name;
        }
        owner_name = owner_name.replace(/\s+/g, ' ').trim();

        // regex matches (e.g searching for for KELLY PAIGE):
        // KELLY TAYLOR W & PAIGE E
        // KELLY PAIGE
        // KELLY PAIGE W
        // KELLY TAYLOR W & PAIGE
        // PAIGE W KELLY
        // PAIGE KELLY
        owner_name_regexp = `${owner_name.toUpperCase().split(' ').join(',?(\\s+)?(\\w+)?(\\s+)?')}|${owner_name.toUpperCase().split(' ').reverse().join(',?(\\s+)?(\\w+)?(\\s+)?')}|${owner_name.toUpperCase().split(' ').join(',?(\\s+)?(\\w+)?(\\s+)?(\\w+)?(\\s+)?&?(\\s+)?')}(\\s+)?([a-zA-Z])?$`;
        
        return {
            first_name,
            last_name,
            middle_name,
            full_name,
            owner_name,
            owner_name_regexp
        }
    }

    async getLineItemObject(document: any) {
        const { _id, __v, createdAt, updatedAt, ..._document } = document.toJSON();
        let docToSave: any = {..._document['ownerId'], ..._document['propertyId'], productId: _document['productId']};
        // let owner = await PublicRecordOwner.findOne({'_id': _document['ownerId']}).exec();
        // let property = await PublicRecordProperty.findOne({'_id': _document['propertyId']}).exec();
        // let docToSave: any = { ...owner?.toJSON(), ...property?.toJSON(), productId: _document['productId']};
        // console.log(docToSave);
        if (docToSave.hasOwnProperty('_id'))
            delete docToSave['_id'];
        if (docToSave.hasOwnProperty('__v'))
            delete docToSave['__v'];
        if (docToSave.hasOwnProperty('createdAt'))
            delete docToSave['createdAt'];
        if (docToSave.hasOwnProperty('updatedAt'))
            delete docToSave['updatedAt'];
        return docToSave;
    }

    decideSearchByV2(ownerProductProperty: any) {

        // to know what given county & state
        if((!this.countyMsg) || (!this.stateMsg) || (this.countyMsg == '') || (this.stateMsg == '')){
            if(ownerProductProperty.ownerId){
                this.countyMsg = ownerProductProperty.ownerId['County'];
                this.stateMsg = ownerProductProperty.ownerId['Property State'];
            } else {
                this.countyMsg = ownerProductProperty.propertyId['County'];
                this.stateMsg = ownerProductProperty.propertyId['Property State'];
            }
        }

        // check if the document is already completed with landgrid
        if (ownerProductProperty.propertyId && ownerProductProperty.ownerId){ // both there
            // check if ownerproductproperty processed by landgrid and not failed
            if(ownerProductProperty.processed && ownerProductProperty.consumed){
                console.log("decideSearchByV2 detected completed document by Landgrid:");
                logOpp(ownerProductProperty);
                return false;
            }
        }

        // check the document is searched by address or name
        if (ownerProductProperty.propertyId && ownerProductProperty.propertyId['Property Address']) {
            this.searchBy = 'address';
        }
        else {
            if (ownerProductProperty.ownerId && ownerProductProperty.ownerId['Full Name']) {
                this.searchBy = 'name';
            } else {
                console.log("decideSearchByV2 unexpected document: ");
                logOpp(ownerProductProperty);
                console.log("Insufficient info for Owner and Property");
                return false;
            }
        }
        logOpp(ownerProductProperty);
        return true;
    }

    // Parse address with addressit
    // {
    //   text: '3528 W ORANGE DR PHOENIX 85019-2717',
    //   parts: [],
    //   number: '3528',
    //   street: 'W ORANGE DR',
    //   postalcode: undefined,
    //   regions: [ 'PHOENIX 85019-2717' ] 
    // }
    getAddressV2(document: IProperty): any {
        const full_address = `${document['Property Address']}, ${document['Property City'] || ''}, ${document['Property State'] || ''} ${document['Property Zip'] || ''}`;
        let street_address = AddressService.getParsedAddress(full_address)?.street_address || '';
        let validate = AddressService.validateAddress(street_address);
        if(validate){
            street_address = validate;
        }
        return {
          full_address,
          street_address
        }
    }

    // To check empty or space
    isEmptyOrSpaces(str: string) {
        return str === null || str.match(/^\s*$/) !== null;
    }

    // This is method for saving the data in OwnerProductProperty from property appraisers, without modify the OwnerProductProperty.
    // It takes 2 argument
    // ownerProductProperty is the ownerProductProperty doc
    // dataFromPropertyAppraisers is the data from property appraisers
    async saveToOwnerProductPropertyV2(ownerProductProperty: any, dataFromPropertyAppraisers: any){
        this.last_save_opp_id = await saveToOwnerProductPropertyByConsumer(ownerProductProperty, dataFromPropertyAppraisers, this.searchBy);
        return this.last_save_opp_id;
    }

    ///////////////////////////////////////////////////////////////////////
    // Send Notification   
    ///////////////////////////////////////////////////////////////////////
    async sendMessage(message: string) {
        const snsService = new SnsService();
        let topicName = SnsService.CIVIL_TOPIC_NAME;
        if (! await snsService.exists(topicName)) {
            await snsService.create(topicName);
        }

        if (! await snsService.subscribersReady(topicName, SnsService.CIVIL_UPDATE_SUBSCRIBERS)) {
            await snsService.subscribeList(topicName);
        }
        await snsService.publish(topicName, message);
    }

    ////// get random sleep in one minute //////
    getRandomInt(min: number, max: number) {
        return Math.floor(Math.random() * (max - min) ) + min;
    }
    async sleep(ms: number){
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    protected async randomSleepInOneMinute(){
        let randInt = this.getRandomInt(10000,60000);
        console.log("Sleeping with", randInt, "ms...");
        await this.sleep(randInt);
    }
    protected async randomSleepIn5Sec(){
        let randInt = this.getRandomInt(1000,5000);
        console.log("Sleeping with", randInt, "ms...");
        await this.sleep(randInt);
    }
    protected async randomSleepInOneSec(){
        let randInt = this.getRandomInt(500,1000);
        console.log("Sleeping with", randInt, "ms...");
        await this.sleep(randInt);
    }

    compareStreetAddress(address1: string, address2: string){
        console.log('>>>> Comparing Addresses <<<<');
        console.log(address1);
        console.log(address2);
        // const parse1 = parseaddress.parseLocation(address1.replace(/\s+|\n/g, ' ').trim());
        // const parse2 = parseaddress.parseLocation(address2.replace(/\s+|\n/g, ' ').trim());
        // if(!parse1 || !parse2){
        //     return false;
        // }
        // let flag = false;
        // if(parse1.street && parse2.street){
        //     flag = flag || (parse1.street === parse2.street);
        // }
        // if(parse1.number && parse2.number){
        //     flag = flag && (parse1.number === parse2.number);
        // }
        // if(parse1.prefix && parse2.prefix){
        //     flag = flag && (parse1.prefix === parse2.prefix);
        // }
        // if(parse1.sec_unit_num && parse2.sec_unit_num){
        //     flag = flag && (parse1.sec_unit_num === parse2.sec_unit_num);
        // }
        let flag = AddressService.compareFullAddress(address1, address2);
        console.log(address1,'&',address2, flag);
        return flag;
    }
}