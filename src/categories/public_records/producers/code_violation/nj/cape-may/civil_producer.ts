import CodeViolationNJ from '../civil_producer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

export default class CivilProducer extends CodeViolationNJ {
    county = 'cape May';
    
    constructor(publicRecordProducer: IPublicRecordProducer) {
        // @ts-ignore
        super(publicRecordProducer);
    }
}