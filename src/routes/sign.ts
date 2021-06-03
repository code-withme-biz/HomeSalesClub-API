import axios from 'axios';

/**
https://19d992cd8c96.ngrok.io/v1/crm/sign/send?nameone=Sean%20Lundberg&emailone=seantlundberg@gmail.com&nametwo=Jon%20Lundberg&emailtwo=sean@homesalesclub.com&leadid=4437205000000676207
**/

// TESTING
exports.test = async function(req: any, res: any) {
    axios.get("https://www.zohoapis.com/crm/v2/functions/zohosigncreaterecord/actions/execute?auth_type=apikey&zapikey=1003.5186ced393a4284ab0e76989308645c9.5b04d9eb8ec67a1880269a1f6545d073", {
        params: {
            documentid: "123456",
            nameone: "test name",
            emailone: "testemail@gmail.com",
        }
    }).then((response) => {
        console.log(response?.data);
        return;
    });

    res.send({
        statusCode: 200,
        body: {
            resp: 'Zoho record update initialized.',
            success: true
        }
    });
}

// SENDS CONTRACTS FROM THE CRM
exports.send = async function(req: any, res: any) {


    // Email Validation
    function validEmail(email: string) {
        if (email) {
            if (/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(email)) {
                return true;
            }
        }
        return false;
    }

    //Set default HTTP response
    var httpResponse = {
        statusCode: 200,
        body: {
            resp: "Good",
            success: true
        }
    }

    //Assumes one seller on contract by default.
    var sellerCount: 1 | 2 = 1;
    var zapierUrl: string = "https://hooks.zapier.com/hooks/catch/7946440/o8jlbdu/";
    var sellernames: string = req.query.nameone;

    //Required Seller One Parameter Check
    if (!req.query.nameone || !req.query.emailone || !req.query.leadid) {
        httpResponse = {
            statusCode: 400,
            body: {
                resp: 'Missing seller one parameters.',
                success: false
            }
        }
    } else if (!validEmail(req.query.emailone)) {
        httpResponse = {
            statusCode: 400,
            body: {
                resp: 'Invalid seller one email.',
                success: false
            }
        }
    }

    //Required Seller Two Parameter Check If There Is A Second Seller, Sets New Endpoint URL
    if (req.query.secondseller && req.query.secondseller == 1) {
        sellerCount = 2;
        zapierUrl = "https://hooks.zapier.com/hooks/catch/7946440/ozsklx0/";
        sellernames = req.query.nameone + " & " + req.query.nametwo;
        if (!req.query.nametwo || !req.query.emailtwo) {
            httpResponse = {
                statusCode: 400,
                body: {
                    resp: 'Missing seller two parameters.',
                    success: false
                }
            }
        } else if (!validEmail(req.query.emailtwo)) {
            httpResponse = {
                statusCode: 400,
                body: {
                    resp: 'Invalid seller two email.',
                    success: false
                }
            }
        }
    }

    //Get Month and Day Values
    function ordinal_suffix_of(i: any) {
        var j = i % 10,
            k = i % 100;
        if (j == 1 && k != 11) {
            return i + "st";
        }
        if (j == 2 && k != 12) {
            return i + "nd";
        }
        if (j == 3 && k != 13) {
            return i + "rd";
        }
        return i + "th";
    }

    var monthNames = ["January", "February", "March", "April", "May","June","July", "August", "September", "October", "November","December"];
    var mydate = new Date();
    var currentmonth = monthNames[mydate.getMonth()].toString();
    var currentday = ordinal_suffix_of(mydate.getDate()).toString();

    //POST to Zapier
    if (httpResponse.statusCode === 200) {
        axios.post(zapierUrl, {
                sendzohosign: {
                    nameone: req.query.nameone || "",
                    emailone: req.query.emailone || "",
                    nametwo: req.query.nametwo || "",
                    emailtwo: req.query.emailtwo || "",
                    zid: req.query.leadid || "",
                    pf_property_address: req.query.address || "",
                    pf_seller_names: sellernames || "",
                    pf_contract_offer_amount: req.query.offeramount || "",
                    pf_emd: req.query.emd || "",
                    pf_closing_costs: req.query.closingcosts || "",
                    pf_inspection_period: req.query.inspectionperiod || "",
                    pf_closing_days: req.query.closingdays || "",
                    pf_other_terms: req.query.otherterms || "",
                    pf_personal_property: req.query.personalproperty || "",
                    pf_titlecompany: req.query.titlecompany || "",
                    pf_day_number: currentday || "",
                    pf_month_number: currentmonth || "",
                }
            })
            .then((response) => {
                //Use Response
                if (response.data?. ["status"] == 'success') {
                    console.log(response.data);
                } else {
                    httpResponse = {
                        statusCode: 400,
                        body: {
                            resp: 'Zapier did not return success.',
                            success: false
                        }
                    }
                }
            }, (error) => {
                httpResponse = {
                    statusCode: 400,
                    body: {
                        resp: 'Zapier POST error.',
                        success: false
                    }
                }
                console.log(error);
            });
    }
    // Send Response
    res.send(httpResponse);
}


// UPDATES CONTRACT CHANGES INTO THE CRM
exports.webhook = async function(req: any, res: any) {

    // Zoho Modifications
    function zohoCreateRecord(requestbody: any) {
        //SELLER DATA ARRAY - GETS SENT TO ZOHO AFTER GETTING POPULATED
        var sellerData = {
            documentid: requestbody.body.requests?. ["document_ids"][0]?.document_id.toString(),
            sellercount: requestbody.body.requests?. ["actions"].length - 1,
            nameone: "",
            emailone: "",
            nametwo: "",
            emailtwo: "",
        }
        // 1 Seller
        if (sellerData.sellercount == 1) {
            let i: any;
            for (i = 0; i < 2; i++) {
                if (requestbody.body.requests?. ["actions"]?. [i]?.signing_order == 1) {
                    console.log("1 Seller: Seller 1");
                    console.log(requestbody.body.requests?. ["actions"]?. [i]?.recipient_name);
                    console.log(requestbody.body.requests?. ["actions"]?. [i]?.recipient_email);
                    sellerData.nameone = requestbody.body.requests?. ["actions"]?. [i]?.recipient_name.toString();
                    sellerData.emailone = requestbody.body.requests?. ["actions"]?. [i]?.recipient_email.toString();
                }
            }
        } else {
            // 2 Sellers
            let i: any;
            for (i = 0; i < 3; i++) {
                if (requestbody.body.requests?. ["actions"]?. [i]?.signing_order == 1) {
                    console.log("2 Sellers: Seller 1");
                    console.log(requestbody.body.requests?. ["actions"]?. [i]?.recipient_name);
                    console.log(requestbody.body.requests?. ["actions"]?. [i]?.recipient_email);
                    sellerData.nameone = requestbody.body.requests?. ["actions"]?. [i]?.recipient_name.toString();
                    sellerData.emailone = requestbody.body.requests?. ["actions"]?. [i]?.recipient_email.toString();
                }
                if (requestbody.body.requests?. ["actions"]?. [i]?.signing_order == 2) {
                    console.log("2 Sellers: Seller 2");
                    console.log(requestbody.body.requests?. ["actions"]?. [i]?.recipient_name);
                    console.log(requestbody.body.requests?. ["actions"]?. [i]?.recipient_email);
                    sellerData.nametwo = requestbody.body.requests?. ["actions"]?. [i]?.recipient_name.toString();
                    sellerData.emailtwo = requestbody.body.requests?. ["actions"]?. [i]?.recipient_email.toString();
                }
            }
        }
        //Create CONTRACT Record in Zoho
        axios.get("https://www.zohoapis.com/crm/v2/functions/zohosigncreaterecord/actions/execute?auth_type=apikey&zapikey=1003.5186ced393a4284ab0e76989308645c9.5b04d9eb8ec67a1880269a1f6545d073", {
            params: {
                documentid: sellerData.documentid.toString(),
                sellercount: sellerData.sellercount.toString(),
                nameone: sellerData.nameone,
                emailone: sellerData.emailone,
                nametwo: sellerData.nametwo,
                emailtwo: sellerData.emailtwo,
            }
        }).then((response) => {
            console.log(response?.data);
            return;
        });
    }

    //UPDATE RECORD WITH STATUS FROM CONTRACT
    function zohoUpdateRecord(requestbody: any, updatetype: any) {
        var sellerData = {
            documentid: requestbody.body.requests?. ["document_ids"][0]?.document_id.toString(),
            contractstatus: requestbody.body.notifications?. ["operation_type"].toString(),
            sellercount: requestbody.body.requests?. ["actions"].length - 1,
            selleronestatus: "",
            sellertwostatus: "",
            hscstatus: ""
        };

        // 1 Seller
        if (sellerData.sellercount == 1) {
            let i: any;
            for (i = 0; i < 2; i++) {
                if (requestbody.body.requests?. ["actions"]?. [i]?.signing_order == 1) {
                    sellerData.selleronestatus = requestbody.body.requests?. ["actions"]?. [i]?.action_status.toString();
                }
                if (requestbody.body.requests?. ["actions"]?. [i]?.signing_order == 2) {
                    sellerData.hscstatus = requestbody.body.requests?. ["actions"]?. [i]?.action_status.toString();
                }
            }
        } else {
            // 2 Sellers
            let i: any;
            for (i = 0; i < 3; i++) {
                if (requestbody.body.requests?. ["actions"]?. [i]?.signing_order == 1) {
                    sellerData.selleronestatus = requestbody.body.requests?. ["actions"]?. [i]?.action_status.toString();
                }
                if (requestbody.body.requests?. ["actions"]?. [i]?.signing_order == 2) {
                    sellerData.sellertwostatus = requestbody.body.requests?. ["actions"]?. [i]?.action_status.toString();
                }
                if (requestbody.body.requests?. ["actions"]?. [i]?.signing_order == 3) {
                    sellerData.hscstatus = requestbody.body.requests?. ["actions"]?. [i]?.action_status.toString();
                }
            }
        }

        if (updatetype == "status") {
            axios.get("https://www.zohoapis.com/crm/v2/functions/zohosignupdate/actions/execute?auth_type=apikey&zapikey=1003.5186ced393a4284ab0e76989308645c9.5b04d9eb8ec67a1880269a1f6545d073", {
                params: {
                    documentid: sellerData.documentid.toString(),
                    contractstatus: sellerData.contractstatus.toString(),
                    sellercount: sellerData.sellercount.toString(),
                    selleronestatus: sellerData.selleronestatus.toString(),
                    sellertwostatus: sellerData.sellertwostatus.toString(),
                    hscstatus: sellerData.hscstatus.toString(),
                }
            }).then((response) => {
                console.log(response?.data);
                return;
            });
        }
        return;
    }

    //CHOSE THE ACTION THAT THE WEBHOOK WILL PREFORM
    switch (req.body.notifications?. ["operation_type"]) {
        case "RequestSubmitted":
            // Create new record in Zoho
            zohoCreateRecord(req);
            break;
        case "RequestViewed":
            // Triggers when the document is viewed.
            break;
        case "RequestSigningSuccess":
            // Update record
            zohoUpdateRecord(req, "status");
            break;
        case "RequestRecalled":
            zohoUpdateRecord(req, "status");
            break;
        default:

    }

    // console.log("***********Operation Type:");
    // console.log(req.body.notifications?. ["operation_type"]);

    // console.log("***********Request Body:");
    // console.log(req.body);

    // console.log("******************Document ID:");
    // console.log(req.body.requests?. ["document_ids"][0]?.document_id);

    // console.log("****************Actions:");
    // console.log(req.body.requests?. ["actions"]);

    //In the update back to Zoho, the Zoho function should check for duplicate contracts for that person.
    //Prevent contract from being sent if there is currently one that is in pending -- contract should be canceled in ZohoSign before sending a new one

    //document id? 159536000000012001 -- comes from response of intial request to zapier endpoint
    // if req.body.requests?.["actions"]?.["action_status"] == 'VIEWED', ignore?

    res.send({
        statusCode: 200,
        body: {
            resp: 'Zoho record update initialized.',
            success: true
        }
    });
}