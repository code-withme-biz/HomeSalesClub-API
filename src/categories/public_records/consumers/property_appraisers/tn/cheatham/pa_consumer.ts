import TennesseePAConsumer from '../tennessee_pa_consumer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';
import puppeteer from 'puppeteer';
export default class CivilProducer extends TennesseePAConsumer {
    county = 'cheatham';
    countyValue = '011';
    
    constructor(publicRecordProducer: IPublicRecordProducer, ownerProductProperties: IOwnerProductProperty, browser: puppeteer.Browser, page: puppeteer.Page) {
        super(publicRecordProducer, ownerProductProperties, browser, page);
    }
}