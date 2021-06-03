import mongoose from 'mongoose';
import LandgridCsvDownloader from './csv_downloader';

(async () => {
    let csvDownload = await new LandgridCsvDownloader().startParsing();
    console.log('Second process finished. Result: ' + csvDownload);
    await mongoose.disconnect();
})();