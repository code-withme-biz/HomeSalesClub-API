import dayjs from 'dayjs';
import db from './models/db';
import mongoose from 'mongoose';

(async () => {
    
    const allDocs = await db.models.LineItem.find({
        "Last Sale Recording Date": { $exists: true, $ne: "" },
        "Last Sale Recording Date Formatted": { $exists: false }
    }).exec();

    if (allDocs.length) {
        console.log(`Adding date "Last Sale Recording Date Formatted" field for ${allDocs.length} documents.`);
    } else {
        console.log('No documents to add "Last Sale Recording Date Formatted" field to found.')
    }

    for (const doc of allDocs) {
        let recordDate = dayjs(doc["Last Sale Recording Date"]);
        if (recordDate.isValid()) {
            doc["Last Sale Recording Date Formatted"] = recordDate.toDate();
            await doc.save();
        }
    }
    
    console.log('Formatted Date addition process complete.');

    await mongoose.disconnect();
    process.exit();
})();