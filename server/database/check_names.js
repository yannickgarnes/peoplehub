const xlsx = require('xlsx');
const GRUPO_SS_PATH = 'C:\\Users\\yanni\\Downloads\\GRUPO SS. ESSAI.xlsx';
const wb = xlsx.readFile(GRUPO_SS_PATH);
console.log('Sheet Names:');
wb.SheetNames.forEach(name => {
  console.log(`- "${name}" (length: ${name.length})`);
  const ws = wb.Sheets[name];
  const ref = ws['!ref'] || 'no ref';
  console.log(`  ref: ${ref}`);
});
