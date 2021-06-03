import mongoose, { Document } from 'mongoose';

export interface IPurchase extends Document {
    state: string;
    county: string;
    key: string;
    price: string;
    title: string;
    upload_date: string;
}

const schema = new mongoose.Schema(
    {
      state: String,
      county: String,
      price: String,
      title: String,
      upload_date: String
    },
    {
      timestamps: true
    }
);

export default schema;