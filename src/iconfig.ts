import { IProduct } from "./models/product";

interface IProductConfig {
    riverside_property_appraiser_email: string | undefined;
    riverside_property_appraiser_password: string | undefined;
    foreclosurecom_user: string | undefined;
    foreclosurecom_pass: string | undefined;
    landgrid_accounts: ILandGridAccount
}

export interface IConfigEnv {
    database_uri: string;
    puppeteer_headless: boolean;
    productConfig: IProductConfig;
    aws: IAWS;
    card: ICARD
    two_captcha_key: string;
}

export interface IConfig {
    [key: string]: IConfigEnv;
}

interface IAWS {
    region: string;
    account_id: string;
    sqs: {
        api_version: string;
        queue_name: string;
        dead_letter_queue_name: string;
    },
    sns: {
        api_version: string;
        product_topic_name: string;
        civil_topic_name: string;
        consumer_topic_name: string;
        publish_subscribers: string;
        recaptcha_zero_balance_topic_name: string;
        civil_update_subscribers: string;
    },
    s3: {
        api_version: string;
        app_bucket_name: string;
        scraper_bucket_name: string;
        error_screenshot_bucket_name: string;
    },
}

interface ICARD {
    card_holder_name: string;
    address: string;
    city: string;
    credit_card_number: string;
    exp_date_month: string;
    exp_date_year: string;
    security_code: string;
}

interface ILandGridAccount {
    landgrid_account_emails: string;
    landgrid_account_passwords: string;
}