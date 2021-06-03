// import AbstractProduct from '../../categories/public_records/abstract_product';
// import ProductFactory from '../product_factory';
import db from '../../models/db';
import { IResponse, ICsvResponse } from './../../interfaces/api';

import { ILineItemModel } from '../../models/line_item';

export default {
    LineItem: {
        __resolveType(lineItem: any, context: any, info: any): string | null{
            if(lineItem.Effective_Year_Built) {
                return 'AuctionLineItem';
            }

            if(lineItem.Address){
                return 'Address'; 
            }
            
            return null;
        }
    },
    Query: {
        async lineItems(parent: any, args: any): Promise<any>{
            return db.models.LineItem.find({});
        },
        async lineItemsCsv(parent: any, args: any): Promise<ICsvResponse>{     
            let success = true;
            let csvPath = '';

            try {
                await (<ILineItemModel>db.models.LineItem).exportToCsv(args['categoryName'], args['productNames'], args['dateRange'], db);
            } catch (e) {
                success = false;
            }
            

            return {
                success: success,
                csvPath: csvPath
            }
        }
    },
    Mutation: {
        async createLineItems(parent: any, args: any): Promise<IResponse>{
            // const products: AbstractProduct[] = ProductFactory.factory(args['categoryName'], args['productNames'], args['dateRange']);

            // products.forEach(product => {
            //     // This does not execute them async!
            //     // dev can use finishScript callback to prevent start twice
            //     product.startParsing(()=> console.log('\nScraping script has finished.\n'));
            // })

            return {
                success: true,
                response: 'processing'
            }
        }
    }
}