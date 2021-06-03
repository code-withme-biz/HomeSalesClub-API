require('dotenv').config();
import db from '../../models/db';
import { IPublicRecordProducer } from '../../models/public_record_producer';
import { ICountyPriority } from '../../models/county_priority';

( async () => {
    const publicRecordProducers: IPublicRecordProducer[] = await db.models.PublicRecordProducer.find({
        source: 'landgrid-property-appraiser-consumer'
    });

    console.log('producer length: ', publicRecordProducers.length);

    for(const producer of publicRecordProducers ) {
        const countyPriority: ICountyPriority = await db.models.CountyPriority.findOne({
            county: producer.county,
            state: producer.state
        });

        producer.countyPriorityId = countyPriority._id;
        const saved = await producer.save();
        console.log('saved producer: ', saved);
    };

    process.exit();
})();