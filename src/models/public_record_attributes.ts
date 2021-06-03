import mongoose, { Schema } from 'mongoose';
import { ILineItem } from './line_item';

export interface IPublicRecordAttributes extends ILineItem {
    'caseUniqueId': string,
    'Property Address': string;
    'Property Unit #': string;
    'Property City': string;
    'Property State': string;
    'Property Zip': string;
    'County': string;
    'Owner Occupied': boolean;
    'First Name': string;
    'Last Name': string;
    'Middle Name': string;
    'Name Suffix': string;
    'Full Name': string;
    'Mailing Care of Name': string;
    'Mailing Address': string;
    'Mailing Unit #': string;
    'Mailing City': string;
    'Mailing State': string;
    'Mailing Zip': string;
    'Property Type': string;
    'Total Assessed Value': string;
    'Last Sale Recording Date': string;
    'Last Sale Recoding Date Formatted': Date;
    'Last Sale Amount': string;
    'Est Value': string;
    'Est Equity': string;
    'Effective Year Built': string;
    owner_full_name: string;
    yearBuilt: string;
    vacancy: string;
    vacancyDate: string;
    fillingDate: string;
    parcel: string;
    descbldg: string;
    listedPrice: string;
    listedPriceType: string;

    improvval: string;
    ll_bldg_footprint_sqft: number;
    ll_bldg_count: number;
    legaldesc: string;
    sqft: number;
    ll_gisacre: number;
    lbcs_activity_desc: string;
    lbcs_function_desc: string;
    livingarea: number;
    assessmentyear: string;
    assedvalschool: string;
    assedvalnonschool: string;
    taxvalschool: number;
    taxvalnonschool: number;
    justvalhomestead: number;
    effyearbuilt: number;

    practiceType: string;
    'Total Open Loans': string;
    'Lien Amount': string;
    'Est. Remaining balance of Open Loans': string;
    'Tax Lien Year': string;
    vacancyProcessed: boolean;

    // schema update specific properties
    newSchemaProcessed: boolean;
    schemaUpdateFailReason: string;
}

const schema: Schema = new mongoose.Schema(
    {
        'caseUniqueId': String,
        'Property Address': String,
        'Property Unit #': String,
        'Property City': String,
        'Property State': {
            type: String,
            required: true
        },
        'Property Zip': String,
        'County': {
            type: String,
            required: true
        },
        'Owner Occupied': Boolean,
        'First Name': String,
        'Last Name': String,
        'Middle Name': String,
        'Name Suffix': String,
        'Full Name': String,
        'Mailing Care of Name': String,
        'Mailing Address': String,
        'Mailing Unit #': String,
        'Mailing City': String,
        'Mailing State': String,
        'Mailing Zip': String,
        'Property Type': String,
        'Total Assessed Value': String,
        'Last Sale Recording Date': String,
        'Last Sale Recording Date Formatted': Date,
        'Last Sale Amount': String,
        'Est Value': String,
        'Est Equity': String,
        'Effective Year Built': String,
        owner_full_name: String,
        yearBuilt: String,
        vacancy: String,
        vacancyDate: String,
        fillingDate: String,
        parcel: String,
        descbldg: String,
        listedPrice: String,
        listedPriceType: String,

        // extra useful property fields from LandGrid
        improvval: String,
        ll_bldg_footprint_sqft: Number,
        ll_bldg_count: Number,
        legaldesc: String,
        sqft: Number,
        ll_gisacre: Number,
        lbcs_activity_desc: String,
        lbcs_function_desc: String,
        livingarea: Number,
        assessmentyear: String,
        assedvalschool: String,
        assedvalnonschool: String,
        taxvalschool: Number,
        taxvalnonschool: Number,
        justvalhomestead: Number,
        effyearbuilt: Number,

        practiceType: String,
        'Total Open Loans': String,
        'Lien Amount': String,
        'Est. Remaining balance of Open Loans': String,
        'Tax Lien Year': String,
        vacancyProcessed: Boolean,
        unprocessableEntiy: Boolean,
        // schema update specific properties
        newSchemaProcessed: Boolean,
        schemaUpdateFailReason: String,

    },
    {
        discriminatorKey: 'kind'
    }
)

schema.index({ createdAt: 1 });
schema.index({ 'Property Address': 1, 'Full Name': 1, 'Property Zip': 1 });

export default schema;