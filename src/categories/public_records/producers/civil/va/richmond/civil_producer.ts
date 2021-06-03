import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import VirginiaCivilProducer from "../virginia_civil_producer";

export default class CivilProducer extends VirginiaCivilProducer {
    state = 'VA';
    fullState = 'Virginia';
    county = 'Richmond';
    courtNames = ['Richmond County General District Court', 'Richmond-Civil General District Court', 'Richmond Manchester General District Court'];

    constructor(publicRecordProducer: IPublicRecordProducer) {
        // @ts-ignore
        super(publicRecordProducer);
    }
}
