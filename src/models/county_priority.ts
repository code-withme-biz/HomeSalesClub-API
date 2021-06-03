import mongoose, { Schema, Model, Document  } from 'mongoose';

export interface ICountyPriority extends Document {
    _id: Schema.Types.ObjectId;
    city: string;
    county: string;
    state: string;
    priority: number
}

const schema = new mongoose.Schema(
    {
        city: String,
        county: {
            type: String,
            required: true,
        },
        state: {
            type: String,
            required: true,
        },
        priority: {
            type: Number,
            required: true
        },
    },
    {
        timestamps: true
    }
);

// indexes
schema.index({ county: 1, state: 1 }, { unique: true });
schema.index({ priority: 1 });

export default schema;