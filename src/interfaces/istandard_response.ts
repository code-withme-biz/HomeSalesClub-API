export interface IResponse {
    statusCode: number;
    body: IBodyResponse;
}

interface IBodyResponse {
    resp: string;
    success: boolean;
}