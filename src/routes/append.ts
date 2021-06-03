import axios from 'axios';
import AppendService from '../services/append_service';
import { IArguments, IResponse } from './../interfaces/iappend';

// Waterfall Append - this goes through the different append services until a result is determined.
// http://localhost/v1/data/append?address_1=2514%20E%20Hillery%20Dr&city=Phoenix&state=Arizona
exports.waterfall = async function(req: any, res: any) {

    // Prepare Services & Argument Data
    let AppendServices = new AppendService();

    const argumentData: IArguments = {
        knownData: {
            "address_1": req.query?.address_1,
            "city": req.query?.city,
            "state": req.query?.state,
        }
    };


    // Service List - In order of service priority
    let serviceWaterfall: any = {
        1: (wfData: any) => AppendServices.provider1(wfData),
        2: (wfData: any) => AppendServices.provider2(wfData),
        3: (wfData: any) => AppendServices.provider3(wfData)
    };

    // Iterate through waterfall
    var continueWaterfall = true;
    var waterfallCount: number = 1;
    var waterfallLength = Object.keys(serviceWaterfall).length;
    while (continueWaterfall) {
        if((waterfallLength+1) == waterfallCount) {
            continueWaterfall = false;
        } else {
            let theseResults = await serviceWaterfall[waterfallCount](argumentData)
            .then((response: any) => {
                if(response.results.phoneFound && !response.error) {
                    continueWaterfall = false;
                    response["providerPosition"] = waterfallCount;
                    // Send Response
                    sendResponse(200, response);
                } else {
                    console.log(response);
                }
            });
        }
        waterfallCount++;
    }


    function sendResponse(code: number, dataResponse: any) {
        res.send({
            statusCode: code,
            body: dataResponse
        });

    }



}