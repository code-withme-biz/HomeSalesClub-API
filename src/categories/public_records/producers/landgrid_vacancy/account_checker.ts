import puppeteer from 'puppeteer';
import AbstractLandgrid from './landgrid_abstract';

import { config as CONFIG } from '../../../../config';
import { IConfigEnv } from '../../../../iconfig';
const config: IConfigEnv = CONFIG[process.env.NODE_ENV || 'production'];

export default class LandgridAccountChecker extends AbstractLandgrid {
    constructor() {
        super();
    }


    async init() {
        this.browser = await this.launchBrowser();
        this.browserPages.landgridPage = await this.browser.newPage();
        await this.setParamsForPage(this.browserPages.landgridPage);
        let pageUrl = 'https://landgrid.com/';
        try {
            await this.browserPages.landgridPage.goto(pageUrl, { waitUntil: 'load' });
            return true;
        } catch (err) {
            console.warn('Website could not be loaded at this time.');
            return false;
        }
    }

    async read(): Promise<boolean> {
        try {
            await this.browserPages.landgridPage?.waitForXPath('//*[@data-toggle="modal"][contains(@href, "signinModal")]');
            return true;
        } catch (err) {
            console.warn('!! IDENTIFIER NOT FOUND!! EXPECTED "Sign-in modal".');
            return false;
        }
    }

    async parseAndSave(): Promise<boolean> {
        let accounts = await this.getLandgridAccountPoolFromMongo({pro: {$exists: false}});
        if (!accounts || !accounts.length) {
            console.warn('No accounts found in database. Please add some!');
            return false;
        }

        const lgPage = this.browserPages.landgridPage as puppeteer.Page;

        let proAccs = 0;
        let basicAccs = 0;
        for (let account of accounts) {
            await (await lgPage.$x('//*[@data-toggle="modal"][contains(@href, "signinModal")]'))[0].click();
            await lgPage.waitFor(1500);

            let userHandle = await lgPage.$x('//*[@id="signinModal"]//*[@class="modal-body"]//*[@id="user_email"]');
            let passHandle = await lgPage.$x('//*[@id="signinModal"]//*[@class="modal-body"]//*[@id="user_password"]');
            let signInButtonHandle = await lgPage.$x('//*[@id="signinModal"]//*[@class="modal-body"]//*[@type="submit"]');

            await userHandle[0].type(account.user, { delay: 179 });
            await passHandle[0].type(account.pass, { delay: 148 });
            await lgPage.waitFor(850);
            await Promise.all([
                lgPage.waitForNavigation({ waitUntil: 'load' }),
                signInButtonHandle[0].click()
            ]);

            let upgradeHandle = await lgPage.$x('//*[@class="dropdown"][./*[@data-tip="my-profile"]]//*[@href="/plans"]');
            let projectsHandle = await lgPage.$x('//*[@data-tip="projects-menu"]');
            let signOutHandle = await lgPage.$x('//a[@href="/users/sign_out"]');

            if (upgradeHandle.length) {
                basicAccs++;
                account.pro = false;
                await account.save();
            } else if (projectsHandle.length) {
                proAccs++;
                account.pro = true;
                await account.save();
            } else {
                console.warn('Unsure if account is pro: ' + account.user);
            }
            await Promise.all([
                lgPage.waitForNavigation({ waitUntil: 'load' }),
                signOutHandle[0].evaluate((el: any) => el.click())
            ]);

            await lgPage.waitFor(1000);
        }

        console.log(`Found ${proAccs} pro accounts and ${basicAccs} basic accounts.`);

        return true;
    }

}