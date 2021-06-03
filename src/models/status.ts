import mongoose, { Document } from 'mongoose';

export interface IStatus extends Document {
    recaptcha_balance_zero: string;
    createdAt: Date;
    updatedAt: Date;
}

const schema = new mongoose.Schema(
    {
      recaptcha_balance_zero: Boolean
    },
    {
      timestamps: true
    }
);

export default schema;