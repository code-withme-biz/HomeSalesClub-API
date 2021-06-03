import mongoose, { Document } from 'mongoose';

export interface ILandgridAccount extends Document {
    user: string;
    pass: string;
    pro: boolean;
    active: boolean;
    remaining_records: Number;
};

const schema = new mongoose.Schema(
    {
        user: {
            type: String,
            required: true
        },
        pass: {
            type: String,
            required: true
        },
        pro: Boolean,
        active: Boolean,
        remaining_records: Number
    },
);

export default schema;