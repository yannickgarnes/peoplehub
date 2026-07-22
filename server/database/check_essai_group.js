const xlsx = require('xlsx');
const path = require('path');
const wb = xlsx.readFile('C:\\Users\\yanni\\Downloads\\GRUPO SS. ESSAI.xlsx');
const sheet = wb.Sheets['ESSAI GROUP'];
const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
for (let i = 0; i < Math.min(data.length, 10); i++) {
  console.log(`Row ${i}:`, data[i]);
}
