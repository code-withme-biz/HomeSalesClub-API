export const isDate = (date: string): boolean => {
    return typeof date === 'string' && date.indexOf('T') > -1 && !isNaN(Date.parse(date));
}

export const isDateTime = (date: string): boolean => {
    return typeof date === 'string' && date.indexOf('T') > -1  && !isNaN(Date.parse(date));
}

export const isInt = (n: number): boolean => {
    return typeof n === 'number' && n % 1 === 0;
}

export const isFloat = (n: number): boolean => {
    return typeof n === 'number' && n % 1 !== 0;
}