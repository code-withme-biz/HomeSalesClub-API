import { SNS } from 'aws-sdk';

import { IConfigEnv } from '../iconfig';
import { config as CONFIG } from '../config';
const config: IConfigEnv = CONFIG[process.env.NODE_ENV || 'production'];

export default class SnsService {
    sns: SNS;
    static PRODUCT_TOPIC_NAME = config.aws.sns.product_topic_name;
    static CIVIL_TOPIC_NAME = config.aws.sns.civil_topic_name;
    static CONSUMER_TOPIC_NAME = config.aws.sns.consumer_topic_name;
    static RECAPTCHA_ZERO_BALANCE_NAME = config.aws.sns.recaptcha_zero_balance_topic_name;
    static PRODUCT_TOPIC_ARN = `arn:aws:sns:${config.aws.region}:${config.aws.account_id}:${SnsService.PRODUCT_TOPIC_NAME}`;
    static PUBLISH_SUBSCRIBERS = config.aws.sns.publish_subscribers;
    static CIVIL_UPDATE_SUBSCRIBERS = config.aws.sns.civil_update_subscribers;

    pendingSubscribers: string[] = [];

    constructor() {
        this.sns = new SNS({
            apiVersion: config.aws.sns.api_version,
            region: config.aws.region
        });
    }

    async fetchTopic(topicName: string): Promise<string> {
        let topicArnArgs = `arn:aws:sns:${config.aws.region}:${config.aws.account_id}:${topicName}`;
        return new Promise( (resolve, reject) => {
            this.sns.listTopics({}, function(err, data) {
                if (err) {
                    console.log('fetchTopic ERROR: ', err);
                    resolve('');
                } else {
                    const topic = data.Topics?.find( (acc) => { 
                        return acc.TopicArn === topicArnArgs;
                    });

                    resolve(topic?.TopicArn || '');
                }
            });
        });
    }

    async exists(topicName: string): Promise<boolean> {
        const topic = await this.fetchTopic(topicName);
        return topic.length > 0 ? true : false
    }
    
    async create(topicName: string): Promise<boolean | string> {
        let topicArnArgs = `arn:aws:sns:${config.aws.region}:${config.aws.account_id}:${topicName}`;
        return new Promise( (resolve, reject) => {
            const params = {
                Name: topicArnArgs,
                Attributes: {},
                Tags: []
            };

            this.sns.createTopic(params, (err, data) => {
                if (err) {
                    console.log('ERROR: ', err);
                    resolve(false);
                } else {
                    console.log('createTopic: ', data);
                    resolve(true);
                }
            });

        });
    }

    async publish(topicName: string, message: string): Promise<boolean | string> {
        return new Promise( async (resolve, reject) => {
            const topic: string = await this.fetchTopic(topicName);
            const params = {
                Message: message,
                TopicArn: topic
            };

            this.sns.publish(params, (err, data) => {
                if (err) {
                    console.log('publish ERROR: ', err);
                    resolve(false);
                } else  {
                    console.log(`Message ${params.Message} send sent to the topic ${params.TopicArn}`);
                    console.log('MessageID: ', data.MessageId);         resolve(true);
                }   
            });
        });
    }

    async fetchSubscribers(topicName: string): Promise<string[]> {
        let topicArnArgs = `arn:aws:sns:${config.aws.region}:${config.aws.account_id}:${topicName}`;
        return new Promise( (resolve, reject) => {
            const params = {
                TopicArn: topicArnArgs
            };

            this.sns.listSubscriptionsByTopic(params, (err, data) => {
                if(err) {
                    console.log('fetchSubscribers ERROR: ', err);
                    resolve([]);
                } else {
                    // @ts-ignore
                    resolve(data.Subscriptions?.map( sub => sub.Endpoint || ''));
                }
            });
        });
    }

    async subscribersReady(topicName: string, subscribers: string): Promise<boolean> {
        return new Promise( async (resolve, reject) => {
            if(subscribers.length > 0) {
                const currentSubscribers = await this.fetchSubscribers(topicName);
                this.pendingSubscribers = subscribers.split(',').filter( sub => !currentSubscribers.includes(sub));

                resolve( this.pendingSubscribers.length === 0 );
            } else {
                resolve(true);
            }
        });
    }

    async subscribeList(topicName: string): Promise<boolean> {
        return new Promise( async (resolve, reject) => {
            try {
                for (const pending of this.pendingSubscribers) {
                    await this.subscribe(topicName, 'EMAIL', pending);
                }
                resolve(true);
            } catch(e) {
                resolve(false);
            }
        });
    }

    async subscribe(topicName: string, protocol: string, endpoint: string): Promise<boolean> {
        let topicArnArgs = `arn:aws:sns:${config.aws.region}:${config.aws.account_id}:${topicName}`;
        return new Promise( (resolve, reject) => {
            const params = {
                Protocol: protocol,
                TopicArn: topicArnArgs,
                Endpoint: endpoint
            };

            this.sns.subscribe(params, (err, data) => {
                if (err) {
                    console.log('subscription ERROR: ', err);
                    resolve(false);
                } else  {
                    console.log('Subscription ARN is ', data.SubscriptionArn);
                    resolve(true);
                }  
            });
        });
    }
}