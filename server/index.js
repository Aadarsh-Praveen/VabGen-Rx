require('dotenv').config();
const http = require('http');
const { sql, poolPromise } = require('./db');

const app = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
  
  const getBody = () => new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
  });

  const sendJSON = (code, data) => { res.writeHead(code, {'Content-Type':'application/json'}); res.end(JSON.stringify(data)); };

  if (req.method === 'GET' && req.url === '/') { res.writeHead(200); res.end('Backend is running!'); return; }

  if (req.method === 'POST' && req.url === '/api/signin') {
    const { email, password } = await getBody();
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('email', sql.VarChar, email)
        .input('password', sql.VarChar, password)
        .query('SELECT * FROM users WHERE email = @email AND password = @password');
      if (result.recordset.length > 0) { sendJSON(200, { message: 'Sign in successful', user: result.recordset[0] }); }
      else { sendJSON(401, { message: 'Invalid email or password' }); }
    } catch (err) { sendJSON(500, { message: err.message }); }
    return;
  }

  sendJSON(404, { message: 'Not found' });
});

app.listen(8080, () => console.log('🚀 Server running on http://localhost:8080'));
