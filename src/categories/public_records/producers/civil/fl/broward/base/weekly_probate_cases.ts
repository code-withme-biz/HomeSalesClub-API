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
				Case_Number,
				Petition_Filed_Date,
				Case_Type_Code,
				Case_Type_Description,
				Party_Type_Code,
				Last_Name,
				First_Name,
				Middle_Name,
				Date_of_Birth,
				Date_of_Death,
				Age,
				Address_Line_1,
				Address_Line_2,
				City,
				State,
				Zip,
				Phone,
				Uniform_Case_Number,
				Case_Created_Date,
			] = record.split("|").map(s => s.trim());

			if (Party_Type_Code !== 'ATTY') {
			data.push({
				case_id: Case_Number,
				filling_date: Petition_Filed_Date,
				doc_type_abbr: '',
				doc_type: 'probate',
				last_name: Last_Name,
				first_name: First_Name,
				middle_name: Middle_Name,
				property_address: Address_Line_1,
				unit: Address_Line_2,
				city: City,
				zip: Zip,
			});
			}
		}
		return data;
	}
}