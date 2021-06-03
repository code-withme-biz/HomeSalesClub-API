// config
require('dotenv').config({ path: __dirname + '/./../../.env' });
import { IConfigEnv } from '../iconfig';
import { config as CONFIG } from '../config';
const config: IConfigEnv = CONFIG[process.env.NODE_ENV || 'production'];

// database
import mongoose from 'mongoose';

// schemas
import CategorySchema, { ICategory } from './category';
import ProductSchema, { IProduct } from './product';
import LineItemSchema, {
    ILineItem,
    ILineItemModel
} from './line_item';
import PublicRecordAttributes, {
    IPublicRecordAttributes
} from './public_record_attributes';
import PublicRecordProducerSchema, {
    IPublicRecordProducer
} from './public_record_producer';
import GeoDataSchema, {
    IGeoData
} from './geo_data';
import PropertySchema from './property';
import OwnerSchema from './owner';
import OwnerProductPropertySchema from './owner_product_property';
import LandgridCountySchema, { ILandgridCounty } from './landgrid_refresh';
import LandgridAccountSchema, { ILandgridAccount } from './landgrid_account';
import CountyPrioritySchema, { ICountyPriority } from './county_priority';
import StatusSchema, { IStatus } from './status';
import PurchaseSchema, { IPurchase } from './purchase';

const conn = mongoose.createConnection(config.database_uri, {
    useCreateIndex: true,
    useNewUrlParser: true,
    useFindAndModify: true,
    useUnifiedTopology: true
})

conn.model<ICategory>('Category', CategorySchema);
conn.model<IProduct>('Product', ProductSchema);
const LineItem = conn.model<ILineItem, ILineItemModel>('LineItem', LineItemSchema, 'line_items');
export const PublicRecordLineItem = LineItem.discriminator<IPublicRecordAttributes>('PublicRecordLineItem', PublicRecordAttributes);
conn.model<IPublicRecordProducer>('PublicRecordProducer', PublicRecordProducerSchema, 'public_record_producers');
conn.model<IGeoData>('GeoData', GeoDataSchema, 'geo_data');
export const LandgridCounty = conn.model<ILandgridCounty>('LandgridCounty', LandgridCountySchema, 'landgrid_refresh');
conn.model<ILandgridAccount>('LandgridAccount', LandgridAccountSchema, 'landgrid_accounts');
export const PublicRecordProperty = conn.model('Property', PropertySchema, 'properties');
export const PublicRecordOwner = conn.model('Owner', OwnerSchema);
export const PublicRecordOwnerProductProperty = conn.model('OwnerProductProperty', OwnerProductPropertySchema);
conn.model<ICountyPriority>('CountyPriority', CountyPrioritySchema, 'county_priorities');
export const PublicStatus = conn.model<IStatus>('Status', StatusSchema);
export const Purchase = conn.model<IPurchase>('Purchase', PurchaseSchema);

export default conn;