import SeedGenerator from './public_record_seed_generator';
import mongoose from 'mongoose';

(async () => {
    await SeedGenerator.Static.categories();
    await SeedGenerator.Static.products();
    try {
        await SeedGenerator.Static.countyPriorities();
    } catch (err) {
        console.warn(err);
    }
    await SeedGenerator.Static.publicRecordProducers();
    try {
        await SeedGenerator.Static.geoData();
    } catch (err) {
        console.warn(err);
    }
    await SeedGenerator.Static.landgridAccounts();
    await mongoose.disconnect();
})();