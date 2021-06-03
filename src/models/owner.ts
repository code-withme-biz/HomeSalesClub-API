import mongoose, { Schema, Model, Document  } from 'mongoose';

export interface IOwner extends Document {
    'Full Name': string;
    'First Name': string;
    'Last Name': string;
    'Middle Name': string;
    'Name Suffix': string;
    'Mailing Care of Name': string;
    'Mailing Address': string;
    'Mailing Unit #': string;
    'Mailing City': string;
    'Mailing State': string;
    'Mailing Zip': string;
    'caseUniqueId': string;
    'County': string;
    'Property State': string;
    'Phone': string;
}
export interface IOwnerModel extends Model<IOwner> {
}

const schema = new Schema(
    {
        'Full Name': {
            type: String,
            validate: {
                validator: function(fullName: string) {
                    if (fullName && fullName.replace(/\s+/, '').trim().toUpperCase() === 'NA') return false;
                    return /^[a-z0-9\s,.'-]+$/i.test(fullName);
                },
                message: props => 'Full Name must be valid.'
            },
            required: [true, 'Full Name is required']
            // while First Name and Last Name might not be required, Full Name is always required when saving an Owner. First Name and Last Name will not be present in the case of an LLC owner.
        },
        'First Name': {
            type: String,
            validate: {
                validator: function(firstName: string) {
                    if(firstName) {
                        return /^[a-z\s,.'-]+$/i.test(firstName);
                    }
    
                    return true;
                },
                message: props => 'First Name must be valid.'
            }
        },
        'Last Name': {
            type: String,
            validate: {
                validator: function(lastName: string) {
                    if(lastName) {
                        return /^[a-z0-9\s,.'-]+$/i.test(lastName);
                    }
    
                    return true;
                },
                message: props => 'Last Name must be valid.'
            }
        },
        'Middle Name': String,
        'Name Suffix': String,
        'Mailing Care of Name': String,
        'Mailing Address': String,
        'Mailing Unit #': String,
        'Mailing City': String,
        'Mailing State': String,
        'Mailing Zip': String,
        'caseUniqueId': String,
        'County': {
            type: String,
            validate: {
                validator: function(county: string) {
                    return /^[a-z0-9\s,.'-]+$/g.test(county);
                },
                message: props => 'County must be normalized.'
            },
            required: true,
        },
        'Property State': {
            type: String,
            validate: {
                validator: function(state: string) {
                    return /^[A-Z][A-Z]$/i.test(state) && state.length === 2;
                },
                message: props => 'Property State must be normalized.'
            },
            required: true,
        },
        'Phone': String,
    },
    {
      timestamps: true
    },
);

schema.pre<IOwner>('save', async function(next) {
    next();
});

// do not store partial indexes with empty string values. Store them as nulls. If you store empty string, then property will exist and index will apply
// also make sure to delete any previous indexes if you modify the indexes. Mongoose will not automatically remove old indexes. Log into the mongo shell and run db.collection.getIndexes() to determine which indexes are still lingering.
schema.index({ 
    'Full Name': 1, 
    'Mailing Address': 1,
    'Mailing Unit #': 1,
    'Mailing City': 1,
    'Mailing State': 1,
    'County': 1,
    'Property State': 1
}, { 
    unique: true,
    partialFilterExpression: {
        'Mailing Address': { $exists: true },
        'Mailing Unit #': { $exists: true },
        'Mailing City': { $exists: true },
        'Mailing State': { $exists: true },
    },
});

// indexes
schema.index({ 'Full Name': 1 });
schema.index({ createdAt: 1 });

export default schema;