require('dotenv').config();
const { Pool } = require('pg');

(async () => {
  console.log('Connecting to:', process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/:[^:@]*@/, ':****@') : '(DATABASE_URL not set)');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  try {
    const result = await pool.query('SELECT current_database() AS db, now() AS now');
    console.log('✅ Connected! DB reports:', result.rows[0]);

    const schemas = await pool.query(`
      SELECT table_schema, count(*) AS table_count
      FROM information_schema.tables
      WHERE table_schema IN ('app', 'clinical')
      GROUP BY table_schema
      ORDER BY table_schema
    `);
    console.log('Tables per schema:', schemas.rows);
  } catch (err) {
    console.error('❌ Connection FAILED');
    console.error('   Message:', err.message);
  } finally {
    await pool.end();
  }
})();
