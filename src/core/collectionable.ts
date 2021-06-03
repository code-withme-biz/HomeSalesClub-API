import { listenerCount } from "process";

export const groupByKey = (collection: any[], key: string) => {
    let map = new Map();
    collection.map(val => {
        if(!map.has(val[key])){
            map.set(val[key], collection.filter(data => data[key] == val[key]));
        }
    });
    return map;
};


