const fs = require('fs');
const shared = fs.readFileSync('d:/WFH/Book1_unzipped/xl/sharedStrings.xml', 'utf8');
const sheet = fs.readFileSync('d:/WFH/Book1_unzipped/xl/worksheets/sheet1.xml', 'utf8');
const strings = [...shared.matchAll(/<t[^>]*>(.*?)<\/t>/g)].map(m => m[1]);
let rows = sheet.split('<row ');
rows.shift();
rows.forEach(row => {
    // try matching string cells
    const cols = [...row.matchAll(/<c r="([A-Z]+)\d+"[^>]*t="s"[^>]*><v>(\d+)<\/v><\/c>/g)];
    const rowData = cols.map(c => ({col: c[1], val: strings[parseInt(c[2])]}));
    
    // try matching inline string cells
    const inlineCols = [...row.matchAll(/<c r="([A-Z]+)\d+"[^>]*t="inlineStr"[^>]*><is><t>(.*?)<\/t><\/is><\/c>/g)];
    inlineCols.forEach(c => rowData.push({col: c[1], val: c[2]}));

    // try matching number cells
    const numCols = [...row.matchAll(/<c r="([A-Z]+)\d+"(?:[^>]*t="n")?[^>]*><v>([0-9.]+)<\/v><\/c>/g)];
    numCols.forEach(c => rowData.push({col: c[1], val: c[2]}));

    if (rowData.length > 0) {
        console.log(rowData.sort((a,b) => a.col.localeCompare(b.col)).map(x => x.col + ':' + x.val).join(', '));
    }
});
