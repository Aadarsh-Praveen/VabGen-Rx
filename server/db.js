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
  connectionTimeout: 15000,
  requestTimeout: 15000,
};

const createPool = (database) => {
  console.log(`🔌 Connecting to: ${database} @ ${process.env.DB_SERVER}`);
  return new sql.ConnectionPool({ ...baseConfig, database })
    .connect()
    .then(pool => {
      console.log(`✅ Connected to [${database}] database`);
      return pool;
    })
    .catch(err => {
      if (
        err.message.includes('Cannot open server') ||
        err.message.includes('firewall') ||
        err.code === 'ESOCKET' ||
        err.code === 'ETIMEOUT'
      ) {
        console.error(`\n🔥 FIREWALL BLOCK on [${database}] database!`);
        console.error(`   Your IP is not whitelisted in Azure SQL firewall.`);
        console.error(`   Fix: Azure Portal → SQL Server → Networking → Add your IP\n`);
      } else {
        console.error(`❌ [${database}] DB connection failed:`, err.message);
      }
      return null;
    });
};

const poolPromise         = createPool('credentials');
const patientsPoolPromise = createPool('patients');

module.exports = { sql, poolPromise, patientsPoolPromise };