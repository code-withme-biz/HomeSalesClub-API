import _ from 'lodash';
import CategoryResolver from './categories/resolvers';
import LineItemResolver from './line_items/resolvers';
import ProductResolver from './products/resolvers';
import OwnerProductPropertyResolver from './owner_product_properties/resolvers';
import GeodataResolver from './geodata/resolvers';
import AuthResolver from './auth/resolvers';

export default _.merge(
    CategoryResolver,
    LineItemResolver,
    ProductResolver,
    OwnerProductPropertyResolver,
    AuthResolver,
    GeodataResolver
);