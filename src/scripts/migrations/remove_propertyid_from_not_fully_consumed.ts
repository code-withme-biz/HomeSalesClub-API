require('dotenv').config();
import db from '../../models/db';
import { IOwnerProductProperty } from '../../models/owner_product_property';

( async () => {
  
  const handleOpp = async (opp: any) => {
    const checkDuplicate = await db.models.OwnerProductProperty.findOne({ownerId: opp.ownerId, $or: [{propertyId: null}, {propertyId: undefined}], productId: opp.productId}).exec();
    if (checkDuplicate) {
      await opp.remove();
      return true;
    }
    opp.propertyId = null;
    await opp.save();
    return false;
  }

  //@ts-ignore 
  const cursor = db.models.OwnerProductProperty.find({ ownerId: {$ne: null}, propertyId: {$ne: null} }).populate('ownerId propertyId').cursor({batchSize: 20}).addCursorFlag('noCursorTimeout',true);
  let count = 0;
  let total = 0;
  let duplicate = 0;
  for (let opp = await cursor.next(); opp != null; opp = await cursor.next()) {
    // i have validation to ensure either propertyId or ownerId is present, so theoretically this should never happen. However, we did manually remove documents that were junk, thus breaking certain associations
    total++;
    if (opp.propertyId === null) {
      if (await handleOpp(opp)) {
        duplicate++;
        console.log('~~~~ duplicate', duplicate)
      }
      continue;
    }
    const property_type = opp.propertyId['Property Type'];
    console.log(property_type);
    if (opp.ownerId['Full Name'] && (property_type === '' || property_type === null || property_type === undefined)) {
      count++;
      console.log(total + ' / ' + count)      
      if (await handleOpp(opp)) {
        duplicate++;
        console.log('~~~~ duplicate', duplicate)
      }
    }
  }
  console.log('Updated: ', count);
  console.log('Duplicate: ', duplicate)
  process.exit();
})();