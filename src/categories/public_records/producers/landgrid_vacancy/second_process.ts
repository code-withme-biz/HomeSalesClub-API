import mongoose from 'mongoose';

import db from '../../../../models/db';
import LandgridCsvDownloader from './csv_downloader';

(async () => {
    let accountDocs = await db.models.LandgridAccount.updateMany({}, { $unset: { pro: 1, remaining_records: 1 } });
    console.log('Account stats reset to base.')
    let csvDownload = await new LandgridCsvDownloader().startParsing();
    console.log('Second process finished. Result: ' + csvDownload);
    await mongoose.disconnect();
})();