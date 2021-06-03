import puppeteer from 'puppeteer';
import AbstractSource from './abstract_producer';

export default class RealtorSource extends AbstractSource {
    urls = {
        generalInfoPage: 'https://www.realtor.com/soldhomeprices/Broward-County_FL'
    };

    async init() {
        this.browser = await this.launchBrowser();
        this.browserPages.generalInfoPage = await this.browser.newPage();
        await this.setParamsForPage(this.browserPages.generalInfoPage);
        await this.browserPages.generalInfoPage?.goto(
            this.urls.generalInfoPage,
            {
                timeout: 1000 * 60
            }
        );
        return true;
    }

    async read(): Promise<boolean> {
        return true;
    }

    async parseAndSave(): Promise<boolean> {
        await this.browserPages.generalInfoPage?.bringToFront();

        const elements = await this.browserPages.generalInfoPage?.$x('//div[contains-token(@class, "address")] ! span ! array{string(.)}') as puppeteer.ElementHandle[];

        console.log('the elements: ', await this.getTextContent(elements));

        return true;
    }
}
