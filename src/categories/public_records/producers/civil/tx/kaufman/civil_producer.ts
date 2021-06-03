import CountyGovernmentRecordsProducer from '../countyGovernmentRecordsProducer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

export default class CivilProducer extends CountyGovernmentRecordsProducer {
     url='https://tx.countygovernmentrecords.com/texas/landrecords/selectCounty.jsp?countyId=150';
     state='TX'
     fullState='Texas';
     county='Kaufman';
     login='longman34';
     password='longman34';
     productCounty='kaufman';

     constructor(publicRecordProducer: IPublicRecordProducer) {
          // @ts-ignore
          super(publicRecordProducer);
      }
}