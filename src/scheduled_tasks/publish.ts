import db from '../models/db';
import { ILineItemModel } from '../models/line_item';
import { formattedDate } from '../core/dateable';
import SnsService from '../services/sns_service';

const startTime: Date = new Date();
startTime.setHours(0,0,0,0);
const startStr: string = startTime.toUTCString();

const endTime: Date = new Date();
endTime.setHours(23,59,59,999);
const endStr: string = endTime.toUTCString();

let uploads: string[] = [];
( async () => {
    const category = await db.models.Category.findOne({ name: 'public_records'}).exec();

    await db.models.Product.find(
        {
            categoryId: category._id
        }
    ).select('name -_id').exec( async (err, products) => {
        try {
            uploads = await (<ILineItemModel>db.models.LineItem).exportToCsv('public_records', products.map( product => product.name), `${startStr} - ${endStr}`, db);
        } catch (e) {
            console.log('exportToCsv ERROR: ', e);
        }
        
        const snsService = new SnsService();
        let topicName = 'PRODUCTS_TOPIC';
        if(! await snsService.exists(topicName)){
            await snsService.create(topicName);
        }

        if( ! await snsService.subscribersReady(topicName, SnsService.PUBLISH_SUBSCRIBERS)) {
            await snsService.subscribeList(topicName);
        }

        await snsService.publish(topicName, `Products are now published: ${uploads.join(', ')}`);

        process.exit();
    });
})();