const xlsx = require('xlsx');
const path = require('path');
const bcrypt = require('bcryptjs');
const { getDb } = require('./db');

const GRUPO_SS_PATH = path.join('C:', 'Users', 'yanni', 'Downloads', 'GRUPO SS. ESSAI.xlsx');
const REGISTRO_PATH = path.join('C:', 'Users', 'yanni', '.gemini', 'antigravity', 'brain', 'c47dc353-a81a-4842-a271-e914e0e9137b', 'scratch', 'registro_decrypted.xlsx');

const normalizeDNI = (dni) => {
    if (!dni) return null;
    return dni.toString().replace(/[\s\-\/()]/g, '').replace(/^0/, '').toUpperCase().trim();
};

const formatExcelDate = (val) => {
    if (!val) return null;
    const s = val.toString().trim();
    if (!s) return null;
    
    // Check if it's an Excel serial date number
    if (/^\d{5}$/.test(s) || /^\d{5}\.\d+$/.test(s)) {
        const num = parseFloat(s);
        const date = new Date((num - (25567 + 2)) * 86400 * 1000);
        if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0];
        }
    }
    
    // Try M/D/YY format (US dates from xlsx)
    const parts = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (parts) {
        let year = parseInt(parts[3]);
        if (year < 100) year += year > 50 ? 1900 : 2000;
        const month = parts[1].padStart(2, '0');
        const day = parts[2].padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // Try D/M/YY or other formats
    const parts2 = s.match(/^(\d{1,2})\-(\d{1,2})\-(\d{2,4})$/);
    if (parts2) {
        let year = parseInt(parts2[3]);
        if (year < 100) year += year > 50 ? 1900 : 2000;
        const month = parts2[2].padStart(2, '0');
        const day = parts2[1].padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    // Try YYYY-MM-DD already
    if (s.match(/^\d{4}-\d{2}-\d{2}/)) return s.split('T')[0];
    return s;
};

const readSheet = (workbook, sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return [];
    return xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
};

const LOCATION_NAMES = [
    'SEVILLA', 'OFICINA SANT FELIU', 'ALMACEN SANT FELIU', 'ALMACÉN SANT FELIU',
    'MADRID', 'VALENCIA', 'SAT CALIDAD', 'ALMACEN SANT JUST DESVERN',
    'ALMACEN SANT JUST', 'SANT JUST DESVERN', 'SANT JUST', 'SAT'
];

const isLocation = (row) => {
    const nonEmpty = row.filter(c => c !== '' && c !== null && c !== undefined);
    if (nonEmpty.length === 1 && typeof nonEmpty[0] === 'string') {
        const val = nonEmpty[0].trim().toUpperCase().replace(/É/g, 'E').replace(/Á/g, 'A').replace(/Ó/g, 'O');
        for (const loc of LOCATION_NAMES) {
            if (val.includes(loc) || loc.includes(val)) return nonEmpty[0].trim();
        }
    }
    return null;
};

const isHeaderRow = (row) => {
    const first = (row[0] || '').toString().toUpperCase().trim();
    return first === 'NOMBRE' || first.includes('CONTROL') || first.includes('REGISTRO') || first.includes('APARICI');
};

const runSeed = async () => {
    console.log('=== Iniciando importación de datos completa ===');
    const db = await getDb();

    // Clear existing data
    db.exec('DELETE FROM users; DELETE FROM documents; DELETE FROM absences; DELETE FROM vacations; DELETE FROM workers; DELETE FROM companies;');

    // Load GRUPO SS Workbook
    let grupoWb;
    try {
        grupoWb = xlsx.readFile(GRUPO_SS_PATH);
    } catch (err) {
        console.error('Error leyendo GRUPO SS:', err.message);
        return;
    }

    // Load REGISTRO Workbook
    let registroWb;
    try {
        registroWb = xlsx.readFile(REGISTRO_PATH);
    } catch (err) {
        console.error('Error leyendo REGISTRO:', err.message);
        registroWb = null;
    }

    // Create companies from GRUPO SS sheet names (normalizing names)
    const companyIds = {};
    console.log('Creando empresas detectadas...');
    let companyCounter = 1;
    for (const sheetName of grupoWb.SheetNames) {
        let companyName = sheetName.trim();
        // Map "NUEVA CERVERA LOGISTICS" to "CERVERA LOGISTICS"
        if (companyName === 'NUEVA CERVERA LOGISTICS') {
            companyName = 'CERVERA LOGISTICS';
        }
        
        // If not already created
        if (!companyIds[companyName]) {
            const code = companyName.split(' ')[0].toUpperCase() + companyCounter++;
            const res = db.runQuery('INSERT INTO companies (name, code) VALUES (?, ?)', [companyName, code]);
            companyIds[companyName] = res.lastInsertRowid;
            console.log(`  Empresa: ${companyName} (ID: ${res.lastInsertRowid}, Código: ${code})`);
        }
        // Map original sheetName as well
        companyIds[sheetName] = companyIds[companyName];
    }

    // Make sure we have CERVERA LOGISTICS company mapped if not there
    if (!companyIds['CERVERA LOGISTICS']) {
        const res = db.runQuery('INSERT INTO companies (name, code) VALUES (?, ?)', ['CERVERA LOGISTICS', 'CERVERA']);
        companyIds['CERVERA LOGISTICS'] = res.lastInsertRowid;
    }

    // Worker map by normalized DNI
    const workerMap = new Map();

    // ===== Process GRUPO SS (Personal data) =====
    console.log('\n--- Leyendo GRUPO SS ---');
    for (const sheetName of grupoWb.SheetNames) {
        const rows = readSheet(grupoWb, sheetName);
        let count = 0;
        for (const row of rows) {
            if (isHeaderRow(row)) continue;
            const nombre = (row[0] || '').toString().trim();
            if (!nombre || nombre === 'NOMBRE') continue;

            const rawDni = (row[7] || '').toString().trim();
            const dni = normalizeDNI(rawDni);
            if (!dni || dni.length < 3) continue;

            const worker = {
                company_id: companyIds[sheetName],
                nombre,
                apellido1: (row[1] || '').toString().trim(),
                apellido2: (row[2] || '').toString().trim(),
                fecha_nacimiento: formatExcelDate(row[3]),
                fecha_alta: formatExcelDate(row[4]),
                fecha_antiguedad: formatExcelDate(row[5]),
                naf: (row[6] || '').toString().trim(),
                dni: rawDni,
                puesto: (row[8] || '').toString().trim(),
                email: (row[9] || '').toString().trim(),
                estado: 'activo'
            };

            workerMap.set(dni, worker);
            count++;
        }
        console.log(`  Hoja "${sheetName}": ${count} trabajadores`);
    }

    // ===== Process REGISTRO (PRL/Safety/Status data) =====
    if (registroWb) {
        console.log('\n--- Leyendo REGISTRO TRABAJADORES ---');
        for (const sheetName of registroWb.SheetNames) {
            const rows = readSheet(registroWb, sheetName);
            let currentLocation = null;
            let count = 0;

            // Mapping sheets to companies
            let companyKey = sheetName;
            if (sheetName === 'NOFER APARICI') companyKey = 'NOFER APARICI';
            else if (sheetName === 'TERMOCERAM') companyKey = 'TERMOCERAM';
            else if (sheetName === 'CERVERA LOGISTICS') companyKey = 'CERVERA LOGISTICS';

            const carnet3aCol = (sheetName === 'TERMOCERAM') ? 10 : null;
            const fechaBajaCol = (sheetName === 'TERMOCERAM') ? 11 : 10;

            for (const row of rows) {
                const loc = isLocation(row);
                if (loc) { 
                    currentLocation = loc; 
                    continue; 
                }
                if (isHeaderRow(row)) continue;

                const nombre = (row[0] || '').toString().trim();
                if (!nombre || nombre === 'NOMBRE') continue;

                const rawDni = (row[3] || '').toString().trim();
                const dni = normalizeDNI(rawDni);
                if (!dni || dni.length < 3) continue;

                let w = workerMap.get(dni);
                if (!w) {
                    // New worker not in GRUPO SS (e.g. from CERVERA or TERMOCERAM sheets)
                    w = {
                        company_id: companyIds[companyKey],
                        nombre: nombre,
                        apellido1: (row[1] || '').toString().trim(),
                        apellido2: (row[2] || '').toString().trim(),
                        dni: rawDni,
                        fecha_alta: formatExcelDate(row[4]),
                        puesto: (row[5] || '').toString().trim(),
                        estado: 'activo'
                    };
                }

                // Update locations and PRL details
                if (currentLocation) {
                    w.ubicacion = currentLocation;
                }
                
                const revMed = (row[6] || '').toString().trim();
                if (revMed) w.revision_medica = revMed;
                
                const formPRL = (row[7] || '').toString().trim();
                if (formPRL) w.formacion_prl = formatExcelDate(formPRL);

                const prlModo = (row[8] || '').toString().trim();
                if (prlModo && prlModo !== '0') {
                    w.prl_modo = prlModo.toLowerCase().includes('on') ? 'online' : (prlModo.toLowerCase().includes('pend') ? 'pendiente' : prlModo);
                }

                const carnetCarr = (row[9] || '').toString().trim();
                if (carnetCarr) w.carnet_carretillero = formatExcelDate(carnetCarr);

                if (carnet3aCol !== null) {
                    const c3a = (row[carnet3aCol] || '').toString().trim();
                    if (c3a) w.carnet_3a_3b = formatExcelDate(c3a);
                }

                const fb = (row[fechaBajaCol] || '').toString().trim();
                if (fb && fb !== ',' && fb !== '0' && fb !== '-') {
                    w.fecha_baja = formatExcelDate(fb);
                    w.estado = 'baja';
                }

                workerMap.set(dni, w);
                count++;
            }
            console.log(`  Hoja "${sheetName}": ${count} trabajadores actualizados/añadidos`);
        }
    }

    // ===== Save to Database =====
    console.log('\n--- Guardando trabajadores y creando accesos ---');
    let workerCount = 0;
    let userCount = 0;

    for (const [dni, w] of workerMap) {
        const res = db.runQuery(`
            INSERT INTO workers (
                company_id, nombre, apellido1, apellido2, dni, naf,
                fecha_nacimiento, fecha_alta, fecha_antiguedad, puesto,
                email, ubicacion, revision_medica, formacion_prl, prl_modo,
                carnet_carretillero, carnet_3a_3b, fecha_baja, estado
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            w.company_id || null,
            w.nombre || null, w.apellido1 || null, w.apellido2 || null,
            w.dni || null, w.naf || null,
            w.fecha_nacimiento || null, w.fecha_alta || null, w.fecha_antiguedad || null,
            w.puesto || null, w.email || null, w.ubicacion || null,
            w.revision_medica || null, w.formacion_prl || null, w.prl_modo || null,
            w.carnet_carretillero || null, w.carnet_3a_3b || null,
            w.fecha_baja || null, w.estado || 'activo'
        ]);

        workerCount++;
        const workerId = res.lastInsertRowid;

        // Create user account
        const email = w.email || `${w.nombre.toLowerCase().replace(/\s+/g, '')}@essai.com`;
        const password = w.dni ? w.dni.replace(/[\s\-()]/g, '').trim() : '123456';
        
        try {
            const hash = await bcrypt.hash(password, 10);
            db.runQuery(
                'INSERT OR IGNORE INTO users (worker_id, email, password_hash, role) VALUES (?, ?, ?, ?)',
                [workerId, email.trim().toLowerCase(), hash, 'employee']
            );
            userCount++;
        } catch (e) {
            console.log(`  Aviso: No se pudo crear usuario para ${w.nombre}: ${e.message}`);
        }
    }

    // Create admin account
    const adminHash = await bcrypt.hash('admin2026', 10);
    db.runQuery(
        'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)',
        ['admin@essai.com', adminHash, 'admin']
    );

    console.log(`\n=== Importación completada ===`);
    console.log(`  Total Empresas: ${Object.keys(companyIds).length / 2}`);
    console.log(`  Total Trabajadores: ${workerCount}`);
    console.log(`  Total Cuentas de usuario: ${userCount}`);
    console.log(`  Administrador: admin@essai.com / admin2026`);
    console.log(`  Base de datos guardada en: data/essai.db`);
};

runSeed().catch(err => {
    console.error('Error fatal en seed:', err);
    process.exit(1);
});
