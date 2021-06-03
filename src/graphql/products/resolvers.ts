import db from '../../models/db'

export default {
    Query: {
        async products(): Promise<any>{
            return db.models.Product.find({});
        }
    },
    Mutation: {

    }
}