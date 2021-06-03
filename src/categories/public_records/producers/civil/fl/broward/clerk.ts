import db from '../../../../../../models/db';
import realtorConsumer from '../../../../../../scheduled_tasks/consumer_realtor';
import totalviewConsumer from '../../../../../../scheduled_tasks/consumer_totalview_realestate';
import { launchBrowser, setParamsForPage, clearPage, randomSleep, sleep, saveToOwnerProductPropertyByProducer, getPracticeType, getPurchaseItems, getTextByXpathFromParent, savePurchasedItem, logOpp, fetchProduct } from '../../../../../../services/general_service';
import axios from 'axios';
import https from 'https';
const AdmZip = require('adm-zip');
const nameParsingService = require('../../../../consumers/property_appraisers/consumer_dependencies/nameParsingServiceNew');
import { config as CONFIG } from '../../../../../../config';
import { IConfigEnv } from '../../../../../../iconfig';
const config: IConfigEnv = CONFIG[process.env.NODE_ENV || 'production'];


//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// MAIN LOGIC
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

(async()=>{
  let state = "FL";
  let county = "broward";
  let test_mode = false;
  let item_infos = [
    { regex: /^(MO|TU|WE|TH|FR|SA|SU)CACIVL/i, title: 'Daily Circuit Cases', filename: 'daily_circuit_cases', test: false},
    { regex: /^(MO|TU|WE|TH|FR|SA|SU)COCIVL/i, title: 'Daily County Cases', filename: 'daily_county_cases', test: false},
    { regex: /^(MO|TU|WE|TH|FR|SA|SU)FELONY/i, title: 'Daily Felony Cases', filename: 'daily_felony_cases', test: false},
    { regex: /^(MO|TU|WE|TH|FR|SA|SU)FMCIVL/i, title: 'Daily Family Cases', filename: 'daily_family_cases', test: false}, //--
    { regex: /^(MO|TU|WE|TH|FR|SA|SU)INFRAC/i, title: 'Daily Infraction (TI) Cases', filename: 'daily_infraction_cases', test: false},
    { regex: /^(MO|TU|WE|TH|FR|SA|SU)MISDEM/i, title: 'Daily Misdemeanor Cases', filename: 'daily_misdemeanor_cases', test: false},
    { regex: /^(MO|TU|WE|TH|FR|SA|SU)PROBAT/i, title: 'Daily Probate Cases', filename: 'daily_probate_cases', test: false},
    { regex: /^(MO|TU|WE|TH|FR|SA|SU)TRFFIC/i, title: 'Daily Traffic (TC) Cases', filename: 'daily_traffic_criminal_cases', test: false},
    
    { regex: /^MNTENANT/i, title: 'Monthly Tenant Cases', filename: 'monthly_tenant_cases', test: false},
    { regex: /^MNEVICT/i, title: 'Monthly Eviction Cases', filename: 'eviction_cases', test: false},
    { regex: /^MNCIVILJGMNT/i, title: 'Monthly Civil Judgements', filename: 'monthly_civil_judgement_cases', test: false},
    
    { regex: /^WKCIVILGAR/i, title: 'Weekly Civil Garnishments', filename: 'weekly_civil_garnishment_cases', test: false},
    { regex: /^WKPROBATWC/i, title: 'Weekly Probate Cases', filename: 'weekly_probate_cases', test: false},
    { regex: /^WKTCDISPO/i, title: 'Weekly Traffic Criminal Dispositions', filename: 'weekly_traffic_criminal_cases', test: false},
    { regex: /^WKTIDISPO/i, title: 'Weekly Traffic Infraction Dispositions', filename: 'weekly_traffic_infraction_cases', test: false},
    { regex: /^WKEVICT/i, title: 'Weekly Evictions:', parseCallback: 'eviction_cases', test: false}
  ];

  const start = async () => {
    let url_reportpage = 'https://www.browardclerk.org/clerkwebsite/bccoc2/filedownload.aspx?product=Report+Catalog';
    let browser = await launchBrowser();
    let page = await browser.newPage();

    // read card info
    let CARD_HOLDER_NAME = config.card.card_holder_name;
    let ADDRESS = config.card.address;
    let CITY = config.card.city;
    let CREDIT_CARD_NUMBER = config.card.credit_card_number;
    let EXP_DATE_MONTH = config.card.exp_date_month;
    let EXP_DATE_YEAR = config.card.exp_date_year;
    let SECURITY_CODE = config.card.security_code;

    let new_purchase_items = [];
    let total_price = 0;
    let prev_purchased_items = await getPurchaseItems('FL', 'broward');
    
    // launch browser
    await clearPage(page);
    await setParamsForPage(page);

    try {       
      await page.goto(url_reportpage, {waitUntil: 'load'});
      await page.waitForXPath('//table[@class="textcatlist"]');

      // choose all items
      let page_number = 1;
      while (true) {
        let titles = [];
        let rows = await page.$x('//table[@class="textcatlist"]/tbody/tr[position()<12 and position()>1]');
        for (const row of rows) {
          let title = await getTextByXpathFromParent(row, './td[1]/span');
          let [filtered] = item_infos.filter(item_info => title.indexOf(item_info.title) > -1);
          if (filtered) {
            titles.push(title);
          }
        }
        for (const _title of titles) {
          let row_xpath = `//table[@class="textcatlist"]//span[contains(text(), "${_title}")]/ancestor::tr[1]`
          let [row] = await page.$x(row_xpath);
          if (row) {
            let [add_button] = await row.$x('./td[7]/input[@type="image"]');
            let title = await getTextByXpathFromParent(row, './td[1]/span');
            title = title.replace(/\s+/g, ' ').trim();
            let upload_date = await getTextByXpathFromParent(row, './td[5]');
            upload_date = upload_date.replace(/\s+/g, ' ').trim();
            let price = await getTextByXpathFromParent(row, './td[6]');

            let parent_tr_xpath_1 = `//table[@class="textcatlist"]//*[contains(text(), "${title}")]/ancestor::tr[1]`;
            // check for purchased
            let [isPurchased] = prev_purchased_items.filter(ppi => ppi.title === title && ppi.upload_date === upload_date);
            if (isPurchased) {
              console.log(`${title} - ${upload_date} - Already Purchased!`);
            } else {
              console.log(title, upload_date);
              if (add_button) {   
                await add_button.click();
                await page.waitForXPath(`${parent_tr_xpath_1}/td[7][contains(text(), "added")]`)
                new_purchase_items.push({price, title, upload_date});
                total_price += parseFloat(price.slice(1));
              }
              await randomSleep(500, 1000);
            }
          }
        }  
        page_number++;
        if (page_number === 10) {
          break;
        }
        let [next_page] = await page.$x(`//a[contains(@href, "Page$${page_number}")]`);
        if (next_page) {
          await next_page.click();
          await page.waitForXPath(`//td/span[text()="${page_number}"]`);
          await sleep(1000);
        }
      }

      console.log('\n======== Report for new purchase items ========\n');
      console.log("Amounts: ", new_purchase_items.length);
      console.log("Total Price: ", total_price);
      console.log(new_purchase_items);
      console.log('\n===============================================\n');

      if (new_purchase_items.length > 0) {
        // click basket button
        let [basket_button] = await page.$x('//a[contains(@href, "basket.asp")]');
        await Promise.all([
          basket_button.click(),
          page.waitForNavigation()
        ]);

        // click purchase button
        await page.waitForXPath('//input[@value="Purchase"]');
        let [purchase_button] = await page.$x('//input[@value="Purchase"]');
        await Promise.all([
          purchase_button.click(),
          page.waitForNavigation()
        ]);

        // input card info
        await page.waitForXPath('//input[@value="Confirm Purchase"]');
        await page.type('input[id*="cc_name"]', CARD_HOLDER_NAME, {delay: 100});
        await page.type('input[id*="to_street"]', ADDRESS, {delay: 100});
        await page.type('input[id*="city"]', CITY, {delay: 100});
        await page.select('select[id*="ddl"]', '1');
        await page.type('input[id*="ccNumber"]', CREDIT_CARD_NUMBER, {delay: 100});
        await page.select('select[id*="DDMonth"]', EXP_DATE_MONTH.padStart(2, '0'));
        await page.select('select[id*="ddl"]', EXP_DATE_YEAR);
        await page.type('input[id*="CCV"]', SECURITY_CODE, {delay: 100});   

        // click confirm purchase button
        await Promise.all([
          page.click('input[id$="SendPayment"]'),
          page.waitForNavigation()
        ]);

        // await for download element  - ctl00_ContentPlaceHolder1_Download
        await page.waitForSelector('a[id$="ContentPlaceHolder1_Download"]');
        let download_button = await page.$('a[id$="ContentPlaceHolder1_Download"]');
        if (download_button) {
          // save purchased_items to db
          for (const purchase_item of new_purchase_items) {
            await savePurchasedItem(state, county, purchase_item);
          }
          // download
          let download_url = await download_button.evaluate((el: any) => el.href);
          await handleDownload(download_url);
        } else {
          console.log('Download is unaailable!!!');
        }
      } else {
        console.log('There is no new uploaded items!');
      }
    } catch (error) {
      console.log(error);
    }

    await page.close();
    await browser.close();
  }

  /**
   * handle download with url
   * @param download_url 
   */
  const handleDownload = async (download_url: string) => {
    const realtor_browser = await launchBrowser();
    const realtor_page = await realtor_browser.newPage();
    await clearPage(realtor_page);
    await setParamsForPage(realtor_page);

    const totalview_browser = await launchBrowser();
    const totalview_page = await totalview_browser.newPage();
    await clearPage(totalview_page);
    await setParamsForPage(totalview_page);

    try {
      const httpsAgent = new https.Agent({ rejectUnauthorized: false });
      const axiosResp = await axios.get(download_url, { timeout: 90000, httpsAgent: httpsAgent, responseType: 'arraybuffer' });
      if (axiosResp.status === 200) {
        let zip = new AdmZip(axiosResp.data);
        let zipEntries = zip.getEntries();

        // loop through the files that we got from unziping the downloaded file
        console.log(zipEntries.map((ze: any) => ze.entryName));

        for (const entry of zipEntries) {
          console.log('\n');
          console.log('\\\ =============================================================== //')
          console.log(entry.entryName);
          //get the xml file from the unziped files
          let [item_info] = item_infos.filter(item_info => entry.entryName.match(item_info.regex));
          if (!item_info) {
            console.log('No Matched info');
            continue;
          }
          if (test_mode && !item_info.test) {
            console.log('Skipping [test=false]');
            continue;
          }
          console.log(item_info);

          // parse csv and save & consume
          try {
            let txt_records = zip.readAsText(entry).split('\n');
            let FloridaCase = await fetchProduct(`./${item_info.filename}`);
            await new FloridaCase(txt_records, realtor_page, totalview_page).start();
          } catch(e) {
            console.log(`Cannot find case definition`);
          }
        }
      }
    } catch (error) {
      console.log(error);
    }

    await realtor_page.close();
    await realtor_browser.close();
    await totalview_page.close();
    await totalview_browser.close();
  };

  await start();
  // await handleDownload('http://localhost:5000/202103021755115668.exe');
  console.log('##### FINISHED #####');
})();
