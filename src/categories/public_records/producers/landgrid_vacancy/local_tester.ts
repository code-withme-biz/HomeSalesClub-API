import LandgridScanner from './refresh_scanner';
import mongoose from 'mongoose';

( async () => {
    await new LandgridScanner().startParsing();
    await mongoose.disconnect();
})();