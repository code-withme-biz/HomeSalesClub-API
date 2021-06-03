const parseFullName = require('parse-full-name').parseFullName;

//////////// PARSE NAME METHODS & VARIABLES ////////////////
const companyIdentifiersArrayNew = [
    'GENERAL', 'TRUSTEES', 'INC', 'ORGANIZATION',
    'CORP', 'CORPORATION', 'LLC', 'MOTORS', 'BANK', 'UNITED',
    'CO', 'COMPANY', 'FEDERAL', 'MUTUAL', 'ASSOC', 'AGENCY',
    'PARTNERSHIP', 'CHURCH', 'CITY', 'SECRETARY',
    'DEVELOPMENT', 'INVESTMENT', 'ESTATE', 'LLP', 'LP', 'HOLDINGS',
    'LOAN', 'CONDOMINIUM', 'CATHOLIC', 'INVESTMENTS', 'D/B/A', 'COCA COLA',
    'LTD', 'CLINIC', 'TODAY', 'PAY', 'CLEANING', 'COSMETIC', 'CLEANERS',
    'FURNITURE', 'DECOR', 'FRIDAY HOMES', 'MIDLAND', 'SAVINGS', 'PROPERTY',
    'ASSET', 'PROTECTION', 'SERVICES', 'TRS', 'ET AL', 'L L C', 'NATIONAL',
    'ASSOCIATION', 'MANAGMENT', 'PARAGON', 'MORTGAGE', 'CHOICE', 'PROPERTIES',
    'J T C', 'RESIDENTIAL', 'OPPORTUNITIES', 'FUND', 'LEGACY', 'SERIES',
    'HOMES', 'LOAN', 'FAM', 'PRAYER', 'WORKFORCE', 'HOMEOWNER', 'L P', 'UNION',
    'DEPARTMENT', 'LOANTRUST', 'OPT2', 'COMMONWEALTH', 'PENNSYLVANIA', 'UNIT', 
    'KEYBANK', 'LENDING', 'FUNDING', 'AMERICAN', 'COUNTY', 'AUTHORITY', 
    'LENDING', 'FCU', 'TOWNSHIP', 'SPECTRUM', 'CU', 'GATEWAY',
    'LOANS', 'MERS', 'SPECTRUM', 'CU', 'BK', 'UN', 'PA', 'DOLLAR', 'ASSN', 'MTG', 'REVOLUTION', 'NATL',
    'BUSINESS', 'CREDIT', 'COMMUNITY', 'HEALTH', 'ELECTRONIC', 'REGISTRATION', 'INSTRUMENT', 'EDUCATIONAL', 'BUILDERS', 'TAX ASSESSORS', 'APARTMENTS', 'ESTATES',
    'FINANCE', 'CAPITAL', 'SYSTEMS','SUBDIVISION', 'UNKNOWN', 'GROUP', 'CUSTOMER', 'AVENUE', 'CONFERENCE', 'SQUARE', 'VILLAGE', 'SHOPS', 'FINANCIAL', 'MEDICAL', 'INDUSTRIAL', 'HOSPITAL'
];

const suffixNamesArrayNew = ['I', 'II', 'III', 'IV', 'V', 'ESQ', 'JR', 'SR'];
const removeFromNamesArrayNew = ['ET', 'AS', 'DECEASED', 'DCSD', 'CP\/RS', 'JT\/RS', 'TR', 'TRUSTEE', 'TRUST'];

// main method that will used in any producer.
exports.newParseName = (name: string) => {
    name = name.trim();
    name = name.replace(/\s+/g,' ');
    let result;
    const companyRegexString = `\\b(?:${companyIdentifiersArrayNew.join('|')})\\b`;
    const companyRegex = new RegExp(companyRegexString, 'i');
    const removeFromNameRegexString = `^(.*?)\\b(?:${removeFromNamesArrayNew.join('|')})\\b.*?$`;
    const removeFromNamesRegex = new RegExp(removeFromNameRegexString, 'i');

    // check if the name is company
    if (name.match(companyRegex)) {
        result = {
            type: name.match(/(LLC)|(L L C)/i) ? 'LLC' : 'COMPANY',
            firstName: '',
            lastName: '',
            middleName: '',
            fullName: name.trim(),
            suffix: ''
        };
        return result;
    }

    // remove anything inside removeFromNamesArray because it's not company and it's a person.
    let cleanName = name.match(removeFromNamesRegex);
    if (cleanName) {
        name = cleanName[1];
    }

    // check if the name is contains comma or not
    if(name.match(/,/g)){
        result = parseNameWithComma(name);
    } else {
        result = parseNameWithoutComma(name);
    }
    return result;
}

// e.g WILSON, JACK W
function parseNameWithComma(name: string){
    let result;
    const suffixNamesRegex = new RegExp(`\\b(?:${suffixNamesArrayNew.join('|')})\\b`, 'i');

    try {
        const suffix = name.match(suffixNamesRegex);
        name = name.replace(suffixNamesRegex, '');
        name = name.replace(/\s+/g,' ');
        let ownersNameSplited = name.split(',');
        const defaultLastName = ownersNameSplited[0].trim();
        let firstNameParser = ownersNameSplited[1].trim().split(/\s+/g);
        const firstName = firstNameParser[0].trim();
        firstNameParser.shift();
        const middleName = firstNameParser.join(' ');
        const fullName = `${defaultLastName}, ${firstName} ${middleName} ${suffix ? suffix[0] : ''}`;
        result = {
            firstName,
            lastName: defaultLastName,
            middleName,
            fullName: fullName.trim(),
            suffix: suffix ? suffix[0] : ''
        };
    }
    catch (e) {

    }
    if (!result) {
        result = {
            firstName: '',
            lastName: '',
            middleName: '',
            fullName: name.trim(),
            suffix: ''
        };
    }
    return result;
}

// e.g WILSON JACK W
function parseNameWithoutComma(name: string){
    let result;

    const suffixNamesRegex = new RegExp(`\\b(?:${suffixNamesArrayNew.join('|')})\\b`, 'i');
    const suffix = name.match(suffixNamesRegex);
    name = name.replace(suffixNamesRegex, '');
    name = name.replace(/\s+/g,' ');
    let ownersNameSplited: any = name.split(' ');
    const defaultLastName = ownersNameSplited[0].trim();
    ownersNameSplited.shift();
    try {
        const firstName = ownersNameSplited[0].trim();
        ownersNameSplited.shift();
        const middleName = ownersNameSplited.join(' ');
        const fullName = `${defaultLastName}, ${firstName} ${middleName} ${suffix ? suffix[0] : ''}`;
        result = {
            firstName,
            lastName: defaultLastName,
            middleName,
            fullName: fullName.trim(),
            suffix: suffix ? suffix[0] : ''
        }
    } catch (e) {
    }
    if (!result) {
        result = {
            firstName: '',
            lastName: '',
            middleName: '',
            fullName: name.trim(),
            suffix: ''
        };
    }
    return result;
}

// e.g Elizabeth J Starr
exports.newParseNameFML = (name: string) => {
    name = name.trim();
    name = name.replace(/\s+/g,' ');
    let result;
    const companyRegexString = `\\b(?:${companyIdentifiersArrayNew.join('|')})\\b`;
    const companyRegex = new RegExp(companyRegexString, 'i');
    const removeFromNameRegexString = `^(.*?)\\b(?:${removeFromNamesArrayNew.join('|')})\\b.*?$`;
    const removeFromNamesRegex = new RegExp(removeFromNameRegexString, 'i');

    // check if the name is company
    if (name.match(companyRegex)) {
        result = {
            type: name.match(/(LLC)|(L L C)/i) ? 'LLC' : 'COMPANY',
            firstName: '',
            lastName: '',
            middleName: '',
            fullName: name.trim(),
            suffix: ''
        };
        return result;
    }

    // remove anything inside removeFromNamesArray because it's not company and it's a person.
    let cleanName = name.match(removeFromNamesRegex);
    if (cleanName) {
        name = cleanName[1];
    }

    // parse with parse-full-name library
    const parser = parseFullName(name);
    result = {
        firstName: parser.first,
        lastName: parser.last,
        middleName: parser.middle,
        fullName: `${parser.last != '' ? parser.last + ', ' : ''}${parser.first} ${parser.middle} ${parser.suffix}`.trim(),
        suffix: parser.suffix
    };

    return result;
}