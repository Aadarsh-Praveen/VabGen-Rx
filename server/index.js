require('dotenv').config();
const http = require('http');
const multer = require('multer');
const { BlobServiceClient } = require('@azure/storage-blob');
const { sql, poolPromise } = require('./db');

// Multer - store in memory
const upload = multer({ storage: multer.memoryStorage() });

// Azure Blob client
const blobServiceClient = BlobServiceClient.fromConnectionString(
  process.env.AZURE_STORAGE_CONNECTION_STRING
);
const containerClient = blobServiceClient.getContainerClient(
  process.env.AZURE_CONTAINER_NAME
);

// Helper to parse multipart form (for image upload)
const parseMultipart = (req) => new Promise((resolve, reject) => {
  upload.single('image')(req, {}, (err) => {
    if (err) reject(err);
    else resolve();
  });
});

// Helper to parse JSON body
const getBody = (req) => new Promise((resolve) => {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try { resolve(JSON.parse(body)); }
    catch { resolve({}); }
  });
});

const sendJSON = (res, code, data) => {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
};

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  // ✅ Test route
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200); res.end('Backend is running!'); return;
  }

  // ✅ Upload image route
  if (req.method === 'POST' && req.url === '/api/upload-image') {
    try {
      await parseMultipart(req);
      const file = req.file;
      if (!file) return sendJSON(res, 400, { message: 'No file uploaded' });

      const blobName = `${Date.now()}-${file.originalname}`;
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.uploadData(file.buffer, {
        blobHTTPHeaders: { blobContentType: file.mimetype }
      });

      const imageUrl = blockBlobClient.url;
      console.log('✅ Image uploaded:', imageUrl);
      sendJSON(res, 200, { imageUrl });
    } catch (err) {
      console.error('❌ Upload error:', err.message);
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  // ✅ Get profile route
  if (req.method === 'GET' && req.url.startsWith('/api/profile')) {
    const email = decodeURIComponent(req.url.split('?email=')[1] || '');
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('email', sql.VarChar, email)
        .query('SELECT name, designation, department, image_url, email, hospital_id FROM users WHERE email = @email');

      if (result.recordset.length > 0) {
        sendJSON(res, 200, { user: result.recordset[0] });
      } else {
        sendJSON(res, 404, { message: 'User not found' });
      }
    } catch (err) {
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  // ✅ Sign in route
  if (req.method === 'POST' && req.url === '/api/signin') {
    const { email, password } = await getBody(req);
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('email', sql.VarChar, email)
        .input('password', sql.VarChar, password)
        .query('SELECT * FROM users WHERE email = @email AND password = @password');

      if (result.recordset.length > 0) {
        sendJSON(res, 200, { message: 'Sign in successful', user: result.recordset[0] });
      } else {
        sendJSON(res, 401, { message: 'Invalid email or password' });
      }
    } catch (err) {
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  // ✅ Register route
  if (req.method === 'POST' && req.url === '/api/register') {
    const body = await getBody(req);
    const { hospital_id, licence_no, name, designation, department,
            dob, age, sex, address, contact_no, email, password } = body;
    try {
      const pool = await poolPromise;
      await pool.request()
        .input('hospital_id', sql.VarChar, hospital_id)
        .input('licence_no', sql.VarChar, licence_no)
        .input('name', sql.VarChar, name)
        .input('designation', sql.VarChar, designation)
        .input('department', sql.VarChar, department)
        .input('dob', sql.Date, dob)
        .input('age', sql.Int, age)
        .input('sex', sql.VarChar, sex)
        .input('address', sql.VarChar, address)
        .input('contact_no', sql.VarChar, contact_no)
        .input('email', sql.VarChar, email)
        .input('password', sql.VarChar, password)
        .query(`INSERT INTO users 
          (hospital_id, licence_no, name, designation, department,
           dob, age, sex, address, contact_no, email, password)
          VALUES 
          (@hospital_id, @licence_no, @name, @designation, @department,
           @dob, @age, @sex, @address, @contact_no, @email, @password)`);

      sendJSON(res, 201, { message: 'Registration successful' });
    } catch (err) {
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  sendJSON(res, 404, { message: 'Route not found' });
});

server.listen(8080, () => console.log('🚀 Server running on http://localhost:8080'));