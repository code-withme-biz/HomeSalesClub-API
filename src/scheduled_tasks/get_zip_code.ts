require('dotenv').config();
import db from '../models/db';
import { IPublicRecordProducer } from '../models/public_record_producer';
import { IOwnerProductProperty } from '../models/owner_product_property';
import landgridPaConsumer from './consumer_landgrid';
import totalviewConsumer from './consumer_totalview_realestate';
import { launchBrowser, setParamsForPage, clearPage, checkPropertyZipOnOpp, checkPropertyZipOnProperty, sleep, isEmptyOrSpaces } from '../services/general_service';
import { ICountyPriority } from '../models/county_priority';
import AddressService from '../services/address_service';

( async () => {
    
    let condition: any = { source: 'property-appraiser-consumer' };

    const data = await db.models.PublicRecordProducer.aggregate([
        { $match: condition },
        { $lookup: { from: 'county_priorities', localField: 'countyPriorityId', foreignField: '_id', as: 'county_priorities' }},
        { $unwind: "$county_priorities" },
        { $sort: {'county_priorities.priority': 1}}
    ]);
    
    // console.log(data);
    let no_county_pa = false;

    const COUNTY = 'county';
    const LANDGRID = 'landgrid';
    const WHITEPAGES = 'whitepages';
    const REALTOR = 'realtor';
    const ZILLOW = 'zillow';
    const TOTALVIEW = 'totalview';

    let report: any = {
      [COUNTY]: { total: 0, success: 0 },
      [LANDGRID]: { total: 0, success: 0 },
      [WHITEPAGES]: { total: 0, success: 0 },
      [REALTOR]: { total: 0, success: 0 },
      [ZILLOW]: { total: 0, success: 0 },
      [TOTALVIEW]: { total: 0, success: 0 }
    };

    const reportResult = (kind: string, result: boolean) => {
      if (kind !== COUNTY || (kind === COUNTY && !no_county_pa)) 
        report[kind].total++;
      if (result)
        report[kind].success++;
    }

    const consumeByLandgrid = async (publicRecordProducer: IPublicRecordProducer, ownerProductProperty: IOwnerProductProperty) => {
      try {
        let opp = await db.models.OwnerProductProperty.findOne({_id: ownerProductProperty._id});
        return landgridPaConsumer(publicRecordProducer, ownerProductProperty);
      } catch (error) {
        console.log('[ERROR - Landgrid Consumer] - ', error);
        return false;
      }
    }

    if(data.length > 0) {
      const totalview_browser = await launchBrowser();
      const totalview_page = await totalview_browser.newPage();
      await clearPage(totalview_page);
      await setParamsForPage(totalview_page);
      for(const publicRecordProducer of data){
        const state = publicRecordProducer.state.toLowerCase();
        const county = publicRecordProducer.county;

        try{
            const countyPriority: ICountyPriority = await db.models.CountyPriority.findOne({
                county: county,
                state: state.toUpperCase()
            });
            if(countyPriority.priority && countyPriority.priority > 270){
                break;
            }
        } catch(e){
        }
        console.log(`get zip codes: now processing county ${county} in state ${state} at ${new Date()}`);

        const regex = `/${state}/${county}/.*$`;
        const productIds = (await db.models.Product.find({ name: {$regex: new RegExp(regex, 'gm')} })).map( (doc: any) =>  doc._id );

        let date = new Date();
        date.setDate(date.getDate() - 50);

        let condition = {
            productId: {$in: productIds}, 
            processed: true,
            consumed: true,
            ownerId: {$ne: null},
            propertyId: {$ne: null},
            createdAt: {$gte: date},
        };

        let skip = 0;
        let index = 0;
        let consumed = 0;
        console.log('~~ # ~~ # ~~ # ~~ # ~~ # ~~ # ~~ # ~~ # ~~ # ~~ # ~~ # ~~ # ');
        while (true) {
            try {
            index++;
            const opps = await db.models.OwnerProductProperty.find(condition).sort({createdAt: -1}).skip(index-1).limit(1).populate('ownerId propertyId');
            // console.log(opps);
            if(opps.length < 1){
                break;
            }
            const opp = opps[0];
            try {
                if (!opp.ownerId && !opp.propertyId) continue;
                if (!opp.propertyId) continue;
                if(checkPropertyZipOnProperty(opp.propertyId)){
                    continue;
                }
                console.log(opp);

                if(opp.ownerId && opp.ownerId['Mailing Zip'] && (opp.ownerId['Mailing Zip'] != '')){
                  if(AddressService.compareFullAddress(opp.ownerId['Mailing Address'], opp.propertyId['Property Address']) && (opp.ownerId['Mailing State'] == opp.propertyId['Property State'])){
                    opp.propertyId['Property Zip'] = opp.ownerId['Mailing Zip'];
                    if(opp.propertyId['Property City'] && isEmptyOrSpaces(opp.propertyId['Property City'])){
                      opp.propertyId['Property City'] = opp.ownerId['Mailing City'];
                    }
                    await opp.save();
                    let checkZip = await checkPropertyZipOnOpp(opp._id);
                    if(checkZip) { continue; }
                  }
                }

                let checkZip = await checkPropertyZipOnOpp(opp._id);
                if(checkZip) { continue; }

                // landgrid
                console.log('\n\n^_^_^_^_^_^_^_^_ Checking Landgrid PA _^_^_^_^_^_^_^_^');
                let opp_id = await consumeByLandgrid(publicRecordProducer, opp) || opp._id;
                checkZip = await checkPropertyZipOnOpp(opp_id);
                if (checkZip) { consumed++; continue; }

                // totalviewrealestate
                console.log('\n\n^_^_^_^_^_^_^_^_ Checking TotalViewRealEstate _^_^_^_^_^_^_^_^');
                let ret = await totalviewConsumer(opp, totalview_page);
                checkZip = await checkPropertyZipOnOpp(opp_id);
                if (checkZip) { consumed++; continue; }
                
            } catch (error) {
                console.log(error);
            }
            } catch (e) {
                console.log('Problem with cursor ERROR: ', e);
                skip = index;
            }
        }
      }
      await totalview_page.close();
      await totalview_browser.close();
    } else {
        console.log('==============================');
        console.log('no remaining property-appraiser-consumer');
    };
    console.log('end of script!');
    process.exit();
})();