import {
    ApolloServer, gql, ApolloError,
} from 'apollo-server-express';
import resolvers from './graphql/resolvers';
import getSchemaFiles from './graphql/typedefs';
const typeDefs = gql(getSchemaFiles());

export default new ApolloServer({
    typeDefs,
    resolvers,
    playground: true,
    introspection: true // run playground in production
})