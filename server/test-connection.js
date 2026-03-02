require('dotenv').config();
const sql = require('mssql');

const baseConfig = {
  server: process.env.DB_SERVER,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT),
  options: { encrypt: true, trustServerCertificate: false },
  connectionTimeout: 15000,
};

const testDB = async (database) => {
  console.log(`\n🔌 Testing [${database}]...`);
  try {
    const pool = await new sql.ConnectionPool({ ...baseConfig, database }).connect();
    const result = await pool.request().query('SELECT DB_NAME() AS db, GETDATE() AS now');
    console.log(`✅ [${database}] connected! DB reports:`, result.recordset[0]);
    await pool.close();
  } catch (err) {
    console.error(`❌ [${database}] FAILED`);
    console.error(`   Code: ${err.code}`);
    console.error(`   Message: ${err.message}`);
  }
};

(async () => {
  console.log('Server:', process.env.DB_SERVER);
  console.log('User:  ', process.env.DB_USER);
  await testDB('credentials');
  await testDB('patients');
  console.log('\nDone.');
})();