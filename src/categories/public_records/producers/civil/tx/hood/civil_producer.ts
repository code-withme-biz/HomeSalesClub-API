import CountyGovernmentRecordsProducer from '../countyGovernmentRecordsProducer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

export default class CivilProducer extends CountyGovernmentRecordsProducer {
     url='https://tx.countygovernmentrecords.com/texas/landrecords/selectCounty.jsp?countyId=190';
     state='TX'
     fullState='Texas';
     county='Hood';
     login='clerk92';
     password='clerk92';
     productCounty='hood';

     constructor(publicRecordProducer: IPublicRecordProducer) {
          // @ts-ignore
          super(publicRecordProducer);
      }
}