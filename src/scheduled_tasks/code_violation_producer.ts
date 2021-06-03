require('dotenv').config();
import db from '../models/db';
import { IPublicRecordProducer } from '../models/public_record_producer';
import AbstractProducer from '../categories/public_records/producers/abstract_producer';

const state: string = process.argv[2];
const county: string = process.argv[3];
const refetch: boolean = process.argv[4] === 'true';

async function fetchProduct(productName: string): Promise<any> {
    const {default: Product} = await import(productName);
    return Product;
}

( async () => {

    if (state && county) {
        await db.models.PublicRecordProducer.updateMany(
            {
                source: 'code-violation' 
            }, 
            {  
                $set: { processed: true }
            }
        );
    
        await db.models.PublicRecordProducer.updateOne(
            {
                source: 'code-violation',
                state: state.toUpperCase(),
                county: county
            }, 
            {  
                $set: { processed: false }
            }
        );
    }

    // use findOneAndUpdate for atomic operation since multiple tasks run in parallel and we don't want to tasks pulling the same public record producer
    const publicRecordProducer: IPublicRecordProducer = await db.models.PublicRecordProducer.findOneAndUpdate({ source: 'code-violation', processed: 'false' }, { processed: true });
    
    if (publicRecordProducer) {
        const state = publicRecordProducer.state.toLowerCase();
        const county = publicRecordProducer.county;
        let civilProducer: any;
        try {
            civilProducer = await fetchProduct(`../categories/public_records/producers/code_violation/${state}/${county}/civil_producer`);
        } catch(e) {
            console.log(`cannot find code-violation covil producer state: ${state} county: ${county}`);
        }
        if(civilProducer) {
            console.log(`now processing 'county: ' ${county} in state: ${state} at ${new Date()}`);
            console.log('refetch = ', refetch);
            console.log(publicRecordProducer);
            await new civilProducer(publicRecordProducer, refetch).startParsing();
        } else {
            // await AbstractProducer.sendMessage(publicRecordProducer.county, publicRecordProducer.state, 0, 'Code Violation', '', true);
        }
    } else {
        console.log('==============================');
        console.log('no remaining code-violation producers');
    }

    console.log('>>>>> end <<<<<')
    process.exit();
})();