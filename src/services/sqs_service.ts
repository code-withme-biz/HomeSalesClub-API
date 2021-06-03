import { SQS } from 'aws-sdk';
import { ISendMessageAttribute, IReceiveAttribute, IDeleteAttribute } from '../interfaces/iqueue';

import { IConfigEnv } from '../iconfig';
import { config as CONFIG } from '../config';
const config: IConfigEnv = CONFIG[process.env.NODE_ENV || 'production'];

export default class SqsService {
  sqs: SQS;
  static QUEUE_NAME = config.aws.sqs.queue_name;
  static DEAD_LETTER_QUEUE_NAME = config.aws.sqs.dead_letter_queue_name;
  static QUEUE_URL = `https://sqs.${config.aws.region}.amazonaws.com/${config.aws.account_id}/${SqsService.QUEUE_NAME}`;
  static DEAD_LETTER_QUEUE_URL = `https://sqs.${config.aws.region}.amazonaws.com/${config.aws.account_id}/${SqsService.DEAD_LETTER_QUEUE_NAME}`;
  static DEAD_LETTER_QUEUE_ARN = `arn:aws:sqs:${config.aws.region}:${config.aws.account_id}:${SqsService.DEAD_LETTER_QUEUE_NAME}`;

  constructor() {
    this.sqs = new SQS({
      apiVersion: config.aws.sqs.api_version,
      region: config.aws.region
    });
  }

  async exists(queueUrl: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
        this.sqs.listQueues({}, (err, data) => {
            if (err) {
                console.log('Exists error: ', err);
                resolve(false);
            } else {
                if (data.QueueUrls && data.QueueUrls.length > 0) {
                    resolve(data.QueueUrls.includes(queueUrl));
                } else {
                    resolve(false);
                }
            }
        });
    });
  }

  async create(queueName: string, attributes: SQS.QueueAttributeMap): Promise<boolean> {
    return new Promise((resolve, reject) => {
        this.sqs.createQueue({
            QueueName: queueName,
            Attributes: attributes
        }, (err, data) => {
            if (err) {
                console.log(`Error creating ${queueName}: `, err);
                resolve(false);
            } else {
                console.log("Success QueueUrl: ", data.QueueUrl);
                resolve(data.QueueUrl ? true : false);
            }
        });
    });
  }

  async setAttributes(params: any): Promise<boolean> {
    return new Promise( (resolve, reject) => {
        this.sqs.setQueueAttributes(params, (err, data) => {
            if (err) {
              console.log("Error setting attributes: ", err);
              resolve(false);
            } else {
              console.log("setAttributes Success: ", data);
              resolve(true);
            }
        });
    });
  }

  async enqueue(queueUrl: string, products: any[], messageAttributes: ISendMessageAttribute): Promise<boolean> {
    return new Promise((resolve, reject) => {

      for(const product of products) {
        const params = {
          MessageAttributes: Object.assign({}, messageAttributes),
          MessageBody: product,
          // MessageDeduplicationId: item.name,
          // MessageGroupId: "Products",
          QueueUrl: queueUrl
        };

        this.sqs.sendMessage(params, (err, data) => {
          if (err) {
            console.log("Error: ", err);
            resolve(false);
          } else {
            console.log("Success: ", data.MessageId);
            resolve(true);
          }
        });
      };
    });
  }


  async dequeue(receiveAttributes: IReceiveAttribute): Promise<SQS.MessageList> {
      return new Promise((resolve, reject) => {
        this.sqs.receiveMessage(receiveAttributes, (err, data) => {
          if (err) {
            return reject(err);
          }
          console.log('receiveMessage data: ', data);
          resolve(data.Messages);
        })
      })
  }

  async deleteMessage(deleteAttributes: IDeleteAttribute): Promise<boolean> {
      return new Promise((resolve, reject) => {
        this.sqs.deleteMessage(deleteAttributes, (err, data) => {
            if (err) {
              return reject(err);
            }

            console.log('deleteMessage data: ', data);
            resolve(true);
        });
      });
  }

  async purge(queueUrl: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
        const params = {
            QueueUrl: queueUrl
        };

        this.sqs.purgeQueue(params, (err, data) => {
            if (err) {
                console.log('ERROR Purging: ', err);
                console.log('purged: ', data);
                resolve(false);
            } else {
                console.log('purgeQueue Success: ', data);
                resolve(true);
            }
        });
    });
  }
}