/**
 * db-universal.js
 * Universal database adapter:
 *  - TURSO (production/Vercel): uses @libsql/client when TURSO_DATABASE_URL is set
 *  - LOCAL (development): uses sql.js with data/essai.db
 *  - VERCEL (no Turso): uses sql.js with /tmp/essai.db + auto-seeds from seed-data.json
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const os = require('os');

const IS_TURSO = !!(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN &&
                    process.env.TURSO_DATABASE_URL !== 'undefined');
const IS_VERCEL = !!(process.env.VERCEL || process.env.VERCEL_ENV);

// DB file path: /tmp on Vercel (writable), data/ locally
const DB_PATH = IS_VERCEL
  ? path.join('/tmp', 'essai.db')
  : path.join(__dirname, '..', '..', 'data', 'essai.db');

const DATA_DIR = IS_VERCEL
  ? '/tmp'
  : path.join(__dirname, '..', '..', 'data');

// Seed data bundled with the app (exported from local DB)
const SEED_DATA_PATH = path.join(__dirname, '..', '..', 'data', 'seed-data.json');

let _universalDb = null;

// ============================================================
// TURSO CLIENT
// ============================================================
async function getTursoDb() {
  const { createClient } = require('@libsql/client');
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  console.log('[DB] ✅ Connected to Turso cloud database');
  return new UniversalDb(client, 'turso');
}

// ============================================================
// SQL.JS (local or Vercel /tmp)
// ============================================================
async function getSqlJsDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  let sqlDb;
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    sqlDb = new SQL.Database(fileBuffer);
    console.log(`[DB] ✅ Loaded existing database from ${DB_PATH}`);
  } else {
    sqlDb = new SQL.Database();
    console.log(`[DB] 🆕 Created new in-memory database`);
  }

  let saveTimeout = null;
  const scheduleSave = () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      try {
        const data = sqlDb.export();
        fs.writeFileSync(DB_PATH, Buffer.from(data));
      } catch (e) {
        console.warn('[DB] Could not save to disk:', e.message);
      }
    }, 100);
  };

  // Unified interface
  const adapter = {
    query: (sql, params) => {
      let stmt;
      try {
        stmt = sqlDb.prepare(sql, params);
        const rows = [];
        while (stmt.step()) rows.push(stmt.getAsObject());
        return rows;
      } finally { if (stmt) stmt.free(); }
    },
    runQuery: (sql, params) => {
      let stmt;
      try {
        stmt = sqlDb.prepare(sql);
        if (params) stmt.bind(params);
        stmt.step();
        scheduleSave();
        const r = sqlDb.exec('SELECT last_insert_rowid() as id');
        return {
          changes: sqlDb.getRowsModified(),
          lastInsertRowid: r?.[0]?.values?.[0]?.[0] ?? null
        };
      } finally { if (stmt) stmt.free(); }
    },
    exec: (sql) => {
      const r = sqlDb.exec(sql);
      scheduleSave();
      return r;
    }
  };

  return new UniversalDb(adapter, 'sqljs');
}

// ============================================================
// UNIVERSAL DB WRAPPER
// ============================================================
class UniversalDb {
  constructor(client, type) {
    this._client = client;
    this._type = type; // 'turso' | 'sqljs'
  }

  async query(sql, params = []) {
    if (this._type === 'turso') {
      const result = await this._client.execute({ sql, args: params });
      return result.rows.map(row =>
        Object.fromEntries(result.columns.map((col, i) => [col, row[i]]))
      );
    }
    return this._client.query(sql, params);
  }

  async runQuery(sql, params = []) {
    if (this._type === 'turso') {
      const result = await this._client.execute({ sql, args: params });
      return {
        changes: result.rowsAffected,
        lastInsertRowid: result.lastInsertRowid ? Number(result.lastInsertRowid) : null
      };
    }
    return this._client.runQuery(sql, params);
  }

  async exec(sql) {
    if (this._type === 'turso') {
      const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
      for (const stmt of statements) {
        try { await this._client.execute(stmt); } catch (e) { /* ignore exists errors */ }
      }
    } else {
      try { this._client.exec(sql); } catch (e) { /* ignore */ }
    }
  }
}

// ============================================================
// SCHEMA + SEED FROM JSON
// ============================================================
async function initSchema(db) {
  const schemaPath = path.join(__dirname, 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8').replace(/--[^\n]*/g, '');
    await db.exec(schemaSql);
  }
}

async function seedFromJson(db) {
  if (!fs.existsSync(SEED_DATA_PATH)) {
    console.log('[DB] No seed-data.json found, skipping auto-seed');
    return;
  }

  // Check if already seeded
  const existingWorkers = await db.query('SELECT COUNT(*) as cnt FROM workers');
  const count = existingWorkers[0]?.cnt ?? 0;
  if (Number(count) > 0) {
    console.log(`[DB] Already seeded with ${count} workers`);
    return;
  }

  console.log('[DB] Seeding from seed-data.json...');
  const seedData = JSON.parse(fs.readFileSync(SEED_DATA_PATH, 'utf8'));

  // Companies
  for (const c of (seedData.companies || [])) {
    await db.runQuery(
      'INSERT OR IGNORE INTO companies (id, name, code) VALUES (?, ?, ?)',
      [c.id, c.name, c.code]
    );
  }

  // Workers
  for (const w of (seedData.workers || [])) {
    await db.runQuery(
      `INSERT OR IGNORE INTO workers
       (id, company_id, nombre, apellido1, apellido2, dni, naf,
        fecha_nacimiento, fecha_alta, fecha_antiguedad, puesto, email,
        ubicacion, revision_medica, formacion_prl, prl_modo,
        carnet_carretillero, carnet_3a_3b, fecha_baja, estado,
        telefono, direccion, departamento)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [w.id, w.company_id, w.nombre, w.apellido1, w.apellido2, w.dni, w.naf,
       w.fecha_nacimiento, w.fecha_alta, w.fecha_antiguedad, w.puesto, w.email,
       w.ubicacion, w.revision_medica, w.formacion_prl, w.prl_modo,
       w.carnet_carretillero, w.carnet_3a_3b, w.fecha_baja, w.estado,
       w.telefono, w.direccion, w.departamento]
    );
  }

  // Admin user
  for (const u of (seedData.users || [])) {
    await db.runQuery(
      'INSERT OR IGNORE INTO users (id, email, password_hash, role) VALUES (?,?,?,?)',
      [u.id, u.email, u.password_hash, u.role]
    );
  }

  // Vacations
  for (const v of (seedData.vacations || [])) {
    await db.runQuery(
      'INSERT OR IGNORE INTO vacations (id, worker_id, fecha_inicio, fecha_fin, dias, tipo, estado, notas) VALUES (?,?,?,?,?,?,?,?)',
      [v.id, v.worker_id, v.fecha_inicio, v.fecha_fin, v.dias, v.tipo, v.estado, v.notas]
    );
  }

  // Absences
  for (const a of (seedData.absences || [])) {
    await db.runQuery(
      'INSERT OR IGNORE INTO absences (id, worker_id, tipo, fecha_inicio, fecha_fin, horas, observaciones) VALUES (?,?,?,?,?,?,?)',
      [a.id, a.worker_id, a.tipo, a.fecha_inicio, a.fecha_fin, a.horas, a.observaciones]
    );
  }

  console.log(`[DB] ✅ Seeded ${seedData.workers?.length} workers, ${seedData.companies?.length} companies`);
}

// ============================================================
// MAIN ENTRY
// ============================================================
async function getDb() {
  if (_universalDb) return _universalDb;

  try {
    if (IS_TURSO) {
      _universalDb = await getTursoDb();
    } else {
      _universalDb = await getSqlJsDb();
    }

    await initSchema(_universalDb);
    await seedFromJson(_universalDb);

  } catch (err) {
    console.error('[DB] Fatal error initializing database:', err.message);
    throw err;
  }

  return _universalDb;
}

module.exports = { getDb };
