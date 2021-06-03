require('dotenv').config();
import db from '../models/db';

( async () => {
    let ownerIds = [];
    let propertyIds = [];

    // Owner
    let cursor: any = await db.models.Owner.find().cursor();
    for (let owner = await cursor.next(); owner != null; owner = await cursor.next()) {
      ownerIds.push(owner._id);
    }
    console.log(`owners: ${ownerIds.length}`);

    // Property
    cursor = await db.models.Property.find().cursor();
    for (let property = await cursor.next(); property != null; property = await cursor.next()) {
      propertyIds.push(property._id);
    }
    console.log(`properties: ${propertyIds.length}`);

    // OwnerProductProperty
    const relations = await db.models.OwnerProductProperty.find({
      $or: [
        {
          $and: [
            {ownerId: {$nin: ownerIds}},
            {ownerId: {$ne: null}}
          ]
        },
        {
          $and: [
            {propertyId: {$nin: propertyIds}},
            {propertyId: {$ne: null}}
          ]
        }
      ]
    }).exec();
    console.log(`relations: ${relations.length}\n${relations}`);

    process.exit();
})();