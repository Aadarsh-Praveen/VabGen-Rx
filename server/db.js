const sql = require('mssql');

const config = {
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT),
  options: {
    encrypt: true,
    trustServerCertificate: false,
  },
};

console.log('🔌 Connecting to:', process.env.DB_SERVER);

const poolPromise = new sql.ConnectionPool(config)
  .connect()
  .then(pool => {
    console.log('✅ Connected to Azure SQL Database');
    return pool;
  })
  .catch(err => {
    console.error('❌ Database connection failed:', err.message);
    // Don't exit — let server keep running
  });

module.exports = { sql, poolPromise };