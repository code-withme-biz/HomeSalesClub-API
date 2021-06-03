require('dotenv').config();
import db from '../../models/db';
import { hasLastSaleRecordDate, getFormattedDate, sleep } from '../../services/general_service';
( async () => {
    let total =0;
    let index = 0;
    let count = 0;
    // let condition = {
        // ownerId: {$ne: null},
        // propertyId: {$ne: null},
    // }
    // check properties
    //@ts-ignore 
    // const cursor_property = db.models.Property.find().cursor({batchSize: 20}).addCursorFlag('noCursorTimeout',true);
    // total = await db.models.Property.find().count();
    // for (let property = await cursor_property.next(); property != null; property = await cursor_property.next()) {
    //     index++;
    //     let lastsaledate = property['Last Sale Recording Date'];
    //     if (lastsaledate) {
    //         if (hasLastSaleRecordDate(lastsaledate)) {
    //             let date = new Date(lastsaledate);
    //             property['Last Sale Recording Date'] = getFormattedDate(date);
    //             count++;
    //         } else {
    //             property['Last Sale Recording Date'] = '';
    //         }
    //         await property.save();
    //     }
    //     console.log(`Update Property: ${total} / ${index} / ${count}`);
    // }


    let condition = {
        // propertyId: {$ne: null},
        // ownerId: {$ne: null},
        // processed: {$exists: false},
        // consumed: {$exists: false},
        // updatedAt: {$}
    }
    //@ts-ignore 
    const cursor = db.models.OwnerProductProperty.find(condition).skip(2306679).populate('ownerId propertyId').cursor({batchSize: 20}).addCursorFlag('noCursorTimeout',true);
    total = await db.models.OwnerProductProperty.find(condition).skip(2306679).count();
    index = 0;
    let count1 = 0;
    let count2 = 0;
    for (let opp = await cursor.next(); opp != null; opp = await cursor.next()) {
        try {
            index++;
            if (!opp.ownerId && !opp.propertyId) {
                await opp.remove();
                count1++;
            }
            else {
                let flag = false;
                if (opp.ownerId && opp.propertyId) {
                    if (!opp.processed) {
                        opp.processed = true;
                        flag = true;
                    }
                    if (!opp.consumed) {
                        let consumed = hasLastSaleRecordDate(opp.propertyId['Last Sale Recording Date']) || !!(opp.propertyId['yearBuilt'] && opp.propertyId['yearBuilt'].match(/\d/) !== null);
                        if (consumed) {
                            flag = true;
                            opp.consumed = consumed;
                            count2++;
                        }
                    }
                    // if (opp.ownerId['Mailing Address'] && opp.ownerId['Mailing Address'].match(/po\s+box/i)) {
                    //     if (opp.ownerId['Property Address']) {
                    //         opp.ownerId['Mailing Address'] = opp.propertyId['Property Address'] || '';
                    //         opp.ownerId['Mailing Unit #'] = opp.propertyId['Property Unit #'] || '';
                    //         opp.ownerId['Mailing City'] = opp.propertyId['Property City'] || '';
                    //         opp.ownerId['Mailing State'] = opp.propertyId['Property State'] || '';
                    //         opp.ownerId['Mailing Zip'] = opp.propertyId['Property Zip'] || '';
                    //         flag = true;
                    //     }
                    // }
                }
                if (flag) await opp.save();
            }
            
            console.log(`${opp._id} ${total} /Index: ${index} / Removed: ${count1} /Consumed: ${count2}`);
        } catch (e) { console.log(e); }
    }

    // index = 0;
    // let count1 = 0;
    // let count2 = 0;
    // //@ts-ignore
    // const properties = await db.models.Property.find({"Property Address": /^\D/});
    // const propertyids = properties.map((p:any) => p._id);
    // // console.log(await db.models.OwnerProductProperty.find({propertyId: {$in: propertyids}}).count());
    // // await db.models.OwnerProductProperty.deleteMany({propertyId: {$in: propertyids}})
    // //@ts-ignore 
    // const cursor = db.models.OwnerProductProperty.find({propertyId: {$in: propertyids}}).cursor({batchSize: 20}).addCursorFlag('noCursorTimeout',true);
    // for (let opp = await cursor.next(); opp != null; opp = await cursor.next()) {
    //     await opp.remove();
    //     index++;
    //     console.log(`${total} / ${index}`);
    // }
    // await db.models.Property.deleteMany({_id: {$in: propertyids}})

    // // total = await db.models.Property.find({"Property Address": /^\D/}).count();
    // // for (let property = await cursor.next(); property != null; property = await cursor.next()) {
    // //     index++;
    // //     count = await db.models.OwnerProductProperty.find({propertyId: property._id}).count();
    // //     console.log(`${total} / ${index} / ${count} / ${count1}`);
    // //     if (count > 7) {
    // //         count1 += count;
    // //         // await db.models.OwnerProductProperty.deleteMany({propertyId: property._id});
    // //         // await property.remove();
    // //     }
    // // }
    // console.log(count1);

    console.log('Finished')
    process.exit();
})();