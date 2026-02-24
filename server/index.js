require('dotenv').config();
const http = require('http');
const multer = require('multer');
const { BlobServiceClient } = require('@azure/storage-blob');
const { sql, poolPromise, patientsPoolPromise } = require('./db');

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

  // ── Test route ─────────────────────────────────────────────
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200); res.end('Backend is running!'); return;
  }

  // ── Upload image ───────────────────────────────────────────
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

  // ── Get profile ────────────────────────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/api/profile')) {
    const email = decodeURIComponent(req.url.split('?email=')[1] || '');
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('email', sql.VarChar, email)
        .query(`SELECT * FROM users WHERE email = @email`);

      if (result.recordset.length > 0) {
        const user = result.recordset[0];
        if (user.dob instanceof Date) {
          user.dob = user.dob.toISOString().split('T')[0];
        }
        sendJSON(res, 200, { user });
      } else {
        sendJSON(res, 404, { message: 'User not found' });
      }
    } catch (err) {
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  // ── Sign in ────────────────────────────────────────────────
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

  // ── Register ───────────────────────────────────────────────
  if (req.method === 'POST' && req.url === '/api/register') {
    const body = await getBody(req);
    const { hospital_id, licence_no, name, designation, department,
            dob, age, sex, address, contact_no, email, password } = body;
    try {
      const pool = await poolPromise;
      await pool.request()
        .input('hospital_id', sql.VarChar, hospital_id)
        .input('licence_no',  sql.VarChar, licence_no)
        .input('name',        sql.VarChar, name)
        .input('designation', sql.VarChar, designation)
        .input('department',  sql.VarChar, department)
        .input('dob',         sql.Date,    dob)
        .input('age',         sql.Int,     age)
        .input('sex',         sql.VarChar, sex)
        .input('address',     sql.VarChar, address)
        .input('contact_no',  sql.VarChar, contact_no)
        .input('email',       sql.VarChar, email)
        .input('password',    sql.VarChar, password)
        .query(`
          INSERT INTO users
            (hospital_id, licence_no, name, designation, department,
             dob, age, sex, address, contact_no, email, password)
          VALUES
            (@hospital_id, @licence_no, @name, @designation, @department,
             @dob, @age, @sex, @address, @contact_no, @email, @password)
        `);

      sendJSON(res, 201, { message: 'Registration successful' });
    } catch (err) {
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  // ── Update address ─────────────────────────────────────────
  if (req.method === 'POST' && req.url === '/api/profile/update-address') {
    const { email, address } = await getBody(req);
    if (!email || !address) {
      return sendJSON(res, 400, { message: 'Email and address are required.' });
    }
    try {
      const pool = await poolPromise;
      await pool.request()
        .input('email',   sql.VarChar, email)
        .input('address', sql.VarChar, JSON.stringify(address))
        .query('UPDATE users SET address = @address WHERE email = @email');

      sendJSON(res, 200, { message: 'Address updated successfully.' });
    } catch (err) {
      console.error('update-address error:', err.message);
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  // ── Change password ────────────────────────────────────────
  if (req.method === 'POST' && req.url === '/api/profile/change-password') {
    const { email, currentPassword, newPassword } = await getBody(req);
    if (!email || !currentPassword || !newPassword) {
      return sendJSON(res, 400, { message: 'All fields are required.' });
    }
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('email', sql.VarChar, email)
        .query('SELECT password FROM users WHERE email = @email');

      if (!result.recordset.length) {
        return sendJSON(res, 404, { message: 'User not found.' });
      }

      const storedPassword = result.recordset[0].password;
      if (currentPassword !== storedPassword) {
        return sendJSON(res, 401, { message: 'Current password is incorrect.' });
      }

      await pool.request()
        .input('email',    sql.VarChar, email)
        .input('password', sql.VarChar, newPassword)
        .query('UPDATE users SET password = @password WHERE email = @email');

      sendJSON(res, 200, { message: 'Password changed successfully.' });
    } catch (err) {
      console.error('change-password error:', err.message);
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  // ── Get all patients ───────────────────────────────────────
  if (req.method === 'GET' && req.url === '/api/patients') {
    try {
      const pool = await patientsPoolPromise;
      const result = await pool.request().query(`
        SELECT
          ID, Name, Age, Sex, Weight_kg, Height_cm, BMI,
          IP_No, Dept, DOA,
          Reason_for_Admission, Past_Medical_History, Past_Medication_History,
          Occupation, Smoker, Alcoholic, Tobacco, Teetotaller,
          Known_Allergies, Marital_Status,
          Temp_C, BP, Pulse,
          FBS_mgdl, PPS_mgdl, RBS_mgdl, HbA1c_percent,
          Hb_gdl, TLC_cells, Platelets_lakhs, ESR_mmhr, APTT_sec,
          Total_Bilirubin, Direct_Bilirubin, Indirect_Bilirubin,
          SGOT_UL, Albumin_gdl, Total_Protein_gdl,
          Urea_mgdl, Creatinine_mgdl, Uric_Acid_mgdl,
          Sodium, Potassium, Chloride, Bicarbonate,
          Triglycerides, Total_Cholesterol, HDL, LDL, VLDL, TC_HDL_Ratio,
          Urine_Albumin, Urine_Sugar, Urine_WBC, Urine_RBC,
          FreeT3, FreeT4, TSH,
          Other_Investigations, Drugs_Prescribed,
          Drug_Drug_Interactions, Drug_Disease_Alerts,
          Drug_Food_Alerts, Dose_Adjustment_Notes,
          Followup_Outcome, Interventions_Made,
          Preferred_Language, Race, Ethnicity, Insurance_Type,
          eGFR_mL_min_1_73m2
        FROM dbo.patient_records
        ORDER BY ID ASC
      `);
      sendJSON(res, 200, { patients: result.recordset });
    } catch (err) {
      console.error('❌ patients fetch error:', err.message);
      sendJSON(res, 500, { message: err.message });
    }
    return;
  }

  // ── 404 ────────────────────────────────────────────────────
  sendJSON(res, 404, { message: 'Route not found' });
});

server.listen(8080, () => console.log('🚀 Server running on http://localhost:8080'));