import mongoose, { Schema, Document } from 'mongoose';

export interface IProduct extends Document {
  name: string;
  categoryId: Schema.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new mongoose.Schema(
    {
      name: {
        type: String,
        required: true
      },
      categoryId: {
        type: Schema.Types.ObjectId,
        ref: 'Category',
        required: true
      }
    },
    {
      timestamps: true
    }
);

// indexes
schema.index({ name: 1 }, { unique: true });
schema.index({ categoryId: 1});

export default schema;