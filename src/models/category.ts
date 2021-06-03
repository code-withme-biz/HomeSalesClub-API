import mongoose, { Document } from 'mongoose';

export interface ICategory extends Document {
    name: string;
    createdAt: Date;
    updatedAt: Date;
}

const schema = new mongoose.Schema(
    {
      name: {
        type: String,
        required: true
      }
    },
    {
      timestamps: true
    }
);

// indexes
schema.index({ name: 1 }, { unique: true });

export default schema;