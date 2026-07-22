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
  revision_medica TEXT,
  formacion_prl TEXT,
  prl_modo TEXT,
  carnet_carretillero TEXT,
  carnet_3a_3b TEXT,
  fecha_baja TEXT,
  estado TEXT DEFAULT 'activo',
  telefono TEXT, direccion TEXT,
  departamento TEXT,
  FOREIGN KEY (company_id) REFERENCES companies(id)
);

CREATE TABLE IF NOT EXISTS vacations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  worker_id INTEGER,
  fecha_inicio TEXT, fecha_fin TEXT,
  dias INTEGER,
  tipo TEXT DEFAULT 'vacaciones',
  estado TEXT DEFAULT 'aprobado',
  notas TEXT,
  FOREIGN KEY (worker_id) REFERENCES workers(id)
);

CREATE TABLE IF NOT EXISTS absences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  worker_id INTEGER,
  tipo TEXT,
  fecha_inicio TEXT, fecha_fin TEXT,
  horas REAL,
  observaciones TEXT,
  FOREIGN KEY (worker_id) REFERENCES workers(id)
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  worker_id INTEGER,
  company_id INTEGER,
  tipo TEXT,
  nombre TEXT,
  ruta_archivo TEXT,
  requiere_firma INTEGER DEFAULT 0,
  firmado INTEGER DEFAULT 0,
  fecha_firma TEXT,
  codigo_firma TEXT,
  autorizaciones TEXT,
  fecha_subida TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (worker_id) REFERENCES workers(id)
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  worker_id INTEGER,
  email TEXT UNIQUE,
  password_hash TEXT,
  role TEXT DEFAULT 'employee',
  ultimo_acceso TEXT,
  FOREIGN KEY (worker_id) REFERENCES workers(id)
);
