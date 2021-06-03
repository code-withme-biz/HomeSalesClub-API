import CodeViolationNJ from '../civil_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

export default class CivilProducer extends CodeViolationNJ {
    county = 'monmouth';
    
    constructor(publicRecordProducer: IPublicRecordProducer) {
        // @ts-ignore
        super(publicRecordProducer);
    }
}