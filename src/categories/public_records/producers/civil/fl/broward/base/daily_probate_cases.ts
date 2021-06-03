import puppeteer from 'puppeteer';
import FloridaBaseCase from "./base_cases";

export default class FloridaCase extends FloridaBaseCase {
	constructor(records: string[], realtor_page: puppeteer.Page, totalview_page: puppeteer.Page) {
		super(records, realtor_page, totalview_page);
	}

	parse() {
		let data = [];
		let infos = [
			{key: 'CASE NUMBER', length: 14},
			{key: 'PETITION FILING DATE', length: 6},
			{key: 'CASE TYPE CODE', length: 5},
			{key: 'CASE TYPE DESCRIPTION', length: 50},
			{key: 'JUDGE CODE', length: 6},
			{key: 'PARTY SEQUENCE NUMBER', length: 3},
			{key: 'PARTY TYPE', length: 6},
			{key: 'LAST NAME', length: 100},
			{key: 'FIRST NAME', length: 100},
			{key: 'MIDDLE NAME', length: 100},
			{key: 'DOB (Decedent) or YOB', length: 6},
			{key: 'DOD', length: 6},
			{key: 'ADDRESS 1', length: 50},
			{key: 'ADDRESS 2', length: 50},
			{key: 'CITY', length: 50},
			{key: 'STATE', length: 3},
			{key: 'ZIP CODE', length: 12},
			{key: 'UNIFORM CASE NUMBER', length: 20},
		];
		for (const record of this.records) {
			if (record.trim() === '') continue;
			let _data: any = {};
			let index = 0;
			for (const info of infos) {
				_data[info.key] = record.slice(index, index+info.length).trim();
				index += info.length;
			}

			if (_data['PARTY TYPE'] !== 'ATTY') {
			data.push({
				case_id: _data['CASE NUMBER'],
				filling_date: _data['PETITION FILING DATE'],
				doc_type_abbr: _data['CASE TYPE CODE'],
				doc_type: 'probate',
				last_name: _data['LAST NAME'],
				first_name: _data['FIRST NAME'],
				middle_name: _data['MIDDLE NAME'],
				property_address: _data['ADDRESS 1'],
				unit: _data['ADDRESS 2'],
				city: _data['CITY'],
				zip: _data['ZIP CODE'],
			});
			}
		}
		return data;
	}
}