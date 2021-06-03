require('dotenv').config();

import db from '../models/db';

( async () => {
    await db.models.PublicRecordProducer.updateMany(
        {
            source: [ 'foreclosurecom', 'auctioncom'] // realtorcom
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