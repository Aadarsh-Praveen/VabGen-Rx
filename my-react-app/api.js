const express = require('express');
const sql = require('mssql');

const router = express.Router();

const config = {
  server: 'admin-vabgen.database.windows.net',
  database: 'credentials',
  user: 'admin-1',
  password: 'YOUR_ACTUAL_PASSWORD_HERE', // ← put your real password here
  port: 1433,
  options: {
    encrypt: true,
    trustServerCertificate: false,
  },
};

let pool;
async function getPool() {
  if (!pool) pool = await sql.connect(config);
  return pool;
}

router.post('/signin', async (req, res) => {
  const { email, password } = req.body;
  try {
    const db = await getPool();
    const result = await db.request()
      .input('email', sql.VarChar, email)
      .input('password', sql.VarChar, password)
      .query('SELECT * FROM users WHERE email = @email AND password = @password');

    if (result.recordset.length > 0) {
      res.json({ message: 'Sign in successful', user: result.recordset[0] });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const db = await getPool();
    await db.request()
      .input('name', sql.VarChar, name)
      .input('email', sql.VarChar, email)
      .input('password', sql.VarChar, password)
      .query('INSERT INTO users (name, email, password) VALUES (@name, @email, @password)');

    res.status(201).json({ message: 'Registration successful' });
  } catch (err) {
    res.status(500).json({ message: 'Server error or email already exists' });
  }
});

module.exports = router;