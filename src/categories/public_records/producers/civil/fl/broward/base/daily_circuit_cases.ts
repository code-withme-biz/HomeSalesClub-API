import puppeteer from 'puppeteer';
import FloridaBaseCase from "./base_cases";

export default class FloridaCase extends FloridaBaseCase {
	constructor(records: string[], realtor_page: puppeteer.Page, totalview_page: puppeteer.Page) {
		super(records, realtor_page, totalview_page);
	}

	parse() {
		let data = [];
		for (const record of this.records) {
			if (record.trim() === '') continue;
			let [
				CASE_NUMBER,
				INITIATED_DATE,
				CASE_TYPE_CODE,
				CASE_TYPE_DESCRIPTION,
				JUDGE_ID,
				GROUP_NUMBER ,
				PARTY_TYPE_CODE,
				LAST_NAME,
				FIRST_NAME,
				MIDDLE_NAME,
				ADDRESS_LINE1,
				ADDRESS_LINE2 ,
				CITY,
				STATE,
				ZIP_CODE,
				UNIFORM_CASE_NUMBER ,
			] = record.split("|").map(s => s.trim());

			if (PARTY_TYPE_CODE.match(/df/i)) {
				data.push({
					case_id: CASE_NUMBER,
					filling_date: INITIATED_DATE,
					doc_type_abbr: CASE_TYPE_CODE,
					doc_type: CASE_TYPE_DESCRIPTION,
					last_name: LAST_NAME,
					first_name: FIRST_NAME,
					middle_name: MIDDLE_NAME,
					property_address: ADDRESS_LINE1,
					unit: ADDRESS_LINE2,
					city: CITY,
					zip: ZIP_CODE,
				});
			}
		}
		return data;
	}
}