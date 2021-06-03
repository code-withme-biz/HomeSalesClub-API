import NewJerseyPAConsumer from '../new_jersey_pa_consumer';
import puppeteer from 'puppeteer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';

export default class CivilProducer extends NewJerseyPAConsumer {
    county = 'atlantic';
    pa_url = 'https://tax1.co.monmouth.nj.us/cgi-bin/prc6.cgi?&ms_user=monm&passwd=data&srch_type=0&adv=0&out_type=0&district=0100';
    
    constructor(publicRecordProducer: IPublicRecordProducer, ownerProductProperties: IOwnerProductProperty, browser: puppeteer.Browser, page: puppeteer.Page) {
        super(publicRecordProducer, ownerProductProperties, browser, page);
    }
}