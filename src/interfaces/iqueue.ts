export interface ISendMessageAttribute {
    [key: string] : IAttribute
}

export interface IReceiveAttribute {
    QueueUrl: string;
    AttributeNames?: string[];
    MaxNumberOfMessages: number;
    MessageAttributeNames?: string[];
    ReceiveRequestAttemptId?: string;
    VisibilityTimeout?: number;
    WaitTimeSeconds?: number;
}

export interface IDeleteAttribute {
    QueueUrl: string;
    ReceiptHandle: string;
}

interface IAttribute {
    DataType: string;
    StringValue: string;
}