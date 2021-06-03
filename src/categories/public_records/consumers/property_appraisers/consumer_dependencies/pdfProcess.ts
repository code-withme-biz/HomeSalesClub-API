//This service was made to parse PDF and get data from it.
//To use this just call processPdf with arguments url:string and {propertyName: propertyRegex, ....}
//UPD: Added the ability to search on the next or previous lines
//To do this, pass the following arguments:
//  1. url:string
//  2.{
//      propertyName: {
//          regexTest: type RegExp //  Regexp to find a line to start from
//          countNextLine: type Number // the count of lines in which the desired line is located (can be negative or positive)
//          regexValue: type RegExp // Regexp to find a value
//      }
//    }
//It will return {propertyName: findValue}
//Please be sure that you have regex like new RegExp(/(?<label>Prop Class:\s+\|)(?<value>.*?)\|/g) where every time present value.
//This service look for value in group matches.

const http = require('http')
const pdfReader = require("pdfreader");

//Processing PDF and return same object with value
const processPdf = async (pdfUrl: string, objProperty: any) => {
    let data: any = {};
    for (let key in objProperty) {
        data[key] = '';
    }
    let bufferPdf = await downloadPdf(pdfUrl);
    data = await pdfParse(bufferPdf, objProperty, data);
    bufferPdf = null;
    return data;
}

//Function to parse PDF
const pdfParse = async (dataBuffer: any, objProperty: any, data: any) => {
    return new Promise(async (resolve, reject) => {
        let rows: any = {};
        const checkRows = () => {
            Object.keys(rows)
                .forEach((item, index, array) => {
                    const str = (rows[item] || []).join(" | ")
                    for (let key in objProperty) {
                        if (objProperty[key] instanceof RegExp) {
                            const match = objProperty[key].exec(str);
                            if (match && match.groups && match.groups.value) {
                                data[key] = match.groups.value.trim();
                            }
                        } else {
                            try {
                                if (objProperty[key].condition) {
                                    if (objProperty[key].condition.test(str)) {
                                        const match = objProperty[key].conditionIsTrue.exec(str);
                                        if (match && match.groups && match.groups.value) {
                                            data[key] = match.groups.value.trim();
                                        }
                                    } else {
                                        const match = objProperty[key].conditionIsFalse.exec(str);
                                        if (match && match.groups && match.groups.value) {
                                            data[key] = match.groups.value.trim();
                                        }
                                    }
                                } else {
                                    if (objProperty[key].regexTest.test(str)) {
                                        const nextItem = array[index + objProperty[key].countNextLine];
                                        const nextStr = (rows[nextItem] || []).join(" | ");
                                        if (objProperty[key].regexValue.condition) {
                                            if (objProperty[key].regexValue.condition.test(nextStr)) {
                                                const match = objProperty[key].regexValue.conditionIsTrue.exec(nextStr);
                                                if (match && match.groups && match.groups.value) {
                                                    data[key] = match.groups.value.trim();
                                                }
                                            } else {
                                                const match = objProperty[key].regexValue.conditionIsFalse.exec(nextStr);
                                                if (match && match.groups && match.groups.value) {
                                                    data[key] = match.groups.value.trim();
                                                }
                                            }
                                        } else {
                                            const match = objProperty[key].regexValue.exec(nextStr);
                                            if (match && match.groups && match.groups.value) {
                                                data[key] = match.groups.value.trim();
                                            }
                                        }
                                    }
                                }
                            } catch (e) {
                                console.log(e);
                            }
                        }
                    }
                });
        }
        new pdfReader.PdfReader().parseBuffer(dataBuffer, function (err: any, item: any) {
            if (!item || item.page) {
                checkRows();
                rows = {};
                resolve(data);
            } else if (item.text) {
                (rows[item.y] = rows[item.y] || []).push(item.text);
            }
        });
    });
}

//Function to download PDF file
const downloadPdf = async (url: string) => {
    return new Promise((resolve, reject) => {
        let buffs: any = []
        http.get(url, (response: any) => {
            response.on('data', (chunk: any) => {
                buffs.push(chunk);
            })
            response.on('end', () => {
                resolve(Buffer.concat(buffs));
            })
        })
    })
}

exports.pdfProcessor = processPdf;