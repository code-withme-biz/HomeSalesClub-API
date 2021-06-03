import { launchBrowser, setParamsForPage, sleep, getFormattedDate } from '../../../services/general_service';
const json2csv = require('json2csv');
const fs = require('fs');

setTimeout(() => {
    console.log('Stopped because exceeded the time limit! (3 hours)');
    process.exit();
}, 10800000); // 3 hours

const dateInput: string = process.argv[2]; // YYYY-MM-DD

( async () => {
    const username = 'REG02807';
    const password = 'Dan000ppp';

    let date = new Date(dateInput);
    console.log(date);
    let dateString = getFormattedDate(date);
    if(!dateString){
        console.log('Date incorrect!');
        process.exit();
    }
    const browser = await launchBrowser();
    const page = await browser.newPage();
    await setParamsForPage(page);
    await page.goto('https://ccmspa.pinellascounty.org/reguseraccess/Login.aspx', {waitUntil: 'networkidle0'});
    console.log('Page loaded, logging in...');
    await page.type('#UserName', username, {delay: 150});
    await page.type('#Password', password, {delay: 150});
    let signIn = await page.$x('//input[@value="Sign On"]');
    await Promise.all([
        signIn[0].click(),
        page.waitForNavigation()
    ]);
    let checkLoggedIn = await page.$x('//a[text()="Probate Case Records"]');
    if(checkLoggedIn.length < 1){
        console.log('Login failed!');
        process.exit();
    }
    let recordsAvailable = ['Probate Case Records', 'Civil, Family Case Records', 'Criminal & Traffic Case Records'];
    let dataProbate: any = [];
    let dataCivil: any = [];
    let dataCriminal: any = [];
    for(const record of recordsAvailable){
        console.log('Processing =>', record, ' - ', dateString);
        await page.goto('https://ccmspa.pinellascounty.org/reguseraccess/default.aspx', {waitUntil: 'networkidle0'});
        let recordLink = await page.$x('//a[text()="'+record+'"]');
        await Promise.all([
            recordLink[0].click(),
            page.waitForNavigation()
        ]);
        await page.click('#DateFiled');
        await sleep(1000);
        await page.type('#DateFiledOnAfter', dateString, {delay: 150});
        await page.type('#DateFiledOnBefore', dateString, {delay: 150});
        await Promise.all([
            page.click('#SearchSubmit'),
            page.waitForNavigation()
        ]);
        let caseDetailLinks = await page.$x('//a[contains(@href, "CaseDetail")]');
        for(let i = 0; i < caseDetailLinks.length; i++){
            // await sleep(3000);
            caseDetailLinks = await page.$x('//a[contains(@href, "CaseDetail")]');
            await caseDetailLinks[i].click();
            try{
                await page.waitForXPath('//div[@class="ssCaseDetailROA"]', {visible: true});
            } catch(e){
                continue;
            }
            let subData = {
                'CaseNumber': '',
                'CaseType': '',
                'FillingDate': '',
                'Defendant/DecedentName': '',
                'Defendant/DecedentAddress': '',
                'Defendant/DecedentCity': '',
                'Defendant/DecedentZip': '',
                'Defendant/DecedentState': '',
                'Plaintiff/PetitionerName': '',
                'Plaintiff/PetitionerAddress': '',
                'Plaintiff/PetitionerCity': '',
                'Plaintiff/PetitionerZip': '',
                'Plaintiff/PetitionerState': ''
            };
            let caseTypeHandle = await page.$x('//th[contains(text(), "Case Type:")]/parent::tr/td');
            let caseType = await caseTypeHandle[0].evaluate((el: any) => el.textContent?.trim());
            if(record == 'Probate Case Records'){
                caseType = 'PROBATE - '+caseType;
            }
            subData['CaseType'] = caseType;
            let dateFilledHandle = await page.$x('//th[contains(text(), "Date Filed:")]/parent::tr/td');
            let dateFilled = await dateFilledHandle[0].evaluate((el: any) => el.textContent?.trim());
            subData['FillingDate'] = dateFilled;
            let caseIdHandle = await page.$x('//div[contains(., "Case No.")]/span');
            let caseId = await caseIdHandle[0].evaluate((el: any) => el.textContent?.trim());
            subData['CaseNumber'] = caseId;
            console.log(caseId);
            let nameHandlesDefendant = await page.$x('//th[contains(text(), "DEFENDANT") or contains(text(), "DECEDENT") or contains(text(), "GUARDIAN") or contains(text(), "RESPONDENT")]/parent::tr/th[2]');
            let nameHandlesPlaintiff = await page.$x('//th[contains(text(), "PLAINTIFF") or contains(text(), "FILER") or contains(text(), "PETITIONER") or contains(text(), "TRUSTEE")]/parent::tr/th[2]');
            for(const nameHandle of nameHandlesDefendant){
                let name = await nameHandle.evaluate((el: any) => el.textContent?.trim());
                let nameId = await nameHandle.evaluate((el: any) => el.getAttribute('id').trim());
                let addressRowHandle = await page.$x('//td[contains(@headers, "'+nameId+'") and contains(., " FL ") and contains(@rowspan, "2")=false]/text()[last()-1]');
                let propertyZip = '';
                let propertyAddress = '';
                let propertyCity = '';
                let propertyState = '';
                try{
                    if (addressRowHandle.length > 0){
                        let addressHandle = await page.$x('//td[contains(@headers, "'+nameId+'") and contains(., " FL ") and contains(@rowspan, "2")=false]/text()[last()-1]');
                        propertyAddress = await addressHandle[0].evaluate((el: any) => el.textContent?.trim());
                        if(propertyAddress.match(/^unit|apt|lot/i)){
                            addressHandle = await page.$x('//td[contains(@headers, "'+nameId+'") and contains(., " FL ") and contains(@rowspan, "2")=false]/text()[1]');
                            propertyAddress = await addressHandle[0].evaluate((el: any) => el.textContent?.trim());
                        }
                        try{
                            let cityStateZipHandle = await page.$x('//td[contains(@headers, "'+nameId+'") and contains(., " FL ") and contains(@rowspan, "2")=false]/text()[last()]');
                            let cityStateZip = await cityStateZipHandle[0].evaluate((el: any) => el.textContent?.trim());
                            let cityStateZipArr = cityStateZip.split(',');
                            propertyCity = cityStateZipArr[0].trim();
                            let stateZip = cityStateZipArr[1].trim();
                            let stateZipArr = stateZip.split(/\s+/g);
                            propertyZip = stateZipArr[1];
                            propertyState = stateZipArr[0];
                        } catch(e){
                            let cityStateZipHandle = await page.$x('//td[contains(@headers, "'+nameId+'") and contains(., " FL ") and contains(@rowspan, "2")=false]/text()[last()]');
                            let cityStateZip = await cityStateZipHandle[1].evaluate((el: any) => el.textContent?.trim());
                            let cityStateZipArr = cityStateZip.split(',');
                            propertyCity = cityStateZipArr[0].trim();
                            let stateZip = cityStateZipArr[1].trim();
                            let stateZipArr = stateZip.split(/\s+/g);
                            propertyZip = stateZipArr[1];
                            propertyState = stateZipArr[0];
                        }
                    } else {
                        let addressHandle = await page.$x('//td[contains(@headers, "'+nameId+'") and contains(., ", ") and contains(@rowspan, "2")=false]/text()[last()-1]');
                        if(propertyAddress.match(/^unit|apt|lot/i)){
                            addressHandle = await page.$x('//td[contains(@headers, "'+nameId+'") and contains(., ", ") and contains(@rowspan, "2")=false]/text()[1]');
                            propertyAddress = await addressHandle[0].evaluate((el: any) => el.textContent?.trim());
                        }
                        if(addressHandle.length > 0){
                            propertyAddress = await addressHandle[0].evaluate((el: any) => el.textContent?.trim());
                            try{
                                let cityStateZipHandle = await page.$x('//td[contains(@headers, "'+nameId+'") and contains(., ", ") and contains(@rowspan, "2")=false]/text()[last()]');
                                let cityStateZip = await cityStateZipHandle[0].evaluate((el: any) => el.textContent?.trim());
                                let cityStateZipArr = cityStateZip.split(',');
                                propertyCity = cityStateZipArr[0].trim();
                                let stateZip = cityStateZipArr[1].trim();
                                let stateZipArr = stateZip.split(/\s+/g);
                                propertyZip = stateZipArr[1];
                                propertyState = stateZipArr[0];
                            } catch(e){
                                let cityStateZipHandle = await page.$x('//td[contains(@headers, "'+nameId+'") and contains(., ", ") and contains(@rowspan, "2")=false]/text()[last()]');
                                let cityStateZip = await cityStateZipHandle[1].evaluate((el: any) => el.textContent?.trim());
                                let cityStateZipArr = cityStateZip.split(',');
                                propertyCity = cityStateZipArr[0].trim();
                                let stateZip = cityStateZipArr[1].trim();
                                let stateZipArr = stateZip.split(/\s+/g);
                                propertyZip = stateZipArr[1];
                                propertyState = stateZipArr[0];
                            }
                        }
                    }
                } catch(e){

                }
                subData['Defendant/DecedentName'] = name;
                subData['Defendant/DecedentAddress'] = propertyAddress;
                subData['Defendant/DecedentCity'] = propertyCity;
                subData['Defendant/DecedentZip'] = propertyZip;
                subData['Defendant/DecedentState'] = propertyState;
                break;
            }
            for(const nameHandle of nameHandlesPlaintiff){
                let name = await nameHandle.evaluate((el: any) => el.textContent?.trim());
                let nameId = await nameHandle.evaluate((el: any) => el.getAttribute('id').trim());
                let addressRowHandle = await page.$x('//td[contains(@headers, "'+nameId+'") and contains(., ", ") and contains(@rowspan, "2")=false]/text()[last()-1]');
                let propertyZip = '';
                let propertyAddress = '';
                let propertyCity = '';
                let propertyState = '';
                if (addressRowHandle.length > 0){
                    let addressHandle = await page.$x('//td[contains(@headers, "'+nameId+'") and contains(., ", ") and contains(@rowspan, "2")=false]/text()[last()-1]');
                    propertyAddress = await addressHandle[0].evaluate((el: any) => el.textContent?.trim());
                    if(propertyAddress.match(/^unit|apt|lot/i)){
                        addressHandle = await page.$x('//td[contains(@headers, "'+nameId+'") and contains(., ", ") and contains(@rowspan, "2")=false]/text()[1]');
                        propertyAddress = await addressHandle[0].evaluate((el: any) => el.textContent?.trim());
                    }
                    try{
                        let cityStateZipHandle = await page.$x('//td[contains(@headers, "'+nameId+'") and contains(., ", ") and contains(@rowspan, "2")=false]/text()[last()]');
                        let cityStateZip = await cityStateZipHandle[0].evaluate((el: any) => el.textContent?.trim());
                        let cityStateZipArr = cityStateZip.split(',');
                        propertyCity = cityStateZipArr[0].trim();
                        let stateZip = cityStateZipArr[1].trim();
                        let stateZipArr = stateZip.split(/\s+/g);
                        propertyZip = stateZipArr[1];
                        propertyState = stateZipArr[0];
                    } catch(e){
                        let cityStateZipHandle = await page.$x('//td[contains(@headers, "'+nameId+'") and contains(., ", ") and contains(@rowspan, "2")=false]/text()[last()]');
                        let cityStateZip = await cityStateZipHandle[1].evaluate((el: any) => el.textContent?.trim());
                        let cityStateZipArr = cityStateZip.split(',');
                        propertyCity = cityStateZipArr[0].trim();
                        let stateZip = cityStateZipArr[1].trim();
                        let stateZipArr = stateZip.split(/\s+/g);
                        propertyZip = stateZipArr[1];
                        propertyState = stateZipArr[0];
                    }
                }
                subData['Plaintiff/PetitionerName'] = name;
                subData['Plaintiff/PetitionerAddress'] = propertyAddress;
                subData['Plaintiff/PetitionerCity'] = propertyCity;
                subData['Plaintiff/PetitionerZip'] = propertyZip;
                subData['Plaintiff/PetitionerState'] = propertyState;
                break;
            }
            console.log(subData);
            if(record == 'Probate Case Records'){
                dataProbate.push(subData);
            } else if(record == 'Civil, Family Case Records'){
                dataCivil.push(subData);
            } else {
                dataCriminal.push(subData);
            }
            await Promise.all([
                page.goBack(),
                // page.waitForNavigation()
                page.waitForXPath('//a[contains(@href, "CaseDetail")]')
            ]);
        }
    }

    let count = 0;
    if(dataProbate.length > 0){
        count += dataProbate.length;
        const csv = json2csv.parse(dataProbate);
        fs.writeFileSync('pinellas-odyssey-probate_'+dateInput+'.csv', csv);
    } else {
        fs.writeFileSync('pinellas-odyssey-probate_'+dateInput+'.csv', '');
    }
    if(dataCivil.length > 0){
        count += dataCivil.length;
        const csv = json2csv.parse(dataCivil);
        fs.writeFileSync('pinellas-odyssey-civil_'+dateInput+'.csv', csv);
    } else {
        fs.writeFileSync('pinellas-odyssey-civil_'+dateInput+'.csv', '');
    }
    if(dataCriminal.length > 0){
        count += dataCriminal.length;
        const csv = json2csv.parse(dataCriminal);
        fs.writeFileSync('pinellas-odyssey-criminal&traffic_'+dateInput+'.csv', csv);
    } else {
        fs.writeFileSync('pinellas-odyssey-criminal&traffic_'+dateInput+'.csv', '');
    }
    console.log('Total records: ', count);
    console.log('Done.');
    
    process.exit();
})();