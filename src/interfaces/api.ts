export interface IResponse {
    success: boolean;
    error?: any;
    data?: any;
    response?: string;
}

export interface IRestRes {
    statusCode: number;
    body: { 
        resp: string;
        success: boolean;
    };
}

export interface ICsvResponse {
    success: boolean;
    csvPath: string;
}