require('dotenv').config();

import db from '../models/db';

( async () => {
    await db.models.PublicRecordProducer.updateMany(
        {
            source: [ 'landgrid-property-appraiser-consumer' ]
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