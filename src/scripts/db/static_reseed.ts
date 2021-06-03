import SeedGenerator from './public_record_seed_generator';
import mongoose from 'mongoose';

(async () => {
    await SeedGenerator.Static.reseedCategories();
    await SeedGenerator.Static.reseedProducts();
    await SeedGenerator.Static.reseedPublicRecordProducers();
    await SeedGenerator.Static.reseedGeoData();
    await SeedGenerator.Static.reseedCountyPriorities();
    await SeedGenerator.Static.reseedLandgridAccounts();
    await mongoose.disconnect();
})();
