import axios from 'axios';
import xmlParser from 'xml2json';
exports.recordUpdate = async function (req: any, res: any) {

    if(!req.query.address || !req.query.city || !req.query.state || !req.query.zipcode || !req.query.recordid) {
        console.log("Missing URL parameters.")
        res.send({
            statusCode: 400,
            body: { 
                resp: 'Missing URL parameters.',
                success: false
            }
        });
    } else {
        axios.get('https://www.zillow.com/webservice/GetDeepSearchResults.htm', {
            params: {
                'zws-id': 'X1-ZWz1hj5qt65bt7_2kpit',
                address: req.query.address,
                citystatezip: `${req.query.city},${req.query.state},${req.query.zipcode}`
            }
        })
        .then((response) => {
          const zillowResults = JSON.parse(xmlParser.toJson(response.data))?.["SearchResults:searchresults"]?.["response"]?.["results"]?.["result"];
          if(zillowResults !== undefined) {
                let zohoGet = axios.get('https://www.zohoapis.com/crm/v2/functions/zillowrecordupdate/actions/execute', {
                    params: {
                        auth_type: 'apikey',
                        zapikey: '1003.5186ced393a4284ab0e76989308645c9.5b04d9eb8ec67a1880269a1f6545d073',
                        zoho_record_type: 'Leads',
                        zoho_record_id: req.query.recordid,
                        Z_Zestimate: zillowResults?.["zestimate"]?.["amount"]?.["$t"] || "",
                        Z_Property_Link: zillowResults?.["links"]?.["homedetails"] || "",
                        Z_Last_Sold_Price: zillowResults?.["lastSoldPrice"]?.["$t"] || "",
                        Z_Last_Sold_Date: zillowResults?.["lastSoldDate"] || "",
                        Z_Bedrooms: zillowResults?.["bedrooms"] || "",
                        Z_Bathrooms: zillowResults?.["bathrooms"] || "",
                        Z_Use_Code: zillowResults?.["useCode"] || "",
                        Z_Finished_Sq_Ft: zillowResults?.["finishedSqFt"] || "",
                        Z_Year_Built: zillowResults?.["yearBuilt"] || "",
                    }
                });
                return zohoGet;
            } else {
                return;
            }
        });
 
        res.send({
            statusCode: 200,
            body: { 
                resp: 'Done.',
                success: true
            }
        });

    }
}