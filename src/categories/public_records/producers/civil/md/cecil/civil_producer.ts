import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import CivilProducerMD from "../casesearch_md";

export default class CivilProducer extends CivilProducerMD {
    state = 'MD';
    fullState = 'Maryland';
    county = 'cecil';
    fullcounty = 'Cecil';
    
    constructor(publicRecordProducer: IPublicRecordProducer) {
        // @ts-ignore
        super(publicRecordProducer);
    }
}
