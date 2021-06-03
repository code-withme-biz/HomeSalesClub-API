import axios from 'axios';
import moment from 'moment-timezone';

//Gets hit by Convoso "Seller Leads - Call Completed" workflow
exports.recordUpdate = async function (req: any, res: any) {
    console.log(req.body);
    const zohoUrl = `https://www.zohoapis.com/crm/v2/functions/convosorecordupdate/actions/execute?auth_type=apikey&zapikey=1003.5186ced393a4284ab0e76989308645c9.5b04d9eb8ec67a1880269a1f6545d073&zoho_record_type=${req.body.zoho_record_type}&zoho_record_id=${req.body.zoho_record_id}&convoso_lead_id=${req.body.convoso_lead_id}&convoso_status=${req.body.convoso_status}&convoso_list_id=${req.body.convoso_list_id}`;
    let zohoGet = await axios.get(zohoUrl);
    res.send({
        statusCode: zohoGet.status,
        body: { 
            resp: 'Zoho record update initialized.',
            success: true
        }
    });
}


//Gets hit by Convoso "Seller Leads - Acquisitions Call Scheduled" workflow
exports.callback = async function (req: any, res: any) {
    //Search for callbacks in Convoso API, determine most recent callback to save.
    axios.get("https://api.convoso.com/v1/callbacks/search", {
        params: {
            auth_token: "2fh297izhwoulww1cthekhsstpi3gsz8",
            lead_id: req.body?.convoso_lead_id,
            recipient: 'Personal'
        }
    }).then((response) => {
        let results = response?.data.data.results;
        let chosenCallback = {
            save_this: 'No',
            callback_time: ''
        };
        if(results.length > 0) {
            let largestNum = 0;
            let largestIndex = 0;
            for (var i = 0; i < results.length; i++) {
                console.log();
                if(parseInt(results[i]?.id) > largestNum) {
                    largestNum = parseInt(results[i]?.id);
                    largestIndex = i;
                }
            }
            chosenCallback = results[largestIndex];
            chosenCallback.save_this = 'Yes';
        }
        return chosenCallback;
    }).then((response) => {
        if(response?.save_this == "Yes") {
            //Convert PST (Convosos Default) to EST, then to UNIX
            var callbackdate = moment.tz(response.callback_time, "America/Los_Angeles").valueOf();
            axios.get("https://www.zohoapis.com/crm/v2/functions/convososavecallback/actions/execute?auth_type=apikey&zapikey=1003.5186ced393a4284ab0e76989308645c9.5b04d9eb8ec67a1880269a1f6545d073", {
                params: {
                    zoho_record_id: req.body.zoho_record_id,
                    callback_date: callbackdate,
                }
            }).then((response) => {
                console.log(response?.data);
                return;
            });
        }
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