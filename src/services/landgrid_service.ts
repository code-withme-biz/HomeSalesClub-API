import db from '../models/db';
import { IGeoData } from '../models/geo_data';

export default class LandgridService {
    // async normalizeStateCounty(stateCounty: string[]) {
    //     const state = stateCounty[0];
    //     const county = stateCounty[1];

    //     return [ (await this.abbr(state)), county]
    // }

    normalizeState(state: string): string {
        if(state === 'Dc') {
            return 'District of columbia'
        } else {
            return state;
        }
    }

    normalizeCounty(county: string): string {
        if(county === 'Dc') {
            return 'District of Columbia'
        } else {
            return county;
        }
    }
 
    async abbr(state: string): Promise<string> {
        if(state.includes('-')) {
            state = state.replace('-', ' ');
        }

        const geoState: string = state.charAt(0).toUpperCase() + state.slice(1);
        const geoData: IGeoData = await db.models.GeoData.findOne({ state: this.normalizeState(geoState) });
        return geoData.state_abbr.toLowerCase();
    }

    async zipcodes(state: string, county: string): Promise<string[]> {
        if(state.includes('-')) {
            state = state.replace('-', ' ');
        }
        const geoState: string = state.charAt(0).toUpperCase() + state.slice(1);
        county = county.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('.+');

        const geoDatas: IGeoData[] = await db.models.GeoData.find({
            state: this.normalizeState(geoState),
            county : { $regex: new RegExp(this.normalizeCounty(county)), $options: 'i' }
        });
        
        if (geoDatas === null)
            return [];
        
        return geoDatas.map(geoData => geoData.zipcode.trim());
    }
}