import OregonCivilProducer from '../oregon_civil_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

export default class CivilProducer extends OregonCivilProducer {
    county = 'Washington';

    constructor(publicRecordProducer: IPublicRecordProducer) {
        super(publicRecordProducer);
    }
}