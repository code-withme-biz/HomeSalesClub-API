
import mongoose, { Schema, Model, Document  } from 'mongoose';
import { Parser } from 'json2csv';
import fs from 'fs';
import { formattedDate } from '../core/dateable';
import S3Service from '../services/s3_service';

export interface ILineItem extends Document {
    productId: Schema.Types.ObjectId;
    lastExportedDate: Date;
}

export interface ILineItemModel extends Model<ILineItem> {
    exportToCsv(categoryName: string, productNames: string[], dateRange: string, connection: mongoose.Connection): Promise<string[]>;

    exportAll(lineItems: { [key: string]: any }[]): Promise<boolean>;
} 

const schema = new mongoose.Schema(
    {
        'Full Name': String,
        productId: {
            type: Schema.Types.ObjectId,
            ref: 'Product'//,
            // required: true
        },
        lastExportedDate: Date,
    },
    {
      timestamps: true,
      discriminatorKey: 'kind'
    }
);

// static methods
// TODO: I don't like having to pass the connection in argument list; but mongoose.connection not working
schema.statics.exportToCsv = async function(categoryName: string, productNames: string[], dateRange: string, db: mongoose.Connection): Promise<string[]> {
    return new Promise(async (resolve) => {
        const start = new Date(Date.parse(dateRange.split(' - ')[0]));
        const end = new Date(Date.parse(dateRange.split(' - ')[1]));
        const ObjectId = mongoose.Types.ObjectId;
        const category = await db.models.Category.findOne({ name: categoryName });

        const s3Service = new S3Service(); 
        const bucket: boolean = await s3Service.exists(S3Service.SCRAPER_BUCKET_NAME);
        if(!bucket) {
            await s3Service.create(S3Service.SCRAPER_BUCKET_NAME);
        }

        let product;
        let collection: any[] = [];

        for (const productName of productNames) {
        // cannot use asynchronous forEach here
        // productNames.forEach( async productName => {
            product = await db.models.Product.findOne({ 
                name: productName, 
                categoryId: new ObjectId(category._id) 
            }).exec();

            if(product?._id) {
                collection = await this.find({ 
                    createdAt: { 
                        '$gte' : start,
                        '$lte' : end
                    }, 
                    productId: new ObjectId(product._id)
                }).lean();
            }

            if(collection.length > 0){
                try {
                    const fields = [
                        'Property Address',
                        'Property Unit #',
                        'Property City',
                        'Property State',
                        'Property Zip',
                        'County',
                        'Owner Occupied',
                        'First Name',
                        'Last Name',
                        'Middle Name',
                        'Name Suffix',
                        'Full Name',
                        'Mailing Care of Name',
                        'Mailing Address',
                        'Mailing Unit #',
                        'Mailing City',
                        'Mailing State',
                        'Mailing Zip',
                        'Property Type',
                        'Total Assessed Value',
                        'Last Sale Recording Date',
                        'Last Sale Amount',
                        'Est Value',
                        'Est Equity',
                        'Effective Year Built',
                        'owner_full_name',
                        'yearBuilt',
                        'vacancy',
                        'vacancyDate',
                        'parcel',
                        'descbldg',
                        'listedPrice',
                        'listedPriceType',
                        'practiceType',
                        'Total Open Loans',
                        'Est. Remaining balance of Open Loans',
                        'Tax Lien Year',
                        'vacancyProcessed'
                    ];

                    const opts = { fields };
                    const parser = new Parser(opts);
                    const csv = parser.parse(collection);
                    const filename = `${productName.split('/')[1]}/${productName.split('/')[2]}/${productName.split('/')[3]}-${formattedDate(start)}.csv`;

                    await s3Service.uploadCsv(S3Service.SCRAPER_BUCKET_NAME, filename, csv);
                } catch (e) {
                    console.error('ERROR: ', e);
                }
            }
        }

        resolve(s3Service.uploads);
    });
};

schema.statics.exportAll = async function(lineItems: { [key: string]: any }[]): Promise<boolean> {
    console.log('the line items length: ', lineItems.length);
    return true;
};

// instance methods

// indexes
schema.index({ createdAt: 1 });
schema.index({ productId: 1 }, {});
schema.index({ productId: 1, 'Property Address': 1});

export default schema;