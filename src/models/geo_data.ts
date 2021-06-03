import mongoose, { Schema, Model, Document  } from 'mongoose';

export interface IGeoData extends Document {
    state_fips: number;
    state: string;
    state_abbr: string;
    zipcode: string;
    county: string;
    city: string;
}

const schema = new mongoose.Schema(
    {
        state_fips: Number,
        state: String,
        state_abbr: String,
        zipcode: String,
        county: String,
        city: String
    },
    {
        timestamps: true
    }
);

// indexes
schema.index({ state: 1, county: 1, zipcode: 1 }, { unique: true });

export default schema;