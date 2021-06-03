require('dotenv').config();
// import { SQS } from 'aws-sdk';
// import SqsService from './services/sqs_service';
import db from '../models/db';
import puppeteer from 'puppeteer';
import { IPublicRecordProducer } from '../models/public_record_producer';
import { IOwnerProductProperty } from '../models/owner_product_property';
import landgridPaConsumer from './consumer_landgrid';
import realtorConsumer from './consumer_realtor';
import zillowConsumer from './consumer_zillow';
import totalviewConsumer from './consumer_totalview_realestate';
import whitepagesConsumer from '../categories/public_records/consumers/whitepages_consumer';
import { config as CONFIG } from '../config';
import { IConfigEnv } from '../iconfig';
const config: IConfigEnv = CONFIG[process.env.NODE_ENV || 'production'];
import SnsService from '../services/sns_service';
import { hasLastSaleRecordDate, launchBrowser, setParamsForPage, clearPage } from '../services/general_service';

const state: string = process.argv[2];
const county: string = process.argv[3];
const practiceType: string = process.argv[4];

async function fetchProduct(productName: string): Promise<any> {
  try {
    const {default: Product} = await import(productName);
    return Product;
  } catch (error) {
    return null;
  }
}

(async () => {
    let no_county_pa = false;

    ///////////////////////////////////////////////////////////////////////
    // Send Notification   
    ///////////////////////////////////////////////////////////////////////
    const sendMessage = async (county: string, state: string, total: number, consumed: number, report: any, sourceType: string) => {
      const snsService = new SnsService();
      let topicName = SnsService.CONSUMER_TOPIC_NAME;
      if (! await snsService.exists(topicName)) {
          await snsService.create(topicName);
      }

      if (! await snsService.subscribersReady(topicName, SnsService.CIVIL_UPDATE_SUBSCRIBERS)) {
          await snsService.subscribeList(topicName);
      }
      let content = 
      ` ============= Consuming Report of ${county}, ${state} =============
        Processed: ${total}
        Consumed:  ${consumed}
        Rate:      ${total === 0 ? 0 : (consumed/total*100).toFixed(2)}%
        County_PA:       ${report[COUNTY].total} / ${report[COUNTY].success}
        Landgrid_PA:     ${report[LANDGRID].total} / ${report[LANDGRID].success}
        WhitePages:      ${report[WHITEPAGES].total} / ${report[WHITEPAGES].success}
        Realtor:         ${report[REALTOR].total} / ${report[REALTOR].success}
        Zillow:          ${report[ZILLOW].total} / ${report[ZILLOW].success}
        TotalView:       ${report[TOTALVIEW].total} / ${report[TOTALVIEW].success}
      `;
      await snsService.publish(topicName, content);
    }

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

    const processOpp = async (_id: any) => {
      let ownerProductProperty = await db.models.OwnerProductProperty.findOne({_id}).populate('ownerId propertyId');
      if (ownerProductProperty.propertyId && ownerProductProperty.ownerId) {
        let flag = false;
        if (!ownerProductProperty.processed) {
          ownerProductProperty.processed = true;
          flag = true;
        }
        if (!ownerProductProperty.consumed && hasLastSaleRecordDate(ownerProductProperty.propertyId['Last Sale Recording Date'])) {
          ownerProductProperty.consumed = true;
          flag = true;
        }
        if (flag) await ownerProductProperty.save();
      } else {
        ownerProductProperty.processed = false;
        ownerProductProperty.consumed = false;
        await ownerProductProperty.save();
      }
      return ownerProductProperty;
    }

    const consumeByCountyPA = async (publicRecordProducer: IPublicRecordProducer, ownerProductProperty: IOwnerProductProperty, browser: puppeteer.Browser, page: puppeteer.Page) => {
      try {
        const state = publicRecordProducer.state.toLowerCase();
        const county = publicRecordProducer.county;
        if (state === 'ca') {
          console.log('No County Property Appraiser Script!!!');
          no_county_pa = true;
          return false;
        }

        const Product: any = await fetchProduct(`../categories/public_records/consumers/property_appraisers/${state}/${county}/pa_consumer`);
        if (!Product || typeof Product !== 'function') {
          no_county_pa = true;
          console.log('No County Property Appraiser Script!!!');
          return false;
        }
        return await new Product(publicRecordProducer, ownerProductProperty, browser, page).startParsing();
      } catch (error) {
        console.log('[ERROR - County Consumer] - ', error);
        return false;
      }
    }

    const consumeByLandgrid = async (publicRecordProducer: IPublicRecordProducer, ownerProductProperty: IOwnerProductProperty) => {
      try {
        let opp = await db.models.OwnerProductProperty.findOne({_id: ownerProductProperty._id});
        if (opp.processed) return true;
        return landgridPaConsumer(publicRecordProducer, ownerProductProperty);
      } catch (error) {
        console.log('[ERROR - Landgrid Consumer] - ', error);
        return false;
      }
    }

    // if (state && county) {
    //   await db.models.PublicRecordProducer.updateMany(
    //       {
    //           source: 'property-appraiser-consumer' 
    //       }, 
    //       {  
    //           $set: { processed: true }
    //       }
    //   );
  
    //   await db.models.PublicRecordProducer.updateOne(
    //       {
    //           source: 'property-appraiser-consumer',
    //           state: state.toUpperCase(),
    //           county: county
    //       }, 
    //       {  
    //           $set: { processed: false }
    //       }
    //   );
    // }
  
    let condition: any = { source: 'property-appraiser-consumer' };
    if (state && county) {
      condition = {
        ...condition,
        state: state.toUpperCase(),
        county: county
      };
    } else {
      condition = {
        ...condition,
        processed: false
      }
    }

    const data = await db.models.PublicRecordProducer.aggregate([
        { $match: condition },
        { $lookup: { from: 'county_priorities', localField: 'countyPriorityId', foreignField: '_id', as: 'county_priorities' }},
        { $unwind: "$county_priorities" },
        { $sort: {'county_priorities.priority': 1}}
    ]).limit(1);

    console.log(data);
    if(data.length > 0) {
      const publicRecordProducer: IPublicRecordProducer = await db.models.PublicRecordProducer.findOneAndUpdate({ _id: data[0]['_id'] }, { processed: true }); 

      const state = publicRecordProducer.state.toLowerCase();
      const county = publicRecordProducer.county;  
            
      console.log(`county-pa-consumer: now processing county ${county} in state ${state} at ${new Date()}`);

      const regex = practiceType ? `/${state}/${county}/${practiceType}` : `/${state}/${county}/.*$`;
      const productIds = (await db.models.Product.find({ name: {$regex: new RegExp(regex, 'gm')} })).map( (doc: any) =>  doc._id );


      // launch browser
      const county_browser = await launchBrowser();
      const county_page = await county_browser.newPage();
      await clearPage(county_page);
      await setParamsForPage(county_page);

      const realtor_browser = await launchBrowser();
      const realtor_page = await realtor_browser.newPage();
      await clearPage(realtor_page);
      await setParamsForPage(realtor_page);

      let whitepages_browser = await launchBrowser();
      let whitepages_page = await whitepages_browser.newPage();
      await setParamsForPage(whitepages_page);
      await clearPage(whitepages_page);

      const totalview_browser = await launchBrowser();
      const totalview_page = await totalview_browser.newPage();
      await clearPage(totalview_page);
      await setParamsForPage(totalview_page);

      let date = new Date();
      date.setDate(date.getDate() - 90);
      // at the moment we cannot use cursors because we are loading all data before navigating to website
      let condition = {
        consumed: {$ne: true},
        productId: {$in: productIds}, 
        createdAt: {$gte: date},
        $or: [{count: {$lt: 6}}, {count: {$exists: false}}]
      };
      let skip = 0;
      let index = 0;
      let total = await db.models.OwnerProductProperty.find(condition).skip(skip).count();
      let consumed = 0;
      
      while (true) {
        try {
          //@ts-ignore 
          const cursor = db.models.OwnerProductProperty.find(condition).sort({createdAt: -1}).skip(skip).populate('ownerId propertyId').cursor({batchSize: 5}).addCursorFlag('noCursorTimeout',true);
          console.log('~~ # ~~ # ~~ # ~~ # ~~ # ~~ # ~~ # ~~ # ~~ # ~~ # ~~ # ~~ # ');
          console.log('number of documents to process: ', total);
          let result = false;
          let count = 0;
          for (let opp = await cursor.next(); opp != null; opp = await cursor.next()) {
            try {
              index++;
              if (!opp.ownerId && !opp.propertyId) continue;

              let owner_product_property = await processOpp(opp._id);
              if (owner_product_property.processed && owner_product_property.consumed) { consumed++; continue; }
              
              // county pa
              console.log(`\n\n^_^_^_^_^_^_^_^_ Checking County PA [${total} / ${index} / ${consumed}] _^_^_^_^_^_^_^_^`);
              let opp_id = await consumeByCountyPA(publicRecordProducer, owner_product_property, county_browser, county_page) || opp._id;
              owner_product_property = await processOpp(opp_id);
              result = owner_product_property.processed && owner_product_property.consumed;
              reportResult(COUNTY, result);
              if (result) {
                // get phone number with whitepages consumer
                console.log('\n\n^_^_^_^_^_^_^_^_ Checking Whitepages _^_^_^_^_^_^_^_^');
                opp_id = await whitepagesConsumer(owner_product_property, whitepages_page) || opp._id;
                consumed++;
                continue;
              }
              console.log(`processed = ${owner_product_property.processed}, consumed = ${owner_product_property.consumed}`);

              // landgrid
              if (!owner_product_property.processed) {
                console.log('\n\n^_^_^_^_^_^_^_^_ Checking Landgrid PA _^_^_^_^_^_^_^_^');
                opp_id = await consumeByLandgrid(publicRecordProducer, owner_product_property) || opp._id;
                owner_product_property = await processOpp(opp_id);
                result = owner_product_property.processed && owner_product_property.consumed;
                reportResult(LANDGRID, result);
                console.log(`processed = ${owner_product_property.processed}, consumed = ${owner_product_property.consumed}`);
                // if (result) { consumed++; continue; } // commented because we need to run whitepages to get phone number
              }

              // whitepages
              if (!owner_product_property.processed) {
                console.log('\n\n^_^_^_^_^_^_^_^_ Checking Whitepages _^_^_^_^_^_^_^_^');
                opp_id = await whitepagesConsumer(owner_product_property, whitepages_page) || opp._id;
                owner_product_property = await processOpp(opp_id);
                result = owner_product_property.processed && owner_product_property.consumed;
                reportResult(WHITEPAGES, result);
                console.log(`processed = ${owner_product_property.processed}, consumed = ${owner_product_property.consumed}`);
                if (result) { consumed++; continue; }
                if (!owner_product_property.processed) {
                  if (owner_product_property.count) owner_product_property.count++; else owner_product_property.count = 0;
                  await owner_product_property.save();
                  continue;
                }
              }

              // realtor
              console.log('\n\n^_^_^_^_^_^_^_^_ Checking Realtor _^_^_^_^_^_^_^_^');
              let ret = await realtorConsumer(owner_product_property, realtor_page);
              reportResult(REALTOR, ret);
              console.log(`consumed = ${ret}`);
              if (ret) { consumed++; continue; }

              // // zillow
              // console.log('\n\n^_^_^_^_^_^_^_^_ Checking Zillow _^_^_^_^_^_^_^_^');
              // await zillowConsumer(publicRecordProducer, owner_product_property);
              // owner_product_property = await processOpp(opp_id);
              // reportResult(ZILLOW, owner_product_property.consumed);
              // console.log(`processed = ${owner_product_property.processed}, consumed = ${owner_product_property.consumed}`);
              // if (owner_product_property.consumed) { consumed++; continue; }

              // totalviewrealestate
              console.log('\n\n^_^_^_^_^_^_^_^_ Checking TotalViewRealEstate _^_^_^_^_^_^_^_^');
              ret = await totalviewConsumer(owner_product_property, totalview_page);
              reportResult(TOTALVIEW, ret);
              console.log(`consumed = ${ret}`);
              if (ret) { consumed++; continue; }

              if (typeof owner_product_property.count === 'number') owner_product_property.count++; else owner_product_property.count = 0;
              await owner_product_property.save();
            } catch (error) {
              console.log(error);
            }
          }
          break;
        } catch (e) {
            console.log('Problem with cursor ERROR: ', e);
            skip = index;
        }
      }
      await sendMessage(publicRecordProducer.state, publicRecordProducer.county, total, consumed, report, 'Consumer Result');

      await totalview_page.close();
      await totalview_browser.close();

      await realtor_page.close();
      await realtor_browser.close();

      await whitepages_page.close();
      await whitepages_browser.close();

      await county_page.close();
      await county_browser.close();
    } else {
        console.log('==============================');
        console.log('no remaining property-appraiser-consumer');
    };

    process.exit();
})();