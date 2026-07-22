// Export all DB data to JSON for Vercel seeding
const { getDb } = require('./db-universal');
const fs = require('fs');
const path = require('path');

async function exportData() {
  // Use the LOCAL sql.js DB (not Turso)
  process.env.TURSO_DATABASE_URL = '';
  process.env.TURSO_AUTH_TOKEN = '';
  
  const { getDb: getLocalDb } = require('./db-universal');
  const db = await getLocalDb();

  const data = {
    exportedAt: new Date().toISOString(),
    companies: await db.query('SELECT * FROM companies'),
    workers: await db.query('SELECT * FROM workers'),
    users: await db.query('SELECT * FROM users WHERE role = "admin"'), // only admin
    vacations: await db.query('SELECT * FROM vacations'),
    absences: await db.query('SELECT * FROM absences'),
  };

  const outPath = path.join(__dirname, '..', '..', 'data', 'seed-data.json');
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
  console.log(`✅ Exported ${data.workers.length} workers, ${data.companies.length} companies`);
  console.log(`   ${data.vacations.length} vacations, ${data.absences.length} absences`);
  console.log(`   Saved to: ${outPath}`);
  process.exit(0);
}

exportData().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
