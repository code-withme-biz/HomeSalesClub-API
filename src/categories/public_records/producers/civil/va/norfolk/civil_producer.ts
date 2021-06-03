import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import VirginiaCivilProducer from "../virginia_civil_producer";

export default class CivilProducer extends VirginiaCivilProducer {
    state = 'VA';
    fullState = 'Virginia';
    county = 'Norfolk';
    courtNames = ['Norfolk General District Court', 'Norfolk General District-Civil Division'];

    constructor(publicRecordProducer: IPublicRecordProducer) {
        // @ts-ignore
        super(publicRecordProducer);
    }
}