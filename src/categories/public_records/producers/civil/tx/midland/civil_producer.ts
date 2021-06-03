import PublicSearchUsProducer from "../../publicsearch_us_producer";
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

export default class CivilProducer extends PublicSearchUsProducer {
    url = 'https://midland.tx.publicsearch.us/';
    state = 'TX';
    fullState = 'texas';
    county = 'midland';

    constructor(publicRecordProducer: IPublicRecordProducer) {
        // @ts-ignore
        super(publicRecordProducer);
    }
}
