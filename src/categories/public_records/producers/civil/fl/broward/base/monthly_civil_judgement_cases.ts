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
				CaseNbrSrch,
				EventDesc,
				EventDate,
				PartyTypeCd,
				LastName,
				FirstName,
				MidName,
				Address1,
				Address2,
				City,
				State,
				Zip,
				ReportDate
			] = record.split("|").map(s => s.trim());

			if (PartyTypeCd.match(/df/i)) {
			data.push({
				case_id: CaseNbrSrch,
				filling_date: EventDate,
				doc_type_abbr: '',
				doc_type: EventDesc,
				last_name: LastName,
				first_name: FirstName,
				middle_name: MidName,
				property_address: Address1,
				unit: Address2,
				city: City,
				zip: Zip,
			});
			}
		}
		return data;
	}
}