import CountyGovernmentRecordsProducer from '../countyGovernmentRecordsProducer';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

export default class CivilProducer extends CountyGovernmentRecordsProducer {
     url='https://tx.countygovernmentrecords.com/texas/landrecords/selectCounty.jsp?countyId=110';
     state='TX'
     fullState='Texas';
     county='Henderson';
     login='hend27';
     password='hend27';
     productCounty='henderson';

     constructor(publicRecordProducer: IPublicRecordProducer) {
          // @ts-ignore
          super(publicRecordProducer);
      }
}