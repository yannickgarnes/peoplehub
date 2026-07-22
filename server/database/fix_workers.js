// Script to fix duplicate Hector Reyes, set ISUN inactive, and set correct company for Hector
const { getDb } = require('./db');

async function fixWorkers() {
  const db = await getDb();

  console.log('=== FIXING WORKERS ===\n');

  // 1. Delete duplicate Hector Reyes (ID 238 has malformed DNI "NIE: Z2191763Y")
  db.runQuery('DELETE FROM workers WHERE id = ?', [238]);
  console.log('✅ Deleted duplicate Hector Reyes (id=238)');

  // 2. Ensure Hector Reyes (ID 153) is in Artesania Baño (company_id=8) and active
  // From the user: "HECTOR REYES SI QUE TRABAJA PON LO EN ARTESANIA BAÑO"
  db.runQuery("UPDATE workers SET company_id=8, estado='activo', departamento='Almacén Sant Just Desvern' WHERE id=153", []);
  console.log('✅ Set Hector Reyes (id=153) to Artesania Baño, active');

  // 3. Set ISUN (JOSEP ISUN VILLAR, id=162) as inactive
  db.runQuery("UPDATE workers SET estado='inactivo' WHERE id=162", []);
  console.log('✅ Set ISUN (id=162) to inactivo');

  // Verify
  const hectors = db.query("SELECT id, nombre, apellido1, company_id, departamento, estado FROM workers WHERE nombre LIKE '%ector%'");
  console.log('\n=== HECTOR AFTER FIX ===');
  hectors.forEach(h => console.log(JSON.stringify(h)));

  const isun = db.query("SELECT id, nombre, apellido1, estado FROM workers WHERE apellido1 LIKE '%ISUN%'");
  console.log('\n=== ISUN AFTER FIX ===');
  isun.forEach(i => console.log(JSON.stringify(i)));

  // Wait for DB save
  await new Promise(r => setTimeout(r, 800));
  console.log('\n✅ All fixes applied and DB saved!');
  process.exit(0);
}

fixWorkers().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
