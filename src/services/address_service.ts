const parseaddress = require('parse-address');
const addressit = require('addressit');

export default class AddressService {
    static pythonScriptPath = "./src/services/address_parser.py";

    static parseString(data: string) {
        console.log(data);
        let result: any = {};
        let regex = /(?<=\(\')(?<key>.*?)(\'.*?\')(?<value>.*?)(?=\'\))/g;
        while (true) {
            let match = regex.exec(data);
            if (match === null) break;
            if (!match.groups) break;
            let key = match.groups.key.trim();
            let value = match.groups.value.trim();
            switch (key) {
              case 'AddressNumber': key = 'house_number'; break;
              case 'StreetNamePreDirectional': key = 'direction'; break;
              case 'StreetNamePreType': key = 'street_name_pre'; break;
              case 'StreetName': key = 'street_name'; break;
              case 'StreetNamePostType': key = 'street_type'; break;
              case 'address1': key = 'street_address'; break;
              case 'OccupancyIdentifier': key = 'unit'; break;
            }
            result[key] = value;
        }
        if (result.street_name_pre && result.street_name) {
            result.street_name = result.street_name_pre + ' ' + result.street_name;
        }
        return result;
    }

    static validateAddress(address: string) {
        if (!address) return null;

        // check for house no.
        address = address.replace(/\s+|\n/gm, ' ').toUpperCase().trim();
        // let house_no = address.split(' ')[0];
        // if (isNaN(parseInt(house_no)) || house_no.match(/\D/)) {
        //     return null;
        // }
        // check for repeated
        if (address.match(/(\b.+\b)\s\1$/i)) {
            address = address.replace(/(\b.+\b)\s\1$/i, '$1');
        }
        return address;
    }

    static detectFullAddress(address: string){
        if (!address) return false;

        const parsev1 = parseaddress.parseLocation(address);
        const parsev2 = addressit(address);
        if(parsev1){
            if(parsev1.zip || parsev1.city || parsev1.state){
                return true;
            }
        }
        if(parsev2.state || parsev2.postalcode){
            return true;
        }
        return false;
    }

    static getFullAddressFromProperty(property: any) {
        let address = property['Property Address'];
        if (address) {
            if (!AddressService.detectFullAddress(address)) {
                let city = property['Property City'] || '';
                let state = property['Property State'] || '';
                let zip = property['Property Zip'] || '';
                address = `${address}, ${city} ${state} ${zip}`;
            }
            return address;
        }
        return '';
    }

    // static detectFullAddressPython(address: string){
    //     if (!address) return false;

    //     var pythonScriptPath = AddressService.pythonScriptPath;
    //     let options = {
    //       args: [address]
    //     }
    //     return new Promise((resolve) => {
    //         PythonShell.run(pythonScriptPath, options, (err, data: any) => {
    //             if (err) resolve(false);
    //             let result: any = {};
    //             for (const v of data) {
    //                 result = {...AddressService.parseString(v)};
    //             }
    //             console.log(result)
    //             resolve(result.state || result.city || result.zip_code);
    //         });
    //     });
    // }

    static getParsedAddress(full_address: string){
        if (!full_address) return null;

        const parsev1 = parseaddress.parseLocation(full_address);
        const parsev2 = addressit(full_address);
        let street_address = (parsev2.number ? parsev2.number : '') + ' ' + (parsev2.street ? parsev2.street : '') + ' ' + (parsev2.unit ? '#'+parsev2.unit : '');
        if(AddressService.isEmptyOrSpaces(street_address) || (parsev2.street && parsev2.street.match(/UNIT|#|APT/gm)) ){
            if(parsev1){
                street_address = (parsev1.number ? parsev1.number : '') + ' ' + (parsev1.prefix ? parsev1.prefix : '') + ' ' + (parsev1.street ? parsev1.street : '') + ' ' + (parsev1.type ? parsev1.type : '') + ' ' + (parsev1.suffix ? parsev1.suffix : '') + ' ' + (parsev1.sec_unit_num ? '#'+parsev1.sec_unit_num : '');
            } else {
                street_address = full_address;
            }
        } else {
            if(!parsev2.unit){ // check unit
                if(parsev1){
                    street_address = street_address + (parsev1.sec_unit_num ? '#'+parsev1.sec_unit_num : '');
                }
            }
        }
        if (!street_address) return null;
        street_address = street_address.replace(/\s+/g, ' ').trim();

        let city = '';
        let state = parsev2.state || '';
        let zip = parsev2.postalcode || '';

        if(parsev1){
            city = parsev1.city || '';
            if(state == ''){
                state = parsev1.state || '';
            }
            if(zip == ''){
                zip = parsev1.zip || '';
            }
        }

        if (city.match(/^.\s+|^.$/gm)){
            city = '';
        }

        if (city != ''){
            const parsed_street = parseaddress.parseLocation(street_address);
            if(parsed_street && parsed_street.type){
                if(city.toLowerCase() == parsed_street.type.toLowerCase()){
                    city = '';
                }
            }
        }

        return {
            street_address: street_address,
            city: city,
            zip: zip,
            state: state
        };
    }

    static compareFullAddress(address1: string, address2: string) {
        let _address1: any = AddressService.getParsedAddress(address1) || {};
        let _address2: any = AddressService.getParsedAddress(address2) || {};
        // console.log(_address1)
        // console.log(_address2)
        if (address1 === null || address2 === null) return false;

        let flag = false;
        if (_address1.street_address && _address2.street_address) {
            flag = flag || (_address1.street_address.toUpperCase() === _address2.street_address.toUpperCase());
            if(!flag){
                const parsed_street1 = parseaddress.parseLocation(_address1.street_address) || {};
                const parsed_street2 = parseaddress.parseLocation(_address2.street_address) || {};
                if(parsed_street1.street && parsed_street2.street){
                    flag = flag || (parsed_street1.street.toUpperCase() === parsed_street2.street.toUpperCase());
                }
                if(parsed_street1.number && parsed_street2.number){
                    flag = flag && (parsed_street1.number.toUpperCase() === parsed_street2.number.toUpperCase());
                }
                if(parsed_street1.prefix && parsed_street2.prefix){
                    flag = flag && (parsed_street1.prefix.toUpperCase() === parsed_street2.prefix.toUpperCase());
                }
                if(parsed_street1.type && parsed_street2.type){
                    flag = flag && (parsed_street1.type.toUpperCase() === parsed_street2.type.toUpperCase());
                }
                if(parsed_street1.sec_unit_num && parsed_street2.sec_unit_num){
                    flag = flag && (parsed_street1.sec_unit_num.toUpperCase() === parsed_street2.sec_unit_num.toUpperCase());
                }
            }
        }
        if (!flag) return false;

        if (_address1.city && _address2.city) {
            flag = flag && (_address1.city.toUpperCase() === _address2.city.toUpperCase());
        }
        if (_address1.state && _address2.state) {
            flag = flag && (_address1.state.toUpperCase() === _address2.state.toUpperCase());
        }
        if (_address1.zip && _address2.zip) {
            flag = flag && (_address1.zip.indexOf(_address2.zip) > -1 || _address2.zip.indexOf(_address1.zip) > -1);
        }
        return flag;
    }

    // static async getParsedAddressPython(full_address: string){
    //     if (!full_address) return null;

    //     var pythonScriptPath = AddressService.pythonScriptPath;
    //     let options = {
    //       args: [full_address]
    //     };
    //     const ts1 = (new Date()).getTime();
    //     return new Promise<any>((resolve) => {
    //         PythonShell.run(pythonScriptPath, options, (err, outputs) => {
    //             if (err || outputs === undefined) return resolve(false);
    //             let result: any = {};
    //             for (const output of outputs) {
    //                 result = {...result, ...AddressService.parseString(output)};
    //             }
    //             const ts2 = (new Date()).getTime();
    //             console.log(ts2 - ts1);
    //             return resolve({
    //                 parsed: {
    //                     house_number: result.house_number,
    //                     direction: result.direction,
    //                     street_name: result.street_name,
    //                     street_type: result.street_type,
    //                     unit: result.unit,
    //                 },
    //                 street_address: result.street_address,
    //                 city: result.city,
    //                 zip: result.zip_code,
    //                 state: result.state
    //             });
    //         });
    //     });
    // }


    static getStreetAddress = (full_address:string) => {
        const parsed = addressit(full_address);
        let street_address = (parsed.number ? parsed.number : '') + ' ' + (parsed.street ? parsed.street : '') + ' ' + (parsed.unit ? '#'+parsed.unit : '');
        street_address = street_address.replace(/\s+/, ' ').trim();
        return street_address;
    }

    static isEmptyOrSpaces = (str: string) => {
        return str === null || str.match(/^\s*$/) !== null;
    }
}

