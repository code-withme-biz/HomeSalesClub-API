require('dotenv').config();

import db from '../models/db';
import AuctionSource from '../categories/public_records/producers/auction_source';

( async () => {
    const publicRecordProducer = await db.models.PublicRecordProducer.findOne({ source: 'auctioncom', processed: false });

    if(publicRecordProducer) {
        // const sqsService = new SqsService();

        // if(! await sqsService.exists(SqsService.QUEUE_URL)) {
        //    await sqsService.create(SqsService.QUEUE_NAME, {
        //        VisibilityTimeout: (2 * 60).toString(),
        //        MessageRetentionPeriod: (60 * 60 * 24).toString(),
        //        DelaySeconds: '30',
        //        MaximumMessageSize: '262144'
                // ReceiveMessageWaitTimeSeconds: '20',
                // FifoQueue:PendingLineItem 'true',
                // ContentBasedDeduplication: 'false'
        //    });
        // }

        // if(! await sqsService.exists(SqsService.DEAD_LETTER_QUEUE_URL)) {
        //    await sqsService.create(SqsService.DEAD_LETTER_QUEUE_NAME, {});
        //    await sqsService.setAttributes({
        //        Attributes: {
        //         "RedrivePolicy": `{\"deadLetterTargetArn\":\"${SqsService.DEAD_LETTER_QUEUE_ARN}\",\"maxReceiveCount\":\"3\"}`,
        //        },
        //        QueueUrl: SqsService.QUEUE_URL
        //    });
        // }
        
        const producer = new AuctionSource(publicRecordProducer);
        await producer.startParsing();
        process.exit();
    } else {
        console.log('WARNING: no more states to crawl');
        process.exit();
    }
})();