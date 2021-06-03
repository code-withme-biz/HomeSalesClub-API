// cron(50 13 * * ? *)
require('dotenv').config();

import db from '../models/db';
import { countiesWithCsv } from './csv_import_produce'; 

( async () => {
    await db.models.PublicRecordProducer.updateMany(
        {
            source: 'civil'
        }, 
        { 
            '$set': 
            { 
                processed: false 
            } 
        }
    );
    
    // await db.models.PublicRecordProducer.updateMany(
    //     {
    //         source: 'csv-imports',
    //     },
    //     { 
    //         '$set': 
    //         { 
    //             processed: true 
    //         } 
    //     }
    // );

    // for(const state in countiesWithCsv){
    //     for(const county of countiesWithCsv[state]){
    //         await db.models.PublicRecordProducer.updateOne(
    //         {
    //             source: 'csv-imports',
    //             state: state,
    //             county: county
    //         },
    //         {
    //             '$set':
    //             {
    //                 processed: false
    //             }
    //         });
    //     }
    // }

    // console.log('Done');
    process.exit();
})();