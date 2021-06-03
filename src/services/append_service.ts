import axios from 'axios';
import { AnyARecord } from 'dns';
import { IArguments, IResponse } from './../interfaces/iappend';

export default class AppendService {

    //Helper functions available to providers
    cleanArguments(parameters: any) {
        return Object.keys(parameters).forEach((key) => (parameters[key] == null) && delete parameters[key]);
    }



    //****************************************************** Provider 1 ******************************************************//
    async provider1(parameters: IArguments): Promise<IResponse> {
        console.log("Data Append: Provider 1 started...");
        const knownData = parameters.knownData;

        //Prepare Response
        var appendResponse: IResponse = {
            'knownData': knownData,
            'results': {
                'phoneFound': false,
                'foundData': {}
            },
            'error': false,
            'requiredDataAvailable': true,
            'message':'',
            'provider':'Provider1'
        }

        // (1) Provider Data Mapping - Map our data to how the provider requires the data.
        let providerMappings = {
            'address': knownData?.address_1,
            'city': knownData?.city,
            'state': knownData?.state,
        }
        this.cleanArguments(providerMappings);

        // (2) Check if necessary mappings are available
        if(!providerMappings.address) {
            appendResponse.requiredDataAvailable = false;
        }

        // (3) Send Request to Provider
        if(appendResponse.requiredDataAvailable) {

            //Request Try/Catch
            try {

                //Create GET Request to Provider
                let response = await axios.get("https://postman-echo.com/get?phone=4806661267", {
                    params: providerMappings
                }).then((response) => {

                    let returnedData = response.data.args;

                    appendResponse.results.phoneFound = true;
                    appendResponse.results.foundData = {
                        'phone': returnedData?.phone
                    };
                });


            } catch (error) {
                console.log(error);
                appendResponse.error = true;
                appendResponse.message = error;

            }


        }

        return appendResponse;
    };






    //****************************************************** Provider 2 ******************************************************//
    async provider2(parameters: IArguments): Promise<IResponse> {
        console.log("Data Append: Provider 2 started...");
        const knownData = parameters.knownData;

        //Prepare Response
        var appendResponse: IResponse = {
            'knownData': knownData,
            'results': {
                'phoneFound': false,
                'foundData': {}
            },
            'error': false,
            'requiredDataAvailable': true,
            'message':'',
            'provider':'Provider2'
        }


        // (1) Provider Data Mapping - Map our data to how the provider requires the data.
        let providerMappings = {
            'address': knownData?.address_1,
            'city': knownData?.city,
            'state': knownData?.state,
        }
        this.cleanArguments(providerMappings);

        // (2) Check if necessary mappings are available
        if(!providerMappings.address) {
            appendResponse.requiredDataAvailable = false;
        }

        // (3) Send Request to Provider
        if(appendResponse.requiredDataAvailable) {

            //Request Try/Catch
            try {

                //Create GET Request to Provider
                let response = await axios.get("https://postman-echo.com/get?phone=4806661267", {
                    params: providerMappings
                }).then((response) => {

                    let returnedData = response.data.args;

                    appendResponse.results.phoneFound = true;
                    appendResponse.results.foundData = {
                        'phone': returnedData?.phone
                    };
                });


            } catch (error) {
                console.log(error);
                appendResponse.error = true;
                appendResponse.message = error;

            }


        }

        return appendResponse;
    };





       //****************************************************** Provider 3 ******************************************************//
       async provider3(parameters: IArguments): Promise<IResponse> {
        console.log("Data Append: Provider 3 started...");
        const knownData = parameters.knownData;

        //Prepare Response
        var appendResponse: IResponse = {
            'knownData': knownData,
            'results': {
                'phoneFound': false,
                'foundData': {}
            },
            'error': false,
            'requiredDataAvailable': true,
            'message':'',
            'provider':'Provider3'
        }


        // (1) Provider Data Mapping - Map our data to how the provider requires the data.
        let providerMappings = {
            'address': knownData?.address_1,
            'city': knownData?.city,
            'state': knownData?.state,
        }
        this.cleanArguments(providerMappings);

        // (2) Check if necessary mappings are available
        if(!providerMappings.address) {
            appendResponse.requiredDataAvailable = false;
        }

        // (3) Send Request to Provider
        if(appendResponse.requiredDataAvailable) {

            //Request Try/Catch
            try {

                //Create GET Request to Provider
                let response = await axios.get("https://postman-echo.com/get?phone=4806661267", {
                    params: providerMappings
                }).then((response) => {

                    let returnedData = response.data.args;

                    appendResponse.results.phoneFound = true;
                    appendResponse.results.foundData = {
                        'phone': returnedData?.phone
                    };
                });


            } catch (error) {
                console.log(error);
                appendResponse.error = true;
                appendResponse.message = error;

            }


        }

        return appendResponse;
    };



}