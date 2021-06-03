import WisconsinSearchProducer from '../wisconsin_search_producer';
import {IPublicRecordProducer} from "../../../../../../models/public_record_producer";

export default class CivilProducer extends WisconsinSearchProducer {

    state = 'WI';
    stateFull = 'Wisconsin'
    countyId = 13;
    county = 'Dane';

    constructor(publicRecordProducer: IPublicRecordProducer) {
        // @ts-ignore
        super(publicRecordProducer);
    }

}