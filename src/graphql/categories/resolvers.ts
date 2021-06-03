import db from '../../models/db'

export default {
    Query: {
        async categories(): Promise<any>{
            return db.models.Category.find({});
        }
    },
    Mutation: {

    }
}