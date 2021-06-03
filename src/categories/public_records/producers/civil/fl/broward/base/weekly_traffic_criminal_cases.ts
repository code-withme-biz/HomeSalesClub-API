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
				RecordType,
				CaseNumber,
				CaseFileDt,
				CaseType,
				UniformCaseNumber,
				BCCN,
				NTA,
				LastName,
				FirstName,
				MiddleName,
				Address1,
				Address2,
				City,
				State,
				Zip,
				PhoneNumber,
				DateOfBirth,
				Race,
				Sex,
				DriverLicenseState,
				DriverLicenseNumber,
				CommercialDLIndicator,
				HearingDate,
				HearingDescription
			] = record.split("|").map(s => s.trim());

			if (RecordType.match(/defendant/i)) {
			data.push({
				case_id: CaseNumber,
				filling_date: CaseFileDt,
				doc_type_abbr: '',
				doc_type: CaseType,
				last_name: LastName,
				first_name: FirstName,
				middle_name: MiddleName,
				property_address: Address1,
				unit: Address2,
				city: City,
				zip: Zip,
				phone_number: PhoneNumber
			});
			}
		}
		return data;
	}
}