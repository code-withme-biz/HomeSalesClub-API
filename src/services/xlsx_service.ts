var XLSX = require('xlsx');

var workbook_to_json = function to_json(workbook: any) {
    var result: any = {};
    workbook.SheetNames.forEach(function(sheetName: string) {
        var roa = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {header:1});
        if(roa.length) result[sheetName] = roa;
    });
    return JSON.stringify(result);
};

export const xlsxBufferToJson = function(buffer: Buffer) {
    // const buffer = Buffer.from(buffer_string);
    var data = new Uint8Array(buffer);

    var arr = new Array();
    for(var i = 0; i != data.length; ++i) {
        arr[i] = String.fromCharCode(data[i]);
    }
    var bstr = arr.join("");
    
    /* Call XLSX */
    var workbook = XLSX.read(bstr, {type:'base64', WTF:false});
    
    return workbook_to_json(workbook);
}

export const xlsxToCsv = function(fileName: string) {
    const workbook = XLSX.readFile(fileName);
    XLSX.writeFile(workbook, fileName, { bookType: "csv" });

    return fileName;
}