// for the most part the dashboard is handled with GraphQL
// however we have some specifialized use cases where we need to export millions of records at once
// consequently, we use express endpoint to send csv file to client
const uuid = require('uuid').v4
import path from 'path'
import { verifyToken } from '../services/jwt_service';
import db from '../models/db';
import { existsSync, unlinkSync, createWriteStream, mkdirSync, WriteStream } from 'fs';
import mongoose from 'mongoose';
import { normalizeDate } from '../services/general_service';
import AddressService from '../services/address_service';
import moment from 'moment';

const rimraf = require('rimraf');
const archiver = require('archiver');

const BATCH_SIZE = 5500; // docs queried at once
const THREADS = 4;
const ARCHIVE_NAME = 'export.zip';
const TEMP_BASE_DIRECTORY = 'export_temp';

let condition: any;
let aggregateConditions: any[];


export default class Dashboard {
    async export(req: any, res: any) {
        try {
            const folderName = `${TEMP_BASE_DIRECTORY}_${uuid()}`;
            const timeout = 30 * 60 * 1000;
            req.setTimeout(timeout);
            res.setTimeout(timeout);

            // const token = req.query.token;
            // const validate: any = await verifyToken(token);
            if (true) {
                const debugTime = new Date().getTime();

                const filters = req.query.filters ? JSON.parse(req.query.filters) : [];
                const from = req.query.from;
                const to = req.query.to;
                const practiceType = req.query.practiceType;
                const selState = req.query.state;
                const selCounty = req.query.county;
                const selZip = req.query.zip;
                const productIdsCount = req.query.owners;

                let filterProperty: any = {}
                for (let i = 0; i < filters.length; i++) {
                    filterProperty[filters[i][0]] = {$regex: filters[i][1]}
                }

                console.log('the from date: ', from);
                console.log('the to date: ', to);
                console.log('practiceType: ', practiceType);
                console.log('state: ', selState);
                console.log('county: ', selCounty);
                console.log('zip: ', selZip);
                console.log('productIds count:', productIdsCount);

                let dateFrom = new Date(new Date(from).setHours(0, 0, 0));
                let dateTo = new Date(new Date(to).setHours(23, 59, 59));
                condition = {
                    // _id: { $gt: mongoose.Types.ObjectId('000000000000000000000000')}, // modified when running batches
                    createdAt: {
                        $gte: dateFrom,
                        $lt: dateTo
                    },
                    processed: true,
                    consumed: true,
                    ownerId: {$ne: null},
                    propertyId: {$ne: null}
                };

                // if (practiceType !== 'all' || selState !== 'all' || selCounty !== 'all') {
                //     let regexpProduct = `/${selState==='all'?'.*':selState}/${selCounty==='all'?'.*':selCounty}/${practiceType==='all'?'.*':practiceType}$`;
                //     let productIds = await db.models.Product.find({name: {$regex: new RegExp(regexpProduct, 'i')}}).exec();
                //     condition = {...condition, productId: {$in: productIds.map(prodId => mongoose.Types.ObjectId(prodId.id))}};
                // }

                if (practiceType.split(',').length < 30 || selState !== 'all' || selCounty !== 'all') {
                    let productIdsArr = [];
                    for(const practice of practiceType.split(',')){
                        let regexpProduct = `/${selState==='all'?'.*':selState}/${selCounty==='all'?'.*':selCounty}/${practice}$`;
                        console.log(regexpProduct);
                        const productIds = await db.models.Product.find({name: {$regex: new RegExp(regexpProduct, 'i')}}).exec();
                        for(const productId of productIds){
                            productIdsArr.push(productId._id);
                        }
                    }
                    condition = {...condition, productId: { $in: productIdsArr }};
                }

                // aggregateConditions = [
                //     {$lookup: {from: 'properties', localField: 'propertyId', foreignField: '_id', as: 'property'}},
                //     {$unwind: "$property"},
                //     {$lookup: {from: 'owners', localField: 'ownerId', foreignField: '_id', as: 'owner'}},
                //     {$unwind: "$owner"},
                //     {$lookup: {from: 'products', localField: 'productId', foreignField: '_id', as: 'product'}},
                //     {$unwind: "$product"},
                //     {
                //         $match: {
                //             'property.Last Sale Recording Date': {
                //                 $exists: true,
                //                 $nin: [
                //                     null, undefined, '', 'n/a', 'N/A', 'undefined', 'null'
                //                 ]
                //             }, ...filterProperty
                //         }
                //     }];

                aggregateConditions = [
                    {$lookup: {from: 'properties', localField: 'propertyId', foreignField: '_id', as: 'property'}},
                    {$unwind: "$property"},
                    {$lookup: {from: 'owners', localField: 'ownerId', foreignField: '_id', as: 'owner'}},
                    {$unwind: "$owner"},
                    {$lookup: {from: 'products', localField: 'productId', foreignField: '_id', as: 'product'}},
                    {$unwind: "$product"},
                    ];

                if (selZip && selZip !== 'null') {
                  aggregateConditions.push(
                    {
                      $match: {
                        'property.Property Zip': {
                          $in: [
                            selZip
                          ],
                        }
                      }
                    }
                  )
                }

                if(productIdsCount && productIdsCount != '' && productIdsCount != 'all'){
                    aggregateConditions.push(
                        {
                            $group: {
                                _id: { ownerId: "$ownerId" },
                                uniqueIds: { $addToSet: "$_id" },
                                count: { $sum: 1 } 
                                } }, 
                            { $match: { 
                                count: { $eq: parseInt(productIdsCount) } 
                            }
                        }
                    )
                    let docs: any[] = await db.models.OwnerProductProperty.aggregate([
                        { $match: condition },
                        ...aggregateConditions
                        ])

                    let uniqueIds = [];
                    for(const doc of docs){
                        for(const uniqueId of doc.uniqueIds){
                            uniqueIds.push(uniqueId);
                        }
                    }

                    aggregateConditions = [
                        {$lookup: {from: 'properties', localField: 'propertyId', foreignField: '_id', as: 'property'}},
                        {$unwind: "$property"},
                        {$lookup: {from: 'owners', localField: 'ownerId', foreignField: '_id', as: 'owner'}},
                        {$unwind: "$owner"},
                        {$lookup: {from: 'products', localField: 'productId', foreignField: '_id', as: 'product'}},
                        {$unwind: "$product"},
                    ];
                    condition = {
                        _id: { $in: uniqueIds }
                    };
                }

                // const outputFiles: any[] = [];
                const filename = 'export'; //TODO better filename
                if (existsSync(folderName)) {
                    rimraf.sync(folderName);
                }
                mkdirSync(folderName);

                const totalDocs = await db.models.OwnerProductProperty.countDocuments(condition).exec();
                let docsPerThread = Math.floor(totalDocs / THREADS);

                console.log(totalDocs + ' documents, ' + docsPerThread + ' docs per thread');

                const finishedThreads = Array(THREADS).fill(false);
                const finishedCallback = (threadNum: number, err: any) => {
                    // when all threads have finished querying the database, zip the files and send them to client
                    if (err) {
                        res.status(500).send(err);
                        return;
                    }

                    console.log('Thread ' + threadNum + ' finished');
                    finishedThreads[threadNum] = true;

                    if (finishedThreads.every((val) => val === true)) {
                        console.log('File created in ' + Math.round((new Date().getTime() - debugTime) / 1000) + ' seconds');
                        sendFileResponse(res, folderName);
                    }
                };

                // concurrently query the database with separate threads. Each threads queries a portion of the documents,
                // starting at a specific index.
                for (let i = 0; i < THREADS; i++) {
                    // get the first document for each thread so that it can start querying docs from that id
                    const docs = await db.models.OwnerProductProperty.aggregate([
                        {$match: condition},
                        {$skip: i * docsPerThread},
                        ...aggregateConditions]).limit(1);
                    console.log(JSON.stringify(docs));
                    console.log(JSON.stringify([
                        {$match: condition},
                        {$skip: i * docsPerThread},
                        ...aggregateConditions]));

                    // create file for thread and add first retrieve documents
                    const threadFilename = path.join(folderName, `${filename}_${i}.csv`);
                    const fileStream = createWriteStream(threadFilename, { flags: 'a' });

                    // if (existsSync(threadFilename)) {
                    //     unlinkSync(threadFilename);
                    // }
                    // outputFiles.push(fileStream);
                    if (docs[0]) {
                      fileStream.write(objectToCSV(transformer(docs[0]), true))
                      // appendFile(threadFilename, objectToCSV(transformer(docs[0]), true), (err) => {
                      //   console.log(`Thread #${i} appendFile failed ${err}`)
                      // });
                    }

                    let docsToQuery = docsPerThread - 1;
                    if (i === THREADS - 1) {
                        docsToQuery += totalDocs - (docsPerThread * THREADS); // the last thread takes all the remaining docs
                    }
                    queryDocs(i, docs[0]?._id, fileStream, docsToQuery, finishedCallback);
                }
            }
        } catch(err) {
            console.trace(err);
            res.status(500).send(err);
        }
    }
}


const queryDocs = async (threadNum: number,
                         startDocId: any,
                         fileStream: WriteStream,
                         remainingDocs: number,
                         callback: Function) => {

    try {
        let documents = []
        if (startDocId) {
          documents = await db.models.OwnerProductProperty.aggregate([
              {$match: { _id: { $gt: startDocId }}},
              {$match: condition},
              {$limit: Math.min(BATCH_SIZE, remainingDocs)},
              ...aggregateConditions]);
        }

        console.log('#' + threadNum + ': Got ' + documents.length + ' docs, ' + remainingDocs + ' remaining');

        for (const doc of documents) {
            fileStream.write(objectToCSV(transformer(doc)))
            // appendFile(fileStream, objectToCSV(transformer(doc)), () => {});
        }

        if (documents.length > 0 && remainingDocs - documents.length > 0) {
            const lastDocId = documents[documents.length - 1]._id;
            queryDocs(threadNum, lastDocId, fileStream, remainingDocs - documents.length, callback);
        } else {
            console.log(`Thread ${threadNum} finished, end stream.`);
            fileStream.end()
            fileStream.on("finish", () => {
              console.log(`Thread ${threadNum} stream finish event`);
              callback(threadNum);
            });
        }
    } catch (err) {
        console.trace(err);
        callback(threadNum, err);
    }
};


const sendFileResponse = (res: any, folderName: string) => {
    const archiveName = `${uuid()}_${ARCHIVE_NAME}`;
    if (existsSync(archiveName)) {
        unlinkSync(archiveName);
    }

    const archive = archiver('zip', { zlib: { level: 9 }});
    const output = createWriteStream(archiveName);

    output.on('close', () => {
        console.log(archive.pointer() + ' total bytes');
        res.download(archiveName, (err: any) => {
            if (err) {
                res.status(500).send(err);
            }

            rimraf.sync(folderName);
            rimraf.sync(archiveName);
        });
    });

    archive.on('error', (err: any) => {
        console.log('Archive error ', err)
        rimraf.sync(folderName);
        res.status(500).send(err);
    });

    archive.pipe(output);
    archive.directory(folderName, false);
    archive.finalize();
};

const transformer = (doc: any)=> {
    let last_sale_recording_date: any = normalizeDate(doc['property']?.['Last Sale Recording Date']);
    // check property address
    let property_address = doc['property']?.['Property Address'];
    let property_city = doc['property']?.['Property City'];
    let property_state = doc['property']?.['Property State'];
    let property_zip = doc['property']?.['Property Zip'];
    if (AddressService.detectFullAddress(property_address)) {
        const parsed_address = AddressService.getParsedAddress(property_address);
        if (parsed_address) {
            property_address = parsed_address.street_address;
            if (!property_city) property_city = parsed_address.city;
            if (!property_state) property_state = parsed_address.state;
            if (!property_zip) property_zip = parsed_address.zip;
        }
    }

    // check mailing address
    let mailing_address = doc['owner']?.['Mailing Address'];
    let mailing_city = doc['owner']?.['Mailing City'];
    let mailing_state = doc['owner']?.['Mailing State'];
    let mailing_zip = doc['owner']?.['Mailing Zip'];
    if (AddressService.detectFullAddress(mailing_address)) {
        const parsed_address = AddressService.getParsedAddress(mailing_address);
        if (parsed_address) {
            mailing_address = parsed_address.street_address;
            if (!mailing_city) mailing_city = parsed_address.city;
            if (!mailing_state) mailing_state = parsed_address.state;
            if (!mailing_zip) mailing_zip = parsed_address.zip;
        }
    }

    if(property_zip == '' && mailing_zip != ''){
        if(AddressService.compareFullAddress(property_address, mailing_address) && (property_state == mailing_state)){
            property_zip = mailing_zip;
            if(property_city == '') property_city = mailing_city;
        }
    }

    const practiceTypes: any = {
        'foreclosure': 'Foreclosure',
        'preforeclosure': 'Preforeclosure',
        'bankruptcy': 'Bankruptcy',
        'tax-lien': 'Tax Lien',
        'auction': 'Auction',
        'inheritance': 'Inheritance',
        'probate': 'Probate',
        'eviction': 'Eviction',
        'hoa-lien': 'Hoa Lien',
        'irs-lien': 'Irs Lien',
        'mortgage-lien': 'Mortgage Lien',
        'pre-inheritance': 'Pre Inheritance',
        'pre-probate': 'Pre Probate',
        'divorce': 'Divorce',
        'tax-delinquency': 'Tax Delinquency',
        'code-violation': 'Code Violation',
        'absentee-property-owner': 'Absentee Property Owner',
        'vacancy': 'Vacancy',
        'debt': 'Debt',
        'personal-injury': 'Personal Injury',
        'marriage': 'Marriage',
        'child-support': 'Child Support',
        'criminal': 'Criminal',
        'insurance-claims': 'Insurance Claims',
        'employment-discrimination': 'Employment Discrimination',
        'traffic': 'Traffic',
        'property-defect': 'Property Defect',
        'declaratory-judgment': 'Declaratory Judgment',
        'other-civil': 'Other Civil',
    };
    let record: any = {};

    record['Created At'] = moment(doc['createdAt']).format('MM-DD-YYYY').toString();
    record['Updated At'] = moment(doc['updatedAt']).format('MM-DD-YYYY').toString();
    const practiceType = doc['product']?.['name']?.split('/')[3]?.trim()
    record['Practice Type'] = practiceTypes[practiceType];
    record['Full Name'] = doc['owner']?.['Full Name'];
    record['First Name'] = doc['owner']?.['First Name'];
    record['Last Name'] = doc['owner']?.['Last Name'];
    record['Middle Name'] = doc['owner']?.['Middle Name'];
    record['Name Suffix'] = doc['owner']?.['Name Suffix'];
    // record['Phone'] = doc['owner']?.['Phone'];
    record['Mailing Address'] = mailing_address;
    record['Mailing Unit #'] = doc['owner']?.['Mailing Unit #'];
    record['Mailing City'] = mailing_city;
    record['Mailing State'] = mailing_state;
    record['Mailing Zip'] = mailing_zip;
    record['Property Address'] = property_address;
    record['Property Unit #'] = doc['property']?.['Property Unit #'];
    record['Property City'] = property_city;
    record['Property Zip'] = property_zip;
    record['Property State'] = property_state;
    record['County'] = doc['property']?.['County'];
    record['Owner Occupied'] = doc['property']?.['Owner Occupied'];
    record['Property Type'] = doc['property']?.['Property Type'];
    record['Total Assessed Value'] = doc['property']?.['Total Assessed Value'];
    record['Last Sale Recording Date'] = last_sale_recording_date;
    // record['Last Sale Recording Date Formatted'] = doc['property']?.['Last Sale Recording Date Formatted'];
    record['Last Sale Amount'] = doc['property']?.['Last Sale Amount'];
    record['Est Value'] = doc['property']?.['Est Value'];
    record['Est Equity'] = doc['property']?.['Est Equity'];
    record['Effective Year Built'] = doc['property']?.['Effective Year Built'];
    record['yearBuilt'] = doc['property']?.['yearBuilt'];
    record['parcel'] = doc['property']?.['parcel'];
    record['descbldg'] = doc['property']?.['descbldg'];
    record['listedPrice'] = doc['property']?.['listedPrice'];
    record['listedPriceType'] = doc['property']?.['listedPriceType'];
    record['listedPrice1'] = doc['property']?.['listedPrice1'],
    record['listedPriceType1'] = doc['property']?.['listedPriceType1'],
    record['sold'] = doc['property']?.['sold'],
    record['Sold Date'] = doc['property']?.['Sold Date'],
    record['soldAmount'] = doc['property']?.['soldAmount'],
    record['sqft'] = doc['property']['sqft'];
    record['sqftlot'] = doc['property']['sqftlot'];
    record['bedrooms'] = doc['property']['bedrooms'];
    record['bathrooms'] = doc['property']['bathrooms'];
    record['Toal Open Loans'] = doc['property']['Toal Open Loans'];
    record['Lien Amount'] = doc['property']['Lien Amount'];
    record['Est. Remaining balance of Open Loans'] = doc['property']['Est. Remaining balance of Open Loans'];
    record['Tax Lien Year'] = doc['property']['Tax Lien Year'];
    record['propertyFrom'] = doc['property']['propertyFrom'];
    return record;
    // return {
    //     'Full Name': doc['owner']?.['Full Name'],
    //     'First Name': doc['owner']?.['First Name'],
    //     'Last Name': doc['owner']?.['Last Name'],
    //     'Property Address': doc['property']?.['Property Address'],
    //     'Property Unit #': doc['property']?.['Property Unit #'],
    //     'Property City': doc['property']?.['Property City'],
    //     'Property State': doc['property']?.['Property State'],
    //     'Property Zip': doc['property']?.['Property Zip'],
    //     'Last Sale Recording Date': last_sale_recording_date,
    //     practiceType: doc['product']?.['name']?.split('/')?.[3],
    //     'Original Doc Type': doc['originalDocType'] || '',
    //     'Filling Date': doc['fillingDate'] || '',
    // }
};


const columnDelimiter = ',';
const objectToCSV = (obj: any, header: boolean = false) => {
    let result = '';
    let ctr = 0;

    if (header) {
        Object.keys(obj).forEach(key => {
            if (ctr > 0) {
                result += columnDelimiter;
            }
            result += key;
            ctr++;
        });
        result = result + '\n'
    }

    ctr = 0;
    Object.keys(obj).forEach(key => {
        if (ctr > 0) {
            result += columnDelimiter;
        }


        let field = obj[key]
        if (typeof obj[key] === "string") {
          field = field.replace(/'/g, "\'")
          field = field.replace(/"/g, "\"")
          field = field.replace(/[\n\r]/g, '')
          field = field.replace(/\s\s+/g, ' ').trim()
          if (field && field.includes(columnDelimiter)) {
            field = `"${field}"`
          }
        }

        result += field
        ctr++
    });

    return result + '\n';
};

