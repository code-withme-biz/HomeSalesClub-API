import db from '../../models/db';
import { IPublicRecordProducer } from '../../models/public_record_producer';

( async () => {
    const publicRecordProducers: IPublicRecordProducer[] = await db.models.PublicRecordProducer.find({
        source: 'civil',
        county: { $in: ['comal', 'nueces'] },
        state: 'TX'
    });
    
    console.log(publicRecordProducers);
    let removed = 0;
    for(const publicRecordProducer of publicRecordProducers){
        const state = publicRecordProducer.state.toLowerCase();
        const county = publicRecordProducer.county;

        console.log(`remove junk data: now processing county ${county} in state ${state} at ${new Date()}`);

        const regex = `/${state}/${county}/.*$`;
        const productIds = (await db.models.Product.find({ name: {$regex: new RegExp(regex, 'gm')} })).map( (doc: any) =>  doc._id );

        let date = new Date();
        date.setDate(date.getDate() - 60);

        let condition = {
            productId: {$in: productIds}, 
            processed: true,
            consumed: true,
            ownerId: {$ne: null},
            propertyId: {$ne: null},
            createdAt: {$gte: date},
        };

        let index = 0;
        console.log('~~ # ~~ # ~~ # ~~ # ~~ # ~~ # ~~ # ~~ # ~~ # ~~ # ~~ # ~~ # ');
        while (true) {
            try {
                index++;
                const opps = await db.models.OwnerProductProperty.find(condition).sort({createdAt: -1}).skip(index-1).limit(1).populate('ownerId propertyId');
                // console.log(opps);
                if(opps.length < 1){
                    break;
                }
                const opp = opps[0];
                try {
                    if (!opp.ownerId || !opp.propertyId) continue;
                    if(opp.ownerId && opp.ownerId['Full Name'] && !opp.ownerId['Full Name'].match(/\w{2,}/gm)){
                        console.log('Removing:')
                        console.log(opp);
                        await opp.remove();
                        removed++;
                    }
                } catch (error) {
                    console.log(error);
                }
            } catch (e) {
                console.log('Problem with cursor ERROR: ', e);
            }
        }
    }
    console.log('Removed data:', removed);
    process.exit();
})();
