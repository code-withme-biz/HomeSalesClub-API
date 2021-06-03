require('dotenv').config();

import db from '../models/db';

( async () => {
    await db.models.PublicRecordProducer.updateMany(
        {
            source: [ 'landgridcom'] 
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