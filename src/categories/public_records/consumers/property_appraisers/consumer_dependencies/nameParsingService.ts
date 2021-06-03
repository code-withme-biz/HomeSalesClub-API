//This service was made for common parsing methods. Please expand it with common methods.

//Array of key company identifiers.
const companyIdentifiersArray = [
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
    'FINANCE', 'CAPITAL', 'SYSTEMS','SUBDIVISION', 'UNKNOWN', 'GROUP', 'CUSTOMER', 'AVENUE'
];

const suffixNamesArray = ['I', 'II', 'III', 'IV', 'V', 'ESQ', 'JR', 'SR']
const suffixNamesRegex = new RegExp(`\\b(?:${suffixNamesArray.join('|')})\\b`, 'i')

//Key phrases regex
const companyRegexString = `\\b(?:${companyIdentifiersArray.join('|')})\\b`;
const companyRegex = new RegExp(companyRegexString, 'i');

//name separate regex
const namesSplitted = ['AND', 'C/O'];
const namesSplittedRegexString = `,|&|\\b(?:${namesSplitted.join('|')})\\b`;
const namesSplittedRegex = new RegExp(namesSplittedRegexString, 'i');

const semicolonSplittedRegex = new RegExp(/;\s.{1,2}/i)

/**
 * @param {string} rawOwnerName
 */
const isCompanyName = (rawOwnerName: string) => {
    if (!rawOwnerName) {
        return false;
    }
    return rawOwnerName.match(companyRegex);
}


//This function parses full name and multiple owners name.
//Accepts string value of the following types:
//1. GOURD, ROBERT G
//2. FALKSTROM, HARRY L AND PAMELA
//3. SUMMIT DEVELOPMENT & CONSTRUCTION COMPANY
//4. LUND, TIMOTHY & PATRICIA L
//5. BROOKS, DARRYL C/O  JASMINE
//And returns an array of objects with parsed names
//Example return:
//1. [{firstName: 'ROBERT', lastName: 'GOURD', middleName: 'G',fullName: 'GOURD, ROBERT G'}]
//2. [
//  {firstName: 'HARRY', lastName: 'FALKSTROM', middleName: 'L', fullName: 'FALKSTROM, HARRY L'},
//  {firstName: 'PAMELA', lastName: 'FALKSTROM', middleName: null, fullName: 'FALKSTROM, PAMELA'}
// ]
//3. [{firstName: 'SUMMIT DEVELOPMENT & CONSTRUCTION COMPANY'}]   <--- in case of company name
//4. [
//  {firstName: 'TIMOTHY', lastName: 'LUND', middleName: null, fullName: 'LUND, TIMOTHY'},
//  {firstName: 'PATRICIA', lastName: 'LUND', middleName: 'L', fullName: 'LUND, PATRICIA L'}
// ]
//5. [
//  {firstName: 'DARRYL', lastName: 'BROOKS', middleName: null, fullName: 'BROOKS, DARRYL'},
//  {firstName: 'JASMINE', lastName: 'BROOKS', middleName: null, fullName: 'BROOKS, JASMINE'}
// ]
/**
 * @param {string} rawOwnersName
 */
exports.parseOwnersFullName = (rawOwnersName: string) => {
    let processedNamesArray = [];

    if (isCompanyName(rawOwnersName)) {
        processedNamesArray.push({
            firstName: '',
            lastName: '',
            middleName: '',
            fullName: rawOwnersName.trim(),
            suffix: ''
        });
        return processedNamesArray;
    }

    let ownersNameSplited = rawOwnersName.split(namesSplittedRegex);

    const defaultLastName = ownersNameSplited[0].trim();
    for (let index = 1; index < ownersNameSplited.length; index++) {
        if (ownersNameSplited[index] != defaultLastName) {
            let element = ownersNameSplited[index];
            const suffix = element.match(suffixNamesRegex)
            element = element.replace(suffixNamesRegex, '')
            element = element.replace(/  +/g, ' ')
            let firstNameParser = element.trim().split(/\s+/g);
            const firstName = firstNameParser[0].trim();
            firstNameParser.shift();
            const middleName = firstNameParser.join(' ');
            const fullName = `${defaultLastName}, ${firstName} ${middleName} ${suffix ? suffix[0] : ''}`;
            processedNamesArray.push({
                firstName,
                lastName: defaultLastName,
                middleName,
                fullName: fullName.trim(),
                suffix: suffix ? suffix[0] : ''
            });
        }
    }
    if (processedNamesArray.length === 0) {
        processedNamesArray.push({
            firstName: '',
            lastName: '',
            middleName: '',
            fullName: rawOwnersName.trim(),
            suffix: ''
        });
    }
    return processedNamesArray;
}

//This function parses full name and multiple owners name without comma.
//Accepts string value of the following types:
//1. GOURD ROBERT G
//2. FALKSTROM HARRY L AND FALKSTROM PAMELA
//3. SUMMIT DEVELOPMENT & CONSTRUCTION COMPANY
//And returns an array of objects with parsed names
//Example return:
//1. [{firstName: 'ROBERT', lastName: 'GOURD', middleName: 'G',fullName: 'GOURD, ROBERT G'}]
//2. [
//  {firstName: 'HARRY', lastName: 'FALKSTROM', middleName: 'L', fullName: 'FALKSTROM, HARRY L'},
//  {firstName: 'PAMELA', lastName: 'FALKSTROM', middleName: null, fullName: 'FALKSTROM, PAMELA'}
// ]
//3. [{firstName: 'SUMMIT DEVELOPMENT & CONSTRUCTION COMPANY'}]   <--- in case of company name
/**
 * @param {string} rawOwnersName
 */
exports.parseOwnersFullNameWithoutComma = (rawOwnersName: string) => {
    let processedNamesArray = [];

    if (isCompanyName(rawOwnersName)) {
        processedNamesArray.push({
            firstName: '',
            lastName: '',
            middleName: '',
            fullName: rawOwnersName.trim(),
            suffix: ''
        });
        return processedNamesArray;
    }

    let ownersNameSplited: any = rawOwnersName.split(' ');

    const defaultLastName = ownersNameSplited[0].trim();
    ownersNameSplited.shift()
    ownersNameSplited = ownersNameSplited.join(' ');
    ownersNameSplited = ownersNameSplited.split(namesSplittedRegex);
    for (let index = 0; index < ownersNameSplited.length; index++) {
        if (ownersNameSplited[index] != defaultLastName) {
            let element = ownersNameSplited[index];
            const suffix = element.match(suffixNamesRegex)
            element = element.replace(suffixNamesRegex, '')
            element = element.replace(/  +/g, ' ')
            let firstNameParser = element.trim().split(/\s+/g);
            if (firstNameParser[0] == defaultLastName) {
                firstNameParser.shift();
            }
            const firstName = firstNameParser[0].trim();
            firstNameParser.shift();
            const middleName = firstNameParser.join(' ');
            const fullName = `${defaultLastName}, ${firstName} ${middleName} ${suffix ? suffix[0] : ''}`;
            processedNamesArray.push({
                firstName,
                lastName: defaultLastName,
                middleName,
                fullName: fullName.trim(),
                suffix: suffix ? suffix[0] : ''
            });
        }
    }
    if (processedNamesArray.length === 0) {
        processedNamesArray.push({
            firstName: '',
            lastName: '',
            middleName: '',
            fullName: rawOwnersName.trim(),
            suffix: ''
        });
    }
    return processedNamesArray;
}

exports.semicolonParseOwnersFullName = (rawOwnersName: string) => {
    let processedNamesArray = [];

    if (isCompanyName(rawOwnersName)) {
        processedNamesArray.push({
            firstName: '',
            lastName: '',
            middleName: '',
            fullName: rawOwnersName.trim(),
            suffix: ''
        });
        return processedNamesArray;
    }

    let globalOwnersNameSplited = rawOwnersName.split(namesSplittedRegex);
    const globalDefaultLastName = globalOwnersNameSplited[0].trim();
    let semicolonSplitted = rawOwnersName.trim().split(semicolonSplittedRegex);
    for (let i = 0; i < semicolonSplitted.length; i++) {
        let ownersNameSplited = semicolonSplitted[i].split(namesSplittedRegex);
        if (semicolonSplitted[i]) {
            if (ownersNameSplited.length === 1) {
                processedNamesArray.push({
                    firstName: ownersNameSplited[0].trim(),
                    lastName: globalDefaultLastName,
                    middleName: null,
                    fullName: null
                });
            } else {
                const defaultLastName = ownersNameSplited[0].trim();
                for (let index = 1; index < ownersNameSplited.length; index++) {
                    if (ownersNameSplited[index] != defaultLastName) {
                        let element = ownersNameSplited[index];
                        const suffix = element.match(suffixNamesRegex)
                        element = element.replace(suffixNamesRegex, '')
                        element = element.replace(/  +/g, ' ')
                        let firstNameParser = element.trim().split(/\s+/g);
                        const firstName = firstNameParser[0].trim();
                        firstNameParser.shift();
                        const middleName = firstNameParser.join(' ');
                        const fullName = `${defaultLastName}, ${firstName} ${middleName} ${suffix ? suffix[0] : ''}`;
                        processedNamesArray.push({
                            firstName,
                            lastName: defaultLastName,
                            middleName,
                            fullName: fullName.trim(),
                            suffix: suffix ? suffix[0] : ''
                        });
                    }
                }
            }
        }
    }
    if (processedNamesArray.length === 0) {
        processedNamesArray.push({
            firstName: '',
            lastName: '',
            middleName: '',
            fullName: rawOwnersName.trim(),
            suffix: ''
        });
    }
    return processedNamesArray;
}

exports.isCompanyName = isCompanyName;