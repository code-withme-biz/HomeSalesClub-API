import mongoose, { Schema, Model, Document } from 'mongoose';
import db from '../models/db';
import {IOwner} from './owner';

export interface IProperty extends Document {
    'Property Address': string;
    'Property Unit #': string;
    'Property City': string;
    'Property State': string;
    'Property Zip': string;    
    'County': string;
    'Owner Occupied': boolean;
    'Property Type': string;
    'Total Assessed Value': string;
    'Last Sale Recording Date': string;
    'Last Sale Recording Date Formatted': Date | null;
    'Last Sale Amount': string;
    'Est Value': string;
    'Est Equity': string;
    'Effective Year Built': string;
    'yearBuilt': string;
    'vacancy': string;
    'vacancyDate': Date;
    'parcel': string;
    'descbldg': string;
    'listedPrice': string;
    'listedPriceType': string;
    'listedPrice1': String;
    'listedPriceType1': String;
    'sold': boolean;
    'Sold Date': String;
    'soldAmount': String;
    'improvval': string;
    'll_bldg_footprint_sqft': number;
    'll_bldg_count': number;
    'legaldesc': string;
    'sqft': number;
    'bedrooms': number;
    'bathrooms': number;
    'sqftlot': number;
    'll_gisacre': number;
    'lbcs_activity_desc': string;
    'lbcs_function_desc': string;
    'livingarea': number;
    'assessmentyear': string;
    'assedvalschool': string;
    'assedvalnonschool': string;
    'taxvalschool': number;
    'taxvalnonschool': number;
    'justvalhomestead': number;
    'effyearbuilt': number;
    'practiceType': string;
    'Toal Open Loans': string;
    'Lien Amount': string;
    'Est. Remaining balance of Open Loans': string;
    'Tax Lien Year': string;
    'caseUniqueId': string;
    'propertyFrom': string;
    fillingDate: string;
    vacancyProcessed: boolean;
}

export interface IPropertyModel extends Model<IProperty> {
} 

const schema = new mongoose.Schema(
    {
        'Property Address': {
            type: String,
            required: true
        },
        'Property Unit #': String,
        'Property City': String,
        'Property State': {
            type: String,
            validate: {
                validator: function(state: string) {
                    return /^[A-Z][A-Z]$/g.test(state) && state.length === 2;
                },
                message: props => 'Property State must be normalized.'
            },
            required: true,
        },
        'Property Zip': String,
        'County': {
            type: String,
            validate: {
                validator: function(county: string) {
                    return /^[a-z0-9\s,.'-]+$/i.test(county);
                },
                message: props => 'County must be normalized.'
            },
            required: true,
        },
        'Owner Occupied': Boolean,
        'Property Type': String,
        'Total Assessed Value': String,
        'Last Sale Recording Date': String,
        'Last Sale Recording Date Formatted': Date,
        'Last Sale Amount': String,
        'Est Value': String,
        'Est Equity': String,
        'Effective Year Built': String,
        'yearBuilt': String,
        'vacancy': String,
        'vacancyDate': Date,
        'parcel': String,
        'descbldg': String,
        'listedPrice': String,
        'listedPriceType': String,
        'listedPrice1': String,
        'listedPriceType1': String,
        'sold': Boolean,
        'Sold Date': String,
        'soldAmount': String,
        'improvval': String,
        'll_bldg_footprint_sqft': Number,
        'll_bldg_count': Number,
        'legaldesc': String,
        'sqft': Number,
        'bedrooms': Number,
        'bathrooms': Number,
        'sqftlot': Number,
        'll_gisacre': Number,
        'lbcs_activity_desc': String,
        'lbcs_function_desc': String,
        'livingarea': Number,
        'assessmentyear': String,
        'assedvalschool': String,
        'assedvalnonschool': String,
        'taxvalschool': Number,
        'taxvalnonschool': Number,
        'justvalhomestead': Number,
        'effyearbuilt': Number,
        'practiceType': String,
        'Total Open Loans': String,
        'Lien Amount': String,
        'Est. Remaining balance of Open Loans': String,
        'Tax Lien Year': String,
        'caseUniqueId': String,
        'propertyFrom': String,
        fillingDate: String,
        vacancyProcessed: Boolean,
    },
    {
        timestamps: true,
    }
);

schema.pre<IProperty>('save', async function(next) {
    next();
});

schema.index({ 
    'Property Address': 1, 
    'Property Unit #': 1,
    'Property City': 1,
    'Property Zip': 1,
    'Property State': 1,
    'County': 1
}, { 
    unique: true,
    partialFilterExpression: {
        'Property Unit #': { $exists: true },
        'Property City': { $exists: true },
        'Property Zip': { $exists: true },
    },
});

schema.index({ 'Property Address': 1 });

export default schema;