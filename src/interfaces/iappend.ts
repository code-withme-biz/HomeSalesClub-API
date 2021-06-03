export interface IArguments {
    knownData?: {
        [key: string]: any
    };
}

export interface IResponse {
    knownData?: {
        [key: string]: any
    },
    results: {
        phoneFound: boolean,
        foundData: {
            [key: string]: any
        }
    };

    error?: boolean;
    requiredDataAvailable?: boolean;
    message?: any;
    waterfallPosition?: number;
    provider?: string;
}