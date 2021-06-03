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
				FILING_DATE,
				PARTY_NAME,
				ADDRESS,
				CITY,
				STATE,
				ZIP,
				DISPOSITION_DESCRIPTION,
				CASE_NUMBER,
				DISPOSITION_CODE,
				DISPOSITION_DATE,
				PARTY_GROUP_NUMBER,
				PARTY_TYPE,
				UNIFORM_CASE_NUMBER,
				REPORT_DATE,
			] = record.split("|").map(s => s.trim());

			if (PARTY_TYPE.match(/df/i)) {
			let full_name = PARTY_NAME;
			const parseName: any = nameParsingService.newParseName(full_name.trim());
			if (parseName.type && parseName.type == 'COMPANY') {
				continue;
			}
			data.push({
				case_id: CASE_NUMBER,
				filling_date: FILING_DATE,
				doc_type_abbr: DISPOSITION_CODE,
				doc_type: DISPOSITION_DESCRIPTION,
				full_name: PARTY_NAME,
				last_name: parseName.lastName,
				first_name: parseName.firstName,
				middle_name: parseName.middleName,
				property_address: ADDRESS,
				unit: '',
				city: CITY,
				zip: ZIP,
			});
			}
		}
		return data;
	}
}