require('dotenv').config();

import db from '../models/db';

( async () => {
    await db.models.PublicRecordProducer.updateMany(
        {
            source: 'auctioncom'
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