const xlsx = require('xlsx');
const GRUPO_SS_PATH = 'C:\\Users\\yanni\\Downloads\\GRUPO SS. ESSAI.xlsx';
const wb = xlsx.readFile(GRUPO_SS_PATH);

wb.SheetNames.forEach(name => {
  console.log('='.repeat(50));
  console.log(`SHEET: ${name}`);
  console.log('='.repeat(50));
  const ws = wb.Sheets[name];
  const data = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
  for (let i = 0; i < Math.min(data.length, 6); i++) {
    console.log(`Row ${i}:`, data[i]);
  }
});
