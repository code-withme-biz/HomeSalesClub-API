import { S3 } from 'aws-sdk';

import { IConfigEnv } from '../iconfig';
import { config as CONFIG } from '../config';
const config: IConfigEnv = CONFIG[process.env.NODE_ENV || 'production'];

export default class S3Service {
    s3: S3;
    uploads: string[] = [];
    static APP_BUCKET_NAME = config.aws.s3.app_bucket_name;
    static APP_BUCKET_LOCATION = `http://${S3Service.APP_BUCKET_NAME}.s3.amazonaws.com/`;
    static SCRAPER_BUCKET_NAME = config.aws.s3.scraper_bucket_name;
    static SCRAPER_BUCKET_LOCATION = `http://${S3Service.SCRAPER_BUCKET_NAME}.s3.amazonaws.com/`;
    static ERROR_SCREENSHOT_BUCKET_NAME = config.aws.s3.error_screenshot_bucket_name;

    constructor() {
        this.s3 = new S3({
            apiVersion: config.aws.s3.api_version,
            region: config.aws.region
        });
    }

    async fetchBucket(bucketName: string): Promise<string> {
        return new Promise( (resolve, reject) => {
            this.s3.listBuckets((err, data) => {
                if (err) {
                  console.log("fetchBucket Error: ", err);
                  resolve('');
                } else {
                    const bucket = data.Buckets?.find( (acc) => { 
                        return acc.Name === bucketName;
                    });
                    // @ts-ignore
                   resolve( bucket ? bucket.Name : '');
                }
            });
        });
    }

    async exists(bucketName: string): Promise<boolean> {
        const bucket = await this.fetchBucket(bucketName);
        return bucket.length > 0 ? true : false
    }

    async create(bucketName: string): Promise<boolean> {
        return new Promise( (resolve, reject) => {
            const bucketParams = {
                Bucket : bucketName
            };

            this.s3.createBucket(bucketParams, (err, data) => {
                if (err) {
                    console.log("createBucket ERROR: ", err);
                    resolve(false);
                } else {
                    console.log('Bucket Location: ', data.Location);
                    resolve(true);
                }
              });
        });
    }

    async getObject(bucketName: string, key: string): Promise<any>{
        return new Promise( (resolve, reject) => {
            const params = {
                Bucket: bucketName, 
                Key: key
            };

            this.s3.getObject(params, function(err, data) {
                if (err) {
                    console.log('getObject ERROR: ', err);
                    reject(err);
                } else {
                    console.log('getObject data: ', data);
                    resolve(data);
                }   
            });
        });
    }
    
    async uploadCsv(bucketName: string, path: string, content: string): Promise<boolean> {
        return new Promise( (resolve, reject) => {
            const params = {
                Bucket: bucketName,
                Key: path,
                Body: Buffer.from(content),
                ContentType: 'application/octet-stream',
                ContentDisposition: 'inline',
                // CacheControl: 'public, max-age=86400'
            }

            this.s3.upload(params, (err: any, data: any) => {
                if (err) {
                  console.log("uploadCsv Error: ", err);
                  resolve(false);
                } if (data) {
                  console.log("Upload Success: ", data.Location);
                  this.uploads.push(data.Location);
                  
                  resolve(true);
                }
            });
        });
    }

    async uploadBase64Image(bucketName: string, filename: string, base64String: Buffer): Promise<string> {
        return new Promise( (resolve, reject) => {
            const params = {
                Bucket: bucketName,
                Key: filename,
                Body: base64String,
                ContentEncoding: 'base64',
                ContentType: 'image/jpeg'
            }

            this.s3.upload(params, (err: any, data: any) => {
                if (err) {
                  console.log("uploadBase64Image Error: ", err);
                  resolve('');
                } if (data) {
                  console.log("Upload Success: ", data.Location);
                  
                  resolve(data.Location);
                }
            });
        });
    }
}