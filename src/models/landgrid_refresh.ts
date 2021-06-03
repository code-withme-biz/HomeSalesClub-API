import mongoose, { Document } from 'mongoose';

export interface ILandgridCounty extends Document {
    map_url: string;
    refresh_date: string;
    normalized_county_name: string;
    normalized_state_name: string;
    full_county_name: string;
    full_state_name: string;
    vacancy_records_processed: boolean;
    csv_download_processed: boolean;
    llc_processed: boolean;
    vacancy_records: number;
};

const schema = new mongoose.Schema(
    {
        map_url: {
            type: String,
            required: true
        },
        refresh_date: {
            type: String,
            required: true
        },
        normalized_county_name: {
            type: String,
            required: true
        },
        normalized_state_name: {
            type: String,
            required: true
        },
        full_county_name: String,
        full_state_name: String,
        vacancy_records_processed: {
            type: Boolean,
            required: true
        },
        csv_download_processed: {
            type: Boolean,
            required: true
        },
        llc_processed: {
            type: Boolean,
            required: true
        },
        vacancy_records: Number
    },
);

// indexes
schema.index({ pro: 1 });

export default schema;