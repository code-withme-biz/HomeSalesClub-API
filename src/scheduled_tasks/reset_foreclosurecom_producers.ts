// cron(50 13 * * ? *)
require('dotenv').config();

import db from '../models/db';

( async () => {
    await db.models.PublicRecordProducer.updateMany(
        {
            source: 'foreclosurecom'
        }, 
        { 
            '$set': 
            { 
                processed: false 
            } 
        }
    );
    process.exit();
})();