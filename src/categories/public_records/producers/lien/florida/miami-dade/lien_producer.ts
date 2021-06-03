import AbstractProducer from '../../../abstract_producer';
import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import { IProduct } from '../../../../../../models/product';
import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';

const credentials = {
    login: 'danielhomesales',
    password: 'homesales2020'
};


export default class CivilProducer extends AbstractProducer {
    numberOfSavedRecords = 0;
    browser: puppeteer.Browser | undefined;
    browserPages = {
        generalInfoPage: undefined as undefined | puppeteer.Page
    };
    urls = {
        generalInfoPage: `https://onlineservices.miami-dadeclerk.com/officialrecords/StandardSearch.aspx`
    }

    xpaths = {
        isPAloaded: '//*[@id="logoSubContainerDiv"]'
    }

    constructor(publicRecordProducer: IPublicRecordProducer) {
        // @ts-ignore
        super();
        this.publicRecordProducer = publicRecordProducer;
        this.stateToCrawl = this.publicRecordProducer?.state || '';
    }




    async init(): Promise<boolean> {
        this.browser = await this.launchBrowser();
        this.browserPages.generalInfoPage = await this.browser.newPage();
        await this.setParamsForPage(this.browserPages.generalInfoPage);
        try {
            await this.browserPages.generalInfoPage.goto(this.urls.generalInfoPage, { waitUntil: 'load' });
            return true;
        } catch (err) {
            console.warn(err);
            return false;
        }
    }


    async read(): Promise<boolean> {
        try {
            await this.browserPages.generalInfoPage?.waitForXPath(this.xpaths.isPAloaded);
            return true;
        } catch (err) {
            console.warn('Problem loading civil producer page.');
            return false;
        }
    }

    // This is main function
    async parseAndSave(): Promise<boolean> {

        const that=this;
        const page = this.browserPages.generalInfoPage!;
        if (page === undefined) return false;
        const product: IProduct = await db.models.Product.findOne({ name: `/${this.publicRecordProducer.state.toLowerCase()}/${this.publicRecordProducer.county}/tax-lien` }).exec();

        //trying to login
        await tryToLogin();

        //start the search
        await fillInTheSearchInputsAndGetTheRecords();

        /////////////////////////////////////////////////////////////////////////////////////////////////////////
        //date helpers : 
        //addDays will add number of days to a date
        //getDatesBetween will return an array of the days between two dates
        /////////////////////////////////////////////////////////////////////////////////////////////////////////
        function addDays(date: Date, days: number) {
            var result = new Date(date);
            result.setDate(result.getDate() + days);
            return result;
        }
        function getDatesBetween(startDate: Date, stopDate: Date) {
            var dateArray = new Array();
            var currentDate = startDate;
            while (currentDate <= stopDate) {
                dateArray.push(currentDate)
                currentDate = addDays(currentDate, 1);

            }
            return dateArray;
        }

        /////////////////////////////////////////////////////////////////////////////////////////////////////////
        //this function will parse the name and return its separates values as an object
        /////////////////////////////////////////////////////////////////////////////////////////////////////////
        function parseName(name: string) {
            let result;
            const companyIdentifiersArray = [
                'GENERAL', 'TRUSTEE', 'TRUSTEES', 'INC', 'ORGANIZATION',
                'CORP', 'CORPORATION', 'LLC', 'MOTORS', 'BANK', 'UNITED',
                'CO', 'COMPANY', 'FEDERAL', 'MUTUAL', 'ASSOC', 'AGENCY',
                'PARTNERSHIP', 'CHURCH', 'CITY', 'TRUST', 'SECRETARY',
                'DEVELOPMENT', 'INVESTMENT', 'ESTATE', 'LLP', 'LP', 'HOLDINGS',
                'LOAN', 'CONDOMINIUM', 'CATHOLIC', 'INVESTMENTS', 'D/B/A', 'COCA COLA',
                'LTD', 'CLINIC', 'TODAY', 'PAY', 'CLEANING', 'COSMETIC', 'CLEANERS',
                'FURNITURE', 'DECOR', 'FRIDAY HOMES', 'MIDLAND', 'SAVINGS', 'PROPERTY',
                'ASSET', 'PROTECTION', 'SERVICES', 'TRS', 'ET AL', 'L L C', 'NATIONAL',
                'ASSOCIATION', 'MANAGMENT', 'PARAGON', 'MORTGAGE', 'CHOICE', 'PROPERTIES',
                'J T C', 'RESIDENTIAL', 'OPPORTUNITIES', 'FUND', 'LEGACY', 'SERIES',
                'HOMES', 'LOAN', 'FAM', 'PRAYER'
            ];
            const suffixNamesArray = ['I', 'II', 'III', 'IV', 'V', 'ESQ', 'JR', 'SR'];
            const suffixNamesRegex = new RegExp(`\\b(?:${suffixNamesArray.join('|')})\\b`, 'i');
            const companyRegexString = `\\b(?:${companyIdentifiersArray.join('|')})\\b`;
            const companyRegex = new RegExp(companyRegexString, 'i');

            if (name.match(companyRegex)) {
                result = {
                    firstName: '',
                    lastName: '',
                    middleName: '',
                    fullName: name.trim(),
                    suffix: ''
                };
                return result;
            }
            const suffix = name.match(suffixNamesRegex);
            name = name.replace(suffixNamesRegex, '');
            name = name.replace(/\s+/g, ' ');
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

        /////////////////////////////////////////////////////////////////////////////////////////////////////////
        //this function will check the record fields in the database, if they are not duplicate it will store them
        /////////////////////////////////////////////////////////////////////////////////////////////////////////
        async function saveReord(namesArray: any, date: any) {
            for (const name of namesArray) {
                //parse name
                let cleanedName = name.replace('(R)', '');
                cleanedName = name.replace('(D)', '').trim();
                const parsedName = parseName(cleanedName);

                const data = {
                    'Property State': 'FL',
                    'County': 'Miami-Dade',
                    'First Name': parsedName.firstName,
                    'Last Name': parsedName.lastName,
                    'Middle Name': parsedName.middleName,
                    'Name Suffix': parsedName.suffix,
                    'Full Name': name,
                    "vacancyProcessed": false,
                    "practiceType": "tax-lien",

                    fillingDate: date,
                    productId: product._id
                };
                if(await that.civilAndLienSaveToNewSchema(data)){
                    console.log('New record saved !');
                    that.numberOfSavedRecords++;
                }
            }
        }

        /////////////////////////////////////////////////////////////////////////////////////////////////////////
        //this function will fill in the date and select the Lien option from the select menu, then click search
        /////////////////////////////////////////////////////////////////////////////////////////////////////////
        async function getTheRecords() {

            //go to the printer page
            await page.goto(`https://onlineservices.miami-dadeclerk.com/officialrecords/PrinterFriendly.aspx`);
            await page.waitForXPath(`//*[@id="ctl00"]/div[4]/table/tbody/tr`);

            //get the number of rows 
            let rowsHandlers = await page.$x(`//*[@id="ctl00"]/div[4]/table/tbody/tr`);
            let numberOfRows = rowsHandlers.length;
            for (let index = 1; index < numberOfRows; index++) {



                //get the names
                let namesArray: any = [];
                let namesHandlers = await page.$x(`//*[@id="ctl00"]/div[4]/table/tbody/tr[${index}]/td[9]/div/div`);
                for (const nameHandler of namesHandlers) {
                    let nameJsonHandler: any = await nameHandler.getProperty('innerText');
                    let name = await nameJsonHandler.jsonValue();
                    name = name.trim();
                    if (name != '') {
                        namesArray.push(name)
                    }
                }

                //get the date 
                let [dateHandler] = await page.$x(`//*[@id="ctl00"]/div[4]/table/tbody/tr[${index}]/td[3]`);
                let dateJsonHandler = await dateHandler.getProperty('innerText');
                let date: any = await dateJsonHandler.jsonValue();
                date = date.trim();
                await saveReord(namesArray, date);

            }

        }

        /////////////////////////////////////////////////////////////////////////////////////////////////////////
        //this function will reformat the given date to mm/dd/yyyy format
        /////////////////////////////////////////////////////////////////////////////////////////////////////////
        function getFormattedDate(date: any) {
            let year = date.getFullYear();
            let month = (1 + date.getMonth()).toString().padStart(2, '0');
            let day = date.getDate().toString().padStart(2, '0');

            return month + '/' + day + '/' + year;
        }

        /////////////////////////////////////////////////////////////////////////////////////////////////////////
        //this function will fill in the date and select the Lien option from the select menu, then click search
        /////////////////////////////////////////////////////////////////////////////////////////////////////////
        async function fillInTheSearchInputsAndGetTheRecords() {

            //fill in the dates
            try {

                let startDate;

                //get the last item based on filling date
                const lastItemDB = await db.models.PublicRecordLineItem.findOne({
                    'Property State': 'FL',
                    'County': 'Miami-Dade',
                    fillingDate: { "$exists": true, "$ne": "" }
                }, null, { sort: { createdAt: -1 } });

                //if found one take its date as a start date for this search
                if (lastItemDB && lastItemDB.fillingDate) {
                    console.log("We Found an Old Record, using it date as a starting date ");
                    startDate = new Date(lastItemDB.fillingDate);
                    console.log("old records date: " + startDate)

                }

                //if there is no record yet and this is the first run, take last month's date as a starting date 
                else {
                    console.log("We Couldnt find an Old Record ");
                    startDate = new Date();
                    startDate.setMonth(startDate.getMonth() - 1);
                    console.log("search will start from date : " + startDate)

                }

                //end date will be today's date 
                let endDate = new Date();

                //get the days between the start date and the end date
                const arrayOfDates = getDatesBetween(startDate, endDate)
                for (let index = 0; index < arrayOfDates.length - 1; index++) {

                    //go to the search page
                    await page.goto('https://onlineservices.miami-dadeclerk.com/officialrecords/StandardSearch.aspx', {
                        waitUntil: 'networkidle0',
                        timeout: 60000
                    });

                    //prapare the dates 
                    const currentStartDate = getFormattedDate(arrayOfDates[index]);
                    const currentEndDate = getFormattedDate(arrayOfDates[index + 1]);
                    console.log('\n')
                    console.log('getting records for the following :')
                    console.log('start date : ' + currentStartDate)
                    console.log('end date : ' + currentEndDate)
                    console.log('\n')

                    //fill in the start date
                    await page.waitForXPath(`//*[@id="prec_date_from"]`);
                    let [startDateInput] = await page.$x(`//*[@id="prec_date_from"]`);
                    await startDateInput.type(currentStartDate);

                    //fill in the end date
                    await page.waitForXPath(`//*[@id="prec_date_to"]`);
                    let [endDateInput] = await page.$x(`//*[@id="prec_date_to"]`);
                    await endDateInput.type(currentEndDate);
                    await page.waitFor(5000);

                    //pick Lien option from the select menu
                    await page.waitForXPath(`//*[@id="pdoc_type"]`);
                    await page.select("#pdoc_type", 'LIE');
                    await page.focus('#pdoc_type');

                    //press search
                    await page.waitForXPath(`//*[@id="btnNameSearch"]`);
                    let [searchButton] = await page.$x(`//*[@id="btnNameSearch"]`);
                    await searchButton.click();
                    await page.waitForNavigation();

                    //get the data 
                    await getTheRecords();

                }

            } catch (error) {
                console.log('Error in filling inputs :');
                console.log(error);
            }

        }

        ///////////////////////////////////////////////////////////////////////////////////////
        //this function will check if logged in or not
        //in case not logged in it will logged you in
        //other wise it will redirect you to the search page
        ///////////////////////////////////////////////////////////////////////////////////////
        async function tryToLogin() {
            await page.goto('https://www2.miami-dadeclerk.com/PremierServices/login.aspx', {
                waitUntil: 'networkidle0',
                timeout: 60000
            });

            let [notLoggedInIndecator] = await page.$x(`//*[@id="ctl00_cphPage_btnLogin"]`);
            if (notLoggedInIndecator) {
                console.log('not logged In, trying to log in..')

                //fill in the login
                await page.waitForXPath(`//*[@id="ctl00_cphPage_txtUserName"]`);
                let [loginInput] = await page.$x(`//*[@id="ctl00_cphPage_txtUserName"]`);
                await loginInput.type(credentials.login);

                //fill in the password
                await page.waitForXPath(`//*[@id="ctl00_cphPage_txtPassword"]`);
                let [passwordInput] = await page.$x(`//*[@id="ctl00_cphPage_txtPassword"]`);
                await passwordInput.type(credentials.password);

                await page.waitForXPath(`//*[@id="ctl00_cphPage_txtPassword"]`);
                let [loginButton] = await page.$x(`//*[@id="ctl00_cphPage_btnLogin"]`);
                await loginButton.click();

                await page.waitForNavigation();
            }
            console.log('Logged in')
        }

        //send the number of saved records in a notification
        await AbstractProducer.sendMessage("miami-dade", "florida", this.numberOfSavedRecords, 'Lien');
        console.log('scraper finished, number of saved Records is : ' + this.numberOfSavedRecords);
        //end 
        await this.browser?.close();
        return true;

    }
}