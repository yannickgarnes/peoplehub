/**
 * routes/import.js
 * Permite importar/actualizar datos de trabajadores subiendo un fichero Excel.
 * Siempre actualiza desde el Excel más reciente (controla la fecha de subida).
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../database/db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Store uploaded Excels in /data/imports/
const importDir = path.join(__dirname, '..', '..', 'data', 'imports');
if (!fs.existsSync(importDir)) fs.mkdirSync(importDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, importDir),
  filename: (req, file, cb) => {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    cb(null, ts + '_' + file.originalname);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls'].includes(ext)) cb(null, true);
    else cb(new Error('Solo se aceptan archivos Excel (.xlsx, .xls)'));
  }
});

// Normalize DNI for matching
const normDNI = (v) => v ? v.toString().replace(/[\s\-\/()]/g, '').toUpperCase().trim() : null;

// Format Excel date
const fmtDate = (val) => {
  if (!val) return null;
  const s = val.toString().trim();
  if (!s) return null;
  if (/^\d{5}$/.test(s) || /^\d{5}\.\d+$/.test(s)) {
    const d = new Date((parseFloat(s) - (25567 + 2)) * 86400 * 1000);
    if (!isNaN(d)) return d.toISOString().split('T')[0];
  }
  const p1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (p1) {
    let y = parseInt(p1[3]); if (y < 100) y += y > 50 ? 1900 : 2000;
    return `${y}-${p1[1].padStart(2,'0')}-${p1[2].padStart(2,'0')}`;
  }
  const p2 = s.match(/^(\d{1,2})\-(\d{1,2})\-(\d{2,4})$/);
  if (p2) {
    let y = parseInt(p2[3]); if (y < 100) y += y > 50 ? 1900 : 2000;
    return `${y}-${p2[2].padStart(2,'0')}-${p2[1].padStart(2,'0')}`;
  }
  if (s.match(/^\d{4}-\d{2}-\d{2}/)) return s.split('T')[0];
  return s;
};

function tryDecryptExcel(filePath, password) {
  if (!password) return filePath;
  const decryptedPath = filePath + '_decrypted.xlsx';
  const pyCode = `import msoffcrypto
with open(r'${filePath}', 'rb') as f:
    file = msoffcrypto.OfficeFile(f)
    if file.is_encrypted():
        file.load_key(password=r'${password}')
        with open(r'${decryptedPath}', 'wb') as out:
            file.decrypt(out)
`;
  const scriptPath = filePath + '_decrypt.py';
  try {
    fs.writeFileSync(scriptPath, pyCode);
    const { execSync } = require('child_process');
    execSync(`py "${scriptPath}"`, { stdio: 'pipe', timeout: 10000 });
    if (fs.existsSync(decryptedPath)) {
      return decryptedPath;
    }
  } catch (e) {
    console.error('Decryption helper error:', e.message);
  } finally {
    try { if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath); } catch {}
  }
  return filePath;
}

/**
 * POST /api/import/excel
 * Upload Excel and sync worker data
 */
router.post('/excel', requireAdmin, upload.single('excel'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo Excel' });

    const xlsx = require('xlsx');
    const db = await getDb();

    const password = req.body.password || req.query.password;
    let filePathToRead = req.file.path;

    if (password) {
      filePathToRead = tryDecryptExcel(req.file.path, password);
    }

    let wb;
    try {
      wb = xlsx.readFile(filePathToRead, { password: password || '' });
    } catch (readErr) {
      if (readErr.message && (readErr.message.includes('password-protected') || readErr.message.includes('password'))) {
        return res.status(400).json({
          password_required: true,
          error: 'File is password-protected. Por favor introduce la contraseña.'
        });
      }
      throw readErr;
    }

    const results = { updated: 0, created: 0, skipped: 0, errors: [] };

    // Map company codes to IDs
    const companiesRaw = await db.query('SELECT id, name, code FROM companies');
    const companyByCode = {};
    const companyByName = {};
    companiesRaw.forEach(c => {
      if (c.code) companyByCode[c.code.toUpperCase()] = c.id;
      if (c.name) companyByName[c.name.toUpperCase()] = c.id;
    });

    // Map company keywords to IDs
    const getCompanyId = (text) => {
      if (!text) return null;
      const t = text.toString().toUpperCase().trim();
      for (const [code, id] of Object.entries(companyByCode)) {
        if (t.includes(code)) return id;
      }
      for (const [name, id] of Object.entries(companyByName)) {
        if (t.includes(name.substring(0, 6))) return id;
      }
      return null;
    };

    const processedIds = new Set();

    // Process each sheet looking for worker data
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
      if (!rows || rows.length < 3) continue;

      // Find header row
      let headerRow = -1;
      let headers = [];
      for (let i = 0; i < Math.min(10, rows.length); i++) {
        const r = rows[i].map(c => c.toString().toUpperCase().trim());
        if (r.some(c => c.includes('DNI') || c.includes('NIE') || c.includes('NOMBRE') || c.includes('APELLIDO'))) {
          headerRow = i;
          headers = r;
          break;
        }
      }
      if (headerRow < 0) continue;

      // Find column indices
      const colIdx = (names) => {
        for (const name of names) {
          const idx = headers.findIndex(h => h.includes(name));
          if (idx >= 0) return idx;
        }
        return -1;
      };

      const col = {
        nombre: colIdx(['NOMBRE']),
        apellido1: colIdx(['APELLIDO1', 'PRIMER APELLIDO', 'APELLIDOS']),
        apellido2: colIdx(['APELLIDO2', 'SEGUNDO APELLIDO']),
        dni: colIdx(['DNI', 'NIE', 'NIF']),
        naf: colIdx(['NAF', 'SEG. SOC', 'SEGURIDAD SOCIAL', 'SS']),
        puesto: colIdx(['PUESTO', 'CARGO', 'CATEGORÍA']),
        email: colIdx(['EMAIL', 'CORREO', 'E-MAIL']),
        telefono: colIdx(['TELEFONO', 'TELÉFONO', 'MOVIL', 'MÓVIL', 'TLF']),
        fecha_alta: colIdx(['FECHA ALTA', 'F.ALTA', 'ALTA']),
        fecha_baja: colIdx(['FECHA BAJA', 'F.BAJA', 'BAJA']),
        revision_medica: colIdx(['REVISIÓN MÉDICA', 'REVISION MEDICA', 'REV. MÉDICA', 'REV MEDICA']),
        formacion_prl: colIdx(['FORMACIÓN PRL', 'FORMACION PRL', 'FECHA FORM', 'PRL']),
        ubicacion: colIdx(['UBICACIÓN', 'UBICACION', 'LOCALIDAD', 'CIUDAD', 'LUGAR TRABAJO']),
        estado: colIdx(['ESTADO', 'ACTIVO', 'SITUACIÓN']),
        fecha_nacimiento: colIdx(['NACIMIENTO', 'F. NAC', 'FECHA NAC']),
        fecha_antiguedad: colIdx(['ANTIGÜEDAD', 'ANTIGUEDAD', 'F.ANTIGUEDAD']),
      };

      if (col.dni < 0 && col.nombre < 0) continue;

      // Process data rows
      for (let i = headerRow + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.every(c => !c)) continue;

        const dni = col.dni >= 0 ? normDNI(row[col.dni]) : null;
        const nombre = col.nombre >= 0 ? row[col.nombre]?.toString().trim() : null;

        if (!dni && !nombre) continue;

        // Find existing worker by DNI first, then name
        let existingWorkers = [];
        if (dni) {
          existingWorkers = await db.query(
            `SELECT id FROM workers WHERE REPLACE(REPLACE(REPLACE(UPPER(dni), ' ', ''), '-', ''), '/', '') = ?`,
            [dni]
          );
        }
        if (existingWorkers.length === 0 && nombre) {
          existingWorkers = await db.query(
            `SELECT id FROM workers WHERE UPPER(TRIM(nombre)) LIKE ?`,
            [`%${nombre.toUpperCase().split(' ')[0]}%`]
          );
        }

        // Build update/insert data
        const workerData = {};
        if (col.nombre >= 0 && row[col.nombre]) workerData.nombre = row[col.nombre].toString().trim();
        if (col.apellido1 >= 0 && row[col.apellido1]) workerData.apellido1 = row[col.apellido1].toString().trim();
        if (col.apellido2 >= 0 && row[col.apellido2]) workerData.apellido2 = row[col.apellido2].toString().trim();
        if (dni) workerData.dni = dni;
        if (col.naf >= 0 && row[col.naf]) workerData.naf = row[col.naf].toString().trim();
        if (col.puesto >= 0 && row[col.puesto]) workerData.puesto = row[col.puesto].toString().trim();
        if (col.email >= 0 && row[col.email]) workerData.email = row[col.email].toString().trim();
        if (col.telefono >= 0 && row[col.telefono]) workerData.telefono = row[col.telefono].toString().trim();
        if (col.fecha_alta >= 0 && row[col.fecha_alta]) workerData.fecha_alta = fmtDate(row[col.fecha_alta]);
        if (col.fecha_baja >= 0 && row[col.fecha_baja]) workerData.fecha_baja = fmtDate(row[col.fecha_baja]);
        if (col.revision_medica >= 0 && row[col.revision_medica]) workerData.revision_medica = fmtDate(row[col.revision_medica]);
        if (col.formacion_prl >= 0 && row[col.formacion_prl]) workerData.formacion_prl = fmtDate(row[col.formacion_prl]);
        if (col.ubicacion >= 0 && row[col.ubicacion]) workerData.ubicacion = row[col.ubicacion].toString().trim();
        if (col.fecha_nacimiento >= 0 && row[col.fecha_nacimiento]) workerData.fecha_nacimiento = fmtDate(row[col.fecha_nacimiento]);
        if (col.fecha_antiguedad >= 0 && row[col.fecha_antiguedad]) workerData.fecha_antiguedad = fmtDate(row[col.fecha_antiguedad]);

        if (Object.keys(workerData).length === 0) { results.skipped++; continue; }

        if (existingWorkers.length > 0) {
          // UPDATE existing worker
          const wId = existingWorkers[0].id;
          const setClauses = Object.keys(workerData).map(k => `${k} = ?`).join(', ');
          await db.runQuery(
            `UPDATE workers SET ${setClauses} WHERE id = ?`,
            [...Object.values(workerData), wId]
          );
          processedIds.add(wId);
          results.updated++;
        } else {
          // INSERT new worker
          const cols = Object.keys(workerData).join(', ');
          const vals = Object.keys(workerData).map(() => '?').join(', ');
          const resIns = await db.runQuery(
            `INSERT INTO workers (${cols}) VALUES (${vals})`,
            Object.values(workerData)
          );
          if (resIns && resIns.lastInsertRowid) {
            processedIds.add(resIns.lastInsertRowid);
          }
          results.created++;
        }
      }
    }

    // Mark workers not in the Excel as "inactivo"
    // Only do this if we processed a significant amount of workers (e.g. > 10) 
    // to prevent accidental wiping if a tiny excel is uploaded.
    results.deactivated = 0;
    if (processedIds.size > 10) {
      const pIds = Array.from(processedIds);
      const placeholders = pIds.map(() => '?').join(',');
      const deactRes = await db.runQuery(
        `UPDATE workers SET estado = 'inactivo' WHERE (estado = 'activo' OR estado IS NULL) AND id NOT IN (${placeholders})`,
        pIds
      );
      results.deactivated = deactRes ? (deactRes.changes || 0) : 0;
    }

    // Log import
    const logPath = path.join(importDir, 'import-log.json');
    const log = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath)) : [];
    log.unshift({
      filename: req.file.originalname,
      date: new Date().toISOString(),
      results
    });
    fs.writeFileSync(logPath, JSON.stringify(log.slice(0, 50), null, 2));

    res.json({
      success: true,
      filename: req.file.originalname,
      results,
      message: `✅ Excel procesado: ${results.updated} actualizados, ${results.created} nuevos, ${results.skipped} sin cambios`
    });

  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ error: 'Error al procesar el Excel: ' + err.message });
  }
});

/**
 * GET /api/import/log
 * Returns the last import log entries
 */
router.get('/log', requireAdmin, async (req, res) => {
  try {
    const logPath = path.join(importDir, 'import-log.json');
    if (!fs.existsSync(logPath)) return res.json([]);
    res.json(JSON.parse(fs.readFileSync(logPath)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
