# 🏢 ESSAI HR Platform — NOFER GROUP

Plataforma de Recursos Humanos para ESSAI GROUP (NOFER, Artesania Baño, Agetar, Decosan, etc.)

## 🚀 Despliegue en Vercel

### 1. Crear base de datos Turso (gratuita)
1. Ve a [turso.tech](https://turso.tech) y crea una cuenta gratis
2. Crea una nueva base de datos: `essai-hr`
3. Copia la URL y el token de autenticación

### 2. Subir a GitHub
```bash
git init
git add .
git commit -m "Initial commit - ESSAI HR Platform"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/essai-hr-platform.git
git push -u origin main
```

### 3. Desplegar en Vercel
1. Ve a [vercel.com](https://vercel.com) → New Project
2. Importa tu repositorio de GitHub
3. En **Environment Variables**, añade:
   - `TURSO_DATABASE_URL` = `libsql://essai-hr-TUUSUARIO.turso.io`
   - `TURSO_AUTH_TOKEN` = `tu-token-de-turso`
   - `JWT_SECRET` = `una-clave-secreta-larga`
4. Haz clic en **Deploy**

### 4. Inicializar datos en Turso
Después del primer deploy, ejecuta desde tu ordenador:
```bash
TURSO_DATABASE_URL=tu-url TURSO_AUTH_TOKEN=tu-token node server/database/seed-turso.js
```

## 💻 Desarrollo local

```bash
npm install
npm start
```
Abre [http://localhost:3000](http://localhost:3000)

**Credenciales:** admin / admin123

## 🔑 Acceso
- **Administrador:** admin / admin123
- **Trabajador:** usa el enlace de firma enviado

## 📁 Estructura

```
essai-hr-platform/
├── public/          # Frontend (HTML, CSS, JS)
├── server/
│   ├── database/    # DB adapter (Turso + sql.js)
│   ├── routes/      # API routes
│   └── index.js     # Express server
├── data/            # Local SQLite (no subir a git)
├── vercel.json      # Configuración Vercel
└── .env.example     # Variables de entorno de ejemplo
```
