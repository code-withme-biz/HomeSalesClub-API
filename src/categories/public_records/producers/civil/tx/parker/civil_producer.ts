import CountyGovernmentRecordsProducer from '../countyGovernmentRecordsProducer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

export default class CivilProducer extends CountyGovernmentRecordsProducer {
     url='https://tx.countygovernmentrecords.com/texas/landrecords/selectCounty.jsp?countyId=260';
     state='TX'
     fullState='Texas';
     county='Parker';
     login='parker87';
     password='parker87';
     productCounty='parker';

     constructor(publicRecordProducer: IPublicRecordProducer) {
          // @ts-ignore
          super(publicRecordProducer);
      }
}