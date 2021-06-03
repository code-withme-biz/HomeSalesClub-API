require('dotenv').config();
// import { SQS } from 'aws-sdk';
// import SqsService from './services/sqs_service';
import db from '../models/db';
import { IPublicRecordProducer } from '../models/public_record_producer';
import { IOwnerProductProperty } from '../models/owner_product_property';
import whitepagesConsumer from '../categories/public_records/consumers/whitepages_consumer';

const state: string = process.argv[2];
const county: string = process.argv[3];
const practiceType: string = process.argv[4];

async function fetchProduct(productName: string): Promise<any> {
    const {default: Product} = await import(productName);
    return Product;
}

(async () => {

    if (state && county) {
        await db.models.PublicRecordProducer.updateMany(
            {
                source: 'landgrid-property-appraiser-consumer' 
            }, 
            {  
                $set: { processed: true }
            }
        );
    
        await db.models.PublicRecordProducer.updateOne(
            {
                source: 'landgrid-property-appraiser-consumer',
                state: state.toUpperCase(),
                county: county
            }, 
            {  
                $set: { processed: false }
            }
        );
    }

    const data = await db.models.PublicRecordProducer.aggregate([
        { $match: { source: 'landgrid-property-appraiser-consumer', processed: false  } },
        { $lookup: { from: 'county_priorities', localField: 'countyPriorityId', foreignField: '_id', as: 'county_priorities' }},
        { $unwind: "$county_priorities" },
        { $sort: {'county_priorities.priority': 1}}
    ]).limit(1);

    console.log(data);
    if(data.length > 0) {
        const publicRecordProducer: IPublicRecordProducer = await db.models.PublicRecordProducer.findOneAndUpdate({ _id: data[0]['_id'] }, { processed: true }); 

        const state = publicRecordProducer.state.toLowerCase();
        const county = publicRecordProducer.county;        
        console.log(`whitepages-pa-consumer: now processing county ${county} in state ${state} at ${new Date()}`);

        const regex = practiceType ? `/${state}/${county}/${practiceType}` : `/${state}/${county}/((?!other).)*$`;
        const productIds = (await db.models.Product.find({ name: {$regex: new RegExp(regex, 'gm')} })).map( (doc: any) =>  doc._id );

        let date = new Date();
        date.setDate(date.getDate() - 30);
        // at the moment we cannot use cursors because we are loading all data before navigating to website
        let condition = { 
            $or: [
                {ownerId: null},
                {propertyId: null}
            ],
            productId: {$in: productIds}
        };
        // @ts-ignore
        const cursor = db.models.OwnerProductProperty.find(condition).populate('ownerId propertyId').cursor({batchSize: 20}).addCursorFlag('noCursorTimeout',true);
        const total = await db.models.OwnerProductProperty.find(condition).count();
        let index = 0;
        for (let opp = await cursor.next(); opp != null; opp = await cursor.next()) {
            index++;
            console.log(total, index);
            if (opp.ownerId === null && opp.propertyId === null) {
                console.log(opp._id);
                // await opp.remove();
                continue;
            }
            try {
                // let result = await whitepagesConsumer(opp);
                // console.log(total, index, result);
            } catch (e) {
                console.log('county_property_appraiser_consume ERROR: ', e);
            }
        }
    } else {
        console.log('==============================');
        console.log('no remaining property-appraiser-consumer');
    };

    process.exit();
})();