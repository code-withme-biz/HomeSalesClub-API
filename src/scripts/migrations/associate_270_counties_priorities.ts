require('dotenv').config();
import db from '../../models/db';
import { IPublicRecordProducer } from '../../models/public_record_producer';
import { ICountyPriority } from '../../models/county_priority';

( async () => {
    const normalizeStringForMongo = (sourceString: string) => {
        return sourceString.toLocaleLowerCase().replace('_', '-').replace(/[^A-Z\d\s\-]/ig, '').replace(/\s+/g, '-');
    }

    const counties = [
    "Maricopa - AZ",
    "Los Angeles - CA",
    "Clark - NV",
    "San Diego - CA",
    "Riverside - CA",
    "Hillsborough - FL",
    "Miami-Dade - FL",
    "Harris - TX",
    "Palm Beach - FL",
    "Broward - FL",
    "Pinellas - FL",
    "Orange - FL",
    "San Bernardino - CA",
    "Cook - IL",
    "Dallas - TX",
    "Pima - AZ",
    "Wake - NC",
    "Sacramento - CA",
    "Mecklenburg - NC",
    "Suffolk - NY",
    "Tarrant - TX",
    "Fulton - GA",
    "Franklin - OH",
    "Hennepin - MN",
    "Prince George's - MD",
    "Bexar - TX",
    "Lee - FL",
    "Philadelphia - PA",
    "Duval - FL",
    "Orange - CA",
    "Arapahoe - CO",
    "Davidson - TN",
    "Dekalb - GA",
    "Denver - CO",
    "El Paso - CO",
    "Gwinnett - GA",
    "Polk - FL",
    "Baltimore - MD",
    "Cobb - GA",
    "Jefferson - KY",
    "Jefferson - CO",
    "Kern - CA",
    "Pasco - FL",
    "Volusia - FL",
    "Brevard - FL",
    "Fresno - CA",
    "Hamilton - OH",
    "Knox - TN",
    "Nassau - NY",
    "Ocean - NJ",
    "St Louis - MO",
    "Camden - NJ",
    "Multnomah - OR",
    "Shelby - TN",
    "Adams - CO",
    "Anne Arundel - MD",
    "Cuyahoga - OH",
    "Essex - NJ",
    "Greenville - SC",
    "Oklahoma - OK",
    "Collin - TX",
    "Marion - IN",
    "Pierce - WA",
    "Pinal - AZ",
    "Sarasota - FL",
    "Chesterfield - VA",
    "Jefferson - AL",
    "Manatee - FL",
    "Oakland - MI",
    "Ramsey - MN",
    "Seminole - FL",
    "Tulsa - OK",
    "Baltimore - MD",
    "Chatham - GA",
    "Johnson - KS",
    "Kent - MI",
    "Middlesex - NJ",
    "Osceola - FL",
    "Providence - RI",
    "Washington - OR",
    "Wayne - MI",
    "Anoka - MN",
    "Burlington - NJ",
    "DC - DC",
    "Douglas - CO",
    "Fayette - KY",
    "Fort Bend - TX",
    "Lake - FL",
    "Marion - FL",
    "San Joaquin - CA",
    "Union - NJ",
    "Virginia Beach - VA",
    "Williamson - TX",
    "Bucks - PA",
    "Charleston - SC",
    "Collier - FL",
    "Douglas - NE",
    "Durham - NC",
    "Escambia - FL",
    "Forsyth - NC",
    "Harford - MD",
    "Horry - SC",
    "Jackson - MO",
    "Jefferson - LA",
    "Macomb - MI",
    "Mobile - AL",
    "Orleans - LA",
    "Salt Lake - UT",
    "Snohomish - WA",
    "Spokane - WA",
    "St Charles - MO",
    "York - PA",
    "Butler - OH",
    "Contra Costa - CA",
    "Gaston - NC",
    "Hamilton - TN",
    "Henry - GA",
    "King - WA",
    "Madison - AL",
    "Milwaukee - WI",
    "Mohave - AZ",
    "New Castle - DE",
    "New Hanover - NC",
    "Pueblo - CO",
    "Queens - NY",
    "Richland - SC",
    "Rutherford - TN",
    "St Johns - FL",
    "St Lucie - FL",
    "Travis - TX",
    "Washoe - NV",
    "Will - IL",
    "Williamson - TN",
    "York - SC",
    "Ada - ID",
    "Allen - IN",
    "Baldwin - AL",
    "Bay - FL",
    "Cabarrus - NC",
    "Charles - MD",
    "Cherokee - GA",
    "Chesapeake - VA",
    "Clay - FL",
    "Cleveland - OK",
    "Dakota - MN",
    "Dauphin - PA",
    "Denton - TX",
    "Fairfax - VA",
    "Hartford - CT",
    "Kings - NY",
    "Lafayette - LA",
    "Lancaster - NE",
    "Linn - IA",
    "Marion - OR",
    "Monmouth - NJ",
    "Monroe - NY",
    "Okaloosa - FL",
    "Portsmouth - VA",
    "Sarpy - NE",
    "St Louis - MO",
    "Stanislaus - CA",
    "Tulare - CA",
    "Union - NC",
    "Washington - MN",
    "Weber - UT",
    "Weld - CO",
    "Atlantic - NJ",
    "Benton - AR",
    "Bergen - NJ",
    "Canyon - ID",
    "Carroll - GA",
    "Carroll - MD",
    "Clay - MO",
    "Clayton - GA",
    "Clermont - OH",
    "Coweta - GA",
    "Cumberland - PA",
    "El Paso - TX",
    "Fairfield - CT",
    "Frederick - MD",
    "Guilford - NC",
    "Henrico - VA",
    "Houston - GA",
    "Howard - MD",
    "Iredell - NC",
    "Kenton - KY",
    "Lake - IL",
    "Lancaster - PA",
    "Lane - OR",
    "Lexington - SC",
    "Montgomery - MD",
    "Montgomery - OH",
    "Newport News - VA",
    "Norfolk - VA",
    "Onslow - NC",
    "Outagamie - WI",
    "Placer - CA",
    "Polk - IA",
    "Prince William - VA",
    "Santa Rosa - FL",
    "Solano - CA",
    "Spartanburg - SC",
    "St Tammany - LA",
    "Alamance - NC",
    "Alameda - CA",
    "Barrow - GA",
    "Bartow - GA",
    "Beaufort - SC",
    "Benton - WA",
    "Blount - TN",
    "Bradley - TN",
    "Bronx - NY",
    "Brown - WI",
    "Butte - CA",
    "Canadian - OK",
    "Catawba - NC",
    "Charlotte - FL",
    "Chester - PA",
    "Clackamas - OR",
    "Clark - IN",
    "Clark - WA",
    "Columbia - GA",
    "Cumberland - NJ",
    "Dane - WI",
    "Davidson - NC",
    "Deschutes - OR",
    "DeSoto - MS",
    "Dorchester - SC",
    "Douglas - GA",
    "Dupage - IL",
    "Erie - NY",
    "Fayette - GA",
    "Forsyth - GA",
    "Gloucester - NJ",
    "Hall - GA",
    "Hampton - VA",
    "Hendricks - IN",
    "Hernando - FL",
    "Honolulu - HI",
    "Hudson - NJ",
    "Indian River - FL",
    "Johnson - IN",
    "Johnston - NC",
    "Kenosha - WI",
    "Kent - RI",
    "Kootenai - ID",
    "Lehigh - PA",
    "Leon - FL",
    "Linn - OR",
    "Lubbock - TX",
    "Medina - OH",
    "Mesa - CO",
    "Montgomery - TN",
    "New Haven - CT",
    "Northampton - PA",
    "Orange - NY",
    "Paulding - GA",
    "Richmond - VA",
    "Roanoke - VA",
    "Rockdale - GA",
    "Saline - AR",
    "Schenectady - NY",
    "Sevier - TN",
    "Shelby - AL",
    "Sumner - TN",
    "Sussex - DE",
    "Walton - GA",
    "Warren - OH",
    "Washington - PA",
    "Washington - TN"
    ]

    let rank = 1;

    // update county priority collection
    console.log("=== UPDATING COUNTY PRIORITIES COLLECTION ===");
    for(const str of counties) {
        console.log(str, rank);
        const arr = str.split(' - ');
        const county = normalizeStringForMongo(arr[0]);
        const state = arr[1];

        let countyPriorityOld: ICountyPriority = await db.models.CountyPriority.findOne({
            priority: rank
        });
        console.log(countyPriorityOld);
        const countyPriority: ICountyPriority = await db.models.CountyPriority.findOne({
            county: county,
            state: state
        });
        console.log(countyPriority);

        let temp = countyPriority.priority;
        countyPriority.priority = rank;
        const saved = await countyPriority.save();
        console.log('saved countypriority new: ', saved);

        if(countyPriorityOld){
            countyPriorityOld = await db.models.CountyPriority.findOne({
                _id: countyPriorityOld._id
            });
            countyPriorityOld.priority = temp;
            const saved2 = await countyPriorityOld.save();
            console.log('saved countypriority old: ', saved2);
        }
        rank++;
    };

    console.log("=== UPDATING PUBLIC RECORD PRODUCER COLLECTION ===");
    // update public record producer collection
    const publicRecordProducers: IPublicRecordProducer[] = await db.models.PublicRecordProducer.find({countyPriorityId: { $exists : true }});
    for( const producer of publicRecordProducers ) {
        try{
            let county = producer.county;
            let state = producer.state;
            const countyPriority: ICountyPriority = await db.models.CountyPriority.findOne({
                county: county,
                state: state
            });
            producer.countyPriorityId = countyPriority._id;
            const saved = await producer.save();
            console.log('saved producer: ', saved);
        } catch(e){
            continue;
        }
    }

    console.log("=== DONE ===");
    process.exit();
})();