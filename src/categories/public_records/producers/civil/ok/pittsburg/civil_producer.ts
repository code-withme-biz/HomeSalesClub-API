import OklahomaSearchProducer from '../oklahoma_search_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

export default class CivilProducer extends OklahomaSearchProducer {
    state='OK'
    fullState='Oklahoma';
    county='Pittsburg';
    productCounty='pittsburg';
    selectCountyValue='pittsburg'

    constructor(publicRecordProducer: IPublicRecordProducer) {
        // @ts-ignore
        super(publicRecordProducer);
    }
}