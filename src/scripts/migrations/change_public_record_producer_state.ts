require('dotenv').config();
import db from '../../models/db';
import { stateAbbreviatable } from '../../core/state_abbreviatable';

import { IPublicRecordProducer } from '../../models/public_record_producer';
import { ICountyPriority } from '../../models/county_priority';

( async () => {
    const docs: IPublicRecordProducer[] = await db.models.PublicRecordProducer.find();

    for(const doc of docs) {
        console.log('checking doc state: ', doc.state);
        let abbr: string | undefined = stateAbbreviatable(doc.state);

        if( !(abbr && doc.county) ) {
            continue;
        }

        console.log('the abbreviation: ', abbr);
        console.log('the county: ', doc.county);
        console.log('the doc: ', doc);

        const countyPriority: ICountyPriority | undefined = await db.models.CountyPriority.findOne({ county: doc.county, state: abbr });

        if(countyPriority?._id) {
            doc.state = abbr;
            doc.countyPriorityId = countyPriority._id;
        } else {
            console.log('countyPriority: ', countyPriority);
            throw new Error(`could not find county priority for ${doc.county} ${abbr}`);
        }

        await doc.save();
    }

    process.exit();
})();