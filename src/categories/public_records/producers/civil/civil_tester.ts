import mongoose from 'mongoose';
import db from '../../../../models/db';



// THESE TWO STRINGS ARE ALL THAT NEED TO BE CHANGED FOR TESTING!
let state = 'Texas';
let county = 'Collins';
// EVERYTHING ELSE SHOULD REMAIN AS-IS!




async function fetchProduct(productName: string): Promise<any> {
    const {default: Product} = await import(productName);
    return Product;
}

( async () => {
    let normalizedCounty = county.toLowerCase().replace(/[\-\.]/ig, ' ').replace(/[^A-Z\d\s]/ig, '').replace(/\s+/g, '-');
    let normalizedState = state.toUpperCase().replace(/[\-\.]/ig, ' ').replace(/[^A-Z\d\s]/ig, '').replace(/\s+/g, '-');

    const publicRecordProducer = await db.models.PublicRecordProducer.findOne({ source: 'civil', state: normalizedState, county: normalizedCounty});

    if (!publicRecordProducer) {
        console.warn('State/County not found. Please double-check that these strings are correct!');
    } else {
        try {
            let CivilProducer = await fetchProduct(`./${publicRecordProducer.state}/${publicRecordProducer.county}/civil_producer`);
            await new CivilProducer(publicRecordProducer).startParsing();
        } catch (err) {
            console.warn(err);
        }
    }

    await mongoose.disconnect();
})();
