import ArkansasPAConsumer from '../arkansas_pa_consumer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';
import puppeteer from 'puppeteer';

export default class CivilProducer extends ArkansasPAConsumer {
    county = 'sebastian';
    pa_url = 'https://www.arcountydata.com/county.asp?county=Sebastian&directlogin=True';
    
    constructor(publicRecordProducer: IPublicRecordProducer, ownerProductProperties: IOwnerProductProperty, browser: puppeteer.Browser, page: puppeteer.Page) {
        super(publicRecordProducer, ownerProductProperties, browser, page);
    }
}