require('dotenv').config();

import db from '../models/db';
import ForeclosureSource from '../categories/public_records/producers/foreclosure_source';

( async () => {
    const publicRecordProducer = await db.models.PublicRecordProducer.findOne({ source: 'foreclosurecom', processed: false });
    if(publicRecordProducer) {
        const producer = new ForeclosureSource(publicRecordProducer);
        await producer.startParsing();
    } else {
        console.log('WARNING: no more states to crawl');
    }
    process.exit();
})();