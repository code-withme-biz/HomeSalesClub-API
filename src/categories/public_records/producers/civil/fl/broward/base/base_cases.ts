import AbstractProducer from '../../../../abstract_producer';
import { IPublicRecordProducer } from '../../../../../../../models/public_record_producer';

import puppeteer from 'puppeteer';
import db from '../../../../../../../models/db';
import { getPracticeType, logOpp, saveToOwnerProductPropertyByProducer } from '../../../../../../../services/general_service';
import realtorConsumer from '../../../../../../../scheduled_tasks/consumer_realtor';
import totalviewConsumer from '../../../../../../../scheduled_tasks/consumer_totalview_realestate';

export default abstract class FloridaBaseCase {
    records: string[] = [];
    state = 'FL';
    county = 'broward';
    realtor_page: puppeteer.Page | undefined;
    totalview_page: puppeteer.Page | undefined;

    abstract parse(): any[];

    constructor(records: string[], realtor_page: puppeteer.Page, totalview_page: puppeteer.Page) {
		this.records = records;
		this.realtor_page = realtor_page;
		this.totalview_page = totalview_page;
	}

  async start() {
      let parsed = this.parse();
      await this.saveAndConsume(parsed);
  }

  async saveAndConsume(records: any[]) {
    for (const record of records) {
        let {
            case_id,
            filling_date,
            doc_type_abbr,
            doc_type,
            last_name,
            first_name,
            middle_name,
            property_address,
            unit,
            city,
            zip,
            phone_number
        } = record;
        console.log(record);

        // check for owner is company or not
        let full_name = record.full_name ? record.full_name :`${last_name} ${first_name} ${middle_name}`;
        const parseName: any = nameParsingService.newParseName(full_name.trim());
        if (parseName.type && parseName.type == 'COMPANY') {
            continue;
        }
        
        const practiceType = getPracticeType(doc_type);
        const productName = `/${this.state.toLowerCase()}/${this.county}/${practiceType}`;
        const prod = await db.models.Product.findOne({ name: productName }).exec();
                  
        console.log('============= NEW RECORD =============');
        const data = {
          'Property State': this.state.toUpperCase(),
          'County': this.county,
          'Property Address': property_address,
          'Property City': city,
          'Property Zip': zip,
          'Property Unit #': unit,
          'First Name': first_name,
          'Last Name': last_name,
          'Middle Name': middle_name,
          'Name Suffix': '',
          'Full Name': full_name,
          "vacancyProcessed": false,
          fillingDate: filling_date,
          "productId": prod._id,
          "caseUniqueId": case_id,
          "Phone": phone_number,
          originalDocType: `${doc_type} [${doc_type_abbr}] [csv]`
        };
        console.log(data);

        let opp_id = await saveToOwnerProductPropertyByProducer(data);
        if (opp_id) {
          let opp = await db.models.OwnerProductProperty.findOne({_id: opp_id}).populate('ownerId propertyId');
          logOpp(opp);

          if (opp && opp.ownerId && opp.propertyId && this.realtor_page && this.totalview_page) {
            // realtor
            console.log('\n\n^_^_^_^_^_^_^_^_ Checking Realtor _^_^_^_^_^_^_^_^');
            let ret = await realtorConsumer(opp, this.realtor_page);
            if (ret) continue;

            // totalviewrealestate
            console.log('\n\n^_^_^_^_^_^_^_^_ Checking TotalViewRealEstate _^_^_^_^_^_^_^_^');
            ret = await totalviewConsumer(opp, this.totalview_page);
            if (ret) continue;
          }
          console.log('===== NOT CONSUMED =====')
        }
      }
    }
}