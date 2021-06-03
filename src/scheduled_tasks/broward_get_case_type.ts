import ParserFactory from '../parsers/factory_parser'
import { groupByKey } from '../core/collectionable';
import { parseCsv } from '../routes/import';
import csv from 'csvtojson'
import S3Service from '../services/s3_service';
import { launchBrowser, launchTorBrowser, setParamsForPage, clearPage, isEmptyOrSpaces, sleep, resolveRecaptcha2 } from '../services/general_service';
import db from '../models/db';

// setTimeout(() => {
//     console.log('Stopped because exceeded the time limit! (48 hours)');
//     process.exit();
// }, 172800000); // 48 hours

( async () => {

    // example folderName: 'fl/broward/2021-05-06'
    const getKeys = async (folderName: string) => {
        let keys = [];
        const s3Service = new S3Service();
        const params = {
            Bucket: 'clerk-of-courts',
            Delimiter: '/',
            Prefix: folderName + '/'
        }
        const data = await s3Service.s3.listObjects(params).promise();
        if(data && data['Contents']){
            for (let index = 1; index < data['Contents'].length; index++) {
                keys.push(data['Contents'][index]['Key']);
            }
        }
        return keys;
    }

    // example key: 'fl/broward/2021-05-06/MOPROBAT.txt
    const getCsvString = async (key: any) => {
        const s3Service = new S3Service();
        const object = await s3Service.getObject('clerk-of-courts', key);

        if (object.Body) {
            const csvString = object.Body.toString('utf-8');
            return csvString;
        }
        return false;
    }

    function getFormattedDate(date: Date) {
        let year: any = date.getFullYear();
        let month: any = (1 + date.getMonth());
        let day: any = date.getDate();
        if (year === NaN || day === NaN || month === NaN) {
            return '';
        }
        month = month.toString().padStart(2, '0');
        day = day.toString().padStart(2, '0');
        return year + '-' + month + '-' + day;
    }

    // example key: 'fl/broward/2021-05-06/MOPROBAT.txt
    function getPracticeTypeFromKey(key: any): string {
        if(key.match(/MNCIVILJGMNT/) || key.match(/WKCOUNTYNEW/)){
            return 'civil';
        }
        return '';
    }

    const getCaseTypeFromClerk = async (page: any, caseNumber: string) => {
        let retries = 0;
        while(true){
            try{
                if(retries > 15){
                    console.log('Stopped for 15 retries!');
                    return false;
                }
                await page.goto('https://www.browardclerk.org/Web2/CaseSearchECA/', {waitUntil: 'networkidle0'});
                let searchByCaseNumber = await page.$x('//a[@href="#caseNumberSearch"]');
                await searchByCaseNumber[0].click();
                await sleep(1000);
                await page.waitForXPath('//input[@id="CaseNumber"]');
                const [input_handle] = await page.$x('//input[@id="CaseNumber"]');
                await page.evaluate((el: any) => el.value = '', input_handle);
                await page.type('#CaseNumber', caseNumber, {delay: 150});
                const captchaSolution = await resolveRecaptcha2('6Le1QhYUAAAAAMxEYd1ktmFoXH48eqxRVcjTfUfP', await page.url());
                let recaptchaHandle = await page.$x('//*[@id="g-recaptcha-response"]');
                await recaptchaHandle[0].evaluate((elem:any, captchaSolution:any) => elem.innerHTML = captchaSolution, captchaSolution);
                let recaptchaHandle1 = await page.$x('//*[@id="g-recaptcha-response-1"]');
                await recaptchaHandle1[0].evaluate((elem:any, captchaSolution:any) => elem.innerHTML = captchaSolution, captchaSolution);
                let recaptchaHandle2 = await page.$x('//*[@id="g-recaptcha-response-2"]');
                await recaptchaHandle2[0].evaluate((elem:any, captchaSolution:any) => elem.innerHTML = captchaSolution, captchaSolution);
                let recaptchaHandle3 = await page.$x('//*[@id="g-recaptcha-response-3"]');
                await recaptchaHandle3[0].evaluate((elem:any, captchaSolution:any) => elem.innerHTML = captchaSolution, captchaSolution);
                console.log("Done.");
                await Promise.all([
                    page.click('#CaseNumberSearchResults'),
                    page.waitForNavigation()
                ]);
                let results = await page.$x('//div[@id="SearchResultsGrid"]//div[@class="k-grid-content"]//table/tbody/tr');
                if(results.length < 1 || results.length > 1){
                    let checkBot = await page.$x('//strong[contains(text(), "BOT attack")]');
                    if(checkBot.length > 0){
                        console.log('The site has been detected the IP address as a bot!');
                        return false;
                    }
                    return '';
                }
                let caseType = await results[0].evaluate((el: any) => el.children[2].textContent.trim());
                console.log('new Case Type:', caseType);
                retries = 0;
                return caseType;
            } catch(e){
                console.log(e);
                console.log('Sleeping 5 seconds...');
                await sleep(5000);
                retries++;
            }
        }
    }

    let countiesWithCSV: any = {
        "FL": [ "broward" ]
    };

    for(const state in countiesWithCSV){
        let counties = countiesWithCSV[state];
        for(const county of counties){
            let today = new Date();
            let todayString = getFormattedDate(today);
            // let todayString = "2021-05-06";
            let folderName = state.toLowerCase() + '/' + county + '/' + todayString;
            let keys = await getKeys(folderName);
            for (const key of keys){
                let practiceType: string = getPracticeTypeFromKey(key);
                console.log("Processing:", key);
                if(practiceType == ''){
                    continue;
                }
                let csvString = await getCsvString(key);
                if(csvString){
                    let fileName: any = key?.split('/').pop();

                    console.log(practiceType, fileName);
                    if(fileName){
                        let clerk_browser = await launchTorBrowser();
                        let clerk_page = await clerk_browser.newPage();
                        await setParamsForPage(clerk_page);
                        
                        const parserFactory = new ParserFactory()
                        const parser = await parserFactory.getParser(practiceType, state, county);
                        const config: any = {
                            noheader: parser.hasHeader(),
                            delimiter: parser.getDelimiter()
                        }
                        if (!parser.hasHeader()) {
                            config.headers = parser.getHeaders(fileName);
                        }
                        console.log(config);
                        let jsonArray = await csv(config).fromString(csvString);
                        let grouped = groupByKey(jsonArray, 'caseNumber');
                        // console.log(grouped);
                        let ind = 0;
                        for (const group of grouped) {
                            if(ind == 0){
                                ind++;
                                continue;
                            }
                            let items = group[1];
                            const caseNumber = items[0].caseNumber;
                            let checkCaseNumber = await db.models.OwnerProductProperty.findOne({ csvCaseNumber: caseNumber });
                            if(checkCaseNumber){
                                console.log(caseNumber, "=> already saved!");
                                continue;
                            }
                            console.log('--- Processing case number:', caseNumber);
                            let newCaseType = await getCaseTypeFromClerk(clerk_page, caseNumber);
                            if(newCaseType){
                                if(newCaseType === ''){
                                    console.log('New case type not found!');
                                    continue;
                                }
                                for(let i = 0; i < items.length; i++){
                                    items[i].dispositionDescription = newCaseType;
                                }
                                let newGroup1 = [];
                                let newGroup = ['', ''];
                                newGroup[1] = items;
                                newGroup1.push(newGroup);
                                console.log(newGroup1);
                                await parser.parse(newGroup1);
                            } else {
                                let retries = 0;
                                let success = true;
                                while(!newCaseType){
                                    if(retries > 15){
                                        success = false;
                                        break;
                                    }
                                    await clerk_browser.close();
                                    clerk_browser = await launchTorBrowser();
                                    clerk_page = await clerk_browser.newPage();
                                    await setParamsForPage(clerk_page);
                                    newCaseType = await getCaseTypeFromClerk(clerk_page, caseNumber);
                                    retries++;
                                }
                                if(!success){
                                    console.log('Error after 15x tried to change the browser IP!');
                                    break;
                                }
                            }
                        }
                        await clerk_browser.close();
                    }
                }
            }
        }
    }
    process.exit();
})();