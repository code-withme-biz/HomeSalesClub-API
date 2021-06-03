import db from '../../models/db'
import { IResponse } from './../../interfaces/api';
import { verifyToken } from '../../services/jwt_service';

export default {
    Query: {
        async geodatas(parent: any, args: any): Promise<any>{
            const token = args['token'];
            const validate: any = await verifyToken(token);
            
            if (validate['valid']) {
                try {
                    const geodatas = db.models.GeoData.find({});
                    return {
                        success: true,
                        data: geodatas
                    }
                }
                catch (error) {
                    return {
                        success: false,
                        error: error.message
                    }
                }
            }
            else {
                return {
                    success: false,
                    error: validate.err
                };
            }
        }
    },
    Mutation: {
        async addGeodata(parent: any, args: any): Promise<IResponse>{
            const { state, state_abbr, zipcode, county, city, token } = args;
            const validate: any = await verifyToken(token);
            
            if (validate['valid']) {
                if (state && state_abbr && zipcode && county && city) {
                    const geodata = {
                        state,
                        state_abbr,
                        zipcode,
                        county,
                        city
                    };
                    try {
                        const result = await db.models.GeoData.create(geodata);
                        return {
                            success: true,
                            data: result,
                        }
                    } catch (error) {
                        return {
                            success: false,
                            error: error.message
                        }
                    }
                }
                return {
                    success: false,
                    error: 'Some Information is emtpy, please check input'
                }
            }
            else {
                return {
                    success: false,
                    error: validate.err
                };
            }
        },
        async updateGeodata(parent: any, args: any): Promise<IResponse> {
            const { id, state, state_abbr, zipcode, county, city, token } = args;
            const validate: any = await verifyToken(token);
            
            if (validate['valid']) {
                if (state && state_abbr && zipcode && county && city) {
                    const geodata = {
                        state,
                        state_abbr,
                        zipcode,
                        county,
                        city
                    };
                    try {
                        const result = await db.models.GeoData.findByIdAndUpdate(id, geodata);
                        return {
                            success: true,
                            data: {
                                state,
                                state_abbr,
                                zipcode,
                                county,
                                city,
                                _id: id
                            }
                        }
                    } catch (error) {
                        return {
                            success: false,
                            error: error.message
                        }
                    }
                }
                return {
                    success: false,
                    error: 'Something went wrong!'
                }
            }
            else {
                return {
                    success: false,
                    error: validate.err
                };
            }
        },
        async deleteGeodata(parent: any, args: any): Promise<IResponse> {
            const { id, token } = args;
            const validate: any = await verifyToken(token);
            
            if (validate['valid']) {
                if (id) {
                    try {
                        const result = await db.models.GeoData.findByIdAndDelete(id);
                        return {
                            success: true,
                            data: {_id: id}
                        }
                    } catch (error) {
                        return {
                            success: false,
                            error: error.message
                        }
                    }
                }
                return {
                    success: false,
                    error: 'Something went wrong!'
                }
            }
            else {
                return {
                    success: false,
                    error: validate.err
                };
            }
        }
    }
}