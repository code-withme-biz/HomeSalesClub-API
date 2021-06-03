import db from "../../models/db"
import { createToken } from '../../services/jwt_service';

export default {
    Query: {
        async signin(parent: any, args: any): Promise<any>{
            const email = args['email'];
            const password = args['password'];
            const EMAIL = "gustavo@homesalesclub.com";
            const PASSWORD = "homesalesclub2020";

            const success = (email==EMAIL && password==PASSWORD);
            const token = success ? createToken(email, password) : '';
            const error = success ? '' : 'Email and Password doesn\'t match';

            return {
                success,
                token,
                error
            }
        }
    },
    Mutation: {

    }
}
