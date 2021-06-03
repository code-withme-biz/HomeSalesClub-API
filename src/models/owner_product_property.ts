import mongoose, { Schema, Model, Document  } from 'mongoose';
import { IOwner } from './owner';
import { IProperty } from './property';
import { IProduct } from './product';

export interface IOwnerProductProperty extends Document {
    ownerId: IOwner;
    propertyId: IProperty;
    productId: IProduct;
    processed: boolean;
    consumed: boolean;
    count: number;
};

export interface IOwnerProductPropertyModel extends Model<IOwnerProductProperty> {
};

// the relationship should not be created UNTIL we have an owner, property and product! Once we have that, then we can mark the relationship as unique
const schema = new Schema(
    {
        ownerId: {
            type: Schema.Types.ObjectId,
            ref: 'Owner',
            required: function(this: IOwnerProductProperty) {
                this.propertyId === null;
            }
        },
        propertyId: {
            type: Schema.Types.ObjectId,
            ref: 'Property',
            required: function(this: IOwnerProductProperty) {
                this.ownerId === null;
            }
        },
        productId: {
            type: Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },
        originalDocType: String,
        processed: Boolean,
        consumed: Boolean,
        fillingDate: String,
        csvFillingDate: String,
        csvCaseNumber: String,
        sourceId: Number,
        codeViolationId: Number,
        count: {
            type: Number,
            default: 0
        }
    },
    {
        collection: 'owner_product_properties',
        timestamps: true
    }
);

schema.index({ 
    ownerId: 1, 
    propertyId: 1,
    productId: 1
}, { unique: true, partialFilterExpression: { propertyId: { $exists:true }, ownerId: { $exists:true }} });

schema.index({
    createdAt: 1,
    ownerId: 1,
    propertyId: 1,
    productId: 1
})

export default schema;