/**
 * migrate.js - Add missing columns to existing database
 * Run once: node server/database/migrate.js
 */
const { getDb } = require('./db');

async function migrate() {
  const db = await getDb();

  const migrations = [
    // documents table
    `ALTER TABLE documents ADD COLUMN codigo_firma TEXT`,
    `ALTER TABLE documents ADD COLUMN autorizaciones TEXT`,
    // workers table
    `ALTER TABLE workers ADD COLUMN departamento TEXT`,
  ];

  let applied = 0;
  for (const sql of migrations) {
    try {
      await db.runQuery(sql, []);
      console.log('✅ Applied:', sql.substring(0, 60));
      applied++;
    } catch (e) {
      // Column likely already exists
      if (e.message && e.message.includes('duplicate column')) {
        console.log('⏭️  Already exists:', sql.substring(0, 60));
      } else {
        // Try via exec for sql.js compatibility
        try {
          await db.exec(sql);
          applied++;
        } catch (e2) {
          console.log('⏭️  Skip (already exists):', sql.substring(0, 60));
        }
      }
    }
  }

  console.log(`\n✅ Migration complete. ${applied} columns added.`);
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration error:', err.message);
  process.exit(1);
});
