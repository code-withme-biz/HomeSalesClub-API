require('dotenv').config();
import db from '../../models/db';
import { stateAbbreviatable } from '../../core/state_abbreviatable';

import { IProduct } from '../../models/product';

( async () => {
    const docs: IProduct[] = await db.models.Product.find();

    for(const doc of docs) {
        const parts = doc.name.split('/');
        if(parts[1].length > 2 ) {
            const name: string = `/${stateAbbreviatable(parts[1])?.toLowerCase()}/${parts[2]}/${parts[3]}`;
            console.log('name update: ', name);
            doc.name = name;
            await doc.save();
        }
    }

    process.exit();
})();