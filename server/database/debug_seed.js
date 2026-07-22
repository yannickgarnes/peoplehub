const xlsx = require('xlsx');
const GRUPO_SS_PATH = 'C:\\Users\\yanni\\Downloads\\GRUPO SS. ESSAI.xlsx';

const wb = xlsx.readFile(GRUPO_SS_PATH);
const sheet = wb.Sheets['ESSAI GROUP'];
const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });

const isHeaderRow = (row) => {
    const first = (row[0] || '').toString().toUpperCase().trim();
    return first === 'NOMBRE' || first.includes('CONTROL') || first.includes('REGISTRO');
};

const normalizeDNI = (dni) => {
    if (!dni) return null;
    return dni.toString().replace(/[\s\-\/()]/g, '').replace(/^0/, '').toUpperCase().trim();
};

console.log('Total rows in sheet:', rows.length);
rows.forEach((row, idx) => {
    const header = isHeaderRow(row);
    const nombre = (row[0] || '').toString().trim();
    const rawDni = (row[7] || '').toString().trim();
    const dni = normalizeDNI(rawDni);
    console.log(`Row ${idx}: nombre="${nombre}", header=${header}, rawDni="${rawDni}", dni="${dni}"`);
});
