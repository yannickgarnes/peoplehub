CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS workers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER,
  nombre TEXT, apellido1 TEXT, apellido2 TEXT,
  dni TEXT, naf TEXT,
  fecha_nacimiento TEXT, fecha_alta TEXT, fecha_antiguedad TEXT,
  puesto TEXT, email TEXT, ubicacion TEXT,
  revision_medica TEXT, -- date or 'NO' or 'PROGRAMAR'
  formacion_prl TEXT, -- date
  prl_modo TEXT, -- 'online'/'presencial'/'pendiente'
  carnet_carretillero TEXT, -- expiry date
  carnet_3a_3b TEXT, -- for TERMOCERAM
  fecha_baja TEXT,
  estado TEXT DEFAULT 'activo', -- 'activo'/'baja'
  telefono TEXT, direccion TEXT,
  FOREIGN KEY (company_id) REFERENCES companies(id)
);

CREATE TABLE IF NOT EXISTS vacations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  worker_id INTEGER,
  fecha_inicio TEXT, fecha_fin TEXT,
  dias INTEGER,
  tipo TEXT DEFAULT 'vacaciones', -- 'vacaciones'/'permiso_personal'
  estado TEXT DEFAULT 'aprobado',
  notas TEXT,
  FOREIGN KEY (worker_id) REFERENCES workers(id)
);

CREATE TABLE IF NOT EXISTS absences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  worker_id INTEGER,
  tipo TEXT, -- 'ilt'/'accidente_trabajo'/'baja_paternal'/'permiso_medico'/'ausencia'
  fecha_inicio TEXT, fecha_fin TEXT,
  horas REAL, -- for hour-based permissions (permiso_medico)
  observaciones TEXT,
  FOREIGN KEY (worker_id) REFERENCES workers(id)
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  worker_id INTEGER,
  company_id INTEGER,
  tipo TEXT, -- 'prl'/'modelo_145'/'justificante'/'contrato'/'nomina'/'politica'/'otro'
  nombre TEXT,
  ruta_archivo TEXT,
  requiere_firma INTEGER DEFAULT 0,
  firmado INTEGER DEFAULT 0,
  fecha_firma TEXT,
  fecha_subida TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (worker_id) REFERENCES workers(id)
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  worker_id INTEGER,
  email TEXT UNIQUE,
  password_hash TEXT,
  role TEXT DEFAULT 'employee', -- 'admin'/'employee'
  ultimo_acceso TEXT,
  FOREIGN KEY (worker_id) REFERENCES workers(id)
);
