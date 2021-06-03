import { stringList } from 'aws-sdk/clients/datapipeline';
import mongoose, {  Schema, Model, Document } from 'mongoose';

export interface IPublicRecordProducer extends Document {
    source: string;
    state: string;
    county: string;
    city: string;
    offset: string;
    processed: boolean;
    countyPriorityId: Schema.Types.ObjectId;
    csvFetchLastDate: string; // to note last date csv fetch from aws s3
};

const schema = new mongoose.Schema(
    {
        source: {
            type: String,
            required: true
        }, // realtorcom, foreclosurecom, auctiocom, etc.
        state: String,
        county: String,
        city: String,
        offset: String,
        processed: {
            type: Boolean,
            required: true
        },
        countyPriorityId: { // not required since some public record producers only contain state information
            type: Schema.Types.ObjectId,
            ref: 'CountyPriority'
        },
        csvFetchLastDate: String
    },
    {
        timestamps: true
    }
);

// indexes
schema.index({ source: 1, processed: 1 });
schema.index({ countyPriorityId: 1 });

export default schema;