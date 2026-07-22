/**
 * db-universal.js
 * Database adapter that uses Turso (libsql) in production (Vercel)
 * and sql.js (in-memory SQLite) in local development.
 *
 * On Vercel: set environment variables TURSO_DATABASE_URL and TURSO_AUTH_TOKEN
 * Locally: data/essai.db file is used via sql.js
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');

const IS_TURSO = !!(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN);

let _client = null;
let _localDb = null;

// ========================
// TURSO (production) PATH
// ========================
async function getTursoClient() {
  if (_client) return _client;
  const { createClient } = require('@libsql/client');
  _client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  console.log('[DB] Connected to Turso cloud database');
  return _client;
}

// ========================
// sql.js (local) PATH
// ========================
async function getLocalDb() {
  if (_localDb) return _localDb;
  const dataDir = path.join(__dirname, '..', '..', 'data');
  const dbPath = path.join(dataDir, 'essai.db');

  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    _localDb = new SQL.Database(fileBuffer);
  } else {
    _localDb = new SQL.Database();
  }

  let saveTimeout = null;
  const saveToDisk = () => {
    const data = _localDb.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
  };
  const scheduleSave = () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveToDisk, 50);
  };

  // Unified query interface wrapping sql.js
  _localDb.query = (sql, params) => {
    let stmt;
    try {
      stmt = _localDb.prepare(sql, params);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally { if (stmt) stmt.free(); }
  };

  _localDb.runQuery = (sql, params) => {
    let stmt;
    try {
      stmt = _localDb.prepare(sql);
      if (params) stmt.bind(params);
      stmt.step();
      scheduleSave();
      const lastInsertResult = _localDb.exec('SELECT last_insert_rowid() as id');
      const lastInsertRowid = lastInsertResult?.[0]?.values?.[0]?.[0] ?? null;
      return { changes: _localDb.getRowsModified(), lastInsertRowid };
    } finally { if (stmt) stmt.free(); }
  };

  _localDb.exec = _localDb.exec.bind(_localDb);
  // Patch exec to trigger save
  const origExec = _localDb.exec.bind(_localDb);
  _localDb.exec = (sql, params) => {
    const result = origExec(sql, params);
    scheduleSave();
    return result;
  };

  // Run schema
  const schemaPath = path.join(__dirname, 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8').replace(/--[^\n]*/g, '');
    _localDb.exec(schemaSql);
  }

  console.log('[DB] Using local sql.js database');
  return _localDb;
}

// ========================
// UNIVERSAL DB INTERFACE
// ========================
class UniversalDb {
  constructor(client, isTurso) {
    this._client = client;
    this._isTurso = isTurso;
  }

  /**
   * Execute a SELECT query, returns array of row objects
   */
  async query(sql, params = []) {
    if (this._isTurso) {
      const result = await this._client.execute({ sql, args: params });
      return result.rows.map(row => Object.fromEntries(
        result.columns.map((col, i) => [col, row[i]])
      ));
    } else {
      return this._client.query(sql, params);
    }
  }

  /**
   * Execute an INSERT/UPDATE/DELETE, returns { changes, lastInsertRowid }
   */
  async runQuery(sql, params = []) {
    if (this._isTurso) {
      const result = await this._client.execute({ sql, args: params });
      return {
        changes: result.rowsAffected,
        lastInsertRowid: result.lastInsertRowid ? Number(result.lastInsertRowid) : null
      };
    } else {
      return this._client.runQuery(sql, params);
    }
  }

  /**
   * Execute multiple SQL statements (schema creation, etc.)
   */
  async exec(sql) {
    if (this._isTurso) {
      // Split on semicolons, execute each statement
      const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
      for (const stmt of statements) {
        await this._client.execute(stmt);
      }
    } else {
      this._client.exec(sql);
    }
  }
}

let _universalDb = null;

async function getDb() {
  if (_universalDb) return _universalDb;

  if (IS_TURSO) {
    const client = await getTursoClient();
    _universalDb = new UniversalDb(client, true);
  } else {
    const localDb = await getLocalDb();
    _universalDb = new UniversalDb(localDb, false);
  }

  // Initialize schema if needed
  const schemaPath = path.join(__dirname, 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8').replace(/--[^\n]*/g, '');
    try {
      await _universalDb.exec(schemaSql);
    } catch (e) {
      // Tables may already exist, ignore
    }
  }

  return _universalDb;
}

module.exports = { getDb };
