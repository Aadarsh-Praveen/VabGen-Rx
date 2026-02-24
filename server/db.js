const sql = require('mssql');

const baseConfig = {
  server: process.env.DB_SERVER,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT),
  options: {
    encrypt: true,
    trustServerCertificate: false,
  },
};

// ── Pool 1: credentials DB (users table) ──────────────────────
console.log('🔌 Connecting to: credentials @', process.env.DB_SERVER);
const poolPromise = new sql.ConnectionPool({ ...baseConfig, database: 'credentials' })
  .connect()
  .then(pool => {
    console.log('✅ Connected to credentials database');
    return pool;
  })
  .catch(err => {
    console.error('❌ credentials DB connection failed:', err.message);
  });

// ── Pool 2: patients DB (patient_records table) ───────────────
console.log('🔌 Connecting to: patients @', process.env.DB_SERVER);
const patientsPoolPromise = new sql.ConnectionPool({ ...baseConfig, database: 'patients' })
  .connect()
  .then(pool => {
    console.log('✅ Connected to patients database');
    return pool;
  })
  .catch(err => {
    console.error('❌ patients DB connection failed:', err.message);
  });

module.exports = { sql, poolPromise, patientsPoolPromise };