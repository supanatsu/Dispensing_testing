const XLSX = require('./xlsx.js');
const workbook = XLSX.readFile('d:/WFH/dataset/5.IPQC Buy off damper install_2026/5.Format New Buy off damper install_Trend chart/Format Buy off Damper Cim BP 3D_MC#.xlsx');
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });
for (let i = 0; i < Math.min(40, jsonData.length); i++) {
    console.log(jsonData[i].join(' | '));
}
