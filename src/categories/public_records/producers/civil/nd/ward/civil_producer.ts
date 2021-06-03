import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import CivilProducerMD from "../casesearch_nd";

export default class CivilProducer extends CivilProducerMD {
    state = 'ND';
    fullState = 'North Dakota';
    county = 'ward';
    
    constructor(publicRecordProducer: IPublicRecordProducer) {
        // @ts-ignore
        super(publicRecordProducer);
    }
}
